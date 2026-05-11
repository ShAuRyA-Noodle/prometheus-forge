---
name: taste-design-frontend
description: PROMETHEUS frontend taste discipline — auto-invokes for frontend/src/**/*.tsx. Enforces ink+accent palette only (no purple/blue), Cabinet Grotesk + Geist (no Inter), min-h-[100dvh], CSS Grid, animate transform+opacity, spring 100/20, no "John Doe / 99.99% / Acme/Nexus/Flow", every HTML/SVG via purify.ts, iframe sandbox="allow-forms" only.
---

# Frontend Taste Discipline

You are editing PROMETHEUS frontend code. The product looks like a tool, not an AI demo. Every surface respects these rules.

This file applies whenever you are editing:
- `frontend/src/**/*.tsx`
- `frontend/src/**/*.ts`
- `frontend/tailwind.config.ts`
- `frontend/index.html`
- `frontend/postcss.config.cjs`

## Hard rules

### R1. Palette: ink + accent only

```
Background:  #0F0F10  (ink-bg)
Surface:     #1A1A1B  (ink-surface)
Surface-2:   #232325  (ink-surface-2 — slight elevation)
Border:      #2E2E30
Text:        #E6E6E6  (text-primary)
Text-2:      #A1A1A1  (text-secondary)
Text-3:      #6E6E70  (text-tertiary)
Accent:      #FF5C28  (accent / brand-warm — or per-brand for generated artifacts)
Success:     #2DD4BF  (teal-400; never green-500)
Warning:     #F4B53D  (mustard; never yellow-300)
Danger:      #E84B45  (red-500-ish; never blood-red)
```

**FORBIDDEN colors:**
- Purple (`#7C3AED`, `purple-*`)
- Blue (`#3B82F6`, `blue-*`)
- Indigo
- Any "AI gradient" — purple-to-blue, indigo-to-violet, "Polygon"-style cyan-pink
- Pastel pinks (`pink-300`)

If you find these in legacy code, replace with ink + accent equivalents.

### R2. Typography

- **Display**: Cabinet Grotesk (loaded via Fontshare CDN with `font-display: swap`)
- **Body**: Geist (loaded via fontsource)
- **Mono**: JetBrains Mono (only for code blocks)

**FORBIDDEN fonts:**
- Inter (over-used in dev tools — every AI demo uses Inter)
- SF Pro (vendor-specific, license issues)
- Roboto, Helvetica, Arial as primary

```
font-family: "Cabinet Grotesk", "Geist", system-ui, sans-serif;
```

### R3. Sizing

- Use `min-h-[100dvh]` — never `h-screen` (mobile Safari breaks `vh`)
- Use `dvh`/`svh`/`lvh` units intentionally
- Container widths via grid breakpoints, not fixed pixel values

### R4. Layout

- **CSS Grid** for everything structural (canvas, dashboard, results page)
- **Flexbox** only for inline alignment (icon + text, badge stack)
- **No flex-math** — if you find yourself computing `width: calc(33% - 1rem)`, switch to `grid-cols-3 gap-4`

### R5. Motion

- **Framer Motion** for any animation
- Spring: `{ type: "spring", stiffness: 100, damping: 20 }` (canonical)
- Animate **only**: `opacity`, `transform` (translate / scale / rotate)
- **Never** animate: `width`, `height`, `padding`, `margin`, `top`, `left` (causes layout thrash)
- Reduced-motion respect: `useReducedMotion()` from framer-motion; cut spring to `tween` w/ duration ≤ 100ms

```tsx
const SPRING = { type: 'spring' as const, stiffness: 100, damping: 20 };

<motion.div
  initial={{ opacity: 0, y: 12 }}   // y is transform translateY — OK
  animate={{ opacity: 1, y: 0 }}
  transition={SPRING}
/>
```

### R6. Iframes

- Use the `<Sandbox>` component from `frontend/src/components/Sandbox/`
- It sets `sandbox="allow-forms"` and injects strict CSP
- **Never** `<iframe>` directly. Never `sandbox="allow-scripts"`. Never `allow-same-origin`.

### R7. Sanitization

- Any HTML / SVG that came from an agent passes through `lib/purify.ts`
- `dangerouslySetInnerHTML={{ __html: purify(htmlString) }}` — `purify` import is mandatory
- Never bypass with a "trust" comment

```tsx
import { purify } from '@/lib/purify';

<div
  dangerouslySetInnerHTML={{ __html: purify(html) }}
  className="prose prose-invert"
/>
```

### R8. Sample data

- Real or `[ — ]`. Never fabricated.
- **FORBIDDEN sample data:**
  - "John Doe", "Jane Smith", "Alex"
  - "99.99%", "10x", "1000+ users"
  - "Acme Corp", "Nexus", "Flow", "Lorem"
  - "[Your company name here]"
- For demos, use the actual generated artifact (one of the golden ideas) — e.g. "Rotunda" with the real palette + real coherence score.

### R9. ARIA + a11y

Every interactive component:
- has a `role` (button, region, dialog, etc.)
- has a `name` (`aria-label` or visible label)
- has keyboard handlers (`onKeyDown` for Enter/Space)
- has a `:focus-visible` style (`focus-visible:ring-2 focus-visible:ring-accent`)
- meets WCAG AA contrast (4.5:1 text vs background; 3:1 large text)

`@axe-core/react` is wired in dev; tests in `frontend/src/__tests__/a11y.test.tsx` enforce zero violations.

### R10. Bundle hygiene

- Tree-shake imports: `import { motion } from 'framer-motion'` not the full package
- Lazy-load heavy editors (Tiptap, Monaco, Recharts) via `React.lazy`
- No moment.js (use date-fns)
- No lodash (use native or scattered helpers)

## Anti-patterns (forbidden)

- ❌ "Quick fade-in-from-y-20 on every component" — only the canvas-drop animation uses it; others stay still
- ❌ Generic 3-card row with `grid-cols-3 gap-4 [card][card][card]` — that pattern screams "AI demo." Use bento layouts with deliberate hierarchy
- ❌ "Built with AI" badges, sparkle emojis, gradient text on the H1
- ❌ "Try it now" CTA without a real preview behind it
- ❌ `dangerouslySetInnerHTML` without `purify`
- ❌ Inline SVG with `<script>` (forbidden anyway by purify; double check before render)

## When you change a frontend file

You MUST also:
1. Verify Lighthouse perf ≥ 90, a11y ≥ 95 on the affected page
2. Verify no new bundle size regression (`vite build --report` if substantial change)
3. Add/update vitest test for new behavior
4. If new component renders agent output: import + use `purify`

## Reading order

1. `CLAUDE.md` (TypeScript / Frontend section)
2. `PROMETHEUS_BLUEPRINT_V2.md` §5 (frontend architecture)
3. The current component you're editing
4. `frontend/src/lib/tokens.ts` — design tokens (palette, type scale, spacing)
