import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
} from "@xyflow/react";
import type { Edge, Node, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { apiFetch } from "@/app/api";
import { DataGrid, OfflineOrEmpty, Panel } from "./common";
import type { SchemaData, SchemaTable } from "./types";

type Tab = "diagram" | "mapping" | "constraints";

const GROUPS: Array<{ name: string; match: (t: string) => boolean; col: number; row0: number }> = [
  { name: "Network", match: (t) => ["network_node", "satellite", "ground_station", "contact", "route", "route_hop", "sat_state_transition"].includes(t), col: 0, row0: 0 },
  { name: "Payload", match: (t) => ["packet", "ttc_frame", "sstv_image", "voice_frame", "payload_mode", "telemetry"].includes(t), col: 1, row0: 0 },
  { name: "Deploy", match: (t) => ["deployer_pod", "deployment_event", "deployment_log"].includes(t), col: 2, row0: 0 },
  { name: "AI", match: (t) => ["ai_model", "dt_node", "ai_model_metric", "routing_decision"].includes(t), col: 3, row0: 0 },
  { name: "Security", match: (t) => ["station_key", "telecommand", "audit_log", "alert", "satellite_tle", "lab_account"].includes(t), col: 4, row0: 0 },
];

function groupOf(name: string): number {
  const g = GROUPS.findIndex((gr) => gr.match(name));
  return g === -1 ? 2 : GROUPS[g].col;
}

function tagBadge(tag: string | null | undefined): string {
  const t = (tag ?? "").toLowerCase();
  if (t.includes("super")) return "supertype";
  if (t.includes("sub")) return "subtype";
  if (t.includes("weak")) return "weak";
  if (t.includes("bridge") || t.includes("m:n") || t.includes("mn")) return "bridge";
  if (t.includes("lookup")) return "lookup";
  if (t.includes("partition")) return "partitioned";
  if (t.includes("audit")) return "audit";
  return tag ?? "";
}

function TableNode({ data }: NodeProps) {
  const d = data as unknown as {
    table: SchemaTable;
    selected: boolean;
    onPick: (name: string) => void;
  };
  const t = d.table;
  const weak = (t.tag ?? "").toLowerCase().includes("weak");
  const partitioned = (t.tag ?? "").toLowerCase().includes("partition");

  return (
    <div
      onClick={() => d.onPick(t.name)}
      className={`min-w-[210px] max-w-[250px] text-left p-3.5 cursor-pointer rounded-[10px] transition-colors ${
        d.selected
          ? "bg-[var(--sx-surface-2)] ring-1 ring-white/50"
          : weak
            ? "bg-[var(--sx-surface)] border-2 border-double border-white/30 hover:border-white/50"
            : "bg-[var(--sx-surface)] border border-white/[0.08] hover:border-white/25"
      }`}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="flex items-center justify-between gap-1.5 border-b border-white/[0.08] pb-2 mb-2">
        <span className="font-[family-name:var(--font-display)] text-[12px] font-bold text-white capitalize truncate">
          {partitioned ? "▤ " : ""}{t.name}
        </span>
        {t.tag && (
          <span className="font-[family-name:var(--font-display)] text-[10px] capitalize text-[var(--sx-text-3)] shrink-0">
            {tagBadge(t.tag)}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {t.columns.slice(0, 8).map((c) => (
          <div key={c.name} className="flex items-center justify-between gap-2 text-[11px] font-mono py-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              {c.pk ? (
                <span className="font-[family-name:var(--font-display)] text-[9px] font-bold capitalize text-white/45 shrink-0">
                  PK
                </span>
              ) : c.fk ? (
                <span className="font-[family-name:var(--font-display)] text-[9px] font-bold capitalize text-white/45 shrink-0">
                  FK
                </span>
              ) : (
                <span className="text-white/20 w-3 text-center select-none">·</span>
              )}
              <span className={`truncate text-white/70 ${c.generated ? "italic" : ""}`}>
                {c.name}
              </span>
            </div>
            <span className="text-white/40 text-[10px] shrink-0 font-mono">{c.type}</span>
          </div>
        ))}
        {t.columns.length > 8 && (
          <p className="text-[11px] text-[var(--sx-text-3)] pt-1 font-[family-name:var(--font-sans)]">
            +{t.columns.length - 8} more columns
          </p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { table: TableNode };

export function SchemaLab({ initialTab = "diagram" }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [data, setData] = useState<SchemaData | null>(null);
  const [bootError, setBootError] = useState<unknown>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{
        tables?: Array<{ table_name: string; kind?: string; comment?: string | null; tags?: string[] }>;
        columns?: Array<{ table_name: string; column_name: string; data_type: string; nullable?: boolean; default_expr?: string | null; generated?: string }>;
        pks?: Array<{ table_name: string; definition?: string }>;
        fks?: Array<{ table_name: string; constraint_name?: string; definition?: string; ref_table?: string }>;
        checks?: Array<Record<string, unknown>>;
        partitions?: Array<{ parent: string; child: string }>;
        views?: Array<Record<string, unknown>>;
        mapping_notes?: string[];
      }>("/api/labs/schema");
      setData(assembleSchema(r.data));
      setBootError(null);
    } catch (e) {
      setBootError(e);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const tables: SchemaTable[] = useMemo(
    () => (data?.tables?.length ? data.tables : fallbackTables()),
    [data],
  );

  const nodes: Node[] = useMemo(() => {
    const perCol = new Map<number, number>();
    return tables.map((t) => {
      const col = groupOf(t.name);
      const row = perCol.get(col) ?? 0;
      perCol.set(col, row + 1);
      return {
        id: t.name,
        type: "table",
        position: { x: col * 260, y: row * 300 },
        data: { table: t, selected: selected === t.name, onPick: setSelected },
      } as Node;
    });
  }, [tables, selected]);

  const edges: Edge[] = useMemo(() => {
    const fks = data?.fks ?? fallbackFks();
    return fks
      .filter((f) => tables.some((t) => t.name === f.from_table) && tables.some((t) => t.name === f.to_table))
      .map((f, i) => {
        const disjoint =
          ["satellite", "ground_station"].includes(f.from_table) ||
          ["ttc_frame", "sstv_image", "voice_frame"].includes(f.from_table);
        return {
          id: `e${i}`,
          source: f.to_table,
          target: f.from_table,
          label: disjoint ? `d · ${f.label ?? "1:1"}` : (f.label ?? ""),
          style: disjoint
            ? { stroke: "#ffffff", strokeWidth: 1.5 }
            : { stroke: "rgba(255, 255, 255, 0.3)", strokeWidth: 1 },
          labelStyle: { fill: "rgba(235, 235, 245, 0.62)", fontSize: 10, fontFamily: "var(--font-sans)" },
        } as Edge;
      });
  }, [data, tables]);

  if (bootError !== null && data === null) {
    return (
      <OfflineOrEmpty
        error={bootError}
        onRetry={() => void load()}
        hint="GET /api/labs/schema — lab backend (brief 10a) still being built in parallel; diagram below is the contracted shape."
      />
    );
  }

  const sel = tables.find((t) => t.name === selected);
  const constraints = (data?.constraints ?? []) as Array<Record<string, unknown>>;
  const mapping = data?.mapping_notes ?? fallbackMapping();

  return (
    <div className="flex flex-col gap-6">
      {/* Schema Navigation: Apple Segmented Control */}
      <div className="inline-flex p-1 bg-[#111113] rounded-[10px] border border-white/[0.08] self-start" role="tablist" aria-label="Schema views">
        {(["diagram", "mapping", "constraints"] as Tab[]).map((t) => {
          const isSel = tab === t;
          return (
            <button
              key={t}
              role="tab"
              aria-selected={isSel}
              onClick={() => setTab(t)}
              className={`font-[family-name:var(--font-display)] text-[12px] capitalize px-4 py-2 min-h-[36px] rounded-[8px] transition-colors cursor-pointer ${
 isSel
 ? "bg-[#1c1c1e] text-white font-semibold shadow-sm"
 : "text-[var(--sx-text-2)] hover:text-white"
 }`}
            >
              {t === "diagram" ? "ER/EER diagram" : t === "mapping" ? "Mapping rules" : "Constraints"}
            </button>
          );
        })}
      </div>

      {tab === "diagram" && (
        <div className="flex flex-col gap-4">
          <Panel className="w-full">
            <div className="p-4 sm:p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <h2 className="sx-eyebrow">
                  Relational EER model ({tables.length} tables)
                </h2>
                <span className="sx-caption">Click a table to inspect</span>
              </div>

              <div className="h-[620px] overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#000] relative">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  fitView
                  fitViewOptions={{ padding: 0.15 }}
                  proOptions={{ hideAttribution: true }}
                  colorMode="dark"
                >
                  <Background gap={24} color="rgba(255, 255, 255, 0.05)" />
                  <Controls showInteractive={false} />
                  <MiniMap pannable zoomable style={{ background: "#0a0a0a" }} />
                </ReactFlow>
              </div>

              <p className="sx-caption leading-relaxed">
                Supertype→subtype generalization lines are solid white. Relationship lines are 1px white 30%.
                Double hairline indicates weak entities; partitioned tables display ▤.
                {data?.partition_count ? ` ${data.partition_count} telemetry partitions live.` : ""}
              </p>
            </div>
          </Panel>

          {sel !== undefined && (
            <div className="sx-group">
              <div className="sx-row bg-[var(--sx-surface-2)]">
                <div className="flex items-center gap-3">
                  <span className="font-[family-name:var(--font-display)] text-[15px] font-bold text-white capitalize ">
                    {sel.name}
                  </span>
                  {sel.tag && (
                    <span className="sx-eyebrow text-[var(--sx-text-3)]">
                      {tagBadge(sel.tag)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="sx-caption">
                    {sel.columns.length} columns
                  </span>
                  <button
                    onClick={() => setSelected(null)}
                    className="sx-btn sx-btn--quiet sx-btn--sm"
                  >
                    Close
                  </button>
                </div>
              </div>
              {sel.comment && (
                <div className="px-4 py-2.5 border-b border-white/[0.08] text-[13px] text-[var(--sx-text-2)]">
                  {sel.comment}
                </div>
              )}
              <div className="divide-y divide-white/[0.08]">
                {sel.columns.map((c) => (
                  <div key={c.name} className="sx-row">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {c.pk ? (
                        <span className="font-[family-name:var(--font-display)] text-[10px] font-bold capitalize text-white/45 shrink-0">
                          PK
                        </span>
                      ) : c.fk ? (
                        <span className="font-[family-name:var(--font-display)] text-[10px] font-bold capitalize text-white/45 shrink-0">
                          FK
                        </span>
                      ) : (
                        <span className="text-white/20 w-4 text-center select-none">·</span>
                      )}
                      <span className={`font-mono text-[13px] text-white ${c.generated ? "italic" : ""}`}>
                        {c.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[12px] text-[var(--sx-text-2)]">
                        {c.type}
                      </span>
                      <span className="text-[12px] text-[var(--sx-text-3)] font-mono">
                        {c.nullable ? "NULL" : "NOT NULL"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "mapping" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="sx-eyebrow">
              EER → Relational mapping transformation · Disjointness, Totality, Bridges
            </h2>
          </div>
          <div className="sx-group">
            {mapping.map((m, i) => (
              <div key={i} className="sx-row items-start">
                <span className="font-[family-name:var(--font-display)] text-[13px] font-bold text-white/45 shrink-0 mt-0.5">
                  0{i + 1}
                </span>
                <p className="sx-body flex-1">
                  {m.replace(/^\d+\s*—\s*/, "")}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "constraints" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="sx-eyebrow">
              Relational integrity constraints · CHECK, EXCLUDE, UNIQUE, FOREIGN KEY
            </h2>
          </div>
          {constraints.length > 0 ? (
            <DataGrid rows={constraints} limit={100} />
          ) : (
            <div className="sx-group">
              {fallbackConstraints().map((c, i) => (
                <div key={i} className="p-4 flex flex-col gap-2 border-b border-white/[0.08] last:border-b-0">
                  <span className="sx-eyebrow">{c.label}</span>
                  <pre className="sx-code overflow-x-auto whitespace-pre-wrap">{c.sql}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function parseFk(def: string, fallbackTo: string): { from: string[]; toTable: string; to: string[] } {
  const m = /FOREIGN KEY \(([^)]+)\) REFERENCES (\S+)\(([^)]+)\)/.exec(def ?? "");
  if (!m) return { from: [], toTable: fallbackTo, to: [] };
  const cols = (s: string) => s.split(",").map((c) => c.trim().replace(/"/g, ""));
  return { from: cols(m[1]), toTable: m[2].replace(/"/g, ""), to: cols(m[3]) };
}

function parsePkCols(def: string): string[] {
  const m = /PRIMARY KEY \(([^)]+)\)/.exec(def ?? "");
  return m ? m[1].split(",").map((c) => c.trim().replace(/"/g, "")) : [];
}

/** Assemble catalog rows into the diagram's SchemaData shape. */
function assembleSchema(raw: {
  tables?: Array<{ table_name: string; kind?: string; comment?: string | null; tags?: string[] }>;
  columns?: Array<{ table_name: string; column_name: string; data_type: string; nullable?: boolean; default_expr?: string | null; generated?: string }>;
  pks?: Array<{ table_name: string; definition?: string }>;
  fks?: Array<{ table_name: string; constraint_name?: string; definition?: string; ref_table?: string }>;
  checks?: Array<Record<string, unknown>>;
  partitions?: Array<{ parent: string; child: string }>;
  views?: Array<Record<string, unknown>>;
  mapping_notes?: string[];
}): SchemaData {
  const pkByTable = new Map<string, Set<string>>();
  for (const p of raw.pks ?? []) {
    const set = pkByTable.get(p.table_name) ?? new Set<string>();
    for (const c of parsePkCols(p.definition ?? "")) set.add(c);
    pkByTable.set(p.table_name, set);
  }
  const fkColsByTable = new Map<string, Set<string>>();
  const fks: SchemaData["fks"] = [];
  for (const f of raw.fks ?? []) {
    const parsed = parseFk(f.definition ?? "", f.ref_table ?? "");
    const set = fkColsByTable.get(f.table_name) ?? new Set<string>();
    for (const c of parsed.from) set.add(c);
    fkColsByTable.set(f.table_name, set);
    fks.push({
      from_table: f.table_name,
      from_cols: parsed.from,
      to_table: parsed.toTable,
      to_cols: parsed.to,
    });
  }
  const colsByTable = new Map<string, SchemaTable["columns"]>();
  for (const c of raw.columns ?? []) {
    const list = colsByTable.get(c.table_name) ?? [];
    list.push({
      name: c.column_name,
      type: c.data_type,
      nullable: c.nullable ?? true,
      def: c.default_expr,
      generated: Boolean(c.generated),
      pk: pkByTable.get(c.table_name)?.has(c.column_name) ?? false,
      fk: fkColsByTable.get(c.table_name)?.has(c.column_name) ?? false,
    });
    colsByTable.set(c.table_name, list);
  }
  const tables: SchemaTable[] = (raw.tables ?? []).map((t) => ({
    name: t.table_name,
    comment: t.comment,
    tag: (t.tags ?? [])[0] ?? null,
    columns: colsByTable.get(t.table_name) ?? [],
    pks: [...(pkByTable.get(t.table_name) ?? [])],
  }));
  const partitions = raw.partitions ?? [];
  return {
    tables,
    fks,
    constraints: raw.checks ?? [],
    partitions: partitions as unknown as SchemaData["partitions"],
    views: viewsToRecords(raw.views),
    mapping_notes: raw.mapping_notes ?? [],
    partition_count: partitions.filter((p) => p.parent === "telemetry").length || partitions.length,
  };
}

function viewsToRecords(views?: Array<Record<string, unknown>>): SchemaData["views"] {
  return (views ?? []) as SchemaData["views"];
}

function fallbackTables(): SchemaTable[] {
  const col = (name: string, type: string, extra?: Partial<SchemaTable["columns"][number]>) => ({
    name,
    type,
    nullable: true,
    ...extra,
  });
  return [
    {
      name: "network_node",
      tag: "supertype",
      comment: "Total disjoint supertype of SAT/GROUND.",
      columns: [
        col("node_id", "VARCHAR(12)", { pk: true }),
        col("kind", "node_kind"),
        col("display_name", "VARCHAR(60)"),
        col("callsign", "callsign"),
      ],
    },
    {
      name: "satellite",
      tag: "subtype",
      comment: "SAT subtype; FK (node_id, kind) enforces disjointness.",
      columns: [
        col("node_id", "VARCHAR(12)", { pk: true, fk: true }),
        col("norad_id", "INT"),
        col("plane", "CHAR(1)"),
        col("state", "sat_state"),
        col("battery_v", "voltage"),
      ],
    },
    {
      name: "ground_station",
      tag: "subtype",
      columns: [
        col("node_id", "VARCHAR(12)", { pk: true, fk: true }),
        col("city", "VARCHAR(60)"),
        col("operator_role", "NAME"),
      ],
    },
    {
      name: "contact",
      tag: "bridge/M:N",
      columns: [
        col("contact_id", "BIGINT", { pk: true }),
        col("kind", "contact_kind"),
        col("from_node", "VARCHAR(12)", { fk: true }),
        col("to_node", "VARCHAR(12)", { fk: true }),
      ],
    },
    {
      name: "packet",
      tag: "supertype",
      columns: [
        col("packet_id", "BIGINT", { pk: true }),
        col("origin_sat", "VARCHAR(12)", { fk: true }),
        col("mode", "VARCHAR(8)"),
      ],
    },
    {
      name: "ttc_frame",
      tag: "subtype",
      columns: [col("packet_id", "BIGINT", { pk: true, fk: true }), col("battery_v", "voltage")],
    },
    {
      name: "sstv_image",
      tag: "subtype",
      columns: [col("packet_id", "BIGINT", { pk: true, fk: true }), col("sstv_mode", "VARCHAR(12)")],
    },
    {
      name: "voice_frame",
      tag: "subtype",
      columns: [col("packet_id", "BIGINT", { pk: true, fk: true }), col("duration_ms", "INT")],
    },
    {
      name: "telemetry",
      tag: "partitioned",
      comment: "RANGE partitioned by day.",
      columns: [col("ts", "TIMESTAMPTZ"), col("sat_id", "VARCHAR(12)", { fk: true }), col("battery_v", "voltage")],
    },
    {
      name: "deployer_pod",
      tag: "",
      columns: [col("pod_id", "VARCHAR(10)", { pk: true }), col("status", "pod_status")],
    },
    {
      name: "deployment_event",
      tag: "weak",
      columns: [col("pod_id", "VARCHAR(10)", { pk: true, fk: true }), col("seq", "SMALLINT", { pk: true })],
    },
    {
      name: "route",
      tag: "bridge/M:N",
      columns: [col("route_id", "BIGINT", { pk: true }), col("origin_sat", "VARCHAR(12)", { fk: true })],
    },
    {
      name: "route_hop",
      tag: "weak",
      columns: [
        col("route_id", "BIGINT", { pk: true, fk: true }),
        col("hop_no", "SMALLINT", { pk: true }),
        col("contact_id", "BIGINT", { fk: true }),
      ],
    },
    {
      name: "ai_model",
      tag: "",
      columns: [col("model_id", "INT", { pk: true }), col("name", "VARCHAR(40)")],
    },
    {
      name: "dt_node",
      tag: "weak",
      columns: [col("model_id", "INT", { pk: true, fk: true }), col("node_id", "INT", { pk: true })],
    },
    {
      name: "routing_decision",
      tag: "",
      columns: [
        col("decision_id", "BIGINT", { pk: true }),
        col("sat_id", "VARCHAR(12)", { fk: true }),
        col("final_action", "router_action"),
      ],
    },
    {
      name: "payload_mode",
      tag: "lookup",
      columns: [col("mode", "VARCHAR(8)", { pk: true }), col("priority", "SMALLINT")],
    },
    {
      name: "station_key",
      tag: "",
      columns: [col("station_id", "VARCHAR(12)", { pk: true, fk: true }), col("secret", "BYTEA")],
    },
    {
      name: "telecommand",
      tag: "",
      columns: [
        col("cmd_id", "BIGINT", { pk: true }),
        col("station_id", "VARCHAR(12)", { fk: true }),
        col("opcode", "VARCHAR(20)"),
      ],
    },
    {
      name: "audit_log",
      tag: "audit",
      columns: [col("audit_id", "BIGINT", { pk: true }), col("table_name", "TEXT")],
    },
  ];
}

function fallbackFks(): SchemaData["fks"] {
  return [
    { from_table: "satellite", from_cols: ["node_id", "kind"], to_table: "network_node", to_cols: ["node_id", "kind"], label: "1:1 total" },
    { from_table: "ground_station", from_cols: ["node_id", "kind"], to_table: "network_node", to_cols: ["node_id", "kind"], label: "1:1 total" },
    { from_table: "ttc_frame", from_cols: ["packet_id", "mode"], to_table: "packet", to_cols: ["packet_id", "mode"], label: "d" },
    { from_table: "sstv_image", from_cols: ["packet_id", "mode"], to_table: "packet", to_cols: ["packet_id", "mode"], label: "d" },
    { from_table: "voice_frame", from_cols: ["packet_id", "mode"], to_table: "packet", to_cols: ["packet_id", "mode"], label: "d" },
    { from_table: "deployment_event", from_cols: ["pod_id"], to_table: "deployer_pod", to_cols: ["pod_id"], label: "weak N:1" },
    { from_table: "contact", from_cols: ["from_node"], to_table: "network_node", to_cols: ["node_id"], label: "M:N" },
    { from_table: "route_hop", from_cols: ["route_id"], to_table: "route", to_cols: ["route_id"], label: "weak" },
    { from_table: "dt_node", from_cols: ["model_id"], to_table: "ai_model", to_cols: ["model_id"], label: "weak" },
  ];
}

function fallbackMapping(): string[] {
  return [
    "1 — EER supertype network_node becomes its own table; each subtype (satellite, ground_station) carries a composite FK (node_id, kind) with a fixed-kind CHECK for disjointness, plus a deferred totality trigger.",
    "2 — Packet hierarchy maps the same way: packet is the supertype, ttc_frame/sstv_image/voice_frame join on (packet_id, mode) with per-mode CHECKs.",
    "3 — Weak entities (deployment_event, route_hop, dt_node) take the owner key into their PK and CASCADE on delete.",
    "4 — M:N contact/route resolve through route_hop; contact pairs carry an EXCLUDE gist so no directed pair overlaps.",
    "5 — Telemetry is RANGE-partitioned by day with a DEFAULT partition; time-series indexes live in the bench lab, not DDL.",
    "6 — Lookups (payload_mode, sat_state_transition) are data-driven so the state machine and priorities are rows, not code.",
  ];
}

function fallbackConstraints(): Array<{ label: string; sql: string }> {
  return [
    { label: "satellite mass ≤ 750 g", sql: "ALTER TABLE satellite ADD CONSTRAINT satellite_mass_g_check CHECK (mass_g <= 750);" },
    { label: "no overlapping directed contacts", sql: "ALTER TABLE contact ADD CONSTRAINT no_overlap EXCLUDE USING gist (from_node WITH =, to_node WITH =, span WITH &&);" },
    { label: "one primary station", sql: "CREATE UNIQUE INDEX one_primary_station ON ground_station (is_primary) WHERE is_primary;" },
    { label: "one active AI model", sql: "CREATE UNIQUE INDEX one_active_model ON ai_model (is_active) WHERE is_active;" },
    { label: "replay protection", sql: "ALTER TABLE telecommand ADD CONSTRAINT telecommand_station_id_nonce_key UNIQUE (station_id, nonce);" },
    { label: "delivered ⇔ delivered_at", sql: "ALTER TABLE packet ADD CONSTRAINT packet_delivered_check CHECK ((status = 'DELIVERED') = (delivered_at IS NOT NULL));" },
  ];
}


