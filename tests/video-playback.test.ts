import { describe, expect, it } from 'vitest';
import {
  createPlaybackToken,
  verifyPlaybackToken,
  viewerBinding,
  SEGMENT_TTL_SECONDS,
} from '@/lib/video/token';
import { dirOf, resolveWithin, rewritePlaylist } from '@/lib/video/playlist';
import { parseRange } from '@/lib/media/driver';

/**
 * Protected playback.
 *
 * These are the checks the whole scheme rests on, so they are asserted rather
 * than assumed. A token that verifies without binding to a viewer, a scope or a
 * resource is a token that authorises everything to anyone who has ever held
 * one — and that failure is invisible in manual testing, because the happy path
 * looks identical.
 */

const VIEWER = viewerBinding({ sessionId: 'sess-1', ip: '203.0.113.7', userAgent: 'UA/1' });
const OTHER = viewerBinding({ sessionId: 'sess-2', ip: '203.0.113.7', userAgent: 'UA/1' });

const expected = (over: Partial<Parameters<typeof verifyPlaybackToken>[1]> = {}) => ({
  scope: 'segment' as const,
  sid: 'vid-1',
  res: 'video/ep1/seg-001.ts',
  viewerBinding: VIEWER,
  ...over,
});

function segmentToken(over: Partial<{ sid: string; res: string; vb: string }> = {}, ttl = 60) {
  return createPlaybackToken(
    { scope: 'segment', sid: 'vid-1', res: 'video/ep1/seg-001.ts', vb: VIEWER, ...over },
    ttl,
  );
}

describe('playback tokens', () => {
  it('accepts a token for the viewer, scope and resource it was minted for', () => {
    const result = verifyPlaybackToken(segmentToken(), expected());
    expect(result.ok).toBe(true);
  });

  it('rejects a token issued for a different viewer', () => {
    // The point of the binding: a URL copied out of one browser is useless in
    // another, so a pasted link does not become a working stream.
    const result = verifyPlaybackToken(segmentToken(), expected({ viewerBinding: OTHER }));
    expect(result).toEqual({ ok: false, reason: 'wrong-viewer' });
  });

  it('rejects a token issued for a different segment', () => {
    // Without this, one valid token would walk the whole episode by changing a
    // number in the URL.
    const result = verifyPlaybackToken(
      segmentToken(),
      expected({ res: 'video/ep1/seg-002.ts' }),
    );
    expect(result).toEqual({ ok: false, reason: 'wrong-resource' });
  });

  it('rejects a token issued for a different video', () => {
    const result = verifyPlaybackToken(segmentToken(), expected({ sid: 'vid-2' }));
    expect(result).toEqual({ ok: false, reason: 'wrong-resource' });
  });

  it('rejects a segment token used to fetch a decryption key', () => {
    const result = verifyPlaybackToken(segmentToken(), expected({ scope: 'key' }));
    expect(result).toEqual({ ok: false, reason: 'wrong-scope' });
  });

  it('rejects an expired token', () => {
    const result = verifyPlaybackToken(segmentToken({}, -1), expected());
    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a tampered payload', () => {
    const token = segmentToken();
    const [version, payload, signature] = token.split('.') as [string, string, string];

    // Re-encode the claims with a different resource but keep the signature.
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      res: string;
    };
    claims.res = 'video/ep1/seg-999.ts';
    const forged = Buffer.from(JSON.stringify(claims)).toString('base64url');

    const result = verifyPlaybackToken(
      `${version}.${forged}.${signature}`,
      expected({ res: 'video/ep1/seg-999.ts' }),
    );
    expect(result).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('rejects malformed input without throwing', () => {
    for (const bad of ['', 'nonsense', 'v1.only-two', 'v2.a.b', '..']) {
      const result = verifyPlaybackToken(bad, expected());
      expect(result.ok).toBe(false);
    }
  });

  it('binds anonymous viewers to their own identifier', () => {
    const a = viewerBinding({ anonymousId: 'anon-a', ip: '203.0.113.7', userAgent: 'UA/1' });
    const b = viewerBinding({ anonymousId: 'anon-b', ip: '203.0.113.7', userAgent: 'UA/1' });
    expect(a).not.toBe(b);
  });

  it('survives a changing client address within the same network', () => {
    // Mobile viewers change address mid-episode; binding to the full IP would
    // look like the player failing at random.
    const a = viewerBinding({ sessionId: 's', ip: '203.0.113.7', userAgent: 'UA/1' });
    const b = viewerBinding({ sessionId: 's', ip: '203.0.113.99', userAgent: 'UA/1' });
    expect(a).toBe(b);

    const elsewhere = viewerBinding({ sessionId: 's', ip: '198.51.100.7', userAgent: 'UA/1' });
    expect(a).not.toBe(elsewhere);
  });

  it('keeps segment tokens short-lived', () => {
    expect(SEGMENT_TTL_SECONDS).toBeLessThanOrEqual(120);
  });
});

describe('playlist rewriting', () => {
  const resolve = (key: string, kind: string) => `/proxy?r=${encodeURIComponent(key)}&k=${kind}`;

  it('rewrites segment lines and leaves the rest of the playlist intact', () => {
    const source = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-TARGETDURATION:10',
      '#EXTINF:10.0,',
      'seg-001.ts',
      '#EXTINF:10.0,',
      'seg-002.ts',
      '#EXT-X-ENDLIST',
    ].join('\n');

    const output = rewritePlaylist(source, { baseDir: 'video/ep1', resolve });

    expect(output).toContain('#EXT-X-TARGETDURATION:10');
    expect(output).toContain('/proxy?r=video%2Fep1%2Fseg-001.ts&k=segment');
    expect(output).not.toContain('\nseg-001.ts');
  });

  it('rewrites the URI attribute of tags that carry one', () => {
    const source = [
      '#EXTM3U',
      '#EXT-X-KEY:METHOD=AES-128,URI="enc.key",IV=0x00',
      '#EXT-X-MAP:URI="init.mp4"',
      '#EXTINF:4.0,',
      'seg.m4s',
    ].join('\n');

    const output = rewritePlaylist(source, { baseDir: 'video/ep1', resolve });

    expect(output).toContain('URI="/proxy?r=video%2Fep1%2Fenc.key&k=key"');
    expect(output).toContain('URI="/proxy?r=video%2Fep1%2Finit.mp4&k=segment"');
    // The rest of the attribute list has to survive untouched.
    expect(output).toContain('METHOD=AES-128');
    expect(output).toContain('IV=0x00');
  });

  it('leaves absolute URLs alone', () => {
    const source = '#EXTM3U\nhttps://other.example/seg.ts\n//cdn.example/seg.ts';
    const output = rewritePlaylist(source, { baseDir: 'video/ep1', resolve });

    expect(output).toContain('https://other.example/seg.ts');
    expect(output).toContain('//cdn.example/seg.ts');
  });

  it('refuses a URI that would escape the package root', () => {
    // A playlist is content we serve but did not necessarily author.
    const source = '#EXTM3U\n../../../etc/passwd';
    const output = rewritePlaylist(source, { baseDir: 'video/ep1', resolve });

    expect(output).toContain('../../../etc/passwd');
    expect(output).not.toContain('/proxy');
  });

  it('resolves relative paths within the package', () => {
    expect(resolveWithin('video/ep1', 'seg.ts')).toBe('video/ep1/seg.ts');
    expect(resolveWithin('video/ep1/hi', '../lo/seg.ts')).toBe('video/ep1/lo/seg.ts');
    expect(resolveWithin('video/ep1', './seg.ts')).toBe('video/ep1/seg.ts');
    expect(resolveWithin('video', '../../escape')).toBeNull();
  });

  it('finds the directory of a key', () => {
    expect(dirOf('video/ep1/master.m3u8')).toBe('video/ep1');
    expect(dirOf('master.m3u8')).toBe('');
  });
});

describe('range requests', () => {
  it('parses the forms a media stack actually sends', () => {
    expect(parseRange('bytes=0-499', 1000)).toEqual({ start: 0, end: 499 });
    expect(parseRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 });
    // A suffix range means "the last N bytes", not "up to N".
    expect(parseRange('bytes=-500', 1000)).toEqual({ start: 500, end: 999 });
  });

  it('clamps an end past the object and rejects nonsense', () => {
    expect(parseRange('bytes=0-99999', 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange('bytes=2000-3000', 1000)).toBeNull();
    expect(parseRange('bytes=500-100', 1000)).toBeNull();
    expect(parseRange('kilobytes=0-1', 1000)).toBeNull();
    expect(parseRange(null, 1000)).toBeNull();
  });
});
