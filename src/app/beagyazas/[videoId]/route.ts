import { NextResponse, type NextRequest } from 'next/server';
import { gatePlayback } from '@/features/video/gate';
import { verifyPlaybackToken } from '@/features/video/token';
import { resolveExternalUrl } from '@/features/video/plan';
import { cspHostOf, cspSourceList } from '@/features/video/provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The isolated playback frame.
 *
 * This route is the reason providers can be added from the admin at 2am instead
 * of through a deploy. The site-wide policy stays at `frame-src 'self'` and is
 * never widened; the widening happens here, in a throwaway same-origin document
 * whose own `Content-Security-Policy` names exactly one host — the one this
 * source declares — and denies everything else.
 *
 * So a new filehost costs a database row, and a compromised one can reach
 * precisely nothing of ours: this document has no session, no site script, and
 * a policy that would not let it fetch anything even if it did.
 *
 * Two shapes come out of here:
 *
 *   • **EMBED** — a sandboxed iframe holding the provider's player. No scripts
 *     of our own at all, so the policy can be `script-src 'none'`.
 *   • **DIRECT_FILE, not proxied** — our own `<video>` pointed at their URL.
 *     Needed because a remote `.m3u8` requires `connect-src` for that host, and
 *     granting that site-wide for every provider anyone ever adds is not a
 *     trade worth making.
 *
 * The sandbox omits `allow-popups` and `allow-top-navigation` by default. Popup
 * ads on our page are our problem regardless of who served them, and a frame
 * that can navigate the top window can send a viewer anywhere. Hosts that
 * genuinely break under it get the flag re-enabled per source.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> },
): Promise<NextResponse> {
  const { videoId } = await params;
  const gate = await gatePlayback(request, videoId);

  if (!gate.ok) return deny(gate.status, gate.reason);

  const verified = verifyPlaybackToken(request.nextUrl.searchParams.get('t') ?? '', {
    scope: 'manifest',
    sid: gate.video.id,
    res: 'frame',
    viewerBinding: gate.binding,
  });

  if (!verified.ok) return deny(403, 'A lejátszási jogosultság lejárt. Töltsd újra az oldalt.');

  let target: string;
  try {
    target = resolveExternalUrl(gate.video);
  } catch (error) {
    return deny(409, error instanceof Error ? error.message : 'A forrás nincs jól beállítva.');
  }

  const isEmbed = gate.video.kind === 'EMBED';

  // Built from what this one source declares, and nothing else.
  const hostList = gate.video.provider?.domains?.length
    ? cspSourceList(gate.video.provider.domains)
    : cspHostOf(target);

  const sandbox = [
    'allow-scripts',
    // Refers to the *framed* document's own origin, not ours — the provider's
    // player needs it to function, and it grants nothing here.
    'allow-same-origin',
    'allow-presentation',
    'allow-forms',
    ...(gate.video.allowPopups ? ['allow-popups', 'allow-popups-to-escape-sandbox'] : []),
  ].join(' ');

  const body = isEmbed ? embedDocument(target, sandbox) : fileDocument(target);

  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    isEmbed ? `frame-src ${hostList}` : "frame-src 'none'",
    isEmbed ? "script-src 'none'" : "script-src 'unsafe-inline'",
    isEmbed ? "media-src 'none'" : `media-src ${hostList} blob:`,
    isEmbed ? "connect-src 'none'" : `connect-src ${hostList}`,
    "img-src 'self' data:",
    // Only our own pages may frame this document.
    "frame-ancestors 'self'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': csp,
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      // Do not tell the provider which episode page the viewer came from.
      'Referrer-Policy': 'no-referrer',
    },
  });
}

const SHELL = `<!doctype html><html lang="hu"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lejátszó</title>
<style>html,body{margin:0;height:100%;background:#07040e;overflow:hidden}
iframe,video{border:0;width:100%;height:100%;display:block;background:#000}
.msg{display:grid;place-items:center;height:100%;font:14px/1.5 system-ui,sans-serif;color:#8f9bbd;padding:1.5rem;text-align:center}</style>
</head><body>`;

function embedDocument(url: string, sandbox: string): string {
  return `${SHELL}<iframe src="${escapeAttribute(url)}" sandbox="${sandbox}" allow="fullscreen; encrypted-media" allowfullscreen referrerpolicy="no-referrer"></iframe></body></html>`;
}

/**
 * A plain `<video>` for a direct file.
 *
 * `.m3u8` is left to the browser: Safari plays it natively, and on the browsers
 * that do not, the source is better configured as proxied — which routes it
 * through our own hls.js player instead. Shipping a second copy of hls.js into
 * this frame to cover that case would double the bundle for a source the admin
 * can fix with one checkbox.
 */
function fileDocument(url: string): string {
  return `${SHELL}<video src="${escapeAttribute(url)}" controls playsinline controlslist="nodownload noremoteplayback" disablepictureinpicture oncontextmenu="return false"></video></body></html>`;
}

function deny(status: number, message: string): NextResponse {
  return new NextResponse(
    `${SHELL}<div class="msg">${escapeText(message)}</div></body></html>`,
    {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'",
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}

/**
 * The URL is interpolated into an attribute, so it is escaped there rather than
 * trusted — it comes from an admin-editable template, and `"` in a template
 * would otherwise let an attribute be closed and another one opened.
 */
function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
