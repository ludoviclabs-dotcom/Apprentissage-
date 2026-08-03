/**
 * Mastery evidence is accepted only from server-verified correction and review
 * flows. Keeping this retired endpoint explicit prevents older clients from
 * mistaking a discarded write for persisted progress.
 */
export async function POST() {
  return Response.json(
    {
      error: "Écriture directe de progression interdite",
      details: "Soumets une réponse à un exercice corrigé pour alimenter la maîtrise."
    },
    { status: 410 }
  );
}
