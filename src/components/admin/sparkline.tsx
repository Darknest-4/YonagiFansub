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
}: {
  data: Array<{ date: string; count: number }>;
  height?: number;
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
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4cd8ff" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#4cd8ff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="spark-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4cd8ff" />
            <stop offset="100%" stopColor="#9d7bff" />
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
            stroke="#1c2540"
            strokeWidth="1"
            strokeDasharray="3 5"
          />
        ))}

        <polygon points={area} fill="url(#spark-fill)" />
        <polyline
          points={line}
          fill="none"
          stroke="url(#spark-line)"
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
          <caption>Napi letöltésszám az elmúlt {data.length} napban</caption>
          <thead>
            <tr>
              <th scope="col">Dátum</th>
              <th scope="col">Letöltés</th>
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
