import { ImageResponse } from 'next/og';
import { BrandIcon } from '@/lib/brand-icon';

export const runtime = 'nodejs';

/**
 * A 512px maszkolható ikon.
 *
 * Külön fájl a párnázatlan változattól, mert a kettő nem cserélhető fel: a
 * launcher körbevágja, ezért a jel a biztonságos zónán belülre kerül. Ugyanez a
 * kép vágás nélkül megjelenítve túl kicsinek látszana a csempén.
 */
export function GET() {
  return new ImageResponse(<BrandIcon size={512} maskable />, {
    width: 512,
    height: 512,
  });
}
