import { ImageResponse } from 'next/og';
import { BrandIcon } from '@/shared/ui/brand-icon';

export const runtime = 'nodejs';

/**
 * A 192px ikon, vágás nélküli megjelenítéshez.
 *
 * A jel kitölti a csempét. Ahol a rendszer körbevágja az ikont, ott a
 * `-maskable` változat megy — lásd a manifestet.
 */
export function GET() {
  return new ImageResponse(<BrandIcon size={192} />, {
    width: 192,
    height: 192,
  });
}
