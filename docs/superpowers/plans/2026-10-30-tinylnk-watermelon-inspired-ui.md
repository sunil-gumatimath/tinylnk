# tinylnk Watermelon Inspired UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restyle tinylnk's existing screens to evoke the polished component-library feel Tedz liked on Watermelon UI without changing product behavior.

**Architecture:** Keep React, Ant Design, and the existing page/component structure. Tune the shared light/dark theme and CSS design tokens first, then refine the existing screen and component styles against those tokens.

**Tech Stack:** React 19, TypeScript, Vite, Ant Design 6, CSS, Framer Motion, Lucide.

**Spec:** `docs/superpowers/specs/2026-10-30-tinylnk-watermelon-inspired-ui-design.md`

## Global Constraints

- Keep the React/TypeScript/Vite stack, Ant Design components, and current API behavior.
- Preserve light/dark themes, keyboard support, reduced motion, and responsive layouts.
- No new product features, backend/API changes, dependency swaps, or changes to auth, link management, analytics, or QR workflows.

## Review Focus

- Light and dark theme parity: controls, dialogs, tags, and charts must remain legible in both modes.
- Narrow viewports: the composer, KPIs, search controls, and link cards must retain usable layouts.
- Existing interaction states: hover, focus, loading, errors, empty results, and success result should remain visually clear.
- Reduced motion: keep current reduced-motion behavior intact.
- Third-party Ant Design overlays and portal content: ensure theme and new tokens apply consistently.

---

### Task 1: Set shared visual tokens and component theme

**Files:**
- Modify: `frontend/src/theme.ts`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/ThemeProvider.tsx` (keep browser theme-color in sync with the new light/dark backgrounds)

**Interfaces:**
- Consumes: existing `getAppTheme(isDark: boolean): ThemeConfig`, existing CSS variables and class names.
- Produces: coordinated light/dark palette, type, spacing, border, and control treatments used by existing components.

- [ ] Define a restrained palette and typography/spacing tokens in `index.css` for both `:root` and `:root.dark`, keeping variable names consumed by components.
- [ ] Align Ant Design's shared tokens in `theme.ts` with the CSS palette, including accessible primary, success, warning, and error colors.
- [ ] Build the frontend with `cd frontend && bun run build`; resolve any type or CSS integration issues.

### Task 2: Apply the visual direction to existing screens

**Files:**
- Modify: `frontend/src/index.css`
- Modify only if existing markup cannot express the approved design: `frontend/src/App.tsx`, `frontend/src/components/Hero.tsx`, `frontend/src/components/ShortenerForm.tsx`, `frontend/src/components/LinkCard.tsx`, `frontend/src/components/EditModal.tsx`, `frontend/src/components/StatsModal.tsx`, `frontend/src/components/QrModal.tsx`

**Interfaces:**
- Consumes: shared CSS variables and `getAppTheme` from Task 1.
- Produces: cohesive styling for header, hero, shortener/result, dashboard/KPIs, link cards, and dialogs with existing interactions intact.

- [ ] Refine existing selectors for clearer hierarchy, restrained surfaces, consistent controls, and visible focus states; avoid unnecessary JSX changes.
- [ ] Keep mobile breakpoints, reduced-motion rules, and light/dark selectors working across the full page and overlay states.
- [ ] Run `cd frontend && bun run build` and `cd frontend && bun run lint`.
- [ ] Inspect the rendered app at desktop and mobile widths, in light and dark themes, and adjust any clipped, low-contrast, or inconsistent elements.
