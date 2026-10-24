# HCM Lite — Design System

The single source of truth for colors, type, and surfaces is the `@theme`
block in [`src/app/globals.css`](../src/app/globals.css). **Raw hex values
never appear in components** — always use a semantic token class below. This
system is permanent for every phase (landing, auth, employees, attendance,
leave, payroll, analytics, AI assistant, notifications).

## Typography
- `--font-sans`: premium native stack (`ui-sans-serif, -apple-system,
  BlinkMacSystemFont, "Segoe UI", Roboto, …`) — applied on `<body>`. No web
  fonts are downloaded, so builds stay offline-safe.
- Scale: hero `text-4xl/5xl font-semibold leading-[1.12] tracking-tight` ·
  page titles `text-2xl` · card titles `text-sm font-semibold` · body `text-sm
  leading-relaxed` · eyebrows `text-xs uppercase tracking-widest text-muted`.
- Radius scale: panels/cards `rounded-xl` (inputs/buttons also `rounded-xl`) ·
  hero/login cards `rounded-2xl` · pills `rounded-full`.

## Tokens

| Token (utility) | Value | Use for |
|---|---|---|
| `bg-primary` / `text-primary` / `border-primary` | `#065F46` | primary buttons, links, active states |
| `hover:bg-primary-hover` | `#064E3B` | hover on primary actions |
| `bg-primary-tint` | `#ECFDF5` | soft background behind primary elements (icon chips, active nav pills, hero badge) |
| `ring-focus` | `#065F46` | keyboard focus rings (`focus-visible:ring-focus`) |
| `bg-page` | `#F7F8F5` | app background |
| `bg-surface` | `#FFFFFF` | cards, panels, tables, topbar |
| `bg-sidebar` | `#102D25` | dark sidebar + brand panels (pair with `text-sage` / `text-white`) |
| `bg-sage` / `bg-sage/60` | `#DCE9DF` | quiet fills, subtle hovers, neutral badges |
| `text-ink` | `#17211D` | main text |
| `text-muted` | `#64716B` | secondary text, placeholders |
| `border-line` | `#E3E9E4` | all borders and dividers |
| `text-success` on `bg-success-bg` | `#166534` / `#DCFCE7` | success status |
| `text-warning` on `bg-warning-bg` | `#92400E` / `#FEF3C7` | warnings, "coming soon" |
| `text-danger` on `bg-danger-bg` | `#991B1B` / `#FEE2E2` | errors, destructive |
| `text-info` on `bg-info-bg` | `#1E40AF` / `#DBEAFE` | informational status |
| `shadow-card` | subtle 1px lift | cards, inputs |
| `shadow-pop` | larger soft lift | modals, preview panels |

## Component rules

- **Buttons** (`components/ui/Button.js`): `primary` (solid green, white text),
  `secondary` (surface + line border), `ghost` (text only). Sizes sm/base/lg.
  Always `focus-visible` ring; disabled = 60% opacity + no pointer.
- **Cards** (`Card.js`): `bg-surface`, `border-line`, `rounded-xl`,
  `shadow-card`, optional header row with title/description/action.
- **Inputs** (`Input.js`): `border-line` → focus `border-primary` +
  `ring-focus/30`; errors switch to the `danger` pair. `rounded-xl`.
- **Alerts** (`Alert.js`): inline banners for error/success/warning/info —
  token pairs, `rounded-xl`, errors use `role="alert"` for screen readers.
- **Badges** (`Badge.js`): tones `primary | success | warning | danger | info |
  neutral` — always the dark text color on its matching light background.
- **Navigation**: desktop sidebar `bg-sidebar` with `text-sage` items (active =
  `bg-white/10 text-white`); topbar `bg-surface` + `border-line`; mobile pills:
  active `bg-primary-tint text-primary`, inactive `bg-sage/60 text-muted`.
- **Tables (from Phase 4)**: surface background, `border-line` row dividers,
  `text-muted` column headers, `rounded-xl` outer border, `shadow-card`.
- **Status on dark surfaces**: use `text-sage` / `text-white`; never place
  muted-on-sidebar text.
- Light mode only; the system intentionally has no dark theme.

## Accessibility
All text/background pairs above meet WCAG AA contrast. Focus states are always
visible (`focus-visible:ring-2 ring-focus ring-offset-2`). Status is never
conveyed by color alone — pair with text.
