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
- [ ] Stage A — packaging scaffold (package.json V2, lockfile, CI, drop V1 build)
- [ ] Stage B — `src/tui.tsx` entrypoint + `src/view.tsx` port
- [ ] Stage C — `src/usage.tsx` / `src/pricing.tsx` / `src/types.tsx` data-layer port
- [ ] Stage D — `npm run typecheck` green (0 errors)
- [ ] Stage E — README rewrite for V2
- [ ] Review + staged commits + push (main agent)
- [ ] Live verification in the user's TUI (local install; compare with current panels)
- [ ] Final push; user swaps their alternative panels for this one

## Review log

(main agent appends an entry per review round: date, stage, verdict, fixes requested)

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

Launch the gemini-3.8-flash subagent with SPEC.md for stages A–E.
