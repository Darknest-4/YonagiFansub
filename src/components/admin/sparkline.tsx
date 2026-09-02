import { formatCount } from '@/lib/utils';

/**
 * Download trend chart.
 *
 * Hand-drawn SVG rather than a charting library: this is one series of thirty
 * points, and a library would add ~40 KB to the admin bundle plus a hydration
 * boundary to draw a line we can express in fifteen lines of path math.
 *
 * Accessibility: the visual is `aria-hidden` and the same data is exposed as a
 * real table to screen readers, so the information is never image-only.
 */
export function Sparkline({
  data,
  height = 180,
  id = 'spark',
}: {
  data: Array<{ date: string; count: number }>;
  height?: number;
  /**
   * Suffix for the gradient ids. SVG `<defs>` ids are document-global, so two
   * charts on one page sharing an id makes the second silently repaint the
   * first. Every instance on a page needs its own.
   */
  id?: string;
}) {
  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-mist-500">Nincs megjeleníthető adat.</p>;
  }

  const width = 600;
  const padding = { top: 12, right: 4, bottom: 22, left: 4 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  // A flat-zero series must not divide by zero, and a single spike should not
  // flatten everything else into the baseline.
  const max = Math.max(1, ...data.map((point) => point.count));

  const x = (index: number) =>
    padding.left + (index / Math.max(1, data.length - 1)) * innerWidth;
  const y = (value: number) => padding.top + innerHeight - (value / max) * innerHeight;

  const line = data.map((point, index) => `${x(index)},${y(point.count)}`).join(' ');
  const area = `${padding.left},${padding.top + innerHeight} ${line} ${x(data.length - 1)},${padding.top + innerHeight}`;

  const peakIndex = data.reduce(
    (best, point, index) => (point.count > (data[best]?.count ?? 0) ? index : best),
    0,
  );

  const labelEvery = Math.ceil(data.length / 6);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        aria-hidden
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f761a8" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#f761a8" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}-line`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#f761a8" />
            <stop offset="100%" stopColor="#ab7ffb" />
          </linearGradient>
        </defs>

        {/* Quartile guides – enough structure to read a value, not a grid. */}
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1={padding.left}
            x2={width - padding.right}
            y1={padding.top + innerHeight * fraction}
            y2={padding.top + innerHeight * fraction}
            stroke="#211738"
            strokeWidth="1"
            strokeDasharray="3 5"
          />
        ))}

        <polygon points={area} fill={`url(#${id}-fill)`} />
        <polyline
          points={line}
          fill="none"
          stroke={`url(#${id}-line)`}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        <circle
          cx={x(peakIndex)}
          cy={y(data[peakIndex]?.count ?? 0)}
          r="3.5"
          fill="#ffc76b"
          stroke="#04060d"
          strokeWidth="2"
        />
      </svg>

      <div className="nums mt-1 flex justify-between px-1 text-[10px] text-mist-600">
        {data
          .filter((_, index) => index % labelEvery === 0)
          .map((point) => (
            <span key={point.date}>{point.date.slice(5).replace('-', '.')}</span>
          ))}
      </div>

      {/* The same data, available to assistive technology. */}
      <figcaption className="sr-only">
        <table>
          <caption>Napi megkezdett nézések az elmúlt {data.length} napban</caption>
          <thead>
            <tr>
              <th scope="col">Dátum</th>
              <th scope="col">Nézés</th>
            </tr>
          </thead>
          <tbody>
            {data.map((point) => (
              <tr key={point.date}>
                <th scope="row">{point.date}</th>
                <td>{formatCount(point.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}

/**
 * Tile-sized trend line.
 *
 * Deliberately axis-free and label-free. At 40 pixels tall no tick would be
 * readable anyway, and the job here is not "read a value" — it is "is this going
 * up or down", which the shape alone answers. The tile's own number carries the
 * precision.
 *
 * `aria-hidden` for the same reason: it adds no information a screen reader
 * could not already get from the tile's value and its context line, and a
 * wordless chart announced as an image is noise.
 */
export function MiniSparkline({
  data,
  color = '#f761a8',
  id,
}: {
  data: number[];
  color?: string;
  id: string;
}) {
  if (data.length < 2) return null;

  const width = 120;
  const height = 34;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min;

  const x = (index: number) => (index / (data.length - 1)) * width;

  /*
    A flat series has no span to scale against. Pinning it to the baseline would
    draw "nothing happened" and "everything is at zero" identically, and a line
    hugging the bottom edge reads as a rule rather than as data — so a flat
    series is drawn through the middle instead.
  */
  const y = (value: number) =>
    span === 0 ? height / 2 : height - 2 - ((value - min) / span) * (height - 4);

  const line = data.map((value, index) => `${x(index)},${y(value)}`).join(' ');
  const last = data[data.length - 1] ?? 0;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-8 w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={`${id}-mini`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      <polygon points={`0,${height} ${line} ${width},${height}`} fill={`url(#${id}-mini)`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={width} cy={y(last)} r="2" fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
