import type { LayoutProps } from "./layoutShared";
import { brandFonts, brandPalette, parseBody } from "./layoutShared";

export function SolutionLayout({ slide, brand, bodyEditor, onActivateBody }: LayoutProps): JSX.Element {
  const { primary, fg, bg, muted } = brandPalette(brand);
  const { heading, body } = brandFonts(brand);
  const parsed = parseBody(slide.body);
  return (
    <div
      className="relative h-full w-full"
      style={{
        background: bg,
        color: fg,
        fontFamily: body,
        padding: 80,
      }}
    >
      <div
        className="grid h-full w-full"
        style={{ gridTemplateColumns: "minmax(0, 7fr) minmax(0, 5fr)", gap: 60 }}
      >
        <div className="grid" style={{ gridTemplateRows: "auto 1fr auto" }}>
          <div
            className="text-[14px] font-mono uppercase tracking-[0.32em]"
            style={{ color: primary }}
          >
            Solution
          </div>
          <div onDoubleClick={onActivateBody} className="self-end pb-4">
            <h2
              style={{
                fontFamily: heading,
                fontSize: 84,
                lineHeight: 1.04,
                letterSpacing: "-0.02em",
                fontWeight: 500,
              }}
            >
              {slide.title}
            </h2>
            {bodyEditor ?? (
              <p
                className="mt-6"
                style={{ fontSize: 23, lineHeight: 1.5, color: `${fg}c8`, maxWidth: 700 }}
              >
                {parsed.paragraphs.join(" ")}
              </p>
            )}
          </div>
          <div />
        </div>
        <div
          className="grid gap-3 self-center rounded-3xl p-7"
          style={{
            background: `${primary}14`,
            border: `1px solid ${muted}`,
            gridTemplateColumns: "1fr",
          }}
        >
          <p
            className="font-mono text-[12px] uppercase tracking-widest"
            style={{ color: primary }}
          >
            How it works
          </p>
          <ol className="grid gap-3" style={{ counterReset: "step" }}>
            {parsed.bullets.slice(0, 4).map((b, i) => (
              <li
                key={i}
                className="grid items-start gap-4"
                style={{ gridTemplateColumns: "44px 1fr" }}
              >
                <span
                  className="grid h-11 w-11 place-items-center rounded-full font-mono text-[16px]"
                  style={{ background: primary, color: bg }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: 19, lineHeight: 1.45, color: fg }}>{b}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
