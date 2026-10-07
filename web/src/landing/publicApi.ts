/**
 * Landing page data: public, read-only endpoints (backend/routers/public.py).
 * No session needed. Every response carries the SQL that produced it.
 */
import { apiFetch, type ApiOk } from "@/app/api";

export type { SqlRecord } from "@/app/api";
export { ApiError } from "@/app/api";
export { formatLatency } from "@/features/routing/api";

export interface PublicSatellite {
  id: string; // "SS-1"
  name: string; // "SomaiyaSat-1"
  state: string; // NOMINAL | SAFE | STOWED | ...
  battery_v: number | null;
  tle_line1: string;
  tle_line2: string;
}

export interface PublicStation {
  id: string; // "GS-BOM"
  name: string; // "KJSIT Mumbai"
  city: string;
  country: string;
  lat: number;
  lng: number;
  primary: boolean;
}

export interface PublicNetwork {
  satellites: PublicSatellite[];
  stations: PublicStation[];
  /** Span of the computed contact plan; routes exist only inside it. */
  plan: { starts: string | null; ends: string | null; contacts: number };
}

export interface PublicRoute {
  rank: number;
  destination: string; // station id
  arrival_ts: string;
  hops: number;
  bottleneck_score: number | null;
  latency_s: number;
  path_nodes: string[];
  path_contacts: number[];
  explanation: string;
}

export interface PublicContact {
  contact_id: number;
  kind: "ISL" | "DOWNLINK";
  from_node: string;
  to_node: string;
  start_ts: string;
  end_ts: string;
  link_score: number | null;
}

export interface PublicRoutes {
  origin: string;
  /** Earliest route to every reachable station, rank 1 first. */
  routes: PublicRoute[];
  /** Every contact used by those routes (look up by path_contacts). */
  contacts: PublicContact[];
}

export interface RoleQuery {
  id: "passes" | "telecommands";
  sql: string;
}

export interface RoleResult {
  id: RoleQuery["id"];
  ok: boolean;
  rows: Array<Record<string, string | number>> | null;
  error: { sqlstate: string | null; message: string } | null;
}

export interface PublicRoles {
  queries: RoleQuery[];
  /** mission_director, station_operator_bom, station_operator_hel, student_analyst */
  roles: Array<{ role: string; results: RoleResult[] }>;
}

export interface SchemaTable {
  name: string;
  kind: "table" | "partitioned table" | "view" | "materialized view";
  approx_rows: number;
  comment: string | null;
}

export interface PublicSchema {
  tables: SchemaTable[];
  columns: Array<{ table_name: string; name: string; type: string; nullable: boolean }>;
  /** One edge per foreign key: from_table references to_table. */
  edges: Array<{ from_table: string; to_table: string }>;
  counts: { functions: number; triggers: number; policies: number; partitions: number };
}

export const getNetwork = (): Promise<ApiOk<PublicNetwork>> => apiFetch<PublicNetwork>("/api/public/network");

export const getRoutes = (origin: string): Promise<ApiOk<PublicRoutes>> =>
  apiFetch<PublicRoutes>(`/api/public/routes?origin=${encodeURIComponent(origin)}`);

export const getRoles = (): Promise<ApiOk<PublicRoles>> => apiFetch<PublicRoles>("/api/public/roles");

export const getSchema = (): Promise<ApiOk<PublicSchema>> => apiFetch<PublicSchema>("/api/public/schema");
