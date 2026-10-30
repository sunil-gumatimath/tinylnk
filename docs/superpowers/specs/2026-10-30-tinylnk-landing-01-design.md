# tinylnk Landing Page 01 Inspired Redesign

## Intent

Reshape tinylnk's main screen around the dark, technical landing-page composition in Watermelon UI's Landing Page 01. The reason is to match the specific hero, grid, section, and motion style the user chose while keeping tinylnk a working URL shortener and link dashboard.

## Goals

- Use a fixed dark technical canvas, centered hero, monospaced utility labels, lime accent, dotted grid, fine rules, and restrained crosshair details.
- Make the existing URL shortener the main hero action, preserving its advanced settings, result, copy, QR, and open-link actions.
- Present tinylnk's existing authenticated KPIs, search/filter controls, link cards, and analytics in a clear bento-like composition.
- Use concise feature blocks to surface existing capabilities such as custom aliases, QR codes, and click analytics.
- Keep the header, sign-in, theme toggle, responsive behavior, keyboard support, and reduced-motion behavior working.
- Preserve user-added alias validation in the shortener and edit modal.

## Non-goals

- Do not add testimonials, invented usage counts, or new product functionality.
- Do not copy Watermelon-specific wording, external screenshots, or remote template assets.
- Do not install the Watermelon template, Tailwind, shadcn/ui, or additional animation/icon dependencies.
- Do not change backend routes, authentication, ownership, link validation, analytics calculations, or QR behavior.

## Approaches

- Adapt the full Landing Page 01 composition around tinylnk's actual shortener and dashboard. **Selected.** This best matches the requested reference while keeping the product's real actions central.
- Keep tinylnk's current page composition and apply only the dark technical styling. This is smaller, but would miss the selected template's recognizable layout.

## Design system

- **Color:** canvas `#101010`; elevated surface `#171717`; primary accent `#A3FF12`; primary text `#F5F5F5`; muted text `#8A8A8A`; dividers `rgba(255,255,255,.08)`.
- **Type:** Inter for large headings and readable interface copy; system monospace for compact technical labels, codes, and metadata.
- **Shape and details:** square to 4px corners for technical surfaces; 1px hairline borders; dotted grid only in large background areas; crosshairs at major section boundaries; lime glow used sparingly.
- **Motion:** keep existing Framer Motion and its reduced-motion support; use one restrained hero reveal and existing user-triggered interaction motion.

## Layout concept

```text
┌ tinylnk ── Create ── Dashboard ── Theme / Account ┐
│                 // LINK SYSTEM                    │
│            Short links. Full signal.              │
│         Simple product explanation                │
│   [destination URL________________] [Shorten]      │
│      [optional settings]    [result / QR]          │
├────────────── technical rule / grid ──────────────┤
│   existing KPI strip / sign-in prompt              │
│   [Links] [Clicks] [Active]                        │
│   [search + tag filter]                             │
│   [link cards in responsive grid]                   │
├────────────── capability bento ──────────────────┤
│   Custom aliases       QR sharing     Analytics    │
└ tinylnk footer / repository link ─────────────────┘
```

Use left-aligned content inside modular sections and center only the hero. Keep the actual shortener prominent; place the existing dashboard below it, with account state determining whether the dashboard or sign-in prompt appears.

## Constraints and implementation calls

- Keep React 19, TypeScript, Vite, Ant Design, Framer Motion, Recharts, and Lucide.
- Prefer existing components and CSS. Adjust `App.tsx`, `Hero.tsx`, and `index.css` only where the current markup cannot express the selected composition; update shared theme values as needed.
- Keep the light-theme toggle behavior by mapping the same layout to a readable light palette; dark remains the default reference appearance.
- Reuse real tinylnk capabilities and user-specific dashboard data. Keep external template artwork out of the app.
