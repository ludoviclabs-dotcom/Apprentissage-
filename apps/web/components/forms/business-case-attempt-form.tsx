"use client";

import { useState } from "react";
import type { BusinessCaseAttempt } from "@finance/domain";
import { postJson } from "@/lib/api-client";
import { FeatureNotice } from "@/components/feature-notice";
import type { FeatureState } from "@/lib/features";

/** Mirrors `userMemo: z.string().min(24)` in app/api/business-cases/[id]/submit. */
const MIN_MEMO_LENGTH = 24;

export function BusinessCaseAttemptForm({
  businessCaseId,
  writes,
  persistence
}: {
  businessCaseId: string;
  writes: FeatureState;
  persistence: FeatureState;
}) {
  const [userMemo, setUserMemo] = useState("");
  const [attempt, setAttempt] = useState<BusinessCaseAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const locked = !writes.enabled;
  const tooShort = userMemo.trim().length < MIN_MEMO_LENGTH;

  async function submit() {
    setPending(true);
    setError(null);

    const outcome = await postJson<{ attempt?: BusinessCaseAttempt }>(
      `/api/business-cases/${businessCaseId}/submit`,
      { userMemo }
    );

    setPending(false);

    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }

    if (!outcome.data.attempt) {
      setError("Soumission impossible");
      return;
    }

    setAttempt(outcome.data.attempt);
  }

  return (
    <div className="action-form">
      <FeatureNotice feature={writes} />
      <label>
        Note de synthese
        <textarea
          rows={7}
          minLength={MIN_MEMO_LENGTH}
          disabled={locked}
          value={userMemo}
          onChange={(event) => setUserMemo(event.target.value)}
          placeholder="Risque, preuves, decision, action corrective..."
        />
      </label>
      <p className="muted">
        {userMemo.trim().length}/{MIN_MEMO_LENGTH} caractères minimum.
      </p>
      <button
        type="button"
        className="primary-action"
        disabled={pending || locked || tooShort}
        title={locked ? writes.reason : undefined}
        onClick={() => void submit()}
      >
        Soumettre le cas
      </button>
      {attempt ? (
        <div className="result-box">
          <strong>{attempt.score}/20</strong>
          <span>{attempt.correction}</span>
          {persistence.enabled ? null : <span className="muted">{persistence.reason}</span>}
        </div>
      ) : null}
      {error ? <div className="result-box error">{error}</div> : null}
    </div>
  );
}
