import type { LayoutProps } from "./layoutShared";
import { brandFonts, brandPalette, parseBody } from "./layoutShared";

export function CompetitionLayout({ slide, brand, bodyEditor, onActivateBody }: LayoutProps): JSX.Element {
  const { primary, fg, bg, muted } = brandPalette(brand);
  const { heading, body } = brandFonts(brand);
  const parsed = parseBody(slide.body);
  // Use bullets as competitor names; numbered rows as feature comparisons.
  const competitors = parsed.bullets.length
    ? parsed.bullets.slice(0, 4)
    : ["Incumbent A", "Incumbent B", "Open-source DIY"];
  const features = parsed.numbered.length
    ? parsed.numbered
    : [
        { label: "End-to-end pipeline", value: "✓ ✗ ✗ ✗" },
        { label: "Real grounded data", value: "✓ ✗ ✓ ✗" },
        { label: "Editable artifacts", value: "✓ ✗ ✗ ✓" },
        { label: "Sub-2-min runtime", value: "✓ ✗ ✗ ✗" },
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
        padding: 72,
        gap: 36,
      }}
    >
      <div className="flex items-end justify-between">
        <div>
          <div
            className="text-[14px] font-mono uppercase tracking-[0.32em]"
            style={{ color: primary }}
          >
            Competition
          </div>
          <h2
            className="mt-2"
            style={{
              fontFamily: heading,
              fontSize: 60,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              fontWeight: 500,
            }}
            onDoubleClick={onActivateBody}
          >
            {slide.title}
          </h2>
        </div>
        {bodyEditor && (
          <div className="max-w-[44%]" style={{ fontSize: 18, lineHeight: 1.5 }}>
            {bodyEditor}
          </div>
        )}
      </div>
      <div
        className="rounded-2xl"
        style={{ border: `1px solid ${muted}` }}
      >
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: `${primary}10` }}>
              <th
                className="text-left"
                style={{ padding: "20px 28px", fontSize: 14, color: primary, fontFamily: body }}
              >
                FEATURE
              </th>
              <th
                style={{ padding: "20px 28px", fontSize: 14, color: primary, fontFamily: body, fontWeight: 700 }}
              >
                {brand?.company_name ?? "Us"}
              </th>
              {competitors.map((c) => (
                <th
                  key={c}
                  style={{
                    padding: "20px 28px",
                    fontSize: 14,
                    color: `${fg}90`,
                    fontFamily: body,
                  }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map((row, i) => {
              const cells = row.value.split(/\s+/);
              return (
                <tr key={row.label} style={{ borderTop: `1px solid ${muted}` }}>
                  <td style={{ padding: "18px 28px", fontSize: 18, color: fg }}>{row.label}</td>
                  {Array.from({ length: competitors.length + 1 }).map((_, j) => {
                    const v = cells[j] ?? (j === 0 ? "✓" : "✗");
                    const ok = v.includes("✓");
                    return (
                      <td
                        key={j}
                        className="text-center"
                        style={{
                          padding: "18px 28px",
                          fontSize: 22,
                          color: j === 0 ? primary : ok ? `${fg}` : `${fg}40`,
                          background: i % 2 === 0 ? "transparent" : `${primary}06`,
                        }}
                      >
                        {ok ? "●" : "—"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
