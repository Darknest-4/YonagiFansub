import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/**
 * Apple touch icon.
 *
 * Generated rather than committed as a binary: iOS requires a PNG (it will not
 * render the SVG favicon), and generating it keeps the mark in one place — the
 * gradient and glyph here match `icon.svg` and the logo component.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(140deg, #f761a8 0%, #8656f5 100%)',
          color: '#04060d',
          fontSize: 110,
          fontWeight: 700,
          // iOS applies its own rounding; a square canvas avoids a double radius.
          borderRadius: 0,
        }}
      >
        夜
      </div>
    ),
    size,
  );
}
