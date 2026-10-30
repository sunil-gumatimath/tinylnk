# tinylnk Watermelon Inspired UI Design

## Intent

Give tinylnk's URL shortener and dashboard the polished visual language that Tedz liked on Watermelon UI, while preserving the existing product flows and data.

## Goals and constraints

- Restyle the current screens, including link creation, recent links, and existing dialogs.
- Keep the React/TypeScript/Vite stack, Ant Design components, and current API behavior.
- Preserve light/dark themes, keyboard support, reduced motion, and responsive layouts.
- Avoid copying Watermelon UI's catalog page structure, which serves a different product.

## Approaches

- Restyle existing Ant Design components and app styles: smallest change and preserves behavior. **Selected.**
- Replace Ant Design with custom React components: more visual control, but wider change and more behavior risk.

## Design direction

Use Watermelon UI as visual inspiration rather than reproducing its pages: a crisp, contemporary component-library feel with clear typography, deliberate spacing, restrained borders, confident accent color, and consistent controls. Carry the direction through tinylnk's existing pages and dialogs; retain its current content and interactions. The precise palette and type scale are implementation calls informed by the existing theme and the reference site.

## Out of scope

No new product features, backend/API changes, dependency swaps, or changes to auth, link management, analytics, or QR workflows.
