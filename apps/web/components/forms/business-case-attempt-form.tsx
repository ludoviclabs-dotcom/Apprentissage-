"use client";

import { useState } from "react";
import type { BusinessCaseAttempt } from "@finance/domain";

export function BusinessCaseAttemptForm({ businessCaseId }: { businessCaseId: string }) {
  const [userMemo, setUserMemo] = useState("");
  const [attempt, setAttempt] = useState<BusinessCaseAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);

    const response = await fetch(`/api/business-cases/${businessCaseId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userMemo })
    });
    const payload = (await response.json()) as { attempt?: BusinessCaseAttempt; error?: string };

    setPending(false);

    if (!response.ok || !payload.attempt) {
      setError(payload.error ?? "Soumission impossible");
      return;
    }

    setAttempt(payload.attempt);
  }

  return (
    <div className="action-form">
      <label>
        Note de synthese
        <textarea
          rows={7}
          minLength={24}
          value={userMemo}
          onChange={(event) => setUserMemo(event.target.value)}
          placeholder="Risque, preuves, decision, action corrective..."
        />
      </label>
      <button type="button" className="primary-action" disabled={pending} onClick={() => void submit()}>
        Soumettre le cas
      </button>
      {attempt ? (
        <div className="result-box">
          <strong>{attempt.score}/20</strong>
          <span>{attempt.correction}</span>
        </div>
      ) : null}
      {error ? <div className="result-box error">{error}</div> : null}
    </div>
  );
}
