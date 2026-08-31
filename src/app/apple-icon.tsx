import { ImageResponse } from 'next/og';
import { BrandIcon } from '@/lib/brand-icon';

export const runtime = 'nodejs';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/**
 * Apple touch icon.
 *
 * Generated rather than committed as a binary: iOS requires a PNG (it will not
 * render the SVG favicon), and generating it keeps the mark in one place — the
 * gradient and glyph come from the same component the PWA icons use.
 *
 * Not maskable: iOS applies its own rounding to a square tile, so the glyph is
 * free to fill it.
 */
export default function AppleIcon() {
  return new ImageResponse(<BrandIcon size={size.width} />, size);
}
