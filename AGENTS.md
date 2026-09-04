# AGENTS.md

## Project Overview

**Sokai（溯洄）** is a monorepo for a page **record → schema → backtest** loop:

1. Capture a real admin page session (UI keyframes, DOM semantics, network).
2. Local Agent generates `page.schema.json` from the recording + source + schema spec.
3. Schema player renders with Jd components and network mocks.
4. Playwright backtest enforces screenshot + DOM + API hard gates.

Pilot target (reference only): marketing composePool list (`marketing.coupon.composePool.list`).

**Design / plans (source of truth for product direction):**

- Spec: `docs/superpowers/specs/2026-09-04-page-record-schema-backtest-design.md`
- Plan: `docs/superpowers/plans/2026-09-04-page-record-schema-backtest.md`

**Stack:** Node.js `24.20.0`, pnpm `11.23.0`, TypeScript, Vitest, Vue 3 + Vite (player), Playwright, Chrome MV3 extension, Ajv (JSON Schema draft-2020-12), `@jd/jdesign-vue` / `@jd/jdesign-vue-pro` where needed.

## Monorepo layout (critical)

```text
sokai/
  packages/     ← ALL project / product code (pnpm workspace packages)
  apps/         ← Independent test / reference projects only — NOT sokai product code
  docs/         ← Specs, plans, inspiration
  fixtures/     ← Recording packages + schemas (when present)
  tools/        ← CLIs / extension (when present; not always workspace members)
```

### `packages/` — where agents work

- pnpm workspace members: `packages/*` only (see `pnpm-workspace.yaml`).
- Put shared contracts, libraries, and product packages here (e.g. `page-schema`, `recording-pack`).
- Prefer `@sokai/<name>` or the package `name` in each `packages/*/package.json` when filtering.

### `apps/` — do not treat as product code

- Each entry under `apps/` is an **independent test or reference project**, unrelated to Sokai’s own implementation.
- `apps/yy-modules` is a **git submodule** (`git@coding.jd.com:webapp/yy-modules.git`) used as a real-world pilot / reference surface (e.g. composePool). Do not “fix” or refactor yy-modules as part of Sokai work unless the user explicitly asks.
- Do not add Sokai product features into `apps/`. Do not assume `apps/*` are workspace packages (they are not in root `pnpm-workspace.yaml`).
- When you need pilot page source, read from the submodule; generate Sokai artifacts under `packages/`, `fixtures/`, `tools/`, or root docs — not inside yy-modules.

### Root

- Root `package.json` is the workspace root (`packageManager`: `pnpm@11.23.0`).
- Private registry default: `http://registry.m.jd.com/` (see `pnpm-workspace.yaml`).

## Setup Commands

Use the pinned toolchain:

- Node: **24.20.0** (`.node-version`)
- pnpm: **11.23.0** (root `packageManager` field)

```bash
# Ensure Node 24.20.0 (fnm / nvm / asdf / volta, etc.)
node -v   # expect v24.20.0

corepack enable
corepack prepare pnpm@11.23.0 --activate
pnpm -v   # expect 11.23.0

pnpm install
```

Optional submodule for pilot reference:

```bash
git submodule update --init --recursive
# apps/yy-modules is separate; do not run its install unless you need that app locally
```

## Development Workflow

- Install at repo root only for Sokai packages: `pnpm install`
- Run a package script: `pnpm --filter <package-name> <script>`
- Run a script in all workspace packages that define it: `pnpm -r --if-present <script>`
- Add a dependency to one package: `pnpm --filter <package-name> add <dep>`
- Create new product code under `packages/<name>/` and ensure it has its own `package.json`

As packages land, expect scripts such as (names may evolve — check each `package.json`):

- `pnpm test` — recursive tests when defined
- package-local `dev` / `build` / `start` via `--filter`

Do **not** use yy-modules’ turbo/vite scripts as Sokai’s primary workflow.

## Testing Instructions

- Prefer Vitest for unit tests inside `packages/*`.
- From root (once packages define `test`): `pnpm -r --if-present test`
- Single package: `pnpm --filter <package-name> test`
- Focus one Vitest case: `pnpm --filter <package-name> exec vitest run -t "<name>"`
- Playwright / backtest CLIs live under `tools/` when present; run via that package’s scripts, not via `apps/`.
- Add or update tests for code you change in `packages/`.
- Root `package.json` may still have a placeholder `test` script until packages are bootstrapped — prefer package-level tests.

## Code Style

- TypeScript for shared contracts and libraries under `packages/`.
- Match existing package conventions (exports, `src/`, ESM vs CJS) when a package already exists.
- Keep recording/schema contracts typed and validated (Ajv against published JSON Schema).
- Do not commit secrets, auth tokens, or unredacted PII in fixtures; follow redaction rules in the design spec.
- Large recording clips: `fixtures/**/clips/**` are gitignored; keep keyframe PNGs, manifests, asserts, contracts, and `page.schema.json` as needed for reproducible backtest.
- Ignore build/noise: `node_modules/`, `dist/`, `*.local`, `tools/page-backtest/artifacts/`, `.worktrees/`.

## Build and Deployment

- No production deploy pipeline is required for MVP; local CLI + fixtures first.
- Build package-by-package: `pnpm --filter <package-name> build` when a `build` script exists.
- Schema player / extension / backtest tooling should be introduced as documented in the plan; prefer `packages/` for shared libs and `tools/` for CLIs/extensions. Do not park product code in `apps/`.

## Architecture constraints (MVP)

From the design spec — agents must respect these:

- Extension records/exports only; **no LLM**, **no** writing `page.schema.json`.
- `page.schema.json` lives **inside** the session folder under `fixtures/`.
- `clips/` never affect backtest pass/fail.
- Undeclared network during backtest fails (no silent passthrough).
- MVP layout whitelist: `list-page` only; sections: `pageHeader` | `searchForm` | `table` | `pagination` | `dialog`.
- Declarative actions only: `search` | `reset` | `pageChange` | `openDialog` | `exportUrl`.
- Screenshot gate: `pixelmatch` `threshold: 0.1`; fail if `diffPixels / totalPixels > 0.02` after masks.

## Pull Request Guidelines

- Title: `[sokai] <summary>` or `[<package-name>] <summary>`
- Before claiming done: run relevant `pnpm --filter … test` / typecheck for touched packages.
- Do not include unrelated `apps/yy-modules` submodule pointer bumps unless intentional.
- Prefer small PRs scoped to one package or one vertical slice of the record/schema/backtest loop.

## Security

- Registry and `@jd/*` packages may need corporate `.npmrc` / auth; never commit credentials.
- Redact tokens/cookies in recording network fixtures by default.
- Treat recorded HAR/bodies as sensitive; keep fixtures minimal and redacted.

## Debugging tips

- Confirm you are on Node 24.20.0 and pnpm 11.23.0 before chasing install weirdness.
- If `@jd/*` install fails, copy/link private registry auth from yy-modules `.npmrc` for local use only — do not commit secrets.
- Workspace scope is `packages/*` only; a new folder under `apps/` will **not** be picked up by `pnpm -r` at the sokai root.
- For product behavior questions, read `docs/superpowers/specs/` before inventing APIs.
- `CLAUDE.md` simply points at this file (`@AGENTS.md`).
