# Event Bros

> **Súper Técnico de Eventos** — a pixel-art platform game about the people who actually make live events happen.

You are the technical crew. Collect microphones, survive the **Feedback** boss, and reach the FOH console before the show starts. It runs entirely in the browser: no backend, no service worker, no telemetry, no tracking.

The game is played in Spanish. The codebase, tests, and documentation are in English.

---

## Quick path

```bash
npm install
npm run dev
```

Open the URL Vite prints, press **Enter**, and you are playing.

```bash
npm run build     # emits dist/
npm run preview   # serves the production build locally
```

---

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | `←` `→` or `A` `D` | `◀` `▶` |
| Jump | `Space`, `W` or `↑` | `A` |
| Crouch | `S` or `↓` | `▼` |
| Pause | `P` | `Ⅱ` |
| Mute | `M` | `♫` |

Touch controls appear automatically on touch devices and are laid out for landscape play, respecting device safe areas.

---

## Stack

| Area | Choice |
| --- | --- |
| Runtime | Vanilla JavaScript (ES modules), HTML Canvas 2D |
| Build | Vite 6, `es2020` target |
| Unit tests | Vitest |
| End-to-end tests | Playwright (Chromium: desktop + mobile landscape) |
| Linting | ESLint 9 flat config |
| Dependencies at runtime | **None** |

Every dependency in `package.json` is a `devDependency`. What ships to the browser is HTML, CSS, JavaScript, and seven PNGs.

---

## Architecture

The runtime is deliberately split between orchestration and pure logic, so the parts worth testing are testable without a canvas.

| Path | Responsibility |
| --- | --- |
| `index.html` | Semantic app shell: loading, error recovery, instructions, touch controls |
| `src/game.js` | Game runtime — rendering, input, audio, level and boss orchestration |
| `src/core/assets.js` | Asset loading with progress reporting and failure handling |
| `src/core/collision.js` | Deterministic collision resolution |
| `src/core/layout.js` | Responsive canvas fitting and safe-area math |
| `src/core/motion.js` | Motion helpers, including reduced-motion behavior |
| `src/core/state.js` | Score, lives, and progression state transitions |
| `src/styles.css` | Responsive shell, control states, reduced-motion styles |
| `public/assets/` | The seven artwork files actually referenced at runtime (2.7 MiB total) |

`src/core/` holds pure functions with no DOM or canvas access. That is what `tests/unit/` covers.

---

## Accessibility

Accessibility here is not a checkbox pass — the canvas is unreadable to a screen reader by design, so the game exposes a parallel, queryable description of itself.

| Concern | How it is handled |
| --- | --- |
| Canvas-only state | A live companion region reports progress, position, score, lives, time, hazards, the current objective, and boss guidance |
| Announcement noise | Updates are cadence-controlled, so assistive tech is informed without being flooded |
| Unsupported canvas | Semantic recovery with an actionable message instead of a silent blank frame |
| Asset failures | Explicit error panel with a working retry, never an infinite spinner |
| Reduced motion | `prefers-reduced-motion` is honored dynamically, including camera movement |
| Keyboard | Skip link, visible focus, and full keyboard play without touch |

---

## Verification

Run these before opening a pull request. All four should pass on a clean tree.

```bash
npm run lint      # ESLint
npm test          # Vitest unit suite
npm run test:e2e  # Playwright user flows
npm run build     # production build
```

- [ ] `npm run lint` reports no findings
- [ ] Unit tests pass
- [ ] E2E tests pass (one desktop-only touch test skips intentionally)
- [ ] `npm run build` produces `dist/`

Playwright needs Chromium. If it is missing, install only that browser:

```bash
npx playwright install chromium
```

---

## Deployment

### Netlify

The repository is deploy-ready. `netlify.toml` holds the entire configuration, so nothing needs to be set in the Netlify UI:

| Setting | Value | Source |
| --- | --- | --- |
| Build command | `npm run build` | `netlify.toml` |
| Publish directory | `dist` | `netlify.toml` |
| Node version | `22` | `netlify.toml`, `.nvmrc`, `engines` |

Connect the repository in Netlify and deploy. There is no SPA redirect rule because the site is a single document with no client-side router.

### Any other static host

```bash
npm run build
```

Publish `dist/`. No backend, service worker, telemetry, or provider-specific runtime is required.

> **Note:** asset URLs are root-absolute, which is correct for a root domain. Hosting under a subpath (for example `example.com/games/event-bros/`) needs a Vite `base` configuration first.

### Caching model

Build output is split into two directories on purpose, because the two halves have different cache lifetimes:

| Path | Contents | Policy |
| --- | --- | --- |
| `/build/*` | Vite bundles, content-hashed | `immutable`, one year |
| `/assets/*` | Artwork from `public/`, **not** hashed | `max-age=0, must-revalidate` |
| `/index.html` | Entry document | `max-age=0, must-revalidate` |

Caching `/assets/*` as immutable would permanently pin the artwork: the filenames never change when the art does. That is why `build.assetsDir` is set to `build` in `vite.config.js` — it keeps the two policies separable.

---

## Known limitations

Tracked deliberately, not hidden:

- Asset loading has no timeout — a stalled network keeps the loader visible.
- The very first touch input after load can be dropped.
- Subpath hosting requires the `base` configuration noted above.

---

## Project layout

```
event-bros/
├── index.html            # app shell
├── src/
│   ├── game.js           # runtime
│   ├── core/             # pure, tested logic
│   └── styles.css
├── public/assets/        # runtime artwork
├── tests/
│   ├── unit/             # Vitest
│   └── e2e/              # Playwright
└── vite.config.js
```

---

## Assets

The pixel art in `public/assets/` was generated with MiniMax M3 through the MiniMax API, whose platform terms leave ownership of generated output with the customer. It is not taken from a third-party asset pack and carries no personal-use or non-commercial restriction.

One caveat worth stating plainly: purely AI-generated images may not be copyrightable in every jurisdiction. Treat the MIT grant over the artwork as a statement of intent rather than a transfer of rights that is guaranteed to exist.

---

## License

Released under the MIT License. See [LICENSE](LICENSE).
