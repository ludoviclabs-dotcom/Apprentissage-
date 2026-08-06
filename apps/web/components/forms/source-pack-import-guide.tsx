"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, RefreshCw } from "lucide-react";
import {
  buildScanCommand,
  PATH_PLACEHOLDER,
  PIPELINE_STEPS,
  validateRelativeSourcePath
} from "@/lib/source-packs/import-command";

/**
 * Assistant d'import local.
 *
 * Ce composant remplace un formulaire qui *paraissait* importer un corpus : il
 * envoyait un chemin au serveur, qui répondait invariablement une erreur. Le
 * serveur web n'a pas accès au disque de l'utilisateur, et une instance
 * déployée n'y aurait de toute façon aucun accès — l'analyse se fait dans le
 * terminal du projet, là où les documents se trouvent.
 *
 * Il n'émet donc aucune requête d'import. Le champ de chemin ne quitte jamais
 * le navigateur : il sert uniquement à composer la commande à copier. Le seul
 * appel réseau possible est un rafraîchissement de la page, qui relit la liste
 * des packs déjà connus.
 */
export function SourcePackImportGuide() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [path, setPath] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const fieldId = useId();
  const errorId = `${fieldId}-error`;

  const check = validateRelativeSourcePath(path);
  const command = buildScanCommand(path);
  // Un champ encore vide n'est pas une erreur à signaler : l'utilisateur n'a
  // simplement pas commencé. On ne l'accuse qu'à partir d'une vraie saisie.
  const visibleError = path.trim() === "" ? null : (check.message ?? null);

  async function copyCommand(): Promise<void> {
    if (!command) {
      return;
    }

    setCopied(false);
    setCopyError(null);

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("presse-papiers indisponible");
      }

      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      // Le presse-papiers est refusé hors contexte sécurisé, ou par une
      // politique du navigateur. On le dit, et la commande reste sélectionnable
      // à l'écran — l'utilisateur n'est jamais bloqué.
      setCopyError("Copie impossible depuis ce navigateur. Sélectionnez la commande ci-dessus pour la copier.");
    }
  }

  return (
    <section className="panel import-guide">
      <div>
        <span className="section-label">Import local</span>
        <h2>Importer un corpus privé</h2>
        <p>
          Les documents sont analysés <strong>localement, depuis le terminal du projet</strong>. Cette page
          n&apos;envoie aucun fichier et ne lit aucun chemin de votre machine.
        </p>
      </div>

      <ol className="import-guide-steps">
        <li>
          Déposez le corpus dans le dossier privé configuré (<code>content-private/</code> par défaut). Il est
          exclu de Git : <strong>aucun PDF ne doit être ajouté au dépôt</strong>.
        </li>
        <li>Lancez la commande ci-dessous depuis le terminal, à la racine du projet.</li>
        <li>
          Enchaînez les étapes suivantes du pipeline, puis vérifiez le rapport de validation.
        </li>
        <li>Revenez ici et actualisez la liste pour consulter les packs détectés.</li>
      </ol>

      <div className="import-guide-field">
        <label htmlFor={fieldId}>Dossier à analyser, relatif au projet</label>
        <input
          id={fieldId}
          value={path}
          onChange={(event) => {
            setPath(event.target.value);
            setCopied(false);
            setCopyError(null);
          }}
          placeholder={PATH_PLACEHOLDER}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={visibleError !== null}
          aria-describedby={visibleError ? errorId : undefined}
        />
        <p id={errorId} className="import-guide-error" role="alert" aria-live="polite">
          {visibleError ?? ""}
        </p>
      </div>

      <div className="import-guide-command">
        <span className="import-guide-command-label">Commande à exécuter</span>
        <code>{command ?? `pnpm content:scan --root "${PATH_PLACEHOLDER}"`}</code>
      </div>

      <div className="import-guide-actions">
        <button
          type="button"
          className="primary-action"
          onClick={copyCommand}
          disabled={!command}
          title={command ? undefined : "Renseignez un chemin relatif valide."}
        >
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          Copier la commande
        </button>

        <button
          type="button"
          className="secondary-action"
          onClick={() => startTransition(() => router.refresh())}
          disabled={pending}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {pending ? "Actualisation…" : "Actualiser la liste"}
        </button>
      </div>

      {/* Une seule région annonce le résultat de la copie, réussite comme échec. */}
      <p className="import-guide-status" role="status" aria-live="polite">
        {copyError ?? (copied ? "Commande copiée." : "")}
      </p>

      <details className="import-guide-pipeline">
        <summary>Les étapes du pipeline</summary>
        <ol>
          {PIPELINE_STEPS.map((step) => (
            <li key={step.script}>
              <code>pnpm {step.script}</code> — {step.purpose}
            </li>
          ))}
        </ol>
        <p className="muted">
          Détail complet dans <code>docs/content-pipeline.md</code>.
        </p>
      </details>
    </section>
  );
}
