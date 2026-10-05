// globe logic adapted from lakshyamody/dbmsproj (app/components/globe_template.html)
// Offline fixture used only when the backend is unreachable (network error
// or 404). TLEs below were computed offline with the same recipe as
// scripts/build_constellation.py: circular SSO, ~525 km, inc 97.5 deg,
// one plane at RAAN 75 deg, 12 deg in-plane spacing (SS-4 still stowed).

import * as satellite from "satellite.js";
import type {
  Alert,
  ConstellationSat,
  Contact,
  Kpi,
  Station,
} from "./api";
import { lookAnglesEl, propagateSat } from "./orbit";

/** node_id -> [line1, line2]. Epoch 2026-10-04 00:00 UTC. */
export const MOCK_TLES: Record<string, [string, string]> = {
  "SS-1": [
    "1 99901U          26277.00000000  .00000000  00000-0  00000+0 0    04",
    "2 99901  97.5000  75.0000 0001000   0.0000   0.0000 15.13676342    02",
  ],
  "SS-2": [
    "1 99902U          26277.00000000  .00000000  00000-0  00000+0 0    05",
    "2 99902  97.5000  75.0000 0001000   0.0000  12.0000 15.13676342    06",
  ],
  "SS-3": [
    "1 99903U          26277.00000000  .00000000  00000-0  00000+0 0    06",
    "2 99903  97.5000  75.0000 0001000   0.0000  24.0000 15.13676342    00",
  ],
  "SS-4": [
    "1 99904U          26277.00000000  .00000000  00000-0  00000+0 0    07",
    "2 99904  97.5000  75.0000 0001000   0.0000  36.0000 15.13676342    04",
  ],
};

/** Pinned demo story, mirroring spec section 4 (states + latest battery). */
const PINNED: Array<{
  node_id: string;
  plane: string;
  slot: number;
  state: string;
  battery: number | null;
}> = [
  { node_id: "SS-1", plane: "A", slot: 1, state: "NOMINAL", battery: 7.9 },
  { node_id: "SS-2", plane: "A", slot: 2, state: "NOMINAL", battery: 6.95 },
  { node_id: "SS-3", plane: "A", slot: 3, state: "SAFE", battery: 6.6 },
  { node_id: "SS-4", plane: "A", slot: 4, state: "STOWED", battery: null },
];

export function mockConstellation(nowMs: number): ConstellationSat[] {
  return PINNED.map((p, i) => ({
    node_id: p.node_id,
    display_name: `SomaiyaSat-${p.slot}`,
    plane: p.plane,
    slot: p.slot,
    state: p.state,
    battery_v: p.battery,
    last_seen:
      p.battery === null
        ? null
        : new Date(nowMs - (i + 1) * 47_000).toISOString(),
    tle_line1: MOCK_TLES[p.node_id][0],
    tle_line2: MOCK_TLES[p.node_id][1],
    next_downlink_station:
      p.battery === null ? null : ["GS-BOM", "GS-HEL", "GS-SVB"][i % 3],
    next_downlink_start:
      p.battery === null
        ? null
        : new Date(nowMs + (i + 2) * 11 * 60_000).toISOString(),
    queued_bytes: p.battery === null ? 0 : 40_000 + i * 18_500,
  }));
}

/** Stations straight from db/02_seed.sql. */
export function mockStations(): Station[] {
  return [
    {
      node_id: "GS-BOM",
      display_name: "KJSIT Mumbai",
      city: "Mumbai",
      country: "IN",
      latitude: 19.0728,
      longitude: 72.8826,
      min_elevation_deg: 10,
      is_primary: true,
    },
    {
      node_id: "GS-HEL",
      display_name: "ReOrbit Espoo",
      city: "Espoo",
      country: "FI",
      latitude: 60.2055,
      longitude: 24.6559,
      min_elevation_deg: 10,
      is_primary: false,
    },
    {
      node_id: "GS-BLR",
      display_name: "Bengaluru Relay",
      city: "Bengaluru",
      country: "IN",
      latitude: 12.9716,
      longitude: 77.5946,
      min_elevation_deg: 10,
      is_primary: false,
    },
    {
      node_id: "GS-TYO",
      display_name: "Tokyo Amateur",
      city: "Tokyo",
      country: "JP",
      latitude: 35.6762,
      longitude: 139.6503,
      min_elevation_deg: 10,
      is_primary: false,
    },
    {
      node_id: "GS-SVB",
      display_name: "Svalbard Polar",
      city: "Longyearbyen",
      country: "NO",
      latitude: 78.2232,
      longitude: 15.6267,
      min_elevation_deg: 5,
      is_primary: false,
    },
    {
      node_id: "GS-CPT",
      display_name: "Cape Town",
      city: "Cape Town",
      country: "ZA",
      latitude: -33.9249,
      longitude: 18.4241,
      min_elevation_deg: 10,
      is_primary: false,
    },
  ];
}

function satrecs(): Map<string, satellite.SatRec> {
  const m = new Map<string, satellite.SatRec>();
  for (const [id, lines] of Object.entries(MOCK_TLES)) {
    try {
      m.set(id, satellite.twoline2satrec(lines[0], lines[1]));
    } catch {
      // Skip unusable element sets; never plot a bogus point.
    }
  }
  return m;
}

/**
 * Derive contacts in the browser: an ISL is any deployed-sat pair within
 * 2000 km; a downlink is any station with elevation above its mask.
 * Windows shorter than 60 s are dropped, matching compute_contacts.py.
 */
export function mockContacts(atMs: number, windowMin = 90): Contact[] {
  const recs = satrecs();
  const sats = [...recs.keys()].filter((id) => id !== "SS-4"); // STOWED excluded
  const stations = mockStations();
  const stepMs = 30_000;
  const steps = Math.floor((windowMin * 60_000) / stepMs);
  const out: Contact[] = [];
  let cid = -1;

  const collectWindows = (
    openAtStep: (t: number) => { score: number; extra: number } | null,
    emit: (startMs: number, endMs: number, best: number, extra: number) => void,
  ): void => {
    let start: number | null = null;
    let best = 0;
    let bestExtra = 0;
    for (let i = 0; i <= steps; i++) {
      const t = atMs + i * stepMs;
      const hit = openAtStep(t);
      if (hit) {
        if (start === null) {
          start = t;
          best = hit.score;
          bestExtra = hit.extra;
        } else if (hit.score > best) {
          best = hit.score;
          bestExtra = hit.extra;
        }
      } else if (start !== null) {
        if (t - start >= 60_000) emit(start, t, best, bestExtra);
        start = null;
      }
    }
    if (start !== null && atMs + steps * stepMs - start >= 60_000) {
      emit(start, atMs + steps * stepMs, best, bestExtra);
    }
  };

  // ISL pairs (one directed row per direction, like the real table).
  for (let a = 0; a < sats.length; a++) {
    for (let b = a + 1; b < sats.length; b++) {
      const ra = recs.get(sats[a]);
      const rb = recs.get(sats[b]);
      if (!ra || !rb) continue;
      const pair = (
        s1: string,
        s2: string,
        r1: satellite.SatRec,
        r2: satellite.SatRec,
      ): void => {
        collectWindows(
          (t) => {
            const p1 = propagateSat(r1, t);
            const p2 = propagateSat(r2, t);
            if (!p1 || !p2) return null;
            // Range via shared-altitude chord approximation.
            const range = chordKm(p1, p2);
            if (range > 2000) return null;
            const score = Math.max(
              0,
              Math.min(
                100,
                Math.round(100 - ((20 * Math.log10(range / 300) * 100) / 24)),
              ),
            );
            return { score, extra: range };
          },
          (s, e, best, range) => {
            out.push({
              contact_id: cid--,
              kind: "ISL",
              from_node: s1,
              to_node: s2,
              start_ts: new Date(s).toISOString(),
              end_ts: new Date(e).toISOString(),
              link_score: best,
              min_range_km: Math.round(range * 10) / 10,
            });
          },
        );
      };
      pair(sats[a], sats[b], ra, rb);
      pair(sats[b], sats[a], rb, ra);
    }
  }

  // Downlinks.
  for (const id of sats) {
    const rec = recs.get(id);
    if (!rec) continue;
    for (const st of stations) {
      collectWindows(
        (t) => {
          const p = propagateSat(rec, t);
          if (!p) return null;
          const look = lookAnglesEl(
            { lat: st.latitude, lng: st.longitude },
            p,
            st.min_elevation_deg,
          );
          if (!look.visible) return null;
          const score = Math.max(
            0,
            Math.min(100, Math.round(60 + look.el * 1.5)),
          );
          return { score, extra: look.range };
        },
        (s, e, best, range) => {
          out.push({
            contact_id: cid--,
            kind: "DOWNLINK",
            from_node: id,
            to_node: st.node_id,
            start_ts: new Date(s).toISOString(),
            end_ts: new Date(e).toISOString(),
            link_score: best,
            min_range_km: Math.round(range * 10) / 10,
          });
        },
      );
    }
  }
  return out;
}

/** Chord range between two propagated positions, km. */
function chordKm(
  p1: { lat: number; lng: number; alt: number },
  p2: { lat: number; lng: number; alt: number },
): number {
  const R = 6371;
  const toR = Math.PI / 180;
  const r1 = R * (1 + p1.alt);
  const r2 = R * (1 + p2.alt);
  const la1 = p1.lat * toR;
  const la2 = p2.lat * toR;
  const dLng = (p2.lng - p1.lng) * toR;
  const cosC =
    Math.sin(la1) * Math.sin(la2) + Math.cos(la1) * Math.cos(la2) * Math.cos(dLng);
  const c = Math.acos(Math.max(-1, Math.min(1, cosC)));
  return Math.sqrt(r1 * r1 + r2 * r2 - 2 * r1 * r2 * Math.cos(c));
}

export function mockKpis(nowMs: number): Kpi[] {
  return [
    {
      sats_total: 8,
      sats_operational: 6,
      packets_queued: 418,
      packets_delivered_24h: 296,
      bytes_delivered_24h: 4_812_300,
      contacts_next_24h: 132,
      isl_contacts_next_24h: 96,
      ai_overrides_24h: 11,
      refreshed_at: new Date(nowMs).toISOString(),
    },
  ];
}

export function mockAlerts(nowMs: number): Alert[] {
  return [
    {
      alert_id: -2,
      sat_id: "SS-3",
      severity: "CRITICAL",
      message: "battery 6.60 V below 6.8 V safe-mode floor",
      raised_at: new Date(nowMs - 42 * 60_000).toISOString(),
      acknowledged: false,
    },
    {
      alert_id: -1,
      sat_id: "SS-2",
      severity: "WARN",
      message: "24 h avg battery below 7.0 V and drifting down",
      raised_at: new Date(nowMs - 3 * 3_600_000).toISOString(),
      acknowledged: false,
    },
  ];
}
