import { CalculationExercise } from "@/components/compta-approfondie/calculation-exercise";
import { ErrorDiagnosis } from "@/components/compta-approfondie/error-diagnosis";
import { JournalWorkshop } from "@/components/compta-approfondie/journal-workshop";
import { ProgressiveCaseView } from "@/components/compta-approfondie/progressive-case";
import type { ChapterTrainingSet } from "@/lib/publication/chapter";

/**
 * L'onglet « S'entraîner ».
 *
 * Une section par famille d'activité, et seulement celles que le chapitre
 * publie : un chapitre sans mini-cas n'affiche pas une section vide intitulée
 * « Mini-cas », il n'affiche rien. Composant serveur — les quatre familles sont
 * des îlots clients, la composition ne l'est pas.
 */
export function ChapterTraining({
  chapter,
  training
}: {
  chapter: string;
  training: ChapterTrainingSet;
}) {
  return (
    <div className="training-stack">
      {training.calculations.length > 0 ? (
        <section className="panel">
          <h2 className="panel-heading">Exercices de calcul</h2>
          <p className="muted">
            La notation est déterministe et faite côté serveur&nbsp;: valeur attendue, tolérance,
            arrondi et unité sont vérifiés séparément.
          </p>
          {training.calculations.map((exercise) => (
            <CalculationExercise key={exercise.exerciseId} chapter={chapter} exercise={exercise} />
          ))}
        </section>
      ) : null}

      {training.journalEntries.length > 0 ? (
        <section className="panel">
          <h2 className="panel-heading">Atelier d&apos;écriture comptable</h2>
          <p className="muted">
            Chaque ligne est corrigée séparément&nbsp;: compte, sens, montant, puis équilibre de
            l&apos;écriture.
          </p>
          {training.journalEntries.map((exercise) => (
            <JournalWorkshop key={exercise.exerciseId} chapter={chapter} exercise={exercise} />
          ))}
        </section>
      ) : null}

      {training.diagnoses.length > 0 ? (
        <section className="panel">
          <h2 className="panel-heading">Diagnostics d&apos;erreur</h2>
          <p className="muted">
            La catégorie choisie est notée&nbsp;; la justification libre est enregistrée sans être
            notée.
          </p>
          {training.diagnoses.map((exercise) => (
            <ErrorDiagnosis key={exercise.exerciseId} chapter={chapter} exercise={exercise} />
          ))}
        </section>
      ) : null}

      {training.cases.length > 0 ? (
        <section className="panel">
          <h2 className="panel-heading">Mini-cas progressifs</h2>
          <p className="muted">
            Les étapes s&apos;enchaînent&nbsp;: chacune s&apos;ouvre quand ses prérequis sont réussis,
            et trois niveaux d&apos;indice sont disponibles à la demande.
          </p>
          {training.cases.map((kase) => (
            <ProgressiveCaseView key={kase.caseId} chapter={chapter} kase={kase} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
