import { ImageResponse } from 'next/og';
import { BrandIcon } from '@/shared/ui/brand-icon';

export const runtime = 'nodejs';

/**
 * A 512px ikon, vágás nélküli megjelenítéshez.
 *
 * A jel kitölti a csempét. Ahol a rendszer körbevágja az ikont, ott a
 * `-maskable` változat megy — lásd a manifestet.
 */
export function GET() {
  return new ImageResponse(<BrandIcon size={512} />, {
    width: 512,
    height: 512,
  });
}
