/** Shared API shapes for the DBMS labs (briefs 10a contract + 10b pages).
 * Backend is built in parallel, so every fetcher degrades to a calm
 * offline state when the route 404s or the backend is down. */

export interface TxStep {
  session: "A" | "B";
  sql: string;
  expect: string;
  explain: string;
}

export interface TxScenario {
  key: string;
  title: string;
  description: string;
  steps: TxStep[];
}

export interface TxExecResult {
  status: "done" | "waiting";
  rows?: Array<Record<string, unknown>>;
  rowcount?: number;
  notice?: string | null;
  sqlstate?: string | null;
  message?: string | null;
}

export interface TxSessionState {
  status: string;
  activity?: Record<string, unknown> | null;
  blocking_pids?: number[];
  result?: TxExecResult | null;
  notice?: string | null;
}

export interface TxLabState {
  session_a?: TxSessionState | null;
  session_b?: TxSessionState | null;
  locks?: Array<Record<string, unknown>>;
  lab_table?: Array<Record<string, unknown>>;
}

export interface SecurityCell {
  role: string;
  object: string;
  privs: string[];
  detail?: string;
}

export interface SecurityMatrix {
  roles: string[];
  objects: string[];
  cells: SecurityCell[];
  memberships?: Array<{ role: string; member: string }>;
  policies?: Array<Record<string, unknown>>;
}

export interface IndexCatalogEntry {
  key: string;
  kind: string;
  ddl: string;
  purpose: string;
  size?: string | null;
}

export interface IndexQuery {
  key: string;
  title: string;
  sql: string;
  best_index: string;
}

export interface IndexRunResult {
  plan_before: unknown;
  plan_after: unknown;
  ms_before?: number | null;
  ms_after?: number | null;
  node_before?: string | null;
  node_after?: string | null;
  buffers_before?: number | null;
  buffers_after?: number | null;
  index_size?: string | null;
}

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
