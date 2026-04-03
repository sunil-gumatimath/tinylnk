# tinylnk frontend

React + TypeScript frontend for **tinylnk**, built with Vite and Ant Design.

## Scripts

From `frontend/`:

- `bun run dev` – start local dev server
- `bun run build` – type-check and build production bundle
- `bun run preview` – preview production build
- `bun run lint` – run ESLint

## Development

```bash
cd frontend
bun install
bun run dev
```

The dev server runs separately from FastAPI.

## Production build

The backend serves static files from `frontend/dist`, so build before running backend in production mode:

```bash
cd frontend
bun run build
```

Then run backend from project root:

```bash
uvicorn backend.app.main:app --reload
```
