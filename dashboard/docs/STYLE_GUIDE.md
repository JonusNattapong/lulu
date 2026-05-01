# Styling Guide

## Color System

The dashboard uses a dark slate base with accent colors for visual hierarchy.

### Base Colors

| Token | Value | Usage |
|-------|-------|-------|
| `bg-[#0f172a]` | Slate-900 | Page background |
| `bg-slate-800` | Gray-800 | Card base |
| `bg-slate-900/50` | Gray-900/50 | Input fields |
| `text-slate-200` | Gray-200 | Primary text |
| `text-slate-400` | Gray-400 | Secondary text |
| `text-slate-500` | Gray-500 | Tertiary text / labels |

### Accent Colors

| Color | Hex/Tailwind | Application |
|-------|-------------|-------------|
| Cyan | `cyan-400`, `cyan-500`, `text-cyan-400` | Primary actions, chat, main CTA |
| Purple | `purple-400`, `text-purple-400` | Capabilities tab |
| Pink | `pink-400`, `text-pink-400` | Plugins section (Ecosystem) |
| Green | `green-400`, `bg-green-500` | Status indicators, availability checkmarks |
| Orange | `orange-400`, `text-orange-400` | Sessions / history |
| Blue | `blue-400/500` | User message bubbles |
| Yellow | `yellow-400` | Token chart gradient |
| Red | `red-400` | Unavailable capability crosses |

## Glassmorphism

The `.glass` utility (in `src/index.css`) provides the signature frosted-panel look:

```css
.glass {
  background: rgba(30, 41, 59, 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
```

Applied to:
- All major panels (StatCard wrappers, tab content, chart area, history cards)
- Chat stream bubble
- Terminal / memory pre blocks

**Visual effect:** Semi-transparent dark slate with soft blur, subtle white border for depth.

### Hover Effects

`.card-hover` utility (lines 24–32 in `index.css`):

```css
.card-hover {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.card-hover:hover {
  transform: translateY(-4px);
  border-color: rgba(56, 189, 248, 0.5);
  box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
}
```

Used on: StatCard containers.

## Typography

| Element | Class | Notes |
|---------|-------|-------|
| Main heading | `text-3xl font-bold tracking-tight text-white` | Logo in header |
| Section titles | `text-xl/2xl font-bold flex items-center gap-2` | All tab subheadings |
| Body text | `text-sm text-slate-200` | Regular content |
| Secondary | `text-slate-400` / `text-xs text-slate-500` | Labels, timestamps |
| Monospace | `font-mono text-sm` | Memory view, terminal blocks |
| Button | `text-sm font-semibold` | All buttons |

**Fonts:** System UI / Inter via `:root { font-family: 'Inter', system-ui, ... }`.

## Spacing

- Page padding: `p-4 md:p-8`
- Section gaps: `gap-6`, `gap-8`, `space-y-6`, `space-y-8`
- Card padding: `p-6`, `p-8` (glass panels)
- Input padding: `px-4 py-3` (prompt), `px-4 py-3` (chat input)

## Border Radius

- Panels / cards: `rounded-3xl` (24px) — soft pill-like edges
- Buttons: `rounded-xl` (12px)
- Chips / badges: `rounded-md`
- StatCard icon wrapper: `rounded-xl`

## Shadows

No drop-shadows on generic elements. Shadow only appears on:
- Logo icon: `shadow-lg shadow-cyan-500/20`
- Active tab button: `shadow-lg shadow-cyan-500/20`
- Hover states: `.card-hover` box-shadow

## Responsive Breakpoints

| Prefix | Min-width | Usage |
|--------|-----------|-------|
| `md:` | 768px | Stats grid → 4 cols, header flex-row |
| `lg:` | 1024px | Chart area → 2/3 width, input layout |
| No prefix | < 768px | Single-column stack |

**Patterns:**
- Stats: `grid-cols-1 md:grid-cols-4`
- Chart container: `lg:col-span-2`
- Ecosystem: `grid grid-cols-1 md:grid-cols-2`

## Animation

**Framer Motion** used for tab transitions:

```tsx
<motion.div
  key="tabname"
  initial={{ opacity: 0, y: 10 }}   // slide up + fade in
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -10 }}     // slide up + fade out
  className="..."
/>
```

- `AnimatePresence mode="wait"` — ensures exit animation completes before next enter
- No spring physics; default ease-out

**CSS transitions** (on hover):
- `.card-hover`: `transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1)`
- Buttons: `transition-all` on all interactive elements

## CSS Utilities

Only two custom classes exist beyond Tailwind:

1. `.glass` — glassmorphism panel
2. `.card-hover` — hover lift + border-color + shadow

Everything else uses Tailwind utility classes directly.

## Dark Theme Only

The dashboard is dark-mode exclusive (`color-scheme: dark`). No light theme variants are defined.

## Icon Usage

Lucide React icons imported at component top:

```tsx
import { Activity, Database, Cpu, History, ExternalLink, Zap, Terminal, Search, MessageSquare, Globe, Box, CheckCircle, XCircle } from 'lucide-react';
```

Applied with `className="text-cyan-400"` or similar color utility.

## Future Styling Migration

If adopting Tailwind v4's new `@theme` syntax or design tokens:
- Move custom colors to `tailwind.config.cjs theme.extend.colors`
- Define spacing scale if consistent spacing tokens are needed
- Add animation variants to `theme.keyframes` if complex transitions grow
