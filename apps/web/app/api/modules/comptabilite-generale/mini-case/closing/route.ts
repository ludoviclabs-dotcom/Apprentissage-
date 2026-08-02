import { comptaGeneraleV1MiniCase } from "@finance/domain";

/**
 * The mini-case's closing VAT figures — the exact expected answer to the
 * case's last exercise (`ex-cgv1-tva-a-decaisser`).
 *
 * A dedicated GET, fetched only after that exercise is graded, for the same
 * reason `/api/revisions/reveal` exists: a Server Component prop passed into a
 * Client Component is still serialized into the page's own initial payload
 * whether or not the client conditionally renders it — passing these figures
 * down that way was tried and measurably failed, since the Playwright
 * assertion that reads the server's own response bytes caught them there
 * regardless of the client-side gate. Only a genuine request the client makes
 * after grading keeps them out of everything the server sends before that.
 *
 * No auth check: revealing is a read, and the public demo may study exactly
 * like a signed-in learner.
 */
export async function GET() {
  return Response.json(
    { closing: comptaGeneraleV1MiniCase.closing },
    { headers: { "Cache-Control": "no-store" } }
  );
}
