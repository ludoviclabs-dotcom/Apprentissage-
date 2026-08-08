/**
 * Fabrique pédagogique contrôlée.
 *
 * Séparation des rôles, dans cet ordre : l'IA propose, Zod contrôle la
 * structure, le code recalcule et vérifie, un humain approuve. Rien dans ce
 * package ne publie : la machine à états n'a pas d'état « publié ».
 */

export * from "./types/status";
export * from "./types/source-reference";
export * from "./types/normative-context";
export * from "./types/metadata";
export * from "./types/smart-revision-sheet";
export * from "./types/flashcard";
export * from "./types/calculation";
export * from "./types/journal-entry";
export * from "./types/error-diagnosis";
export * from "./types/progressive-case";
export * from "./types/artifact";

export * from "./calc/templates";
export * from "./validation/text";
export * from "./validation/normative-accounts";
export * from "./validation/normative";
export * from "./validation/engine";
export * from "./envelope/build";
export * from "./prompts/registry";
export * from "./providers";
export * from "./corpus/load";
export * from "./generate/orchestrator";
export * from "./store/draft-store";
