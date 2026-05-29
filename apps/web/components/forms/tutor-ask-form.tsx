"use client";

import { useState } from "react";
import type { SourceReference } from "@finance/domain";
import { SourceReference as SourceReferenceList } from "../source-reference";

interface TutorResponse {
  answer?: string;
  reasoningSteps?: string[];
  sources?: SourceReference[];
  error?: string;
}

export function TutorAskForm() {
  const [question, setQuestion] = useState("Explique-moi la logique d'une provision.");
  const [response, setResponse] = useState<TutorResponse | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function askTutor() {
    setIsPending(true);
    try {
      const result = await fetch("/api/ai/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, mode: "reprise" })
      });
      setResponse((await result.json()) as TutorResponse);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section className="panel action-form">
      <div>
        <span className="section-label">Tuteur sourcé</span>
        <h2>Poser une question</h2>
        <p>Version MVP déterministe : le tuteur répond uniquement avec des sources attachées.</p>
      </div>
      <input value={question} onChange={(event) => setQuestion(event.target.value)} />
      <button type="button" className="primary-action" onClick={askTutor} disabled={isPending || question.length < 4}>
        {isPending ? "Recherche..." : "Demander au tuteur"}
      </button>
      {response?.answer ? (
        <div className="result-box">
          <strong>{response.answer}</strong>
          {response.reasoningSteps ? <span>{response.reasoningSteps.join(" → ")}</span> : null}
        </div>
      ) : null}
      {response?.sources ? <SourceReferenceList sources={response.sources} /> : null}
      {response?.error ? (
        <div className="result-box error">
          <strong>{response.error}</strong>
        </div>
      ) : null}
    </section>
  );
}
