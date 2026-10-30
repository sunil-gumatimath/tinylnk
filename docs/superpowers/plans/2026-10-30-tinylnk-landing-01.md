# tinylnk Landing Page 01 Inspired UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Reshape tinylnk's page into a dark technical landing experience inspired by Watermelon UI Landing Page 01 while retaining its current URL and dashboard workflows.

**Architecture:** Keep the existing React/Ant Design component and state model. First align light/dark theme tokens to the chosen visual system, then adapt the page composition and reusable CSS around the existing hero, shortener, auth states, dashboard, and dialogs.

**Tech Stack:** React 19, TypeScript, Vite, Ant Design 6, CSS, Framer Motion, Recharts, Lucide.

**Spec:** `docs/superpowers/specs/2026-10-30-tinylnk-landing-01-design.md`

## Global Constraints

- Keep React 19, TypeScript, Vite, Ant Design, Framer Motion, Recharts, and Lucide.
- Do not change backend routes, authentication, ownership, link validation, analytics calculations, or QR behavior.
- Preserve alias validation in the shortener and edit modal.
- Keep the light-theme toggle behavior; dark remains the default reference appearance.
- Do not add testimonials, invented usage counts, or new product functionality.
- Do not install the Watermelon template, Tailwind, shadcn/ui, or additional animation/icon dependencies.

## Review Focus

- Signed-out visitors can still shorten a link and see the existing sign-in prompt for dashboard access.
- Signed-in users retain their KPIs, tag filters, search, link actions, and paged results within the new layout.
- Shortening errors, successful results, optional settings, and validation messages remain visible and reachable.
- Analytics, edit, and QR dialogs inherit the dark/light theme and remain readable above the technical background.
- Mobile layout keeps the URL input, buttons, menu, link cards, and dialogs usable without horizontal page overflow.
- Reduced-motion preference remains respected by existing MotionConfig and CSS rules.

---

### Task 1: Align shared theme tokens with Landing Page 01

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/theme.ts`
- Modify: `frontend/src/ThemeProvider.tsx`

**Interfaces:**
- Consumes: existing CSS variables, `getAppTheme(isDark: boolean)`, and persisted theme preference.
- Produces: the shared near-black/lime dark palette, a readable light counterpart, monospace utility type, technical dividers, and matching Ant Design/browser chrome colors for Task 2.

- [x] Set the dark tokens to the spec's canvas `#101010`, surface `#171717`, accent `#A3FF12`, text `#F5F5F5`, muted text `#8A8A8A`, and divider `rgba(255,255,255,.08)`; define the light counterpart without changing the theme toggle.
- [x] Add a system monospace token and restrained grid/rule tokens; keep existing class names and CSS variables consumed by components.
- [x] Align Ant Design and browser `theme-color` backgrounds, surfaces, borders, focus colors, and charts with both themes.
- [x] Run `cd frontend && bun run build` and resolve type/CSS integration issues.

### Task 2: Compose the page around tinylnk's real workflows

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Hero.tsx`
- Modify: `frontend/src/index.css`
- Modify only if existing markup cannot express the approved design: `frontend/src/components/ShortenerForm.tsx`

**Interfaces:**
- Consumes: theme tokens from Task 1 and existing form, auth, dashboard, modal, and link-card interfaces.
- Produces: a template-inspired header and centered hero, a prominent existing shortener/result section, the current signed-out or signed-in dashboard states, concise capability bento, and a tinylnk footer.

- [x] Make the header navigation anchor to the existing create/dashboard sections while keeping sign-in, account, and theme controls.
- [x] Replace hero copy and structure with concise tinylnk wording; keep the URL composer as the primary action and preserve shortcut focus behavior.
- [x] Add the template's restrained dot grid, technical section rules/crosshairs, mono metadata, and responsive bento spacing without importing remote template assets.
- [x] Add compact feature blocks for existing custom alias, QR, and analytics capabilities, plus a footer with the repository link; use no fabricated metrics or testimonials.
- [x] Keep signed-out and signed-in conditional rendering, all current actions, keyboard focus, mobile breakpoints, and reduced-motion behavior intact.
- [x] Run `cd frontend && bun run build` and `cd frontend && bun run lint`; inspect the final diff and check for page overflow and selector conflicts in the available environment.
