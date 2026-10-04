// globe logic adapted from lakshyamody/dbmsproj (app/components/globe_template.html)
// Typed fetchers for the /ops data contract plus the polling + SSE hook.
// Every response is {data, sql, role}; 401 means no console profile (AppShell
// guards it), network errors fall back to mock data.

import { useEffect, useState } from "react";
import { apiFetch } from "@/app/api";
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

async function fetchApi<T>(url: string): Promise<{ data: T; role: string }> {
  try {
    const r = await apiFetch<T>(url);
    return { data: r.data, role: r.role };
  } catch (e) {
    const err = e as { status?: number; message?: string };
    if (err?.status === 401) throw new Unauthorized(url);
    if (err?.status === 0 || err?.status === 404) {
      throw new MockFallback(`network error for ${url}`);
    }
    throw e;
  }
}

export interface OpsData {
  sats: ConstellationSat[];
  stations: Station[];
  contacts: Contact[];
  kpis: Kpi[];
  alerts: Alert[];
  telemetry: TelemetryEvent[];
  decisions: DecisionEvent[];
  role: string;
  mock: boolean;
  unauthorized: boolean;
  refetchAlerts: () => Promise<void>;
  reload: () => Promise<void>;
}

export async function ackAlertApi(alertId: number): Promise<void> {
  await apiFetch(`/api/alerts/${alertId}/ack`, {
    method: "POST",
  });
}

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
      } catch (e) {
        if (cancelled || e instanceof Unauthorized) return;
        setContacts(mockContacts(Date.now(), 90));
      }
    };

    const loadKpis = async (): Promise<void> => {
      try {
        const r = await fetchApi<Kpi[] | Kpi>("/api/kpis");
        if (cancelled) return;
        // Backend returns the single mv_kpis row as an object.
        setKpis(Array.isArray(r.data) ? r.data : [r.data]);
      } catch (e) {
        if (cancelled || e instanceof Unauthorized) return;
        setKpis(mockKpis(Date.now()));
      }
    };

    const loadAlerts = async (): Promise<void> => {
      try {
        const r = await fetchApi<Alert[]>("/api/alerts?limit=20");
        if (cancelled) return;
        setAlerts(r.data);
      } catch (e) {
        if (!cancelled && !(e instanceof Unauthorized))
          setAlerts(mockAlerts(Date.now()));
      }
    };

    const boot = async (): Promise<void> => {
      try {
        const r = await fetchApi<(ConstellationSat & { sat_id?: string })[]>("/api/constellation");
        if (cancelled) return;
        // v_constellation_status exposes the key as sat_id.
        setSats(r.data.map((s) => ({ ...s, node_id: s.node_id ?? s.sat_id ?? "" })));
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
        setMock(true);
        usingMock = true;
      }
      try {
        const r = await fetchApi<Station[]>("/api/stations");
        if (cancelled) return;
        setStations(r.data);
      } catch (e) {
        if (!cancelled && !(e instanceof Unauthorized))
          setStations(mockStations());
      }
      await loadAlerts();
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

  const refetchAlerts = async (): Promise<void> => {
    try {
      const r = await fetchApi<Alert[]>("/api/alerts?limit=20");
      setAlerts(r.data);
    } catch (e) {
      if (!(e instanceof Unauthorized)) {
        // keep current alerts
      }
    }
  };

  const reload = async (): Promise<void> => {
    await refetchAlerts();
  };

  return {
    sats,
    stations,
    contacts,
    kpis,
    alerts,
    telemetry,
    decisions,
    role,
    mock,
    unauthorized,
    refetchAlerts,
    reload,
  };
}
