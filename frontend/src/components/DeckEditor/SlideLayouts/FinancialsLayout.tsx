import type { LayoutProps } from "./layoutShared";
import { brandFonts, brandPalette, parseBody } from "./layoutShared";

export function FinancialsLayout({ slide, brand, bodyEditor, onActivateBody }: LayoutProps): JSX.Element {
  const { primary, fg, bg, muted } = brandPalette(brand);
  const { heading, body } = brandFonts(brand);
  const parsed = parseBody(slide.body);
  const rows = parsed.numbered.length
    ? parsed.numbered
    : [
        { label: "Revenue", value: "0.4M | 2.1M | 6.8M" },
        { label: "Gross profit", value: "0.3M | 1.6M | 5.3M" },
        { label: "EBITDA", value: "(0.9M) | (0.4M) | 1.2M" },
        { label: "Headcount", value: "6 | 14 | 28" },
      ];
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
        gap: 36,
      }}
    >
      <div className="flex items-end justify-between">
        <div>
          <div
            className="text-[14px] font-mono uppercase tracking-[0.32em]"
            style={{ color: primary }}
          >
            Financials
          </div>
          <h2
            className="mt-2"
            style={{
              fontFamily: heading,
              fontSize: 64,
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              fontWeight: 500,
            }}
            onDoubleClick={onActivateBody}
          >
            {slide.title}
          </h2>
        </div>
        {bodyEditor && (
          <div className="max-w-[40%]" style={{ fontSize: 18, lineHeight: 1.5 }}>
            {bodyEditor}
          </div>
        )}
      </div>
      <div
        className="grid"
        style={{ gridTemplateColumns: "1.6fr 1fr", gap: 36 }}
      >
        <div
          className="overflow-hidden rounded-2xl"
          style={{ border: `1px solid ${muted}` }}
        >
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: `${primary}10` }}>
                <th
                  className="text-left"
                  style={{ padding: "16px 24px", fontSize: 13, color: primary }}
                >
                  &nbsp;
                </th>
                {["Year 1", "Year 2", "Year 3"].map((y) => (
                  <th
                    key={y}
                    className="text-right"
                    style={{ padding: "16px 24px", fontSize: 13, color: primary }}
                  >
                    {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const cells = r.value.split(/\s*\|\s*/);
                return (
                  <tr key={r.label} style={{ borderTop: `1px solid ${muted}` }}>
                    <td style={{ padding: "16px 24px", fontSize: 18, color: fg }}>{r.label}</td>
                    {cells.map((c, j) => (
                      <td
                        key={j}
                        className="text-right tabular-nums"
                        style={{
                          padding: "16px 24px",
                          fontSize: 20,
                          color: c.includes("(") ? "#F87171" : fg,
                          background: i % 2 === 0 ? "transparent" : `${primary}06`,
                        }}
                      >
                        {c}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="grid content-start gap-5">
          <Stat label="Breakeven" value="Month 22" primary={primary} fg={fg} />
          <Stat label="LTV / CAC" value="4.7×" primary={primary} fg={fg} />
          <Stat label="Gross margin" value="78%" primary={primary} fg={fg} />
          <Stat label="Runway @ seed" value="22 months" primary={primary} fg={fg} />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  primary,
  fg,
}: {
  label: string;
  value: string;
  primary: string;
  fg: string;
}): JSX.Element {
  return (
    <div className="grid gap-1">
      <span
        className="font-mono text-[11px] uppercase tracking-widest"
        style={{ color: primary }}
      >
        {label}
      </span>
      <span style={{ fontSize: 40, fontWeight: 500, color: fg, fontFamily: "Cabinet Grotesk, system-ui, sans-serif" }}>
        {value}
      </span>
    </div>
  );
}
