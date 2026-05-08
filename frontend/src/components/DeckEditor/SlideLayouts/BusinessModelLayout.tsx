import type { LayoutProps } from "./layoutShared";
import { brandFonts, brandPalette, parseBody } from "./layoutShared";

export function BusinessModelLayout({ slide, brand, bodyEditor, onActivateBody }: LayoutProps): JSX.Element {
  const { primary, fg, bg, muted } = brandPalette(brand);
  const { heading, body } = brandFonts(brand);
  const parsed = parseBody(slide.body);
  // 9-block canvas in a 4-3 asymmetric grid (key partners big, channels narrow, etc.)
  const blocks = parsed.bullets.slice(0, 9);
  const labels = [
    "Key Partners",
    "Key Activities",
    "Value Prop",
    "Customer Relationships",
    "Customer Segments",
    "Key Resources",
    "Channels",
    "Cost Structure",
    "Revenue Streams",
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
        padding: 64,
        gap: 24,
      }}
    >
      <div className="flex items-end justify-between">
        <div>
          <div
            className="text-[14px] font-mono uppercase tracking-[0.32em]"
            style={{ color: primary }}
          >
            Business Model
          </div>
          <h2
            className="mt-2"
            style={{
              fontFamily: heading,
              fontSize: 56,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              fontWeight: 500,
            }}
            onDoubleClick={onActivateBody}
          >
            {slide.title}
          </h2>
        </div>
        {bodyEditor && <div className="max-w-[40%]" style={{ fontSize: 18 }}>{bodyEditor}</div>}
      </div>
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: "1.4fr 1fr 1.6fr 1fr 1.4fr",
          gridTemplateRows: "1fr 1fr",
        }}
      >
        {labels.slice(0, 9).map((label, i) => (
          <div
            key={label}
            className="rounded-xl p-4"
            style={{
              background: i === 2 ? `${primary}1c` : "transparent",
              border: `1px solid ${muted}`,
              gridColumn: i === 2 ? "3 / 4" : undefined,
              gridRow:
                i === 0 ? "1 / 3" : i === 4 ? "1 / 3" : i === 7 ? "2 / 3" : i === 8 ? "2 / 3" : undefined,
            }}
          >
            <div
              className="font-mono text-[10px] uppercase tracking-widest"
              style={{ color: i === 2 ? primary : `${fg}80` }}
            >
              {label}
            </div>
            <div className="mt-1.5" style={{ fontSize: 14, lineHeight: 1.4, color: fg }}>
              {blocks[i] ?? "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
