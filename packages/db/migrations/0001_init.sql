CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS source_packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  domain TEXT NOT NULL,
  version_label TEXT NOT NULL,
  effective_date DATE,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL CHECK (status IN ('ready', 'processing', 'needs-review'))
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  source_pack_id TEXT NOT NULL REFERENCES source_packs(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  original_path TEXT NOT NULL,
  checksum TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_pack_id, checksum)
);

CREATE TABLE IF NOT EXISTS document_pages (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  raw_text TEXT NOT NULL DEFAULT '',
  markdown_text TEXT NOT NULL DEFAULT '',
  extracted_tables_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (document_id, page_number)
);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_start INTEGER NOT NULL,
  page_end INTEGER NOT NULL,
  section_title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  domain TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  difficulty INTEGER NOT NULL DEFAULT 1,
  effective_date DATE,
  source_type TEXT NOT NULL CHECK (source_type IN ('course', 'official-reference', 'personal-note', 'exercise')),
  UNIQUE (document_id, content_hash)
);

CREATE TABLE IF NOT EXISTS embeddings (
  id TEXT PRIMARY KEY,
  chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL,
  embedding_model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS embeddings_vector_idx
  ON embeddings USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS concepts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS chunk_concepts (
  chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  PRIMARY KEY (chunk_id, concept_id)
);

CREATE TABLE IF NOT EXISTS competencies (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  name TEXT NOT NULL,
  level_min INTEGER NOT NULL,
  level_max INTEGER NOT NULL,
  status TEXT NOT NULL,
  strength INTEGER NOT NULL CHECK (strength BETWEEN 0 AND 100)
);

CREATE TABLE IF NOT EXISTS learning_paths (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  duration_days INTEGER NOT NULL,
  current_day INTEGER NOT NULL DEFAULT 1,
  goal TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  concept TEXT NOT NULL,
  rule TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  example TEXT NOT NULL,
  frequent_error TEXT NOT NULL,
  linked_exercise_id TEXT
);

CREATE TABLE IF NOT EXISTS lesson_sources (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  pack TEXT NOT NULL,
  document TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('course', 'official-reference', 'personal-note', 'exercise')),
  page_start INTEGER,
  page_end INTEGER,
  effective_date DATE
);

CREATE TABLE IF NOT EXISTS learning_days (
  id TEXT PRIMARY KEY,
  learning_path_id TEXT NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  domain TEXT NOT NULL,
  competency_ids TEXT[] NOT NULL DEFAULT '{}',
  lesson_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('done', 'today', 'next', 'locked')),
  UNIQUE (learning_path_id, day_number)
);

CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  topic TEXT NOT NULL,
  level INTEGER NOT NULL,
  estimated_minutes INTEGER NOT NULL DEFAULT 20,
  statement TEXT NOT NULL,
  expected_answer TEXT NOT NULL,
  rubric_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  competency_ids TEXT[] NOT NULL DEFAULT '{}',
  source_chunk_ids TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  user_answer TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 20),
  correction_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS corrections (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 20),
  summary TEXT NOT NULL,
  correct_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  errors_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  remediation TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS simulations (
  id TEXT PRIMARY KEY,
  scenario_type TEXT NOT NULL,
  domain TEXT NOT NULL,
  level INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS revision_items (
  id TEXT PRIMARY KEY,
  competency_id TEXT NOT NULL REFERENCES competencies(id) ON DELETE CASCADE,
  due_at TIMESTAMPTZ NOT NULL,
  strength INTEGER NOT NULL CHECK (strength BETWEEN 0 AND 100),
  last_reviewed_at TIMESTAMPTZ
);

ALTER TABLE IF EXISTS exercises ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER NOT NULL DEFAULT 20;
ALTER TABLE IF EXISTS exercises ADD COLUMN IF NOT EXISTS competency_ids TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE IF EXISTS exercises ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'short-answer';

CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  domain TEXT NOT NULL,
  tier TEXT NOT NULL,
  description TEXT NOT NULL,
  objective TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS flashcards (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  concept_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  type TEXT NOT NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  explanation TEXT NOT NULL,
  competency_ids TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('new', 'learning', 'due', 'mastered')),
  due_at TIMESTAMPTZ NOT NULL,
  interval_days INTEGER NOT NULL DEFAULT 0,
  source_references_json JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS revision_reviews (
  id TEXT PRIMARY KEY,
  flashcard_id TEXT NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  rating TEXT NOT NULL CHECK (rating IN ('forgotten', 'partial', 'correct', 'mastered')),
  reviewed_at TIMESTAMPTZ NOT NULL,
  next_due_at TIMESTAMPTZ NOT NULL,
  interval_days INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS error_journal (
  id TEXT PRIMARY KEY,
  exercise_id TEXT NOT NULL,
  correction_id TEXT NOT NULL,
  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  competency_ids TEXT[] NOT NULL DEFAULT '{}',
  next_action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  exercise_ids TEXT[] NOT NULL DEFAULT '{}',
  duration_minutes INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'in-progress', 'submitted')),
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  score INTEGER
);

CREATE TABLE IF NOT EXISTS business_cases (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  domain TEXT NOT NULL,
  level INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('locked', 'available', 'completed')),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS business_case_attempts (
  id TEXT PRIMARY KEY,
  business_case_id TEXT NOT NULL REFERENCES business_cases(id) ON DELETE CASCADE,
  user_memo TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 20),
  correction TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
