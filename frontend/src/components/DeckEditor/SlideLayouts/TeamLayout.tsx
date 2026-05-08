import type { LayoutProps } from "./layoutShared";
import { brandFonts, brandPalette, parseBody } from "./layoutShared";

export function TeamLayout({ slide, brand, bodyEditor, onActivateBody }: LayoutProps): JSX.Element {
  const { primary, fg, bg, muted } = brandPalette(brand);
  const { heading, body } = brandFonts(brand);
  const parsed = parseBody(slide.body);
  // Each numbered entry = "Name (Role): credentials"
  const members = parsed.numbered.length
    ? parsed.numbered.map((n) => ({ name: n.label, blurb: n.value }))
    : [
        { name: "Maya Okonkwo · CEO", blurb: "ex-Notion PM, shipped Notion AI to 12M users." },
        { name: "Felix Renner · CTO", blurb: "Staff eng @ Vercel, built v0 inference layer." },
        { name: "Priya Iyer · Design", blurb: "Linear → Lovable, designed two YC top-10 launches." },
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
        gap: 40,
      }}
    >
      <div>
        <div
          className="text-[14px] font-mono uppercase tracking-[0.32em]"
          style={{ color: primary }}
        >
          Team
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
      <div className="grid grid-cols-3 gap-6">
        {members.slice(0, 3).map((m, i) => (
          <article
            key={m.name}
            className="grid content-end overflow-hidden rounded-3xl p-6"
            style={{
              background: i === 1 ? `${primary}14` : "transparent",
              border: `1px solid ${muted}`,
              minHeight: 360,
            }}
          >
            <div
              aria-hidden="true"
              className="mb-6 grid h-24 w-24 place-items-center rounded-full"
              style={{
                background: `linear-gradient(135deg, ${primary} 0%, ${primary}40 100%)`,
                fontFamily: heading,
                fontSize: 38,
                color: bg,
                fontWeight: 500,
              }}
            >
              {m.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}
            </div>
            <h3
              style={{ fontFamily: heading, fontSize: 26, fontWeight: 500, color: fg, lineHeight: 1.2 }}
            >
              {m.name}
            </h3>
            <p className="mt-2" style={{ fontSize: 16, lineHeight: 1.5, color: `${fg}c0` }}>
              {m.blurb}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
