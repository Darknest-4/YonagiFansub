'use client';

/**
 * Root error boundary.
 *
 * Replaces the entire document when the root layout itself fails, which means it
 * cannot rely on anything from that layout — not the fonts, not the global
 * stylesheet, not the providers. Hence the inline styles: this page has to render
 * correctly when nothing else does.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="hu">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '2rem',
          background: '#04060d',
          color: '#e6ecff',
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <div style={{ maxWidth: '32rem', textAlign: 'center' }}>
          <p
            style={{
              fontSize: '0.75rem',
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              color: '#f761a8',
              fontWeight: 700,
            }}
          >
            夜凪 · Yonagi Fansub
          </p>

          <h1 style={{ marginTop: '1.5rem', fontSize: '1.5rem', fontWeight: 700 }}>
            Az oldal nem tölthető be
          </h1>

          <p style={{ marginTop: '0.75rem', lineHeight: 1.7, color: '#8f9bbd' }}>
            Súlyos hiba történt. Dolgozunk rajta — próbáld újra néhány perc múlva.
          </p>

          {error.digest && (
            <p
              style={{
                marginTop: '1.25rem',
                fontFamily: 'ui-monospace, monospace',
                fontSize: '0.75rem',
                color: '#6f7c9e',
              }}
            >
              Hibaazonosító: {error.digest}
            </p>
          )}

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '2rem',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.625rem',
              border: 'none',
              background: '#f761a8',
              color: '#04060d',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Újrapróbálom
          </button>
        </div>
      </body>
    </html>
  );
}
