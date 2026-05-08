import type { LayoutProps } from "./layoutShared";
import { brandFonts, brandPalette, parseBody } from "./layoutShared";

export function AskLayout({ slide, brand, bodyEditor, onActivateBody }: LayoutProps): JSX.Element {
  const { primary, fg, bg, muted } = brandPalette(brand);
  const { heading, body } = brandFonts(brand);
  const parsed = parseBody(slide.body);
  const ask = parsed.numbered.find((n) => /raise|seed|round/i.test(n.label))?.value ?? "$1.5M Seed";
  const useOf = parsed.bullets.length
    ? parsed.bullets.slice(0, 4)
    : [
        "Hire two staff engineers + one founding designer",
        "Ship enterprise-grade workspace integrations",
        "Run paid acquisition pilot at $40 CAC ceiling",
        "18-month runway to $4M ARR Series A",
      ];
  return (
    <div
      className="relative grid h-full w-full"
      style={{
        background: `radial-gradient(80% 80% at 90% 10%, ${primary}30 0%, transparent 50%), ${bg}`,
        color: fg,
        fontFamily: body,
        gridTemplateColumns: "1.2fr 1fr",
        padding: 96,
        gap: 56,
      }}
    >
      <div className="grid content-end" onDoubleClick={onActivateBody}>
        <div
          className="text-[14px] font-mono uppercase tracking-[0.32em]"
          style={{ color: primary }}
        >
          The Ask
        </div>
        <h2
          className="mt-3"
          style={{
            fontFamily: heading,
            fontSize: 130,
            lineHeight: 0.96,
            letterSpacing: "-0.04em",
            fontWeight: 500,
          }}
        >
          {ask}
        </h2>
        <p className="mt-6 max-w-[640px]" style={{ fontSize: 22, lineHeight: 1.5, color: `${fg}d0` }}>
          {bodyEditor ?? slide.title}
        </p>
      </div>
      <div className="grid content-end gap-5">
        <div
          className="rounded-2xl p-6"
          style={{ border: `1px solid ${muted}`, background: `${primary}10` }}
        >
          <p
            className="font-mono text-[12px] uppercase tracking-widest"
            style={{ color: primary }}
          >
            Use of funds
          </p>
          <ul className="mt-3 grid gap-3">
            {useOf.map((u, i) => (
              <li
                key={i}
                className="grid gap-3"
                style={{ gridTemplateColumns: "auto 1fr", alignItems: "baseline" }}
              >
                <span
                  className="font-mono text-[14px]"
                  style={{ color: primary, minWidth: 40 }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ fontSize: 18, lineHeight: 1.45, color: fg }}>{u}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
