import type { LayoutProps } from "./layoutShared";
import { brandFonts, brandPalette, parseBody } from "./layoutShared";

export function ProblemLayout({ slide, brand, bodyEditor, onActivateBody }: LayoutProps): JSX.Element {
  const { primary, fg, bg, muted } = brandPalette(brand);
  const { heading, body } = brandFonts(brand);
  const parsed = parseBody(slide.body);
  return (
    <div
      className="relative grid h-full w-full"
      style={{
        background: bg,
        color: fg,
        fontFamily: body,
        gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1fr)",
        gridTemplateRows: "auto 1fr",
        padding: 84,
        gap: 56,
      }}
    >
      <div className="col-span-2">
        <div
          className="text-[14px] font-mono uppercase tracking-[0.32em]"
          style={{ color: primary }}
        >
          The Problem
        </div>
        <h2
          className="mt-4"
          style={{
            fontFamily: heading,
            fontSize: 76,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            fontWeight: 500,
            maxWidth: "92%",
          }}
        >
          {slide.title}
        </h2>
      </div>
      <div onDoubleClick={onActivateBody} className="self-start">
        {bodyEditor ?? (
          <p style={{ fontSize: 24, lineHeight: 1.55, color: `${fg}d0` }}>
            {parsed.paragraphs.join("\n\n")}
          </p>
        )}
      </div>
      <aside className="self-start">
        <div
          className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-4"
          style={{ fontSize: 18 }}
        >
          {parsed.numbered.length > 0
            ? parsed.numbered.map((n) => (
                <Stat key={n.label} label={n.label} value={n.value} primary={primary} fg={fg} />
              ))
            : parsed.bullets.slice(0, 3).map((b, i) => (
                <Stat key={i} label={`#${i + 1}`} value={b} primary={primary} fg={fg} />
              ))}
        </div>
        <div
          className="mt-8 rounded-2xl border p-6"
          style={{ borderColor: muted, background: `${primary}0d` }}
        >
          <p className="font-mono text-[12px] uppercase tracking-widest" style={{ color: primary }}>
            Cost of inaction
          </p>
          <p className="mt-2" style={{ fontSize: 22, lineHeight: 1.4, color: fg }}>
            Founders waste 100–200 hours and $10K–$45K assembling what should be one workflow.
          </p>
        </div>
      </aside>
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
    <>
      <div
        className="font-mono pt-1 text-[14px] uppercase tracking-widest"
        style={{ color: primary }}
      >
        {label}
      </div>
      <div style={{ color: fg, fontSize: 22, lineHeight: 1.35 }}>{value}</div>
    </>
  );
}
