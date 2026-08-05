import Link from "next/link";
import { MAX_SCORE, type Exercise } from "@finance/domain";
import { DomainBadge } from "@/components/domain-badge";

/**
 * Une carte d'exercice dans la grille de /exercices.
 *
 * CE QU'ELLE MONTRE TOUJOURS : ce qui appartient à l'exercice — son domaine,
 * son échelle de notation, le nombre de critères de son barème, les compétences
 * qu'il vise. Ces informations sont vraies pour tout le monde.
 *
 * CE QU'ELLE NE MONTRE QUE POUR UN COMPTE : `lastScore`. La maquette place un
 * badge « ✓ 16/20 » sur une carte, et c'est juste — pour quelqu'un qui a
 * réellement fait l'exercice. En mode découverte, `getCorrectionHistory`
 * retourne les corrections *seedées* : les afficher attribuerait au visiteur un
 * travail qu'il n'a pas fourni, ce que PR-20 a précisément retiré du reste du
 * produit (ADR-011). L'appelant ne transmet donc `lastScore` que s'il y a un
 * utilisateur identifié.
 *
 * L'ÉTAT « VERROUILLÉ » DE LA MAQUETTE N'EST PAS ICI. Il demande l'état de
 * progression canonique par exercice — une requête par carte — et /exercices ne
 * verrouille rien aujourd'hui. Dessiner un cadenas que la page n'applique pas
 * serait une promesse fausse dans l'autre sens.
 */

export interface ExerciseCardProps {
  exercise: Exercise;
  /** Note de la dernière tentative. Absent = pas de compte, ou jamais tenté. */
  lastScore?: number;
}

export function ExerciseCard({ exercise, lastScore }: ExerciseCardProps) {
  const criteria = exercise.rubric.length;

  return (
    <article className="exercise-card" data-exercise-id={exercise.id}>
      <div className="exercise-card-head">
        <DomainBadge domainId={exercise.domainId} />

        {lastScore === undefined ? (
          <span className="exercise-card-scale">/{MAX_SCORE}</span>
        ) : (
          // Le « ✓ » double l'information portée par le vert : un état ne se
          // lit jamais à la couleur seule.
          <span className="exercise-card-score">
            <span aria-hidden="true">✓</span>
            {lastScore}/{MAX_SCORE}
          </span>
        )}
      </div>

      <h2>{exercise.title}</h2>

      <p>{exercise.statement}</p>

      {/* Le mono ne porte que les nombres : c'est là qu'il aide à comparer
          deux cartes d'un coup d'œil. */}
      <p className="exercise-card-meta">
        Barème sur <strong>{criteria}</strong> critère{criteria > 1 ? "s" : ""} · environ{" "}
        <strong>{exercise.estimatedMinutes}</strong> min
      </p>

      {exercise.competencyIds.length > 0 ? (
        <div className="exercise-card-tags">
          {exercise.competencyIds.map((competencyId) => (
            <span key={competencyId}>{competencyId}</span>
          ))}
        </div>
      ) : null}

      <div className="exercise-card-actions">
        {/* Une seule action, et elle mène à la page qui porte à la fois
            l'énoncé et le formulaire. La maquette en dessine deux
            (« Commencer », « Ouvrir le détail ») ; ici elles aboutiraient à la
            même route, et un second bouton qui va au même endroit est un
            ornement, pas un choix. */}
        <Link className="primary-action action-sm inline-link" href={`/exercices/${exercise.id}`}>
          {lastScore === undefined ? "Commencer" : "Refaire"}
        </Link>
      </div>
    </article>
  );
}
