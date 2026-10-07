import { useEffect, useMemo, useState } from "react";
import { ApiError, getRoles } from "@/landing/publicApi";
import type { PublicRoles, RoleResult } from "@/landing/publicApi";

const SEGMENTS: readonly { readonly role: string; readonly label: string }[] = [
  { role: "mission_director", label: "Mission Director" },
  { role: "station_operator_bom", label: "Mumbai Operator" },
  { role: "station_operator_hel", label: "Espoo Operator" },
  { role: "student_analyst", label: "Student Analyst" },
];

function findResult(results: RoleResult[], id: "passes" | "telecommands"): RoleResult | undefined {
  return results.find((r) => r.id === id);
}

function stationOf(row: Record<string, string | number>): string {
  const v = row["station"] ?? row["station_id"] ?? row["id"] ?? Object.values(row)[0];
  return String(v ?? "");
}

function passesOf(row: Record<string, string | number>): string {
  const v = row["passes"] ?? row["count"] ?? Object.values(row)[1] ?? "";
  return String(v);
}

function telecommandCount(rows: Array<Record<string, string | number>> | null): number {
  if (!rows || rows.length === 0) return 0;
  if (rows.length === 1) {
    const first = rows[0];
    for (const key of Object.keys(first)) {
      if (key.toLowerCase() === "count") {
        const n = Number(first[key]);
        if (Number.isFinite(n)) return n;
      }
    }
  }
  return rows.length;
}

/**
 * RoleLens: the same two queries run as four database logins.
 * Data comes from getRoles() once; the comparison uses the real
 * director row count.
 */
export function RoleLens() {
  const [data, setData] = useState<PublicRoles | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [role, setRole] = useState<string>("station_operator_bom");
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent): void => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    let live = true;
    getRoles()
      .then((res) => {
        if (live) setData(res.data);
      })
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError) setError(e);
        else setError(new ApiError({ status: 0, message: "Could not reach the database." }));
      });
    return () => {
      live = false;
    };
  }, []);

  const passesSql = useMemo(
    () => data?.queries.find((q) => q.id === "passes")?.sql ?? "",
    [data],
  );
  const teleSql = useMemo(
    () => data?.queries.find((q) => q.id === "telecommands")?.sql ?? "",
    [data],
  );
  const current = useMemo(() => data?.roles.find((r) => r.role === role), [data, role]);
  const director = useMemo(
    () => data?.roles.find((r) => r.role === "mission_director"),
    [data],
  );

  const passesResult = current ? findResult(current.results, "passes") : undefined;
  const teleResult = current ? findResult(current.results, "telecommands") : undefined;
  const directorPasses = director ? findResult(director.results, "passes") : undefined;

  const passesRows = passesResult?.rows ?? [];
  const directorCount = directorPasses?.rows?.length ?? 0;
  const diff = directorCount - passesRows.length;
  const seesAll = diff <= 0;

  return (
    <section id="roles" className="sx-section scroll-mt-[72px]">
      <div className="mx-auto max-w-[1200px] px-4 md:px-8">
        <h2 className="sx-h2">Same Query, Four Logins</h2>
        <p className="sx-lead mt-3">
          PostgreSQL decides what each login may see. These are real results of the same two
          queries, run as four different database roles.
        </p>

        {error ? (
          <p className="sx-body mt-6">
            Could not reach the database.
            {error.sqlstate ? (
              <span className="font-mono" style={{ color: "var(--sx-red)" }}>
                {" "}
                {error.sqlstate}
              </span>
            ) : null}
          </p>
        ) : !data ? (
          <p className="sx-caption mt-6">Loading the roles.</p>
        ) : (
          <>
            <div
              role="tablist"
              aria-label="Database role"
              className="mt-6 grid grid-cols-2 gap-1 p-1 md:grid-cols-4"
              style={{ background: "var(--sx-surface)", borderRadius: 14 }}
            >
              {SEGMENTS.map((s) => {
                const active = s.role === role;
                return (
                  <button
                    key={s.role}
                    role="tab"
                    aria-selected={active}
                    type="button"
                    onClick={() => setRole(s.role)}
                    className="transition-colors"
                    style={{
                      minHeight: 44,
                      borderRadius: 10,
                      background: active ? "var(--sx-surface-2)" : "transparent",
                      color: active ? "#fff" : "var(--sx-text-2)",
                      fontSize: 14,
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>

            <div
              key={role}
              className="mt-6 grid gap-6 md:grid-cols-2"
              style={
                reduced
                  ? undefined
                  : { animation: "rolelens-fade 200ms var(--sx-ease-out)" }
              }
            >
              <style>{`@keyframes rolelens-fade { from { opacity: 0; } to { opacity: 1; } }`}</style>
              <div style={{ minHeight: 280 }}>
                <pre className="sx-code overflow-x-auto whitespace-pre-wrap">{passesSql}</pre>
                <div className="sx-group mt-4" style={{ minHeight: 200 }}>
                  <div className="sx-row">
                    <span className="sx-eyebrow">Station</span>
                    <span className="sx-eyebrow">Passes</span>
                  </div>
                  {passesResult?.ok === false ? (
                    <div className="sx-row">
                      <span
                        className="font-mono"
                        style={{ fontSize: 13, color: "var(--sx-red)" }}
                      >
                        ERROR {passesResult.error?.sqlstate ?? ""}:{" "}
                        {passesResult.error?.message ?? "query failed"}
                      </span>
                    </div>
                  ) : (
                    passesRows.map((row, i) => (
                      <div key={`${stationOf(row)}-${i}`} className="sx-row">
                        <span className="font-mono" style={{ fontSize: 13, color: "#fff" }}>
                          {stationOf(row)}
                        </span>
                        <span className="sx-num" style={{ color: "#fff" }}>
                          {passesOf(row)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <p className="sx-caption mt-3">
                  {seesAll
                    ? "This login sees every station's passes."
                    : `Row-level security on contact hides the other ${diff} stations' passes from this login.`}
                </p>
              </div>

              <div style={{ minHeight: 280 }}>
                <pre className="sx-code overflow-x-auto whitespace-pre-wrap">{teleSql}</pre>
                <div className="mt-4" style={{ minHeight: 200 }}>
                  {teleResult && !teleResult.ok ? (
                    <>
                      <p className="font-mono" style={{ fontSize: 13, color: "var(--sx-red)" }}>
                        ERROR {teleResult.error?.sqlstate ?? ""}:{" "}
                        {teleResult.error?.message ?? "query failed"}
                      </p>
                      <p className="sx-caption mt-3">
                        This login has no SELECT grant on telecommand.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="sx-num" style={{ fontSize: 28, color: "#fff" }}>
                        {telecommandCount(teleResult?.rows ?? null)}
                      </p>
                      <p className="sx-caption mt-3">telecommand rows visible to this login</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
