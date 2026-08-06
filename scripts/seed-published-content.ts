import { rm } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// Imports relatifs, pas par nom de paquet : la racine du dépôt ne déclare pas
// `@finance/content-publication` dans ses dépendances, et l'y ajouter pour un
// script d'amorçage de test ferait porter au dépôt entier une dépendance dont
// seul Playwright a besoin.
import { buildPublishedVersion } from "../packages/content-publication/src/snapshot";
import { publishVersion } from "../packages/content-publication/src/store";
import {
  approvedCalculationDraft,
  approvedCaseDraft,
  approvedDiagnosisDraft,
  approvedFlashcardDraft,
  approvedJournalDraft,
  approvedSheetDraft
} from "../packages/content-publication/test/fixtures";

/**
 * Amorce un magasin publié **jetable** pour les tests end-to-end.
 *
 * TROIS VERROUS INDÉPENDANTS, PARCE QU'UN SEUL SE CONTOURNE PAR ACCIDENT.
 *
 * 1. `ALLOW_TEST_CONTENT_SEED=true` est **obligatoire**. Aucune valeur par
 *    défaut, aucune déduction depuis l'environnement : lancer ce script sans le
 *    dire explicitement ne fait rien. Une variable absente n'active jamais les
 *    fixtures — c'est la règle inverse qui produit les accidents.
 * 2. `NODE_ENV=production` est un **refus catégorique**, drapeau ou pas. Il n'y
 *    a délibérément pas d'échappatoire : le serveur end-to-end lance ce script
 *    *avant* `next start`, donc dans un shell où `NODE_ENV` n'est pas encore
 *    « production ». Aucun cas d'usage légitime ne demande d'amorcer des
 *    fixtures dans un processus de production.
 * 3. La cible doit être **sous `test-results/`**. Écrire dans
 *    `content/published/` publierait pour de bon des contenus que personne n'a
 *    relus ; le chemin est vérifié plutôt que supposé.
 *
 * NI PDF, NI CORPUS PRIVÉ. Les fixtures sont écrites à la main dans
 * `packages/content-publication/test/fixtures.ts` : elles n'ouvrent aucun
 * fichier, ne lisent pas `data/extracted/`, et le texte qu'elles portent est
 * inventé pour le test. Leurs identifiants sont préfixés `e2e-` et le sont par
 * construction, ce qu'un test vérifie.
 *
 * Le magasin produit est git-ignoré (`test-results/`), donc le script ne peut
 * pas laisser d'artefact suivi par Git.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Le seul emplacement où ce script a le droit d'écrire. */
export const TEST_STORE_PARENT = join(repoRoot, "test-results");

export const SEEDED_STORE_ROOT = join(TEST_STORE_PARENT, "published-content");

export class SeedRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedRefusedError";
  }
}

/**
 * Les trois verrous, sous forme de fonction pure pour être testables sans
 * lancer le script.
 */
export function assertSeedAllowed(
  env: { NODE_ENV?: string; ALLOW_TEST_CONTENT_SEED?: string },
  targetRoot: string
): void {
  if (env.NODE_ENV === "production") {
    throw new SeedRefusedError(
      "Amorçage refusé : NODE_ENV=production.\n" +
        "Ce script écrit des contenus de test. Il n'existe aucun cas où les amorcer " +
        "dans un processus de production soit légitime, et donc aucun drapeau pour le forcer."
    );
  }

  if (env.ALLOW_TEST_CONTENT_SEED !== "true") {
    throw new SeedRefusedError(
      "Amorçage refusé : ALLOW_TEST_CONTENT_SEED n'est pas « true ».\n" +
        "Les contenus de test ne sont jamais amorcés par défaut. Pour les tests end-to-end, " +
        "Playwright pose la variable lui-même (voir playwright.config.ts) ; pour un lancement " +
        "manuel, exporter ALLOW_TEST_CONTENT_SEED=true."
    );
  }

  const insideTestResults = relative(TEST_STORE_PARENT, targetRoot);

  if (insideTestResults.startsWith("..") || resolve(targetRoot) === resolve(TEST_STORE_PARENT)) {
    throw new SeedRefusedError(
      `Amorçage refusé : la cible « ${targetRoot} » n'est pas sous test-results/.\n` +
        "Ce script n'écrit jamais dans content/published/, qui est le magasin réellement publié."
    );
  }
}

export async function seedTestStore(targetRoot: string = SEEDED_STORE_ROOT): Promise<number> {
  assertSeedAllowed(process.env, targetRoot);

  // Idempotent : on repart d'un magasin vide, sans quoi une seconde exécution
  // buterait sur « un instantané publié n'est jamais réécrit ». C'est aussi le
  // nettoyage du script — il ne laisse jamais deux jeux superposés.
  await rm(targetRoot, { recursive: true, force: true });

  const options = { rootDir: targetRoot };
  const publishedAt = "2026-08-06T09:00:00.000Z";

  // Les six types, pour que la suite e2e couvre les cinq onglets : sans carte,
  // « Réviser » afficherait son état vide et le mode focus ne serait jamais
  // exercé.
  const drafts = [
    approvedSheetDraft(),
    approvedFlashcardDraft(),
    approvedCalculationDraft(),
    approvedJournalDraft(),
    approvedDiagnosisDraft(),
    approvedCaseDraft()
  ];

  for (const draft of drafts) {
    const version = buildPublishedVersion({
      draft,
      publishedBy: "e2e@example.test",
      publishedAt,
      publicationVersion: 1,
      previousPublishedVersionId: null
    });

    await publishVersion(options, version);
  }

  return drafts.length;
}

async function main(): Promise<void> {
  try {
    const count = await seedTestStore();
    console.log(`${count} contenus de test publiés dans ${SEEDED_STORE_ROOT}`);
  } catch (error) {
    if (error instanceof SeedRefusedError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

// Même garde que `verify-deployment.ts` : la racine du dépôt n'est pas un module
// ESM, donc `tsx` compile ce fichier en CJS et un `await` de premier niveau y
// est refusé.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
