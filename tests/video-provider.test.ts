import { describe, expect, it } from 'vitest';
import {
  buildEmbedUrl,
  cspHostOf,
  cspSourceList,
  extractExternalId,
  isAllowedUrl,
} from '@/lib/video/provider';

/**
 * Provider URL handling.
 *
 * The extraction patterns are the difference between "paste the link" and
 * "find the id yourself", and the domain check is what stops an admin-editable
 * template from pointing a frame at an arbitrary host. Both are pure, so both
 * are pinned here rather than discovered in production.
 */

const streamtape = {
  slug: 'streamtape',
  embedTemplate: 'https://streamtape.com/e/{id}',
  urlPatterns: ['streamtape\\.[a-z.]+/(?:e|v)/([A-Za-z0-9]+)'],
  domains: ['streamtape.com', 'streamtape.net'],
};

const youtube = {
  slug: 'youtube',
  embedTemplate: 'https://www.youtube-nocookie.com/embed/{id}',
  urlPatterns: [
    'youtube\\.com/watch\\?v=([A-Za-z0-9_-]{11})',
    'youtu\\.be/([A-Za-z0-9_-]{11})',
  ],
  domains: ['youtube-nocookie.com'],
};

describe('extractExternalId', () => {
  it('pulls the id out of the URL shapes people actually paste', () => {
    expect(extractExternalId(streamtape, 'https://streamtape.com/v/abc123XYZ/ep1.mp4')).toBe(
      'abc123XYZ',
    );
    expect(extractExternalId(streamtape, 'https://streamtape.net/e/abc123XYZ')).toBe('abc123XYZ');
    expect(extractExternalId(youtube, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30')).toBe(
      'dQw4w9WgXcQ',
    );
    expect(extractExternalId(youtube, 'https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('accepts a bare id, since people often have only that', () => {
    expect(extractExternalId(streamtape, 'abc123XYZ')).toBe('abc123XYZ');
    expect(extractExternalId(streamtape, '  abc123XYZ  ')).toBe('abc123XYZ');
  });

  it('refuses a URL it cannot parse rather than storing nonsense', () => {
    // Silently keeping this would produce a source that 404s at playback, with
    // nothing to point at as the cause.
    expect(extractExternalId(streamtape, 'https://valami-mas.hu/video/1')).toBeNull();
    expect(extractExternalId(streamtape, '')).toBeNull();
  });

  it('survives a broken pattern instead of taking the provider down', () => {
    // The patterns are admin-editable; one bad regex must not be fatal.
    const broken = { ...streamtape, urlPatterns: ['([unclosed', ...streamtape.urlPatterns] };
    expect(extractExternalId(broken, 'https://streamtape.com/e/abc123XYZ')).toBe('abc123XYZ');
  });
});

describe('buildEmbedUrl', () => {
  it('substitutes the id and escapes it', () => {
    expect(buildEmbedUrl(streamtape, 'abc123')).toBe('https://streamtape.com/e/abc123');
    // An id that could break out of the URL is encoded, not interpolated raw.
    expect(buildEmbedUrl(streamtape, 'a/../b')).toBe('https://streamtape.com/e/a%2F..%2Fb');
  });

  it('returns null when the provider has no template', () => {
    expect(buildEmbedUrl({ ...streamtape, embedTemplate: null }, 'abc')).toBeNull();
  });
});

describe('isAllowedUrl', () => {
  it('accepts the declared domains and their subdomains', () => {
    expect(isAllowedUrl(streamtape, 'https://streamtape.com/e/x')).toBe(true);
    // Filehosts rotate subdomains constantly.
    expect(isAllowedUrl(streamtape, 'https://cdn5.streamtape.com/get/x')).toBe(true);
  });

  it('refuses a different domain, http, and lookalikes', () => {
    expect(isAllowedUrl(streamtape, 'https://evil.example/e/x')).toBe(false);
    expect(isAllowedUrl(streamtape, 'http://streamtape.com/e/x')).toBe(false);
    // The classic suffix trick: `notstreamtape.com` must not pass as a
    // subdomain of `streamtape.com`.
    expect(isAllowedUrl(streamtape, 'https://notstreamtape.com/e/x')).toBe(false);
    expect(isAllowedUrl(streamtape, 'https://streamtape.com.evil.example/e/x')).toBe(false);
  });

  it('refuses everything when no domain is declared', () => {
    expect(isAllowedUrl({ ...streamtape, domains: [] }, 'https://streamtape.com/e/x')).toBe(false);
  });

  it('refuses malformed input', () => {
    expect(isAllowedUrl(streamtape, 'nem url')).toBe(false);
  });
});

describe('cspSourceList', () => {
  it('emits the host and a wildcard for its subdomains', () => {
    expect(cspSourceList(['streamtape.com'])).toBe(
      'https://streamtape.com https://*.streamtape.com',
    );
  });

  it('drops anything that is not a plain hostname', () => {
    // A value that slipped past validation must not be able to inject an extra
    // CSP source — this list becomes a policy header verbatim.
    expect(cspSourceList(['ok.com', 'https://x.com', "' unsafe-inline '", '..'])).toBe(
      'https://ok.com https://*.ok.com',
    );
  });

  it("falls back to 'none' rather than an empty directive", () => {
    // An empty `frame-src` would be a syntax error and browsers vary on how
    // they treat it; `'none'` is unambiguous.
    expect(cspSourceList([])).toBe("'none'");
    expect(cspSourceList(['nonsense'])).toBe("'none'");
  });
});

describe('cspHostOf', () => {
  it('names exactly the one host a direct file lives on', () => {
    expect(cspHostOf('https://files.example.com/a/b.mp4')).toBe('https://files.example.com');
  });

  it("refuses http and garbage", () => {
    expect(cspHostOf('http://files.example.com/a.mp4')).toBe("'none'");
    expect(cspHostOf('nem url')).toBe("'none'");
  });
});
