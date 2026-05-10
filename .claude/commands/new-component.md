---
name: new-component
description: Scaffold a new React component with TS strict, Tailwind tokens, ARIA, and a vitest test.
argument-hint: <Name> [folder]
---

You are scaffolding a React component for PROMETHEUS. Two arguments:
1. **Name** — PascalCase (e.g. `BrandRefiner`)
2. **folder** — optional subfolder under `frontend/src/components/` (e.g. `MicroWidgets`); default is the root of `components/`.

Honor `CLAUDE.md` and `.claude/skills/taste-design-frontend/SKILL.md`:
- Tailwind v4 design tokens — ink + accent palette, no purple/blue gradients, no Inter font
- TS 5 strict; no `any`; no `as` without comment explanation
- React 18 functional components; hooks `useXxx.ts`
- Framer Motion springs `stiffness: 100, damping: 20`; animate transform + opacity only
- Use `min-h-[100dvh]` not `h-screen`; CSS Grid not flex-math
- DOMPurify mandatory for any agent-output HTML/SVG (centralized in `lib/purify.ts`)
- ARIA: name, role, focus management, keyboard nav

## Generate two files

### 1. `frontend/src/components/{folder}/{Name}.tsx`

```tsx
import { motion } from 'framer-motion';
import type { FC } from 'react';

export interface {Name}Props {
  /** TODO: document */
  className?: string;
}

const SPRING = { type: 'spring' as const, stiffness: 100, damping: 20 };

export const {Name}: FC<{Name}Props> = ({ className }) => {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={SPRING}
      role="region"
      aria-label="{Name}"
      className={`grid gap-4 p-4 bg-ink-surface text-text-primary ${className ?? ''}`}
    >
      {/* TODO: implement */}
    </motion.section>
  );
};

export default {Name};
```

### 2. `frontend/src/components/{folder}/__tests__/{Name}.test.tsx`

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { {Name} } from '../{Name}';

describe('{Name}', () => {
  it('renders with the expected ARIA role', () => {
    render(<{Name} />);
    expect(screen.getByRole('region', { name: '{Name}' })).toBeInTheDocument();
  });

  it('respects className prop', () => {
    render(<{Name} className="test-cls" />);
    expect(screen.getByRole('region')).toHaveClass('test-cls');
  });
});
```

## Last in your response

Print:

> **Don't forget:**
> 1. If this renders agent output (HTML/SVG), pass it through `lib/purify.ts` first.
> 2. If iframe-based, use `<Sandbox>` from `components/Sandbox/` (sandbox="allow-forms" only).
> 3. If interactive, ensure focus-visible state + keyboard handlers.
> 4. If displays numbers, use `<CitationChip>` from `MicroWidgets/`.
> 5. Add to Storybook (when wired) and to the relevant page (`pages/*.tsx`).
> 6. Run `cd frontend && npm run test {Name}.test` to verify green.
