"use client";

import { useState } from "react";
import type { SourceReference } from "@finance/domain";
import { SourceReference as SourceReferenceList } from "../source-reference";
import { postJson } from "@/lib/api-client";

interface TutorResponse {
  answer?: string;
  reasoningSteps?: string[];
  sources?: SourceReference[];
  provider?: string;
  providerStatus?: "ok" | "disabled" | "failed";
}

const PROVIDER_MESSAGES: Record<NonNullable<TutorResponse["providerStatus"]>, string | null> = {
  ok: null,
  disabled:
    "Aucun tuteur conversationnel n'est activé ici : la réponse est assemblée depuis le corpus documentaire local.",
  failed: "Le modèle configuré n'a pas répondu : réponse de repli assemblée depuis le corpus seedé."
};

export function TutorAskForm() {
  const [question, setQuestion] = useState("Explique-moi la logique d'une provision.");
  const [response, setResponse] = useState<TutorResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function askTutor() {
    setIsPending(true);
    setError(null);

    const outcome = await postJson<TutorResponse>("/api/ai/tutor", { question, mode: "reprise" });

    setIsPending(false);

    if (!outcome.ok) {
      setResponse(null);
      setError(outcome.error);
      return;
    }

    setResponse(outcome.data);
  }

  const providerMessage = response?.providerStatus ? PROVIDER_MESSAGES[response.providerStatus] : null;

  return (
    <section className="panel action-form tutor-panel">
      <div>
        <span className="section-label">Tuteur sourcé</span>
        <h2>Poser une question</h2>
        <p>Le tuteur répond uniquement avec des sources attachées.</p>
      </div>
      <input value={question} onChange={(event) => setQuestion(event.target.value)} />
      <button type="button" className="primary-action" onClick={askTutor} disabled={isPending || question.length < 4}>
        {isPending ? "Recherche..." : "Demander au tuteur"}
      </button>
      {providerMessage ? <p className="feature-notice info">{providerMessage}</p> : null}
      {response?.answer ? (
        <div className="result-box">
          <strong>{response.answer}</strong>
          {response.reasoningSteps ? <span>{response.reasoningSteps.join(" → ")}</span> : null}
        </div>
      ) : null}
      {/* La réponse du tuteur est un verdict sourcé (AGENTS.md) : la preuve
          reste visible, elle ne se replie pas derrière un clic. */}
      {response?.sources ? <SourceReferenceList sources={response.sources} defaultOpen /> : null}
      {error ? (
        <div className="result-box error">
          <strong>{error}</strong>
        </div>
      ) : null}
    </section>
  );
}
