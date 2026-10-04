import { apiFetch } from "@/app/api";
import type {
  ConstellationSat,
  Contact,
  Station,
} from "@/features/ops/api";
import { mockConstellation, mockContacts, mockStations } from "@/features/ops/mock";

export interface CgrRoute {
  rank: number;
  destination: string;
  arrival_ts: string;
  hops: number;
  bottleneck_score: number;
  latency_s: number;
  path_nodes: string[];
  path_contacts: number[];
  explanation: string;
}

export interface PlanHop {
  route_id: number;
  hop_no: number;
  contact_id: number;
  depart_ts: string;
  arrive_ts: string;
  contact_kind: "ISL" | "DOWNLINK";
  from_node: string;
  to_node: string;
  link_score: number;
  from_lat: number | null;
  from_lon: number | null;
  to_lat: number | null;
  to_lon: number | null;
}

export interface PlanBundle {
  route: Record<string, unknown> | null;
  hops: PlanHop[];
}

export interface QueueRow {
  sat_id: string;
  mode: string;
  status: string;
  packets: number;
  bytes: number;
}

/** Raw constellation row: v_constellation_status + TLE columns. */
interface ConstellationRow {
  sat_id: string;
  display_name: string;
  plane: string;
  slot: number;
  state: string;
  battery_v: number | null;
  last_seen: string | null;
  tle_line1: string;
  tle_line2: string;
  next_station?: string | null;
  next_downlink_start?: string | null;
  queued_bytes?: number;
}

interface StationRow extends Omit<Station, "latitude" | "longitude"> {
  latitude: number | string;
  longitude: number | string;
}

export function formatLatency(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${s}s`;
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1048576).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export function txSeconds(sizeBytes: number): number {
  return (sizeBytes * 8) / 9600;
}

/** Operational = deployable relays; STOWED sats (B4) never relay. */
export function isOperational(state: string): boolean {
  return state === "NOMINAL" || state === "SAFE" || state === "COMMISSIONING";
}

function toConstellationSat(r: ConstellationRow): ConstellationSat {
  return {
    node_id: r.sat_id,
    display_name: r.display_name,
    plane: r.plane,
    slot: r.slot,
    state: r.state,
    battery_v: r.battery_v,
    last_seen: r.last_seen,
    tle_line1: r.tle_line1,
    tle_line2: r.tle_line2,
    next_downlink_station: r.next_station ?? null,
    next_downlink_start: r.next_downlink_start ?? null,
    queued_bytes: r.queued_bytes ?? 0,
  };
}

export async function loadGlobeData(): Promise<{
  sats: ConstellationSat[];
  stations: Station[];
  contacts: Contact[];
  mock: boolean;
}> {
  try {
    const [cs, ss] = await Promise.all([
      apiFetch<ConstellationRow[]>("/api/constellation"),
      apiFetch<StationRow[]>("/api/stations"),
    ]);
    const now = new Date().toISOString();
    let contacts: Contact[] = [];
    try {
      const c = await apiFetch<Contact[]>(
        `/api/contacts?at=${encodeURIComponent(now)}&window_min=90`,
      );
      contacts = c.data;
    } catch {
      contacts = [];
    }
    return {
      sats: cs.data.map(toConstellationSat),
      stations: ss.data.map((s) => ({
        ...s,
        latitude: Number(s.latitude),
        longitude: Number(s.longitude),
      })),
      contacts,
      mock: false,
    };
  } catch (e) {
    const err = e as { status?: number };
    if (err?.status !== 0 && err?.status !== 404) throw e;
    const now = Date.now();
    return {
      sats: mockConstellation(now),
      stations: mockStations(),
      contacts: mockContacts(now, 90),
      mock: true,
    };
  }
}

export async function findRoutes(
  origin: string,
  t0: string,
  size: number,
  maxHops: number,
): Promise<CgrRoute[]> {
  const q = new URLSearchParams({
    origin,
    t0,
    size: String(size),
    max_hops: String(maxHops),
  });
  const r = await apiFetch<CgrRoute[]>(`/api/routing/routes?${q.toString()}`);
  return r.data;
}

export async function planRoute(
  origin: string,
  t0: string,
  size: number,
): Promise<PlanBundle> {
  const r = await apiFetch<PlanBundle>("/api/routing/plan", {
    method: "POST",
    body: JSON.stringify({ origin, t0, size }),
  });
  return r.data;
}

export async function loadQueue(sat: string): Promise<QueueRow[]> {
  const r = await apiFetch<QueueRow[]>(
    `/api/routing/queue?sat=${encodeURIComponent(sat)}`,
  );
  return r.data;
}

/** Short static excerpt of the recursive CGR CTE for the "why" panel. */
export const CGR_CTE_EXCERPT = `-- abbreviated: full CTE runs in cgr_routes() (Exp 6, CO3)
WITH RECURSIVE hops(node, arrival, hops, bottleneck, path_nodes, path_contacts) AS (
  SELECT origin, p_t0, 0, 100, ARRAY[origin], ARRAY[]::BIGINT[]
  UNION ALL
  SELECT c.to_node,
         GREATEST(c.start_ts, h.arrival) + tx,
         h.hops + 1, LEAST(h.bottleneck, c.link_score),
         h.path_nodes || c.to_node, h.path_contacts || c.contact_id
    FROM hops h JOIN LATERAL (
      SELECT DISTINCT ON (c.to_node) c.*
        FROM contact c
       WHERE c.from_node = h.node
         AND c.end_ts > h.arrival + tx
         AND c.start_ts < p_t0 + INTERVAL '30 hours'
       ORDER BY c.to_node, c.start_ts
    ) c ON TRUE
   WHERE h.hops < p_max_hops AND NOT c.to_node = ANY (h.path_nodes)
)
SELECT * FROM hops WHERE node IN (SELECT node_id FROM ground_station)
 ORDER BY arrival, hops, bottleneck DESC LIMIT p_limit;`;
