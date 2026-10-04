/** Typed fetch for the SomaiyaNet API contract (brief 05 + 09a).
 *
 * Every success response is `{data, sql:[{label,sql,exp,co,elapsed_ms,rowcount}], role}`.
 * Errors look like `{error:{sqlstate,message,detail,hint}, sql, role}` with
 * 401 (no profile), 403 (42501 "PostgreSQL refused"), 409, 422 or 400.
 *
 * `apiFetch` returns `{data, sql, role}` on success and pushes the SQL
 * records into the SqlLog (see SqlDrawer.tsx) automatically, so pages do
 * nothing extra. On failure it throws an `ApiError` carrying the SQL that
 * was attempted — the drawer renders 42501/P0001/28000 as a Somaiya-red
 * "PostgreSQL refused" card instead of a crash.
 */

export interface SqlRecord {
  label: string;
  sql: string;
  exp?: string | null;
  co?: string | null;
  elapsed_ms?: number | null;
  rowcount?: number | null;
}

export interface ApiOk<T> {
  data: T;
  sql: SqlRecord[];
  role: string;
}

type SqlPusher = (recs: SqlRecord[]) => void;
type ErrPusher = (err: ApiError) => void;

let sqlPusher: SqlPusher | null = null;
let errPusher: ErrPusher | null = null;

/** Registered by SqlProvider so apiFetch can push without a React import. */
export function setSqlPusher(fn: SqlPusher | null): void {
  sqlPusher = fn;
}

/** Registered by SqlProvider so apiFetch can surface errors in the drawer. */
export function setSqlErrorPusher(fn: ErrPusher | null): void {
  errPusher = fn;
}

export class ApiError extends Error {
  status: number;
  sqlstate?: string;
  detail?: string;
  hint?: string;
  sql: SqlRecord[];
  role?: string;

  constructor(opts: {
    status: number;
    message: string;
    sqlstate?: string;
    detail?: string;
    hint?: string;
    sql?: SqlRecord[];
    role?: string;
  }) {
    super(opts.message);
    this.name = "ApiError";
    this.status = opts.status;
    this.sqlstate = opts.sqlstate;
    this.detail = opts.detail;
    this.hint = opts.hint;
    this.sql = opts.sql ?? [];
    this.role = opts.role;
  }

  /** True for the deliberate denial demo (RLS / GRANT refusal). */
  get isRefused(): boolean {
    return (
      this.status === 403 ||
      this.sqlstate === "42501" ||
      this.sqlstate === "P0001" ||
      this.sqlstate === "28000"
    );
  }
}

function toRecords(raw: unknown): SqlRecord[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>).map((r) => ({
    label: String(r["label"] ?? "sql"),
    sql: String(r["sql"] ?? ""),
    exp: (r["exp"] as string | null) ?? null,
    co: (r["co"] as string | null) ?? null,
    elapsed_ms: (r["elapsed_ms"] as number | null) ?? null,
    rowcount: (r["rowcount"] as number | null) ?? null,
  }));
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<ApiOk<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: "same-origin",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    const err = new ApiError({
      status: 0,
      message: "Backend offline: run `python run.py`",
      sql: [],
    });
    errPusher?.(err);
    throw err;
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const sql = toRecords(body["sql"]);
  if (sql.length > 0) sqlPusher?.(sql);

  if (res.ok) {
    return {
      data: body["data"] as T,
      sql,
      role: String(body["role"] ?? ""),
    };
  }

  const e = (body["error"] ?? {}) as Record<string, unknown>;
  const err = new ApiError({
    status: res.status,
    message: String(e["message"] ?? `HTTP ${res.status} for ${path}`),
    sqlstate: e["sqlstate"] !== undefined ? String(e["sqlstate"]) : undefined,
    detail: e["detail"] !== undefined ? String(e["detail"]) : undefined,
    hint: e["hint"] !== undefined ? String(e["hint"]) : undefined,
    sql,
    role: body["role"] !== undefined ? String(body["role"]) : undefined,
  });
  errPusher?.(err);
  throw err;
}
