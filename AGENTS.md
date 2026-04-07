# Repository Guidelines

## Project Structure & Module Organization
- `central-hub/` contains the main service: `server.mjs`, REST routes in `routes/`, core orchestration in `modules/`, static dashboard assets in `public/`, and service-local config in `config/`.
- `lib/` holds shared clients and utilities, especially `lib/api-clients/` and `lib/utils/`.
- `scripts/` contains setup and sync scripts such as `init-setup.mjs` and `sync-lucky-to-sunpanel.mjs`, plus systemd unit files.
- `test/` contains Node test files named `*.test.mjs`. Docs live in `docs/`; runtime data and local artifacts appear in `data/`, `logs/`, and `temp/`.

## Build, Test, and Development Commands
- `npm install` installs root dependencies used by the CLI, tests, and `central-hub/` service.
- `npm start` starts the Central Hub server from `central-hub/server.mjs`.
- `npm run dev` starts the hub in watch mode for local development.
- `npm test` runs the full test suite with Node’s built-in test runner.
- `npm run init` runs initial setup helpers from `scripts/init-setup.mjs`.
- Example CLI tasks: `node cli.mjs sync-all`, `node cli.mjs sync-lucky`, `node cli.mjs import-lucky`.

## Coding Style & Naming Conventions
- Use ES modules (`.mjs`), 2-space indentation, semicolons, and small focused functions.
- Use `camelCase` for variables/functions, `PascalCase` for classes, and kebab-case file names such as `cloudflare-api.mjs`.
- Keep route handlers thin and place reusable logic in `central-hub/modules/` or `lib/`.
- No formatter or linter is currently enforced; match the surrounding file style exactly.

## Testing Guidelines
- Write tests with `node:test` and `node:assert/strict`; mirror existing patterns in `test/`.
- Name files `*.test.mjs` and keep tests deterministic by stubbing env vars instead of relying on live services.
- Add or update tests whenever changing API clients, config loading, or import/sync behavior.
- Run `npm test` before opening a pull request.

## Commit & Pull Request Guidelines
- Follow the existing history: short, imperative subjects with optional prefixes such as `feat:`, `fix:`, or `chore:`.
- Keep commits focused. Example: `fix: preserve Lucky fallback token handling`.
- PRs should include a clear summary, affected paths, test results, and linked issues if applicable.
- Include screenshots only for dashboard or UI changes.

## Security & Configuration Tips
- Copy `.env.template` to `.env` for local setup; never commit secrets or machine-specific values.
- When changing hub behavior, keep `config/` and `central-hub/config/` aligned if both execution paths are affected.
- Avoid editing generated state files in `data/` or logs in `logs/` unless the change explicitly targets runtime data handling.
