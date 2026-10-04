// globe logic adapted from lakshyamody/dbmsproj (app/components/globe_template.html)
// Typed fetchers for the /ops data contract plus the polling + SSE hook.
// Every response is {data, sql, role}; errors are {error:{sqlstate,message}}.

import { useEffect, useState } from "react";
import {
  mockAlerts,
  mockConstellation,
  mockContacts,
  mockKpis,
  mockStations,
} from "./mock";

export interface ConstellationSat {
  node_id: string;
  display_name: string;
  plane: string;
  slot: number;
  state: string;
  battery_v: number | null;
  last_seen: string | null;
  tle_line1: string;
  tle_line2: string;
  next_downlink_station?: string | null;
  next_downlink_start?: string | null;
  queued_bytes?: number;
}

export interface Station {
  node_id: string;
  display_name: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  min_elevation_deg: number;
  is_primary: boolean;
}

export interface Contact {
  contact_id: number;
  kind: "ISL" | "DOWNLINK";
  from_node: string;
  to_node: string;
  start_ts: string;
  end_ts: string;
  link_score: number;
  min_range_km: number;
}

export interface Kpi {
  sats_total: number;
  sats_operational: number;
  packets_queued: number;
  packets_delivered_24h: number;
  bytes_delivered_24h: number;
  contacts_next_24h: number;
  isl_contacts_next_24h: number;
  ai_overrides_24h: number;
  refreshed_at: string;
}

export interface Alert {
  alert_id: number;
  sat_id: string | null;
  severity: "INFO" | "WARN" | "CRITICAL";
  message: string;
  raised_at: string;
  acknowledged: boolean;
}

export interface TelemetryEvent {
  sat_id: string;
  ts: string;
  battery_v: number;
  temp_c: number;
  rssi_dbm: number | null;
  mode_active: string | null;
}

export interface DecisionEvent {
  sat_id: string;
  final_action: string;
  overridden: boolean;
}

export class MockFallback extends Error {}
export class Unauthorized extends Error {}

interface ApiOk<T> {
  data: T;
  sql: string;
  role: string;
}

async function fetchApi<T>(url: string): Promise<ApiOk<T>> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new MockFallback(`network error for ${url}`);
  }
  if (res.status === 401) throw new Unauthorized(url);
  if (res.status === 404) throw new MockFallback(`${url} -> 404`);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return (await res.json()) as ApiOk<T>;
}

export interface OpsData {
  sats: ConstellationSat[];
  stations: Station[];
  contacts: Contact[];
  kpis: Kpi[];
  alerts: Alert[];
  telemetry: TelemetryEvent[];
  decisions: DecisionEvent[];
  sql: Record<string, string>;
  role: string;
  mock: boolean;
  unauthorized: boolean;
}

const FALLBACK_SQL: Record<string, string> = {
  constellation: "-- mock fallback: GET /api/constellation unreachable",
  stations: "-- mock fallback: GET /api/stations unreachable",
  contacts: "-- mock fallback: GET /api/contacts unreachable",
  kpis: "-- mock fallback: GET /api/kpis unreachable",
  alerts: "-- mock fallback: GET /api/alerts unreachable",
};

const LIVE_SQL: Record<string, string> = {
  constellation:
    "SELECT node_id, display_name, plane, slot, state, battery_v,\n" +
    "       last_seen, tle_line1, tle_line2\n" +
    "  FROM v_constellation_status ORDER BY node_id; -- GET /api/constellation",
  stations:
    "SELECT node_id, display_name, city, country, latitude, longitude,\n" +
    "       min_elevation_deg, is_primary\n" +
    "  FROM ground_station ORDER BY node_id; -- GET /api/stations",
  contacts:
    "SELECT contact_id, kind, from_node, to_node, start_ts, end_ts,\n" +
    "       link_score, min_range_km\n  FROM contact\n" +
    " WHERE span && tstzrange(:at, :at + make_interval(mins => :window))\n" +
    " ORDER BY start_ts; -- GET /api/contacts",
  kpis: "SELECT * FROM mv_kpis WHERE kpi_id = 1; -- GET /api/kpis",
  alerts:
    "SELECT alert_id, sat_id, severity, message, raised_at, acknowledged\n" +
    "  FROM alert ORDER BY raised_at DESC LIMIT 20; -- GET /api/alerts",
};

/** Local synthetic telemetry tick used only while on mock data. */
function mockTick(prev: TelemetryEvent[]): TelemetryEvent {
  const ids = ["SAT-A1", "SAT-A2", "SAT-A3", "SAT-A4", "SAT-B1", "SAT-B2", "SAT-B3"];
  const base: Record<string, number> = {
    "SAT-A1": 7.9,
    "SAT-A2": 7.6,
    "SAT-A3": 7.4,
    "SAT-A4": 7.1,
    "SAT-B1": 7.8,
    "SAT-B2": 6.95,
    "SAT-B3": 6.6,
  };
  const id = ids[Math.floor(Math.random() * ids.length)];
  const last = [...prev].reverse().find((t) => t.sat_id === id);
  const anchor = last ? last.battery_v : base[id];
  const battery = Math.round((anchor + (Math.random() - 0.5) * 0.06) * 100) / 100;
  return {
    sat_id: id,
    ts: new Date().toISOString(),
    battery_v: battery,
    temp_c: Math.round((21 + Math.random() * 6) * 10) / 10,
    rssi_dbm: Math.round((-95 + Math.random() * 20) * 10) / 10,
    mode_active: battery < 7.2 ? "TTC" : "SSTV",
  };
}

const POLL_MS = 30_000;

export function useOpsData(): OpsData {
  const [sats, setSats] = useState<ConstellationSat[]>(() =>
    mockConstellation(Date.now()),
  );
  const [stations, setStations] = useState<Station[]>(() => mockStations());
  const [contacts, setContacts] = useState<Contact[]>(() =>
    mockContacts(Date.now(), 90),
  );
  const [kpis, setKpis] = useState<Kpi[]>(() => mockKpis(Date.now()));
  const [alerts, setAlerts] = useState<Alert[]>(() => mockAlerts(Date.now()));
  const [telemetry, setTelemetry] = useState<TelemetryEvent[]>([]);
  const [decisions, setDecisions] = useState<DecisionEvent[]>([
    { sat_id: "SAT-B3", final_action: "SAFE_TTC_ONLY", overridden: true },
    { sat_id: "SAT-A1", final_action: "FULL_DOWNLINK", overridden: false },
  ]);
  const [sql, setSql] = useState<Record<string, string>>(FALLBACK_SQL);
  const [role, setRole] = useState("mock");
  const [mock, setMock] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let usingMock = true;
    let ticksStarted = false;
    const timers: number[] = [];
    const sources: EventSource[] = [];

    const startMockTicks = (): void => {
      if (ticksStarted || cancelled) return;
      ticksStarted = true;
      const tick = window.setInterval(() => {
        if (cancelled) return;
        setTelemetry((t) => [...t.slice(-19), mockTick(t)]);
      }, 3000);
      timers.push(tick);
    };

    const startStream = (): void => {
      try {
        const src = new EventSource("/api/stream");
        sources.push(src);
        src.addEventListener("telemetry", (ev) => {
          const msg = ev as MessageEvent;
          try {
            const t = JSON.parse(msg.data) as TelemetryEvent;
            if (!cancelled) setTelemetry((prev) => [...prev.slice(-19), t]);
          } catch {
            // Malformed SSE frame: drop it, keep the stream open.
          }
        });
        src.addEventListener("decision", (ev) => {
          const msg = ev as MessageEvent;
          try {
            const d = JSON.parse(msg.data) as DecisionEvent;
            if (!cancelled) setDecisions((prev) => [d, ...prev].slice(0, 20));
          } catch {
            // Malformed SSE frame: drop it, keep the stream open.
          }
        });
        src.onerror = (): void => {
          // Stream broke: close it and synthesize ticks so the UI keeps moving.
          src.close();
          if (!cancelled) startMockTicks();
        };
      } catch {
        // EventSource construction failed: fall back to synthetic ticks.
        startMockTicks();
      }
    };

    const loadContacts = async (): Promise<void> => {
      const at = new Date().toISOString();
      try {
        const r = await fetchApi<Contact[]>(
          `/api/contacts?at=${encodeURIComponent(at)}&window_min=90`,
        );
        if (cancelled) return;
        setContacts(r.data);
        setSql((s) => ({ ...s, contacts: r.sql || LIVE_SQL.contacts }));
      } catch (e) {
        if (cancelled || e instanceof Unauthorized) return;
        setContacts(mockContacts(Date.now(), 90));
      }
    };

    const loadKpis = async (): Promise<void> => {
      try {
        const r = await fetchApi<Kpi[]>("/api/kpis");
        if (cancelled) return;
        setKpis(r.data);
        setSql((s) => ({ ...s, kpis: r.sql || LIVE_SQL.kpis }));
      } catch (e) {
        if (cancelled || e instanceof Unauthorized) return;
        setKpis(mockKpis(Date.now()));
      }
    };

    const boot = async (): Promise<void> => {
      try {
        const r = await fetchApi<ConstellationSat[]>("/api/constellation");
        if (cancelled) return;
        setSats(r.data);
        setSql((s) => ({ ...s, constellation: r.sql || LIVE_SQL.constellation }));
        setRole(r.role);
        setMock(false);
        usingMock = false;
      } catch (e) {
        if (cancelled) return;
        if (e instanceof Unauthorized) {
          setUnauthorized(true);
          return;
        }
        setSats(mockConstellation(Date.now()));
        setSql((s) => ({ ...s, ...FALLBACK_SQL }));
        setMock(true);
        usingMock = true;
      }
      try {
        const r = await fetchApi<Station[]>("/api/stations");
        if (cancelled) return;
        setStations(r.data);
        setSql((s) => ({ ...s, stations: r.sql || LIVE_SQL.stations }));
      } catch (e) {
        if (!cancelled && !(e instanceof Unauthorized))
          setStations(mockStations());
      }
      try {
        const r = await fetchApi<Alert[]>("/api/alerts?limit=20");
        if (cancelled) return;
        setAlerts(r.data);
        setSql((s) => ({ ...s, alerts: r.sql || LIVE_SQL.alerts }));
      } catch (e) {
        if (!cancelled && !(e instanceof Unauthorized))
          setAlerts(mockAlerts(Date.now()));
      }
      await loadContacts();
      await loadKpis();
      if (cancelled) return;
      if (usingMock) startMockTicks();
      else startStream();
    };

    void boot();
    // Contacts and KPIs re-poll every 30 s; each poll retries live first.
    const poll = window.setInterval(() => {
      if (cancelled) return;
      void loadContacts();
      void loadKpis();
    }, POLL_MS);
    timers.push(poll);

    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearInterval(t));
      sources.forEach((s) => s.close());
    };
  }, []);

  return {
    sats,
    stations,
    contacts,
    kpis,
    alerts,
    telemetry,
    decisions,
    sql,
    role,
    mock,
    unauthorized,
  };
}
