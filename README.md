# Event Bros

A portable static platform game about live-event production. The production build preserves the original Spanish game, pixel art, keyboard and touch controls, scoring, audio, level, and boss encounter while adding resilient loading and accessible companion UI.

## Quick path

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Press **Enter** to start; use arrow keys or A/D to move, Space/W/Up to jump, P to pause, and M to mute.

## Verification

```bash
npm run lint
npm test
npm run test:e2e
npm run build
npm run preview
```

Playwright uses Chromium in desktop and mobile-landscape profiles. If Chromium is not installed locally, install only that browser with `npx playwright install chromium`.

## Architecture

| Area | Responsibility |
| --- | --- |
| `index.html` | Semantic app shell, loading/error recovery, instructions, and accessible controls |
| `src/game.js` | Encapsulated game runtime, rendering, input, audio, and level orchestration |
| `src/core/` | Deterministic state, layout, collision, asset-loading, and motion helpers |
| `src/styles.css` | Responsive canvas shell, safe areas, control states, and reduced-motion behavior |
| `tests/unit/` | Vitest regression coverage for deterministic logic |
| `tests/e2e/` | Playwright user flows, error recovery, responsive layout, and semantics |
| `public/assets/` | Only runtime-referenced, delivery-optimized artwork |

## Static deployment

Run `npm run build` and publish the generated `dist/` directory on any static host. No backend, service worker, telemetry, or provider-specific runtime is required.
