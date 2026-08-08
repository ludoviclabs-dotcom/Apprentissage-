import {
  NORMATIVE_PROFILE_LABELS,
  NORMATIVE_STATUS_LABELS,
  SCORING_POLICY_LABELS,
  type NormativeContext,
  type NormativeProfile,
  type ScoringPolicy,
  type VersionConflictNote
} from "@finance/content-generation";

/**
 * Le référentiel d'un contenu, à l'écran de relecture.
 *
 * CE QUE LE RELECTEUR DOIT POUVOIR LIRE EN UN COUP D'ŒIL : ce qui s'applique
 * aujourd'hui, ce qui vient du support, ce qui est propre au cas, et ce qui
 * servira à noter l'apprenant. Les quatre questions se répondaient jusqu'ici en
 * lisant les numéros de compte de l'écriture attendue et en s'en remettant à sa
 * mémoire du plan comptable — c'est-à-dire pas du tout, puisque c'est
 * précisément l'erreur que l'audit a trouvée.
 *
 * L'ABSENCE DE RÉFÉRENTIEL EST AFFICHÉE, PAS SUPPOSÉE. Un contenu sans contexte
 * normatif n'est pas présenté comme « ANC 2026 » par défaut : il est présenté
 * comme non déterminé, ce qu'il est. Le défaut existe côté public pour les
 * versions antérieures au champ ; il n'a rien à faire dans un écran dont l'objet
 * est de décider.
 */

const PROFILE_TONE: Record<NormativeProfile, string> = {
  "anc-2026-current": "ready",
  "course-original": "needs-review",
  "entity-specific": "processing"
};

const PROFILE_TITLE: Record<NormativeProfile, string> = {
  "anc-2026-current":
    "Plan comptable général en vigueur au 1er janvier 2026 — c'est ce sur quoi un apprenant est noté",
  "course-original":
    "Traitement du support d'origine, conservé pour comparaison — ne note jamais une réponse d'aujourd'hui",
  "entity-specific":
    "Subdivision propre à une entité ou à un exercice — jamais un compte obligatoire du plan officiel"
};

const SCORING_TONE: Record<ScoringPolicy, string> = {
  graded: "ready",
  "comparison-only": "needs-review",
  "not-gradable": "processing"
};

const CONFLICT_TONE: Record<VersionConflictNote["severity"], string> = {
  info: "processing",
  warning: "needs-review",
  blocking: "needs-review"
};

const CONFLICT_LABEL: Record<VersionConflictNote["severity"], string> = {
  info: "Information",
  warning: "Avertissement",
  blocking: "Bloquant"
};

export function NormativeProfileBadge({ profile }: { profile: NormativeProfile }) {
  return (
    <span className={`state-token ${PROFILE_TONE[profile]}`} title={PROFILE_TITLE[profile]}>
      {NORMATIVE_PROFILE_LABELS[profile]}
    </span>
  );
}

export function ScoringPolicyBadge({ policy }: { policy: ScoringPolicy }) {
  return (
    <span
      className={`state-token ${SCORING_TONE[policy]}`}
      title={
        policy === "graded"
          ? "La réponse attendue fait foi : elle corrige les tentatives et compte dans la progression"
          : policy === "comparison-only"
            ? "Affiché pour comparer deux états du droit — ne corrige rien, ne compte dans aucun score"
            : "Sans réponse attendue exploitable — rien à noter"
      }
    >
      {SCORING_POLICY_LABELS[policy]}
    </span>
  );
}

/** L'étiquette d'un contenu dont personne n'a encore établi le référentiel. */
export function UndeterminedProfileBadge() {
  return (
    <span
      className="state-token needs-review"
      title="Aucun référentiel déclaré : le profil applicable reste à établir avant approbation"
    >
      Référentiel non déterminé
    </span>
  );
}

function formatPeriod(context: NormativeContext): string {
  if (!context.effectiveFrom && !context.effectiveTo) {
    return "non datée";
  }

  if (context.effectiveFrom && context.effectiveTo) {
    return `du ${context.effectiveFrom} au ${context.effectiveTo}`;
  }

  return context.effectiveFrom ? `à partir du ${context.effectiveFrom}` : `jusqu'au ${context.effectiveTo}`;
}

export function NormativePanel({ context }: { context: NormativeContext | null | undefined }) {
  if (!context) {
    return (
      <>
        <p className="review-badges">
          <UndeterminedProfileBadge />
        </p>
        <p className="muted">
          Ce contenu ne déclare aucun référentiel. Tant qu&apos;il n&apos;en porte pas, on ne peut pas dire
          selon quel plan comptable il est vrai, ni s&apos;il a le droit de noter une réponse. Le classement
          normatif en propose un&nbsp;; la publication est refusée sans lui dès que le contenu emploie un
          compte dont le traitement dépend du millésime.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="review-badges">
        <NormativeProfileBadge profile={context.profile} />
        <ScoringPolicyBadge policy={context.scoringPolicy} />
        <span className="muted">
          {NORMATIVE_STATUS_LABELS[context.status]} · période {formatPeriod(context)}
          {context.supersededByProfile
            ? ` · remplacé par « ${NORMATIVE_PROFILE_LABELS[context.supersededByProfile]} »`
            : ""}
        </span>
      </p>

      {context.profile === "course-original" ? (
        <p>
          Traitement du support d&apos;origine. Il est conservé tel quel pour permettre la comparaison
          avec le plan en vigueur&nbsp;; il ne corrige aucune tentative et n&apos;entre dans aucun score.
        </p>
      ) : null}

      {context.customAccountDisclosures.length > 0 ? (
        <>
          <h3>Sous-comptes déclarés</h3>
          <ul className="review-issues">
            {context.customAccountDisclosures.map((disclosure) => (
              <li key={disclosure.accountNumber}>
                <strong>{disclosure.accountNumber}</strong> — {disclosure.label}
                <span className="muted">
                  {" "}
                  · subdivision du compte {disclosure.parentAccount} ·{" "}
                  {disclosure.source === "course"
                    ? "défini par le support de cours"
                    : "défini par le plan de comptes de l'entité"}
                </span>
              </li>
            ))}
          </ul>
          <p className="muted">
            Ces numéros ne sont pas prescrits par le plan officiel&nbsp;: ils ne doivent jamais être
            présentés comme des comptes obligatoires.
          </p>
        </>
      ) : null}

      {context.versionConflictNotes.length > 0 ? (
        <>
          <h3>Conflits de version</h3>
          <ul className="review-issues">
            {context.versionConflictNotes.map((note, index) => (
              <li key={`${note.code}-${index}`}>
                <span className={`state-token ${CONFLICT_TONE[note.severity]}`}>
                  {CONFLICT_LABEL[note.severity]}
                </span>{" "}
                <strong>{note.code}</strong> — {note.message}
                {note.sourceIds.length > 0 ? (
                  <div className="muted">Sources confrontées&nbsp;: {note.sourceIds.join(", ")}</div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {context.sourceVersionIds.length > 0 ? (
        <p className="muted">
          Versions de référentiel invoquées&nbsp;: {context.sourceVersionIds.join(", ")}
        </p>
      ) : null}
    </>
  );
}
