# Architecture

Finance Learning Hub is a private, local-first learning cockpit.

The MVP starts with seeded learning data and a navigable Next.js interface. Document ingestion, RAG and AI agents are represented by stable package boundaries so they can be wired later without changing the user experience.

## Runtime

- `apps/web`: Next.js application.
- `packages/domain`: domains, competencies, exercises, corrections and seeded learning paths.
- `packages/db`: PostgreSQL/pgvector schema and migration SQL.
- `packages/ai`: provider and agent contracts.
- `packages/ingest`: source pack and document ingestion primitives.
- `workers/ingestion-worker`: Docker boundary for future Docling/Python ingestion.

## Product Rule

The cockpit is organized around guided learning. Retrieval and AI features support the route, but the main user loop is:

1. diagnose current level;
2. follow the 30-day path;
3. study one concept;
4. answer one exercise;
5. read a structured correction;
6. update competency strength.
