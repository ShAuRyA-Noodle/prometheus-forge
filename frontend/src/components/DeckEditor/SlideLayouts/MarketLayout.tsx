import type { LayoutProps } from "./layoutShared";
import { brandFonts, brandPalette, parseBody } from "./layoutShared";

export function MarketLayout({ slide, brand, bodyEditor, onActivateBody }: LayoutProps): JSX.Element {
  const { primary, fg, bg, muted } = brandPalette(brand);
  const { heading, body } = brandFonts(brand);
  const parsed = parseBody(slide.body);
  // Concentric rings: TAM > SAM > SOM. Pull values from numbered if present.
  const rings: { label: string; value: string; size: number; opacity: number }[] = [
    { label: "TAM", value: parsed.numbered[0]?.value ?? "$71.5B", size: 460, opacity: 0.16 },
    { label: "SAM", value: parsed.numbered[1]?.value ?? "$12.4B", size: 320, opacity: 0.36 },
    { label: "SOM", value: parsed.numbered[2]?.value ?? "$840M", size: 180, opacity: 0.95 },
  ];
  return (
    <div
      className="relative grid h-full w-full"
      style={{
        background: bg,
        color: fg,
        fontFamily: body,
        gridTemplateColumns: "1fr 1fr",
        padding: 80,
        gap: 60,
      }}
    >
      <div className="grid" style={{ gridTemplateRows: "auto 1fr auto" }}>
        <div
          className="text-[14px] font-mono uppercase tracking-[0.32em]"
          style={{ color: primary }}
        >
          Market
        </div>
        <div onDoubleClick={onActivateBody} className="self-end pb-4">
          <h2
            style={{
              fontFamily: heading,
              fontSize: 76,
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              fontWeight: 500,
            }}
          >
            {slide.title}
          </h2>
          {bodyEditor ?? (
            <p
              className="mt-5"
              style={{ fontSize: 22, lineHeight: 1.5, color: `${fg}c8`, maxWidth: 540 }}
            >
              {parsed.paragraphs.join(" ")}
            </p>
          )}
        </div>
        <div className="grid gap-2 pt-4" style={{ gridTemplateColumns: "repeat(3, auto)", maxWidth: 480 }}>
          {rings.map((r) => (
            <div key={r.label} className="grid gap-1">
              <span
                className="font-mono text-[11px] uppercase tracking-widest"
                style={{ color: primary }}
              >
                {r.label}
              </span>
              <span style={{ fontFamily: heading, fontSize: 30, fontWeight: 500 }}>
                {r.value}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="relative grid place-items-center">
        {rings.map((r) => (
          <div
            key={r.label}
            className="absolute rounded-full"
            style={{
              width: r.size,
              height: r.size,
              border: `1px solid ${muted}`,
              background: `${primary}${Math.round(r.opacity * 255)
                .toString(16)
                .padStart(2, "0")}`,
            }}
            aria-hidden="true"
          />
        ))}
        <div className="relative grid place-items-center text-center">
          <span
            className="font-mono text-[10px] uppercase tracking-widest"
            style={{ color: bg }}
          >
            SOM
          </span>
          <span
            style={{
              fontFamily: heading,
              fontSize: 36,
              fontWeight: 500,
              color: bg,
            }}
          >
            {rings[2]?.value}
          </span>
        </div>
      </div>
    </div>
  );
}
