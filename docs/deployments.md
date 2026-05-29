# Deployments

This workspace now contains the Apprentissage project only.

## Project Map

| Product | GitHub repo | Vercel project | Public URL | Notes |
| --- | --- | --- | --- | --- |
| Finance Learning Hub | `ludoviclabs-dotcom/Apprentissage-` | `finance-learning-hub` | `https://finance-learning-hub.vercel.app` | Current Apprentissage MVP. |
| Patrimoine fiscal | `ludoviclabs-dotcom/Patrimoine-` | `patrimoine-fiscal-demo` | `https://patrimoine-fiscal-demo.vercel.app` | Separate app. Do not overwrite from this repo. |

## Guardrails

- Do not alias `patrimoine-fiscal-demo.vercel.app` to this project.
- Do not deploy this repo to the Patrimoine Vercel project.
- Keep `.vercel/` ignored because it contains local project linkage.
- Keep `vercel.json` committed because it documents how this monorepo builds on Vercel.

## Current Apprentissage Production

`finance-learning-hub.vercel.app` is linked to the Vercel project `finance-learning-hub`.

The monorepo build uses:

- install: `corepack pnpm install --frozen-lockfile`
- build: `corepack pnpm --filter @finance/web build`
- output: `apps/web/.next`
