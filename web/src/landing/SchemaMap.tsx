import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ApiError, getSchema } from "@/landing/publicApi";
import type { PublicSchema, SchemaTable, SqlRecord } from "@/landing/publicApi";

interface Area {
  readonly label: string;
  readonly tables: readonly string[];
}

const AREAS: readonly Area[] = [
  {
    label: "Network",
    tables: [
      "network_node",
      "satellite",
      "satellite_tle",
      "deployer_pod",
      "ground_station",
      "station_key",
      "contact",
    ],
  },
  {
    label: "Data",
    tables: ["payload_mode", "telemetry", "packet", "ttc_frame", "sstv_image", "voice_frame"],
  },
  {
    label: "Routing",
    tables: ["route", "route_hop", "routing_decision"],
  },
  {
    label: "AI",
    tables: ["ai_model", "ai_model_metric", "dt_node"],
  },
  {
    label: "Operations",
    tables: [
      "telecommand",
      "alert",
      "audit_log",
      "deployment_event",
      "deployment_log",
      "sat_state_transition",
      "lab_account",
    ],
  },
];

interface EdgeLine {
  readonly from: string;
  readonly to: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly loop?: boolean;
}

function isBaseTable(t: SchemaTable): boolean {
  return t.kind === "table" || t.kind === "partitioned table";
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent): void => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * SchemaMap: the real schema, clickable. Counts come from getSchema();
 * edges come from foreign keys. Default selection is packet.
 */
export function SchemaMap() {
  const [schema, setSchema] = useState<PublicSchema | null>(null);
  const [sql, setSql] = useState<SqlRecord[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [selected, setSelected] = useState<string>("packet");
  const [lines, setLines] = useState<EdgeLine[]>([]);
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 });
  const mapRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    let live = true;
    getSchema()
      .then((res) => {
        if (!live) return;
        setSchema(res.data);
        setSql(res.sql);
        const names = new Set(res.data.tables.map((t) => t.name));
        setSelected(names.has("packet") ? "packet" : (res.data.tables[0]?.name ?? "packet"));
      })
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError) setError(e);
        else setError(new ApiError({ status: 0, message: "Could not load the schema." }));
      });
    return () => {
      live = false;
    };
  }, []);

  const baseTables = useMemo(() => (schema ? schema.tables.filter(isBaseTable) : []), [schema]);
  const views = useMemo(
    () =>
      schema
        ? schema.tables.filter((t) => t.kind === "view" || t.kind === "materialized view")
        : [],
    [schema],
  );
  const byName = useMemo(() => new Map(baseTables.map((t) => [t.name, t])), [baseTables]);

  const areasWithTables = useMemo(() => {
    const listed = new Set<string>();
    for (const a of AREAS) for (const n of a.tables) listed.add(n);
    return AREAS.map((a) => {
      if (a.label === "Operations") {
        const extra = baseTables
          .filter((t) => !listed.has(t.name))
          .map((t) => t.name)
          .sort();
        const names = [...a.tables.filter((n) => byName.has(n)), ...extra];
        return { label: a.label, names };
      }
      return { label: a.label, names: a.tables.filter((n) => byName.has(n)) };
    });
  }, [baseTables, byName]);

  const neighbours = useMemo(() => {
    const set = new Set<string>([selected]);
    if (!schema) return set;
    for (const e of schema.edges) {
      if (e.from_table === e.to_table) continue;
      if (e.from_table === selected) set.add(e.to_table);
      if (e.to_table === selected) set.add(e.from_table);
    }
    return set;
  }, [schema, selected]);

  const selectedTable: SchemaTable | undefined = byName.get(selected);
  const columns = useMemo(
    () => (schema ? schema.columns.filter((c) => c.table_name === selected) : []),
    [schema, selected],
  );
  const references = useMemo(
    () =>
      schema
        ? schema.edges.filter((e) => e.from_table === selected && e.to_table !== selected)
        : [],
    [schema, selected],
  );
  const referencedBy = useMemo(
    () =>
      schema
        ? schema.edges.filter((e) => e.to_table === selected && e.from_table !== selected)
        : [],
    [schema, selected],
  );

  const countsLine = useMemo(() => {
    if (!schema) return "";
    const tableCount = schema.tables.filter((t) => isBaseTable(t)).length;
    const viewCount = schema.tables.filter(
      (t) => t.kind === "view" || t.kind === "materialized view",
    ).length;
    return (
      `${tableCount} tables, ${viewCount} views, ${schema.counts.functions} functions, ` +
      `${schema.counts.triggers} triggers, ${schema.counts.policies} row-level security policies ` +
      `and ${schema.counts.partitions} partitions.`
    );
  }, [schema]);

  useLayoutEffect(() => {
    const measure = (): void => {
      const map = mapRef.current;
      if (!map) return;
      const mapRect = map.getBoundingClientRect();
      setMapSize({ w: mapRect.width, h: mapRect.height });
      if (!schema) {
        setLines([]);
        return;
      }
      const out: EdgeLine[] = [];
      for (const e of schema.edges) {
        if (e.from_table === e.to_table) continue;
        const fromEl = buttonRefs.current.get(e.from_table);
        const toEl = buttonRefs.current.get(e.to_table);
        if (!fromEl || !toEl) continue;
        const fr = fromEl.getBoundingClientRect();
        const tr = toEl.getBoundingClientRect();
        const fromCx = fr.left + fr.width / 2 - mapRect.left;
        const toCx = tr.left + tr.width / 2 - mapRect.left;
        const fromY = fr.top + fr.height / 2 - mapRect.top;
        const toY = tr.top + tr.height / 2 - mapRect.top;
        if (Math.abs(fromCx - toCx) < 8) {
          // Same column: loop out past the right edge instead of crossing the buttons.
          out.push({
            from: e.from_table,
            to: e.to_table,
            x1: fr.right - mapRect.left,
            y1: fromY,
            x2: tr.right - mapRect.left,
            y2: toY,
            loop: true,
          });
        } else if (fromCx <= toCx) {
          out.push({
            from: e.from_table,
            to: e.to_table,
            x1: fr.right - mapRect.left,
            y1: fromY,
            x2: tr.left - mapRect.left,
            y2: toY,
          });
        } else {
          out.push({
            from: e.from_table,
            to: e.to_table,
            x1: fr.left - mapRect.left,
            y1: fromY,
            x2: tr.right - mapRect.left,
            y2: toY,
          });
        }
      }
      setLines(out);
    };

    measure();
    const map = mapRef.current;
    if (!map || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(map);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [schema, selectedTable]);

  const setButtonRef = (name: string) => (el: HTMLButtonElement | null) => {
    if (el) buttonRefs.current.set(name, el);
    else buttonRefs.current.delete(name);
  };

  return (
    <section id="database" className="sx-section scroll-mt-[72px]">
      <div className="mx-auto max-w-[1200px] px-4 md:px-8">
        <h2 className="sx-h2">Inside The Database</h2>
        <p className="sx-lead mt-3">
          Every screen in SomaiyaNet reads these tables. Pick one to see its columns and what it
          links to.
        </p>

        {error ? (
          <p className="sx-body mt-6">
            Could not load the schema.
            {error.sqlstate ? (
              <span className="font-mono" style={{ color: "var(--sx-red)" }}>
                {" "}
                {error.sqlstate}
              </span>
            ) : null}
          </p>
        ) : !schema ? (
          <p className="sx-caption mt-6">Loading the schema.</p>
        ) : (
          <>
            <p className="sx-caption mt-4">{countsLine}</p>
            <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
              <div ref={mapRef} className="relative">
                <svg
                  aria-hidden="true"
                  className="absolute inset-0 hidden md:block"
                  width={mapSize.w}
                  height={mapSize.h}
                  style={{ pointerEvents: "none" }}
                >
                  {lines
                    .filter((l) => l.from === selected || l.to === selected)
                    .map((l) => {
                      const mx = (l.x1 + l.x2) / 2;
                      const d = l.loop
                        ? `M ${l.x1} ${l.y1} C ${l.x1 + 22} ${l.y1}, ${l.x2 + 22} ${l.y2}, ${l.x2} ${l.y2}`
                        : `M ${l.x1} ${l.y1} C ${mx} ${l.y1}, ${mx} ${l.y2}, ${l.x2} ${l.y2}`;
                      return (
                        <path
                          key={`${l.from}->${l.to}`}
                          d={d}
                          fill="none"
                          stroke="rgba(255, 255, 255, 0.7)"
                          strokeWidth={1}
                        />
                      );
                    })}
                </svg>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
                  {areasWithTables.map((area) => (
                    <div key={area.label}>
                      <p className="sx-eyebrow">{area.label}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-col">
                        {area.names.map((name) => {
                          const t = byName.get(name);
                          if (!t) return null;
                          const isSel = name === selected;
                          const dimmed = !neighbours.has(name);
                          return (
                            <button
                              key={name}
                              ref={setButtonRef(name)}
                              type="button"
                              aria-pressed={isSel}
                              onClick={() => setSelected(name)}
                              className="w-full text-left"
                              style={{
                                minHeight: 44,
                                borderRadius: 10,
                                background: isSel
                                  ? "var(--sx-surface-2)"
                                  : "var(--sx-surface)",
                                boxShadow: isSel
                                  ? "inset 0 0 0 1px rgba(255, 255, 255, 0.9)"
                                  : "none",
                                opacity: dimmed ? 0.35 : 1,
                                padding: "8px 12px",
                                transition: reducedMotion
                                  ? "none"
                                  : "opacity 250ms var(--sx-ease-out), background-color 250ms var(--sx-ease-out)",
                              }}
                            >
                              <span
                                className="font-mono block break-all"
                                style={{ fontSize: 13, color: "#fff" }}
                              >
                                {name}
                              </span>
                              <span className="sx-caption block">
                                ≈ {t.approx_rows.toLocaleString()} {t.approx_rows === 1 ? "row" : "rows"}
                                {t.kind === "partitioned table" ? ", partitioned" : ""}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {views.length > 0 ? (
                  <p className="sx-caption mt-6" style={{ lineHeight: 2 }}>
                    Views:{" "}
                    {views.map((v, i) => (
                      <span key={v.name}>
                        <span className="font-mono">{v.name}</span>
                        {i < views.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </p>
                ) : null}
                {sql.length > 0 ? (
                  <details className="mt-4">
                    <summary className="sx-btn sx-btn--quiet sx-btn--sm cursor-pointer list-none px-0">
                      Show the SQL behind this map
                    </summary>
                    <pre
                      className="sx-code mt-2 overflow-x-auto whitespace-pre-wrap"
                      style={{ fontSize: 12 }}
                    >
                      {sql.map((s) => s.sql).join("\n\n")}
                    </pre>
                  </details>
                ) : null}
              </div>

              <div className="sx-group h-fit">
                {selectedTable ? (
                  <>
                    <div className="sx-row" style={{ alignItems: "baseline" }}>
                      <span className="font-mono" style={{ fontSize: 17, color: "#fff" }}>
                        {selectedTable.name}
                      </span>
                      <span className="sx-caption">{selectedTable.kind}</span>
                    </div>
                    <div className="sx-row" style={{ alignItems: "baseline" }}>
                      <span className="sx-caption">References</span>
                      <span className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                        {references.length === 0 ? (
                          <span className="sx-caption">none</span>
                        ) : (
                          references.map((r) => (
                            <button
                              key={r.to_table}
                              type="button"
                              onClick={() => setSelected(r.to_table)}
                              className="font-mono transition-colors hover:text-white"
                              style={{ fontSize: 13, color: "var(--sx-text-2)" }}
                            >
                              {r.to_table}
                            </button>
                          ))
                        )}
                      </span>
                    </div>
                    <div className="sx-row" style={{ alignItems: "baseline" }}>
                      <span className="sx-caption">Referenced by</span>
                      <span className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                        {referencedBy.length === 0 ? (
                          <span className="sx-caption">none</span>
                        ) : (
                          referencedBy.map((r) => (
                            <button
                              key={r.from_table}
                              type="button"
                              onClick={() => setSelected(r.from_table)}
                              className="font-mono transition-colors hover:text-white"
                              style={{ fontSize: 13, color: "var(--sx-text-2)" }}
                            >
                              {r.from_table}
                            </button>
                          ))
                        )}
                      </span>
                    </div>
                    <div style={{ maxHeight: 440, overflowY: "auto" }}>
                      {columns.map((c) => (
                        <div key={c.name} className="sx-row">
                          <span className="font-mono" style={{ fontSize: 13, color: "#fff" }}>
                            {c.name}
                          </span>
                          <span className="sx-caption">
                            {c.type}
                            {c.nullable ? (
                              <span style={{ color: "var(--sx-text-3)" }}> null</span>
                            ) : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
