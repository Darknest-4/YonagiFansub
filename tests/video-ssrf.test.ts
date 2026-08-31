import { describe, expect, it } from 'vitest';
import { isPublicAddress } from '@/lib/video/ssrf';

/**
 * The address filter behind the file proxy.
 *
 * The proxy fetches a URL a staff member typed and streams the answer back, so
 * without this it hands whoever holds `episode:write` a read primitive for the
 * private network. Every bypass below is a known one, which is why they are
 * pinned rather than assumed.
 */

describe('isPublicAddress — refuses the private network', () => {
  it('blocks loopback', () => {
    for (const address of ['127.0.0.1', '127.1.2.3', '127.255.255.254', '::1']) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it('blocks link-local, where cloud metadata lives', () => {
    // The single most valuable target: instance credentials on AWS, GCP, Azure,
    // DigitalOcean and Hetzner are all one unauthenticated GET away from here.
    expect(isPublicAddress('169.254.169.254')).toBe(false);
    expect(isPublicAddress('169.254.0.1')).toBe(false);
    expect(isPublicAddress('fe80::1')).toBe(false);
  });

  it('blocks the RFC1918 ranges', () => {
    for (const address of [
      '10.0.0.1',
      '10.255.255.255',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it('blocks the reserved and documentation ranges', () => {
    for (const address of [
      '0.0.0.0',
      '100.64.0.1', // carrier-grade NAT
      '192.0.2.1', // TEST-NET-1
      '198.18.0.1', // benchmarking
      '198.51.100.1', // TEST-NET-2
      '203.0.113.1', // TEST-NET-3
      '224.0.0.1', // multicast
      '255.255.255.255',
      'fc00::1', // unique local
      'fd12:3456::1',
      'ff02::1', // multicast
      '2001:db8::1', // documentation
      '64:ff9b::1', // NAT64
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it('blocks IPv4 addresses hiding inside IPv6', () => {
    // `::ffff:127.0.0.1` is loopback wearing a costume, and is the standard way
    // a v4-only check gets walked past.
    expect(isPublicAddress('::ffff:127.0.0.1')).toBe(false);
    expect(isPublicAddress('::ffff:169.254.169.254')).toBe(false);
    expect(isPublicAddress('::ffff:10.0.0.1')).toBe(false);
    // …and still lets a genuinely public one through in that form.
    expect(isPublicAddress('::ffff:93.184.216.34')).toBe(true);
  });

  it('blocks a scoped link-local address', () => {
    expect(isPublicAddress('fe80::1%eth0')).toBe(false);
  });

  it('refuses anything that is not an address at all', () => {
    for (const value of ['', 'localhost', 'nem-ip', '999.999.999.999', '10.0.0']) {
      expect(isPublicAddress(value), value).toBe(false);
    }
  });
});

describe('isPublicAddress — allows the public internet', () => {
  it('accepts ordinary addresses', () => {
    for (const address of [
      '93.184.216.34',
      '1.1.1.1',
      '8.8.8.8',
      // Adjacent to a blocked range but outside it: 172.15 and 172.32 are
      // public, only 172.16–172.31 are private.
      '172.15.255.255',
      '172.32.0.1',
      // 100.63 and 100.128 sit either side of the CGNAT block.
      '100.63.255.255',
      '100.128.0.1',
      '2606:4700:4700::1111',
    ]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });
});
