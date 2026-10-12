/** Shared API shapes for the DBMS labs (briefs 10a contract + 10b pages).
 * Backend is built in parallel, so every fetcher degrades to a calm
 * offline state when the route 404s or the backend is down. */

export interface NormStage {
  stage: string;
  tables: Array<{ name: string; columns: string[]; rows: Array<Record<string, unknown>> }>;
  fds: Array<{ fd: string; violates: string; fix: string }>;
}

export interface NormAnomaly {
  stage: string;
  before: string;
  after: string;
  explanation: string;
}

export interface LosslessRow {
  stage: string;
  rows_original: number;
  rows_rejoined: number;
  missing: number;
  spurious: number;
}

export interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
  def?: string | null;
  generated?: boolean;
  pk?: boolean;
  fk?: boolean;
}

export interface SchemaTable {
  name: string;
  comment?: string | null;
  tag?: string | null;
  columns: SchemaColumn[];
  pks?: string[];
}

export interface SchemaFk {
  from_table: string;
  from_cols: string[];
  to_table: string;
  to_cols: string[];
  label?: string | null;
}

export interface SchemaData {
  tables: SchemaTable[];
  fks: SchemaFk[];
  constraints?: Array<Record<string, unknown>>;
  partitions?: Array<Record<string, unknown>>;
  views?: Array<Record<string, unknown>>;
  mapping_notes?: string[];
  partition_count?: number;
}

export interface ConsolePreset {
  group: string;
  name: string;
  sql: string;
}

export interface ConsoleResult {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  rowcount: number;
  plan?: unknown;
}
