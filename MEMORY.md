# MEMORY — port checkpoint

Last updated: 2026-11-17 (main agent)

## Mission

Port `opencode-usage-panel` (V1, `shiv-source`) to OpenCode V2 in the fork
`andreacasini/opencode-usage-panel`. V2 only, no npm publish, git/local install
only. Full contract: `SPEC.md`.

## Environment facts

- Repo checkout: `/workspace/opencode-usage-panel` (fork; `main` == upstream `b22403a` at start)
- GitHub token: `/workspace/git_token` line 1 (`...: <token>`). **NEVER print or commit it.**
- Push (main agent only, token never stored in git config):
  `TOKEN=$(sed -n '1p' /workspace/git_token | sed 's/^.*: //') && git push "https://x-access-token:${TOKEN}@github.com/andreacasini/opencode-usage-panel.git" main`
- `origin` remote URL is scrubbed (no token in `.git/config`).
- Toolchain installed via `apk`: git 2.54.1, node 24.22.3, npm 11.12.1 (Alpine 3.24, root).
- User's opencode: v2.3.0. User's current alternative panels (V2-native, useful as references):
  `@chenlongapps/opencode-token-usage`, `opencode-quota-sidebar`.
- SDK versions to target: `@opencode/plugin` 2.3.0, `@opencode/client` 2.3.0, `@opentui/*` 0.8.4.

## Stage checklist

- [x] Research V2 plugin API; verify against 2.3.0 type definitions
- [x] Write SPEC.md + MEMORY.md (this file)
- [x] Stage A — packaging scaffold (package.json V2, lockfile, CI, drop V1 build)
- [x] Stage B — `src/tui.tsx` entrypoint + `src/view.tsx` port
- [x] Stage C — `src/usage.tsx` / `src/pricing.tsx` / `src/types.tsx` data-layer port
- [x] Stage D — `npm run typecheck` green (0 errors; re-run by main agent)
- [x] Stage E — README rewrite for V2
- [x] Review + staged commits + push (main agent) — see review log
- [x] Runtime verification: registered via cli.json (local dir), reconciled by the
      running TUI with no load errors; `opencode plugin add <git-url>` verified;
      object-form `package` with git URL verified
- [ ] Final visual confirmation by the user in the TUI sidebar
- [ ] User swaps their alternative panels for this one (optional cleanup of cli.json)

## Review log

- 2026-11-17, round 1 (main agent): full diff review of all 14 changed files
  against SPEC.md and the @opencode/plugin 2.3.0 types. Source port PASS with
  zero code fixes required — entrypoint, slot claim, theme tokens, message
  discrimination, nested model refs, optional tokens/cost guards, ModelCost
  array handling all correct; typecheck re-run independently (exit 0).
  One README correction applied by main agent after runtime verification:
  removed the "project opencode.json" suggestion (TUI-only packages belong in
  cli.json). Committed as three stages: docs spec, feat port, ci cleanup.

## Verified facts (runtime, opencode 2.3.0)

- `opencode plugin add` accepts npm or git specifiers only — NOT local paths
  (error: "Plugin target must be an npm registry package or Git package specifier").
- `opencode plugin add https://github.com/andreacasini/opencode-usage-panel` works
  and pins to the pushed commit (shown in `opencode plugin list` VERSION column).
- Object form `{ "package": "<git-url>", "options": {...} }` in cli.json works.
- Local directory entries in cli.json `plugins` work (package.json name+exports
  are honored; `./tui` resolves to `src/tui.tsx`).
- The built-in context panel's V2 plugin id is `opencode.sidebar.context`; the
  user's cli.json already disables it via `-opencode.sidebar.context`.
- Our `replace: "sidebar.content"` claim suppresses other claims inside that
  slot boundary — the user's alternative panels (token-usage, quota-sidebar)
  are covered by it while both are enabled.

## Key decisions / rationale

- `replace: "sidebar.content"` claim replaces the built-in context panel → V1's
  "disable `internal:sidebar-context`" step is gone entirely.
- `ModelCost` is an array in V2 → pick the entry without `tier`.
- No `reasoning` rate in V2 `ModelCost` → reasoning falls back to `output` rate (V1 parity).
- Ship TS source (`exports["./tui"] = "./src/tui.tsx"`), no esbuild/dist — the V2 plugin-docs pattern.
- Version 2.0.0; original author credit kept; repository URLs point at the fork.
- Coding delegated to one `google/gemini-3.8-flash` subagent (small codebase;
  sequential stages; main agent reviews + commits).

## Next step

User confirms the panel renders correctly in their TUI sidebar, then
(optionally) removes the alternative panels from cli.json. If a pricing table
is wanted, add options per README "Pricing & Options" and save cli.json to
hot-reload. `opencode plugin update` moves the git install to newer commits.
