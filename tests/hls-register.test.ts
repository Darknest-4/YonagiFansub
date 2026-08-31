import { describe, expect, it } from 'vitest';
import { resolutionFor } from '../scripts/lib/hls-register';

describe('resolutionFor', () => {
  it('a szabványos magasságokat pontosan képezi le', () => {
    expect(resolutionFor(480)).toBe('SD_480P');
    expect(resolutionFor(720)).toBe('HD_720P');
    expect(resolutionFor(1080)).toBe('FHD_1080P');
    expect(resolutionFor(1440)).toBe('QHD_1440P');
    expect(resolutionFor(2160)).toBe('UHD_2160P');
  });

  // Letterboxed and anamorphic sources are common, and refusing to register a
  // package because it is 816 pixels tall would be pedantry with a real cost.
  it('a nem szabványos magassághoz a legközelebbi fokot választja', () => {
    expect(resolutionFor(816)).toBe('HD_720P');
    expect(resolutionFor(1024)).toBe('FHD_1080P');
    expect(resolutionFor(576)).toBe('SD_480P');
    expect(resolutionFor(2000)).toBe('UHD_2160P');
  });

  it('a szélsőségeket a szélső fokokra viszi', () => {
    expect(resolutionFor(144)).toBe('SD_480P');
    expect(resolutionFor(4320)).toBe('UHD_2160P');
  });
});
