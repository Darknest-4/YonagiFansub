import 'server-only';
import { isIP } from 'node:net';
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import type { LookupFunction } from 'node:net';

/**
 * Keeping the file proxy from becoming a window into our own network.
 *
 * The proxy fetches a URL a staff member typed and streams the answer back to a
 * browser. Without a guard that is a read primitive for anything the server can
 * reach — cloud metadata at `169.254.169.254`, an internal admin panel, a
 * database's HTTP interface — handed to whoever holds `episode:write`. That is a
 * content role, and it must not carry "read the private network" with it.
 *
 * The guard runs at **connect time**, not on the URL string. Checking a hostname
 * and then calling `fetch` leaves the classic gap: DNS can answer differently
 * between the check and the connection, so a name that validated as public
 * resolves to `127.0.0.1` a moment later. Node's `lookup` hook is the designed
 * place to close that — every address the resolver returns is inspected, and the
 * socket is refused before it is opened, so there is no window at all.
 */

/** Parses `a.b.c.d` into a 32-bit number, or `null` if it is not IPv4. */
function toInt(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

/** `[network, maskBits]` ranges that must never be reachable through the proxy. */
const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // RFC1918
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local — cloud metadata lives here
  ['172.16.0.0', 12], // RFC1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.168.0.0', 16], // RFC1918
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, includes broadcast
];

function isPublicV4(address: string): boolean {
  const value = toInt(address);
  if (value === null) return false;

  return !BLOCKED_V4.some(([network, bits]) => {
    const base = toInt(network);
    if (base === null) return false;
    // `>>> 0` keeps the shift unsigned; a /0 mask would otherwise be -1.
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (value & mask) === (base & mask);
  });
}

function isPublicV6(address: string): boolean {
  const value = address.toLowerCase().split('%')[0] ?? '';

  // An IPv4-mapped address (`::ffff:127.0.0.1`) is an IPv4 address wearing a
  // costume, and is the standard way this check gets bypassed.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (mapped?.[1]) return isPublicV4(mapped[1]);

  if (value === '::' || value === '::1') return false;

  const prefixes = [
    'fc', 'fd', // fc00::/7, unique local
    'fe8', 'fe9', 'fea', 'feb', // fe80::/10, link-local
    'ff', // ff00::/8, multicast
  ];
  if (prefixes.some((prefix) => value.startsWith(prefix))) return false;

  // NAT64 and the documentation range.
  if (value.startsWith('64:ff9b:') || value.startsWith('2001:db8:')) return false;

  return true;
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicV4(address);
  if (family === 6) return isPublicV6(address);
  return false;
}

export class BlockedAddressError extends Error {
  constructor(readonly address: string) {
    super(`A cél címe nem nyilvános: ${address}`);
    this.name = 'BlockedAddressError';
  }
}

/**
 * Rejects a hostname that is an IP literal pointing somewhere private.
 *
 * **This is not redundant with `guardedLookup`.** Node only consults `lookup`
 * when it has a name to resolve; a URL whose host is already an address skips
 * the resolver entirely and connects straight out. Relying on the hook alone
 * left `https://169.254.169.254/` reaching the socket — which is how this was
 * found, and why the check lives on both paths.
 *
 * A hostname that is not a literal passes through here and is caught by the
 * resolver hook instead.
 */
export function assertPublicHost(hostname: string): void {
  // `URL.hostname` keeps the brackets on an IPv6 literal.
  const bare = hostname.replace(/^\[|\]$/g, '');
  if (isIP(bare) && !isPublicAddress(bare)) {
    throw new BlockedAddressError(bare);
  }
}

/**
 * A `lookup` implementation that refuses to hand back a private address.
 *
 * Drop-in for `http.request({ lookup })`. Every candidate is checked, and the
 * connection fails rather than being opened — including when a hostname resolves
 * to a mix of public and private addresses, which is how a rebinding attack
 * usually presents.
 */
export const guardedLookup: LookupFunction = (
  hostname: string,
  options: LookupOptions,
  callback: (
    error: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
): void => {
  // A literal address never reaches the resolver, so it is checked here.
  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) {
      callback(new BlockedAddressError(hostname), '', 0);
      return;
    }
  }

  dnsLookup(hostname, options, (error, address, family) => {
    if (error) {
      callback(error, '', 0);
      return;
    }

    const candidates: LookupAddress[] = Array.isArray(address)
      ? address
      : [{ address: address as string, family: family as number }];

    const blocked = candidates.find((entry) => !isPublicAddress(entry.address));
    if (blocked) {
      callback(new BlockedAddressError(blocked.address), '', 0);
      return;
    }

    callback(null, address as string, family);
  });
};
