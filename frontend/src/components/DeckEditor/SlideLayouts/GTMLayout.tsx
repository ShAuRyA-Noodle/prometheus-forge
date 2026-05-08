import type { LayoutProps } from "./layoutShared";
import { brandFonts, brandPalette, parseBody } from "./layoutShared";

export function GTMLayout({ slide, brand, bodyEditor, onActivateBody }: LayoutProps): JSX.Element {
  const { primary, fg, bg, muted } = brandPalette(brand);
  const { heading, body } = brandFonts(brand);
  const parsed = parseBody(slide.body);
  const phases = parsed.numbered.length
    ? parsed.numbered.slice(0, 3)
    : [
        { label: "Weeks 1-4", value: "Soft launch in 3 founder communities (Indie Hackers, MicroConf, On Deck)" },
        { label: "Weeks 5-8", value: "Product Hunt + targeted founder podcast tour" },
        { label: "Weeks 9-12", value: "Paid acquisition pilot at $40 CAC ceiling, scale only if LTV/CAC > 3" },
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
      <div>
        <div
          className="text-[14px] font-mono uppercase tracking-[0.32em]"
          style={{ color: primary }}
        >
          Go-to-Market
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
        {bodyEditor && (
          <div className="mt-3" style={{ fontSize: 20, color: `${fg}c0` }}>
            {bodyEditor}
          </div>
        )}
      </div>
      <ol className="relative grid grid-cols-3 items-stretch gap-6">
        <div
          aria-hidden="true"
          className="absolute left-[14%] right-[14%] top-[26px] h-[2px]"
          style={{ background: muted }}
        />
        {phases.map((p, i) => (
          <li
            key={p.label}
            className="grid gap-4 rounded-2xl p-6"
            style={{
              background: i === 0 ? `${primary}14` : "transparent",
              border: `1px solid ${muted}`,
            }}
          >
            <div className="flex items-center gap-3">
              <span
                className="grid h-12 w-12 place-items-center rounded-full font-mono"
                style={{ background: primary, color: bg, fontSize: 18 }}
              >
                {i + 1}
              </span>
              <span
                className="font-mono text-[12px] uppercase tracking-widest"
                style={{ color: `${fg}90` }}
              >
                {p.label}
              </span>
            </div>
            <p style={{ fontSize: 18, lineHeight: 1.5, color: fg }}>{p.value}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
