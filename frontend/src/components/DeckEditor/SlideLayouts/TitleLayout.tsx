import type { LayoutProps } from "./layoutShared";
import { brandFonts, brandPalette, SLIDE_H, SLIDE_W } from "./layoutShared";

export function TitleLayout({ slide, brand, bodyEditor, onActivateBody }: LayoutProps): JSX.Element {
  const { primary, fg, bg } = brandPalette(brand);
  const { heading, body } = brandFonts(brand);
  return (
    <div
      className="relative grid h-full w-full"
      style={{
        background: `radial-gradient(120% 120% at 8% 8%, ${primary}26 0%, transparent 55%), ${bg}`,
        gridTemplateColumns: "1fr",
        gridTemplateRows: "auto 1fr auto",
        padding: 96,
        color: fg,
        fontFamily: body,
      }}
    >
      <div
        className="text-[16px] font-medium uppercase tracking-[0.32em]"
        style={{ color: primary }}
      >
        {brand?.company_name ?? "Untitled Co."}
      </div>
      <div
        className="self-end pb-4"
        onDoubleClick={onActivateBody}
      >
        <h1
          className="font-display"
          style={{
            fontFamily: heading,
            fontSize: 110,
            lineHeight: 1.02,
            letterSpacing: "-0.03em",
            fontWeight: 500,
            maxWidth: SLIDE_W * 0.85,
            color: fg,
          }}
        >
          {slide.title}
        </h1>
        {bodyEditor ? (
          <div className="mt-7 max-w-[78%]" style={{ fontSize: 26, lineHeight: 1.4, color: `${fg}cc` }}>
            {bodyEditor}
          </div>
        ) : (
          <p className="mt-7 max-w-[78%]" style={{ fontSize: 26, lineHeight: 1.4, color: `${fg}cc` }}>
            {slide.body}
          </p>
        )}
      </div>
      <div
        className="flex items-center justify-between text-[14px] font-mono uppercase tracking-[0.2em]"
        style={{ color: `${fg}66` }}
      >
        <span>{brand?.tagline ?? ""}</span>
        <span>{slide.slide_number.toString().padStart(2, "0")} / —</span>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          right: 0,
          bottom: 0,
          width: SLIDE_W * 0.18,
          height: SLIDE_H * 0.4,
          background: primary,
          clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
          opacity: 0.85,
        }}
      />
    </div>
  );
}
