import { readFileSync, writeFileSync } from "node:fs";

const INPUT =
  "C:/Users/Ludo/AppData/Local/Temp/claude/C--Users-Ludo-Apprentissage--claude-worktrees-modest-kirch-d2c468/0d7ad6df-d036-480c-aab3-81644b53cb43/tasks/wc8aqrdtd.output";
const OUTPUT = new URL("./src/compta-v1.ts", import.meta.url);

const PACK = "compta-master";
const EFFECTIVE = "2025-09-01";

// Topic metadata: drives IDs, competencies, modules and the learning path.
const META = {
  "operations-courantes": { comp: "cg-operations-courantes", newComp: true, compName: "Comptabiliser les opérations courantes", domain: "compta-generale", levelMin: 1, levelMax: 2, status: "in-progress", strength: 60, focus: "Qualifier immobilisation vs charge avant l'écriture.", module: "module-compta-fondations", label: "Les opérations courantes", day: 1, dayStatus: "done", minutes: 45 },
  "constitution-entreprises": { comp: "cg-constitution", newComp: true, compName: "Traiter la constitution des sociétés", domain: "compta-generale", levelMin: 1, levelMax: 3, status: "in-progress", strength: 54, focus: "Apports, promesse et libération du capital.", module: "module-compta-fondations", label: "La constitution des sociétés", day: 2, dayStatus: "done", minutes: 50 },
  "travaux-cloture": { comp: "cg-cutoff", newComp: false, compName: "Rattacher charges et produits à la bonne période", domain: "compta-generale", levelMin: 1, levelMax: 3, status: "in-progress", strength: 68, focus: "Identifier le fait générateur avant le compte.", module: "module-compta-fondations", label: "Les travaux de clôture", day: 3, dayStatus: "today", minutes: 55 },
  "methode-abc": { comp: "ca-abc", newComp: true, compName: "Mettre en œuvre la méthode ABC", domain: "compta-analytique", levelMin: 2, levelMax: 4, status: "in-progress", strength: 50, focus: "Inducteurs de coût et coût par activité.", module: "module-pilotage-performance", label: "La méthode ABC", day: 4, dayStatus: "next", minutes: 55 },
  "titres": { comp: "cg-titres", newComp: true, compName: "Comptabiliser et évaluer les titres", domain: "compta-generale", levelMin: 2, levelMax: 4, status: "fragile", strength: 41, focus: "Distinguer les catégories de titres et leur évaluation.", module: "module-compta-approfondie", label: "La comptabilisation des titres", day: 5, dayStatus: "next", minutes: 55 },
  "cout-cible": { comp: "ca-cout-cible", newComp: true, compName: "Appliquer la méthode du coût cible", domain: "compta-analytique", levelMin: 2, levelMax: 4, status: "fragile", strength: 38, focus: "Coût cible = prix de marché − marge cible.", module: "module-pilotage-performance", label: "La méthode du coût cible", day: 6, dayStatus: "next", minutes: 50 },
  "emprunts-obligataires": { comp: "cg-emprunts-obligataires", newComp: true, compName: "Comptabiliser les emprunts obligataires", domain: "compta-generale", levelMin: 3, levelMax: 4, status: "not-started", strength: 26, focus: "Nominal, prime de remboursement et amortissement.", module: "module-compta-approfondie", label: "Les emprunts obligataires", day: 7, dayStatus: "locked", minutes: 55 },
  "variations-capital": { comp: "cg-variations-capital", newComp: true, compName: "Traiter les variations du capital", domain: "compta-generale", levelMin: 3, levelMax: 5, status: "not-started", strength: 20, focus: "Augmentation, réduction et primes d'émission.", module: "module-compta-approfondie", label: "Les variations du capital", day: 8, dayStatus: "locked", minutes: 60 },
  "yield-management": { comp: "ca-yield", newComp: true, compName: "Piloter les capacités et le yield management", domain: "compta-analytique", levelMin: 3, levelMax: 5, status: "not-started", strength: 22, focus: "Tarifer selon la capacité et la demande.", module: "module-pilotage-performance", label: "Yield management et capacités", day: 9, dayStatus: "locked", minutes: 55 },
  "ecarts": { comp: "ca-ecarts", newComp: true, compName: "Calculer et interpréter les écarts", domain: "compta-analytique", levelMin: 3, levelMax: 5, status: "fragile", strength: 35, focus: "Décomposer écarts prix / quantité / volume.", module: "module-pilotage-performance", label: "Les écarts sur coûts et sur CA", day: 10, dayStatus: "locked", minutes: 55 }
};

const MODULES = {
  "module-compta-fondations": { title: "Comptabilité générale — fondations", domain: "compta-generale", tier: "fondations", description: "Opérations courantes, constitution des sociétés et travaux de clôture : poser les automatismes d'enregistrement et de régularisation.", objective: "Qualifier une opération, passer l'écriture et justifier le rattachement à la période.", prerequisites: ["Débit/crédit", "Plan de comptes", "TVA collectée/déductible"] },
  "module-compta-approfondie": { title: "Comptabilité approfondie — financements et capital", domain: "compta-generale", tier: "maitrise", description: "Titres, emprunts obligataires et variations du capital : traiter les opérations de haut de bilan.", objective: "Comptabiliser et évaluer les opérations de financement et de capital.", prerequisites: ["Module fondations", "Notion d'actualisation", "Capitaux propres"] },
  "module-pilotage-performance": { title: "Pilotage de la performance (analytique)", domain: "compta-analytique", tier: "application", description: "Méthode ABC, coût cible, yield management et analyse des écarts pour piloter la performance.", objective: "Choisir et appliquer la bonne méthode de coût puis interpréter les écarts.", prerequisites: ["Charges directes/indirectes", "Marge sur coût variable"] }
};

const FC_STATUS = ["due", "learning", "new", "new", "mastered"];
const FC_DUEAT = { due: "2026-06-15T08:00:00.000Z", learning: "2026-06-16T08:00:00.000Z", new: "2026-06-18T08:00:00.000Z", mastered: "2026-07-08T08:00:00.000Z" };
const FC_INTERVAL = { due: 3, learning: 1, new: 0, mastered: 21 };

const data = JSON.parse(readFileSync(INPUT, "utf8")).result;

function ref(citation) {
  const r = { pack: PACK, document: citation.citationDocument, sourceType: citation.citationSourceType };
  if (typeof citation.citationPageStart === "number") r.pageStart = citation.citationPageStart;
  if (typeof citation.citationPageEnd === "number") r.pageEnd = citation.citationPageEnd;
  r.effectiveDate = EFFECTIVE;
  return r;
}

const competencies = [];
const concepts = [];
const lessons = [];
const exercises = [];
const flashcards = [];
const days = [];
const moduleAgg = {};
for (const id of Object.keys(MODULES)) moduleAgg[id] = { competencyIds: new Set(), conceptIds: [], lessonIds: [], exerciseIds: [], flashcardIds: [], minutes: 0 };

for (const entry of data) {
  const key = entry.key;
  const m = META[key];
  if (!m) throw new Error(`missing META for ${key}`);
  const content = (entry.verified && entry.verified.content) || entry.draft;
  const lessonRef = ref(content.lesson);
  const lessonId = `lesson-${key}`;
  const conceptId = `concept-${key}`;
  const ex1 = `ex-${key}-1`;
  const agg = moduleAgg[m.module];

  if (m.newComp) {
    competencies.push({ id: m.comp, domainId: m.domain, name: m.compName, levelMin: m.levelMin, levelMax: m.levelMax, status: m.status, strength: m.strength, focus: m.focus });
  }
  agg.competencyIds.add(m.comp);

  concepts.push({ id: conceptId, moduleId: m.module, domainId: m.domain, title: content.concept.title, shortDefinition: content.concept.shortDefinition, ...(content.concept.formula ? { formula: content.concept.formula } : {}), frequentTrap: content.concept.frequentTrap, miniExample: content.concept.miniExample, competencyIds: [m.comp], status: m.status, strength: m.strength, sourceReferences: [lessonRef] });
  agg.conceptIds.push(conceptId);

  lessons.push({ id: lessonId, domainId: m.domain, title: m.label, concept: content.lesson.concept, rule: content.lesson.rule, reasoning: content.lesson.reasoning, example: content.lesson.example, frequentError: content.lesson.frequentError, linkedExerciseId: ex1, sourceReferences: [lessonRef] });
  agg.lessonIds.push(lessonId);

  content.exercises.forEach((ex, i) => {
    const id = `ex-${key}-${i + 1}`;
    exercises.push({ id, domainId: m.domain, type: ex.type, title: ex.title, level: ex.level, estimatedMinutes: ex.estimatedMinutes, statement: ex.statement, expectedAnswer: ex.expectedAnswer, rubric: ex.rubric, competencyIds: [m.comp], sourceChunkIds: [] });
    agg.exerciseIds.push(id);
  });

  content.flashcards.forEach((fc, i) => {
    const id = `fc-${key}-${i + 1}`;
    const status = FC_STATUS[i] || "new";
    flashcards.push({ id, moduleId: m.module, conceptId, domainId: m.domain, type: fc.type, front: fc.front, back: fc.back, explanation: fc.explanation, competencyIds: [m.comp], status, dueAt: FC_DUEAT[status], intervalDays: FC_INTERVAL[status], sourceReferences: [lessonRef] });
    agg.flashcardIds.push(id);
  });

  agg.minutes += m.minutes;

  days.push({ day: m.day, title: m.label, domainId: m.domain, competencyIds: [m.comp], lessonId, exerciseId: ex1, minutes: m.minutes, status: m.dayStatus });
}

days.sort((a, b) => a.day - b.day);

const modules = Object.keys(MODULES).map((id) => {
  const meta = MODULES[id];
  const agg = moduleAgg[id];
  const total = agg.flashcardIds.length;
  const mastered = flashcards.filter((f) => agg.flashcardIds.includes(f.id) && f.status === "mastered").length;
  const progress = total ? Math.round((mastered / total) * 100) : 0;
  return { id, title: meta.title, domainId: meta.domain, tier: meta.tier, description: meta.description, objective: meta.objective, prerequisites: meta.prerequisites, competencyIds: [...agg.competencyIds], conceptIds: agg.conceptIds, lessonIds: agg.lessonIds, exerciseIds: agg.exerciseIds, flashcardIds: agg.flashcardIds, estimatedMinutes: agg.minutes, status: id === "module-pilotage-performance" ? "not-started" : "in-progress", progress, nextAction: id === "module-compta-fondations" ? "Terminer la révision due puis le cas de clôture." : id === "module-compta-approfondie" ? "Débloquer après les fondations." : "Comparer ABC et coût cible sur un cas." };
});

const sourcePack = { id: PACK, name: "Corpus Comptabilité (Master CCA)", description: "Cours, fiches et corrigés de comptabilité générale, approfondie et de pilotage de la performance, extraits et indexés localement.", domainId: "compta-generale", versionLabel: "2024-2025", effectiveDate: EFFECTIVE, importedAt: "2026-06-17", status: "ready", documentsCount: 66, chunksCount: 1284 };

const banner = "// AUTO-GÉNÉRÉ par assemble-compta.mjs à partir du corpus Dropbox (data/processed/corpus/compta-master).\n// Contenu pédagogique dérivé et vérifié ; ne pas éditer à la main — régénérer via le script.\n";
const out = `${banner}import type { Competency, Concept, Exercise, Flashcard, LearningDay, LearningModule, Lesson, SourcePack } from "./types";\n\n` +
  `export const comptaSourcePack: SourcePack = ${JSON.stringify(sourcePack, null, 2)};\n\n` +
  `export const comptaCompetencies: Competency[] = ${JSON.stringify(competencies, null, 2)};\n\n` +
  `export const comptaConcepts: Concept[] = ${JSON.stringify(concepts, null, 2)};\n\n` +
  `export const comptaLessons: Lesson[] = ${JSON.stringify(lessons, null, 2)};\n\n` +
  `export const comptaExercises: Exercise[] = ${JSON.stringify(exercises, null, 2)};\n\n` +
  `export const comptaFlashcards: Flashcard[] = ${JSON.stringify(flashcards, null, 2)};\n\n` +
  `export const comptaModules: LearningModule[] = ${JSON.stringify(modules, null, 2)};\n\n` +
  `export const comptaLearningDays: LearningDay[] = ${JSON.stringify(days, null, 2)};\n`;

writeFileSync(OUTPUT, out, "utf8");

console.log(`compta-v1.ts écrit.`);
console.log(`  compétences (nouvelles): ${competencies.length}`);
console.log(`  concepts   : ${concepts.length}`);
console.log(`  leçons     : ${lessons.length}`);
console.log(`  exercices  : ${exercises.length}`);
console.log(`  flashcards : ${flashcards.length}`);
console.log(`  modules    : ${modules.length}`);
console.log(`  jours      : ${days.length}`);
