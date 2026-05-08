import type { LayoutProps } from "./layoutShared";
import { brandFonts, brandPalette, parseBody } from "./layoutShared";

export function ContactLayout({ slide, brand, bodyEditor }: LayoutProps): JSX.Element {
  const { primary, fg, bg } = brandPalette(brand);
  const { heading, body } = brandFonts(brand);
  const parsed = parseBody(slide.body);
  const fields = parsed.numbered.length
    ? parsed.numbered
    : [
        { label: "Email", value: "founders@example.com" },
        { label: "Web", value: brand?.tagline ? "—" : "example.com" },
        { label: "Calendar", value: "cal.com/example/intro" },
      ];
  return (
    <div
      className="relative grid h-full w-full"
      style={{
        background: bg,
        color: fg,
        fontFamily: body,
        gridTemplateColumns: "1fr",
        gridTemplateRows: "1fr auto",
        padding: 96,
      }}
    >
      <div className="grid content-center justify-items-start gap-8">
        <p
          className="font-mono text-[14px] uppercase tracking-[0.32em]"
          style={{ color: primary }}
        >
          Let&apos;s build this
        </p>
        <h2
          style={{
            fontFamily: heading,
            fontSize: 110,
            lineHeight: 1,
            letterSpacing: "-0.03em",
            fontWeight: 500,
          }}
        >
          {slide.title}
        </h2>
        {bodyEditor && (
          <div style={{ fontSize: 24, lineHeight: 1.4, color: `${fg}c0`, maxWidth: 760 }}>
            {bodyEditor}
          </div>
        )}
      </div>
      <dl
        className="grid border-t pt-6"
        style={{
          gridTemplateColumns: "repeat(3, 1fr)",
          borderColor: `${primary}40`,
          gap: 32,
        }}
      >
        {fields.slice(0, 3).map((f) => (
          <div key={f.label} className="grid gap-1">
            <dt
              className="font-mono text-[11px] uppercase tracking-widest"
              style={{ color: `${fg}80` }}
            >
              {f.label}
            </dt>
            <dd style={{ fontFamily: heading, fontSize: 24, color: fg }}>{f.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
