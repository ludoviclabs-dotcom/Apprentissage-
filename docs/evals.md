# Evals

Initial acceptance checks:

- Navigation exposes the nine learning zones: Accueil, Parcours, Cours, Connaissances, Exercices, Annales & Concours, Business Cases, Revisions, Progression.
- Domain colors remain readable on light backgrounds.
- A 30-day path can display current day, progress and next action.
- An exercise attempt can produce score, correction details and remediation.
- A revision session can display due cards and schedule the next review.
- A short exam can start and submit answers through the API.
- A business case can collect a memo and return a deterministic correction.
- Long source and competency names do not break the interface.
- `POST /api/source-packs` returns a manifest for local folders.
- `POST /api/exercises/attempts` returns a structured correction.
- `POST /api/ai/tutor` refuses uncited answers and returns source references.
- `GET /api/revisions/due`, `GET /api/progress`, `POST /api/exams/start`, `POST /api/exams/submit` and `POST /api/business-cases/[id]/submit` return structured JSON.
