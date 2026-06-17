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

export type LearningTier = "fondations" | "application" | "maitrise";

export type ExerciseType = "qcm" | "short-answer" | "calculation" | "journal-entry" | "justification" | "mini-case";

export type FlashcardType = "concept" | "formula" | "journal-entry" | "frequent-error" | "diagnostic";

export type FlashcardStatus = "new" | "learning" | "due" | "mastered";

export type ReviewRating = "forgotten" | "partial" | "correct" | "mastered";

export type ErrorCategory =
  | "calculation"
  | "accounting-treatment"
  | "reasoning"
  | "source-quality"
  | "missing-element";

export type ExamSessionStatus = "draft" | "in-progress" | "submitted";

export type BusinessCaseStatus = "locked" | "available" | "completed";

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

export interface LearningModule {
  id: string;
  title: string;
  domainId: DomainId;
  tier: LearningTier;
  description: string;
  objective: string;
  prerequisites: string[];
  competencyIds: string[];
  conceptIds: string[];
  lessonIds: string[];
  exerciseIds: string[];
  flashcardIds: string[];
  estimatedMinutes: number;
  status: CompetencyStatus;
  progress: number;
  nextAction: string;
}

export interface Concept {
  id: string;
  moduleId: string;
  domainId: DomainId;
  title: string;
  shortDefinition: string;
  formula?: string;
  frequentTrap: string;
  miniExample: string;
  competencyIds: string[];
  status: CompetencyStatus;
  strength: number;
  sourceReferences: SourceReference[];
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

export interface RubricScore {
  criterion: string;
  maxPoints: number;
  awardedPoints: number;
  justification: string;
}

export interface RemediationPlan {
  microLesson: string;
  nextAction: string;
  competencyTags: string[];
  expectedAnswer: string;
  nextExerciseId?: string;
}

export interface Exercise {
  id: string;
  domainId: DomainId;
  type: ExerciseType;
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
  rubricScores: RubricScore[];
  correct: string[];
  partialPoints: string[];
  errors: string[];
  calculationErrors: string[];
  accountingTreatmentErrors: string[];
  reasoningErrors: string[];
  sourceQualityIssues: string[];
  missingElements: string[];
  remediation: string;
  remediationPlan: RemediationPlan;
  sourceReferences: SourceReference[];
}

export interface Flashcard {
  id: string;
  moduleId: string;
  conceptId: string;
  domainId: DomainId;
  type: FlashcardType;
  front: string;
  back: string;
  explanation: string;
  competencyIds: string[];
  status: FlashcardStatus;
  dueAt: string;
  intervalDays: number;
  sourceReferences: SourceReference[];
}

export interface RevisionSession {
  id: string;
  generatedAt: string;
  dueCount: number;
  newCount: number;
  fragileCount: number;
  masteredCount: number;
  cards: Flashcard[];
}

export interface RevisionReview {
  flashcardId: string;
  rating: ReviewRating;
  reviewedAt: string;
  nextDueAt: string;
  intervalDays: number;
  nextStatus: FlashcardStatus;
}

export interface ErrorJournalEntry {
  id: string;
  exerciseId: string;
  correctionId: string;
  category: ErrorCategory;
  summary: string;
  competencyIds: string[];
  nextAction: string;
  createdAt: string;
}

export interface ExamSession {
  id: string;
  title: string;
  exerciseIds: string[];
  durationMinutes: number;
  status: ExamSessionStatus;
  startedAt?: string;
  submittedAt?: string;
  score?: number;
}

export interface BusinessCaseQuestion {
  id: string;
  prompt: string;
  competencyIds: string[];
  expectedPoints: string[];
}

export interface BusinessCaseDocument {
  id: string;
  title: string;
  summary: string;
  sourceReferences: SourceReference[];
}

export interface BusinessCase {
  id: string;
  title: string;
  domainId: DomainId;
  level: number;
  status: BusinessCaseStatus;
  description: string;
  dossier: string;
  documents: BusinessCaseDocument[];
  questions: BusinessCaseQuestion[];
  expectedDeliverable: string;
  competencyIds: string[];
  sourceReferences: SourceReference[];
}

export interface BusinessCaseAttempt {
  id: string;
  businessCaseId: string;
  userMemo: string;
  score: number;
  correction: string;
  createdAt: string;
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
