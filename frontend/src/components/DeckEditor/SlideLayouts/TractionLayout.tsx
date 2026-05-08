import type { LayoutProps } from "./layoutShared";
import { brandFonts, brandPalette, parseBody } from "./layoutShared";

export function TractionLayout({ slide, brand, bodyEditor, onActivateBody }: LayoutProps): JSX.Element {
  const { primary, fg, bg, muted } = brandPalette(brand);
  const { heading, body } = brandFonts(brand);
  const parsed = parseBody(slide.body);
  // Synthesize a sparkline if numeric series provided as numbered "M1: 42" format.
  const series = parsed.numbered
    .map((n) => Number(n.value.replace(/[^\d.-]/g, "")))
    .filter((v) => Number.isFinite(v));
  const points = buildSparkline(series.length ? series : [12, 18, 24, 36, 52, 78, 119, 168, 240]);
  const last = parsed.numbered.at(-1);
  return (
    <div
      className="grid h-full w-full"
      style={{
        background: bg,
        color: fg,
        fontFamily: body,
        gridTemplateColumns: "1fr",
        gridTemplateRows: "auto 1fr",
        padding: 80,
        gap: 32,
      }}
    >
      <div>
        <div
          className="text-[14px] font-mono uppercase tracking-[0.32em]"
          style={{ color: primary }}
        >
          Traction
        </div>
        <h2
          className="mt-3"
          style={{
            fontFamily: heading,
            fontSize: 76,
            lineHeight: 1.04,
            letterSpacing: "-0.02em",
            fontWeight: 500,
          }}
          onDoubleClick={onActivateBody}
        >
          {slide.title}
        </h2>
      </div>
      <div
        className="grid"
        style={{ gridTemplateColumns: "1.4fr 1fr", gap: 56 }}
      >
        <div
          className="relative overflow-hidden rounded-3xl"
          style={{ border: `1px solid ${muted}`, background: `${primary}0c` }}
        >
          <svg
            viewBox="0 0 600 320"
            className="h-full w-full"
            preserveAspectRatio="none"
            aria-label="Traction trend"
          >
            <defs>
              <linearGradient id="trxFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={primary} stopOpacity="0.65" />
                <stop offset="100%" stopColor={primary} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={points.areaPath} fill="url(#trxFill)" />
            <path d={points.linePath} fill="none" stroke={primary} strokeWidth={3} strokeLinecap="round" />
            {points.dots.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r={i === points.dots.length - 1 ? 6 : 3} fill={primary} />
            ))}
          </svg>
        </div>
        <div className="grid content-start gap-6" style={{ alignContent: "start" }}>
          {bodyEditor && <div style={{ fontSize: 18, lineHeight: 1.5 }}>{bodyEditor}</div>}
          <div className="grid gap-1">
            <span
              className="font-mono text-[11px] uppercase tracking-widest"
              style={{ color: primary }}
            >
              {last?.label ?? "Latest"}
            </span>
            <span style={{ fontFamily: heading, fontSize: 64, fontWeight: 500 }}>
              {last?.value ?? "240 paying users"}
            </span>
          </div>
          <ul className="grid gap-2 text-[18px]" style={{ color: `${fg}d0` }}>
            {parsed.bullets.slice(0, 4).map((b, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="mt-2 h-1.5 w-5 shrink-0"
                  style={{ background: primary }}
                  aria-hidden="true"
                />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function buildSparkline(values: number[]): {
  linePath: string;
  areaPath: string;
  dots: { x: number; y: number }[];
} {
  const W = 600;
  const H = 320;
  const PAD_X = 24;
  const PAD_Y = 32;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const dots = values.map((v, i) => ({
    x: PAD_X + (i / Math.max(1, values.length - 1)) * innerW,
    y: PAD_Y + innerH - ((v - min) / range) * innerH,
  }));
  const linePath = dots
    .map((d, i) => `${i === 0 ? "M" : "L"}${d.x.toFixed(1)},${d.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${dots.at(-1)!.x.toFixed(1)},${(H - PAD_Y).toFixed(1)} L${dots[0]!.x.toFixed(1)},${(H - PAD_Y).toFixed(1)} Z`;
  return { linePath, areaPath, dots };
}
