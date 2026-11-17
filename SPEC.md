# SPEC — Port opencode-usage-panel to OpenCode V2

Status: **ACTIVE** (implementation in progress)
Coding: `gemini-3.8-flash` subagent · Review/commits/push: main agent

## 1. Goal

Port this V1-only opencode TUI plugin to the OpenCode V2 plugin API with **100%
feature parity**:

- Sidebar panel breaking the current session down by model: token counters
  (`input` = cache miss, `output`, `reasoning`, `cache read` = cache hit) with
  each counter's share of that model's own total tokens, plus per-model
  estimated cost.
- `Context` block: latest assistant turn's token count and its share of the
  model's context window.
- `Spent` total and `peak surcharge` line.
- User-configurable rate tables (`pricing`) with UTC `peakHours` windows
  (wrap-past-midnight and `days` supported), per-message timestamp matching,
  local-timezone schedule rendering, `"timezone": "utc"` display option.
- Models without a configured rate table fall back to the per-message `cost`
  opencode records (free tiers show `—`).

## 2. Confirmed decisions

| Decision | Choice |
| --- | --- |
| Repo | fork `andreacasini/opencode-usage-panel` (upstream: `shiv-source/opencode-usage-panel` @ `b22403a`) |
| Compatibility | OpenCode **V2 only** (`engines.opencode >= 2.3.0`); no V1 support |
| Distribution | git / local install only; **no npm publish** |
| Slot placement | `replace: "sidebar.content"` — takes over the built-in context panel (replaces V1's "disable `internal:sidebar-context`" instructions) |
| Version | `2.0.0` |

## 3. Target stack (verified against the running opencode v2.3.0)

- `@opencode/plugin` `2.3.0` (SDK + `Plugin.define`, `usePlugin`, types)
- `@opencode/client` `2.3.0` (`SessionMessageInfo`, `SessionMessageAssistant`, `ModelInfo`, `ModelCost`, `TokenUsageInfo` types)
- `@opentui/core` / `@opentui/solid` `0.8.4`
- `solid-js` `^1.9.17`
- `typescript` `^5.9` (dev only; node 24 via CI)

## 4. V1 → V2 API mapping (authoritative; verified against the 2.3.0 type definitions)

### 4.1 Entrypoint & package

| V1 | V2 |
| --- | --- |
| `src/index.tsx` default-exports `{ id, tui }` (`TuiPluginModule`) | `src/tui.tsx` default-exports `Plugin.define({ id, setup(context) })` from `@opencode/plugin/tui` |
| `src/plugin.tsx` exports `tui: TuiPlugin` + `api.slots.register({ order, slots })` | merged into `src/tui.tsx`; `context.ui.slot({ replace: "sidebar.content", render })`; the returned unregister function is returned from `setup` as cleanup |
| package `exports: { ".": dist, "./tui": dist }`, esbuild bundle in `dist/` | `exports: { "./tui": "./src/tui.tsx" }` — ship TS source (OpenCode resolves `@opencode/plugin/tui` at runtime); drop esbuild, `scripts/`, `dist/`, `main`, `prepublishOnly` |
| peerDeps `@opencode-ai/plugin >=1.18.0`, `@opentui/* >=0.4.5` | peerDeps `@opencode/plugin >=2.3.0`, `@opentui/core >=0.8.4`, `@opentui/solid >=0.8.4`, `solid-js >=1.9.0` |

Reference shape for `src/tui.tsx`:

```tsx
/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { UsagePanel } from "./view"

export default Plugin.define({
  id: "opencode-usage-panel",
  setup(context) {
    // Prime the model catalog for rate lookups; panel degrades to `?? []` until synced.
    const location = context.location ?? context.data.location.default()
    void context.data.location.model.sync(location).catch(() => {})
    return context.ui.slot({
      replace: "sidebar.content",
      render: ({ sessionID }) => <UsagePanel sessionID={sessionID} />,
    })
  },
})
```

### 4.2 Slot & components

| V1 | V2 |
| --- | --- |
| slot `sidebar_content`, order 100, `props.session_id` | slot `sidebar.content`, claim `{ replace: "sidebar.content", render: ({ sessionID }) => ... }` |
| `api` object threaded into `View` as a prop | `usePlugin()` from `@opencode/plugin/tui` inside components (returns the full `Context`) |
| `View(props: { api, sessionID, options })` | `UsagePanel(props: { sessionID })`; context/options come from `usePlugin()` |
| options argument of `tui(api, options)` | `context.options` (same JSON shape: `pricing`, `peakHours`, `timezone`) |

### 4.3 Theme

V1 `api.theme.current` accessor → V2 `context.theme` (plain object read
directly in JSX, per the official component example) and `context.themeMode`.

| V1 token | V2 token |
| --- | --- |
| `theme().text` | `context.theme.text.base` |
| `theme().textMuted` | `context.theme.text.muted` |
| `theme().primary` | `context.theme.text.action.primary.base` |
| `theme().warning` | `context.theme.text.feedback.warning.base` |
| `theme().success` | `context.theme.text.feedback.success.base` |
| `theme().borderSubtle` | `context.theme.border.base` |

### 4.4 Data layer

| V1 | V2 |
| --- | --- |
| `api.state.session.messages(sessionID)` | `context.data.session.message.list(sessionID)` → `SessionMessageInfo[]` |
| filter `message.role === "assistant"` | filter `message.type === "assistant"` (narrows to `SessionMessageAssistant`) |
| flat `message.providerID` / `message.modelID` | nested `message.model.providerID` / `message.model.id` (`ModelRef`) |
| `message.tokens` required | `message.tokens` **optional** (`TokenUsageInfo`) — skip the message when absent |
| `message.cost` | still present, **optional** `cost?: MoneyUSD` — use with `?? 0` |
| `message.time.created` | unchanged |
| tokens shape `{ input, output, reasoning, cache: { read, write } }` | unchanged |
| `api.state.provider[].models[modelID]` catalog | `context.data.location.model.list(location) ?? []` → flat `ModelInfo[]`; match `m.providerID === providerID && m.modelID === modelID` |
| `model.cost` single object, optional `reasoning` / `cacheRead` / `cache.read` | `model.cost: ModelCost[]` — `ModelCost = { tier?: { type: "context"; size: number }, input, output, cache: { read, write } }`; pick `cost.find(c => !c.tier) ?? cost[0]`; there is **no `reasoning` rate** → reasoning falls back to the `output` rate (V1 parity); `cacheRead` comes from `cache.read` |
| `model.limit.context` | unchanged |
| `model.name` | unchanged |
| location | `context.location ?? context.data.location.default()` |
| reactivity | keep the `createMemo` pattern — `context.data` is an event-fed Solid store, reads inside memos stay live with no manual subscriptions |

Type imports (documented subpaths): `import type { Context } from "@opencode/plugin/tui/context"`;
`import type { SessionMessageAssistant, ModelInfo, ModelCost } from "@opencode/client"`.

### 4.5 Logic that must NOT change

`config.tsx` (options parsing, peak-window matching) and `format.tsx` are pure
and port unchanged. The pricing math (`costOf`, peak/off/peak resolution,
surcharge), the aggregation order/sort in `usage.tsx`, the row layout, and all
display strings stay byte-for-byte where possible.

## 5. File-by-file work plan

| File | Action |
| --- | --- |
| `src/index.tsx` | delete (replaced by `src/tui.tsx`) |
| `src/plugin.tsx` | delete (merged into `src/tui.tsx`) |
| `src/tui.tsx` | new — V2 entrypoint (see §4.1) |
| `src/view.tsx` | port — `UsagePanel` component, `usePlugin()`, V2 theme tokens, `sessionID` prop; keep the 60s `setInterval` tick when peak windows are configured, `onCleanup` as before |
| `src/usage.tsx` | port — new context type, `type === "assistant"`, nested model ref, optional tokens/cost, model catalog via `data.location.model` |
| `src/pricing.tsx` | port — `ratesFor(context, providerID, modelID, config)`; `ModelCost[]` handling per §4.4 |
| `src/types.tsx` | port — replace the V1 `Cost` type with the V2 `ModelCost` array shape (import from `@opencode/client` or mirror it) |
| `src/config.tsx`, `src/format.tsx` | unchanged |
| `package.json` | rewrite per §6 |
| `package-lock.json` | regenerate (`rm` + `npm install`) |
| `tsconfig.json` | keep as-is (already `jsx: preserve`, `jsxImportSource: @opentui/solid`, `moduleResolution: bundler`, `strict`, `skipLibCheck`) |
| `scripts/build.mjs` | delete |
| `.npmignore` | delete (no publishing) |
| `.github/workflows/release.yaml` | delete (no npm publish) |
| `.github/workflows/ci.yml` | keep typecheck job; drop the `npm run build` step and the release leftovers; node 24 |
| `README.md` | rewrite per §8 |
| `LICENSE`, `screenshots/` | untouched |

## 6. package.json (target shape)

```json
{
  "$schema": "https://json.schemastore.org/package.json",
  "name": "opencode-usage-panel",
  "version": "2.0.0",
  "description": "Sidebar token-usage and cost panel for the opencode TUI. Breaks a session down by model with per-model cost, context usage, and configurable peak/off-peak pricing.",
  "author": { "name": "shiv kumar" },
  "contributors": [{ "name": "Andrea Casini" }],
  "repository": { "type": "git", "url": "git+https://github.com/andreacasini/opencode-usage-panel.git" },
  "homepage": "https://github.com/andreacasini/opencode-usage-panel",
  "bugs": { "url": "https://github.com/andreacasini/opencode-usage-panel/issues" },
  "type": "module",
  "license": "MIT",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "exports": {
    "./tui": "./src/tui.tsx"
  },
  "files": ["src", "README.md", "LICENSE"],
  "keywords": ["opencode", "opencode-plugin", "opencode-tui", "tokens", "usage", "cost", "tui"],
  "peerDependencies": {
    "@opencode/plugin": ">=2.3.0",
    "@opentui/core": ">=0.8.4",
    "@opentui/solid": ">=0.8.4",
    "solid-js": ">=1.9.0"
  },
  "devDependencies": {
    "@opencode/client": "2.3.0",
    "@opencode/plugin": "2.3.0",
    "@opentui/core": "0.8.4",
    "@opentui/solid": "0.8.4",
    "solid-js": "^1.9.17",
    "typescript": "^5.9.3"
  },
  "engines": {
    "opencode": ">=2.3.0"
  }
}
```

## 7. CI

`ci.yml`: keep the existing paths filter and typecheck job; node-version 24;
`npm ci` + `npm run typecheck` only (remove `npm run build`). Delete
`release.yaml` entirely.

## 8. README rewrite requirements

- Requirements: opencode `>= 2.3.0`; TUI plugin importing `@opencode/plugin/tui`,
  rendering the `sidebar.content` slot with `replace`.
- Install (primary): `opencode plugin add https://github.com/andreacasini/opencode-usage-panel`
  (installs from git and registers globally).
- Install (local checkout): point `cli.json` `plugins` at the directory:
  `{ "$schema": "https://opencode.ai/v2/cli.json", "plugins": ["/abs/path/opencode-usage-panel"] }`.
- Options (pricing / peakHours / timezone) via the `plugins` object form in
  `~/.config/opencode/cli.json`:
  `{ "plugins": [{ "package": "/abs/path/opencode-usage-panel", "options": { ... } }] }`
- Remove: npm install section + badge, `tui.json` instructions,
  `plugin_enabled` / `internal:sidebar-context` section (the `replace` claim
  already takes over the built-in panel), local-file-pointing-at-`src/index.tsx`
  example.
- Keep: feature description, screenshots, pricing & peak-windows docs
  (unchanged semantics).
- Note the plugin is installed from this fork (no npm package).

## 9. Acceptance criteria

1. `npm install` + `npm run typecheck` → **0 errors**.
2. Plugin loads in opencode 2.3.0 TUI from a local path; `opencode plugin list`
   shows id `opencode-usage-panel`.
3. Panel renders in the sidebar in place of the built-in context panel; layout
   identical to V1 (header, Context block, per-model sections, Spent box,
   peak schedule line).
4. Numbers update live while the session produces messages.
5. Fallback pricing shows recorded per-model costs; `—` for free models.
6. With a test `pricing` + `peakHours` config (e.g. a window covering "now"):
   per-model computed cost, `▲ peak` badge, `peak surcharge` line, and the
   local-time schedule line all render correctly.
7. `git diff` review by main agent passes; history committed in clean stages.

## 10. Out of scope

- npm publishing / release workflow
- V1 (OpenCode 1.x) support
- New features, refactor of pricing math, styling redesign
