import { ImageResponse } from 'next/og';
import { getPublicSettings } from '@/server/settings';

export const runtime = 'nodejs';
export const alt = 'Yonagi Fansub';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Default Open Graph image.
 *
 * Generated rather than a static asset so the tagline stays in sync with the
 * site settings. Deliberately typographic: no external fonts or images are
 * fetched, which keeps generation fast and free of network failure modes.
 */
export default async function OpenGraphImage() {
  const settings = await getPublicSettings();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px',
          background: 'linear-gradient(140deg, #04060d 0%, #0b101f 55%, #17526e 100%)',
          color: '#e6ecff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '72px',
              height: '72px',
              borderRadius: '20px',
              background: 'linear-gradient(140deg, #4cd8ff, #8656f5)',
              color: '#04060d',
              fontSize: '40px',
              fontWeight: 700,
            }}
          >
            夜
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '38px', fontWeight: 800, letterSpacing: '-0.02em' }}>
              Yonagi
            </span>
            <span
              style={{
                fontSize: '15px',
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                color: '#6ee5ff',
                fontWeight: 600,
              }}
            >
              Fansub
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '900px' }}>
          <span style={{ fontSize: '58px', fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.03em' }}>
            {settings.siteTagline ?? 'Magyar anime feliratok'}
          </span>
          <span style={{ marginTop: '24px', fontSize: '26px', color: '#8f9bbd', lineHeight: 1.45 }}>
            Friss kiadások, átlátható projektállapotok, letöltések egy helyen.
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            fontSize: '20px',
            color: '#6f7c9e',
          }}
        >
          <span
            style={{
              width: '48px',
              height: '3px',
              background: 'linear-gradient(90deg, #4cd8ff, transparent)',
            }}
          />
          yonagifansub.hu
        </div>
      </div>
    ),
    size,
  );
}
