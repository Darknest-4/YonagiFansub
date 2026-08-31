import type { ReactElement } from 'react';

/**
 * The app mark, as one drawing.
 *
 * Three routes render an icon — the Apple touch icon and the two PWA sizes —
 * and each used to be free to drift from the others. Sharing the drawing means
 * a change to the mark is one edit, and the home-screen icon on iOS can never
 * quietly stop matching the one on Android.
 *
 * `maskable` is the Android install case. There the system crops the icon to
 * whatever shape the launcher uses — a circle, a squircle, a rounded square —
 * and anything within about 10% of the edge can be cut off. The safe-zone
 * padding is what keeps the glyph whole under every one of those masks; without
 * it the character loses its corners on most phones.
 */
export function BrandIcon({
  size,
  maskable = false,
}: {
  size: number;
  maskable?: boolean;
}): ReactElement {
  // The glyph fills the tile on iOS (which applies its own rounding), and sits
  // inside the safe zone when Android may crop it.
  const glyph = Math.round(size * (maskable ? 0.42 : 0.6));

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(140deg, #f761a8 0%, #8656f5 100%)',
        color: '#04060d',
        fontSize: glyph,
        fontWeight: 700,
        borderRadius: 0,
      }}
    >
      夜
    </div>
  );
}
