export type DomainId =
  | "compta-generale"
  | "compta-analytique"
  | "controle-gestion"
  | "ifrs-ias"
  | "iso"
  | "fiscalite"
  | "finance";

export type CompetencyStatus =
  | "not-started"
  | "in-progress"
  | "fragile"
  | "mastered";

export type LearningDayStatus = "done" | "today" | "next" | "locked";

export type SourceType = "course" | "official-reference" | "personal-note" | "exercise";

export type SourcePackStatus = "ready" | "processing" | "needs-review";

export interface Domain {
  id: DomainId;
  name: string;
  shortName: string;
  accent: string;
  softAccent: string;
  description: string;
}

export interface Competency {
  id: string;
  domainId: DomainId;
  name: string;
  levelMin: number;
  levelMax: number;
  status: CompetencyStatus;
  strength: number;
  focus: string;
}

export interface SourceReference {
  pack: string;
  document: string;
  sourceType: SourceType;
  pageStart?: number;
  pageEnd?: number;
  effectiveDate?: string;
}

export interface Lesson {
  id: string;
  domainId: DomainId;
  title: string;
  concept: string;
  rule: string;
  reasoning: string;
  example: string;
  frequentError: string;
  linkedExerciseId: string;
  sourceReferences: SourceReference[];
}

export interface RubricItem {
  label: string;
  points: number;
}

export interface Exercise {
  id: string;
  domainId: DomainId;
  title: string;
  level: number;
  estimatedMinutes: number;
  statement: string;
  expectedAnswer: string;
  rubric: RubricItem[];
  competencyIds: string[];
  sourceChunkIds: string[];
}

export interface Correction {
  id: string;
  exerciseId: string;
  score: number;
  summary: string;
  correct: string[];
  errors: string[];
  remediation: string;
  sourceReferences: SourceReference[];
}

export interface Attempt {
  id: string;
  exerciseId: string;
  userAnswer: string;
  score: number;
  correctionId: string;
  createdAt: string;
}

export interface LearningDay {
  day: number;
  title: string;
  domainId: DomainId;
  competencyIds: string[];
  lessonId: string;
  exerciseId: string;
  minutes: number;
  status: LearningDayStatus;
}

export interface LearningPath {
  id: string;
  name: string;
  durationDays: number;
  currentDay: number;
  goal: string;
  days: LearningDay[];
}

export interface SourcePack {
  id: string;
  name: string;
  description: string;
  domainId: DomainId;
  versionLabel: string;
  effectiveDate: string;
  importedAt: string;
  status: SourcePackStatus;
  documentsCount: number;
  chunksCount: number;
}

export interface DocumentRecord {
  id: string;
  sourcePackId: string;
  filename: string;
  fileType: "pdf" | "docx" | "pptx" | "xlsx" | "md";
  domainId: DomainId;
  title: string;
  originalPath: string;
  checksum: string;
  importedAt: string;
  pages: number;
  status: SourcePackStatus;
}

export interface Chunk {
  id: string;
  documentId: string;
  pageStart: number;
  pageEnd: number;
  sectionTitle: string;
  content: string;
  domainId: DomainId;
  topic: string;
  difficulty: number;
  effectiveDate?: string;
  sourceType: SourceType;
}

export interface DashboardPriority {
  id: string;
  domainId: DomainId;
  title: string;
  reason: string;
  action: string;
}
