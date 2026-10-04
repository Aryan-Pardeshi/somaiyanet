import { apiFetch } from "@/app/api";

export interface Pod {
  pod_id: string;
  serial_no: string;
  release_mechanism: string;
  status: string;
  launch_date: string | null;
  release_ts: string | null;
  temperature_c: number | null;
}

export interface DeployEvent {
  pod_id: string;
  seq: number;
  signal: string;
  ok: boolean;
  value: string | null;
  observed_at: string;
}

export interface DeploySat {
  node_id: string;
  state: string;
  pod_id: string;
}

export interface DeployLog {
  log_id: number;
  pod_id: string | null;
  sat_id: string | null;
  action: string;
  outcome: string;
  detail: string | null;
  logged_at: string;
}

export interface DeployBundle {
  pod: Pod | null;
  events: DeployEvent[];
  satellite: DeploySat | null;
  log: DeployLog[];
}

export interface Snapshot {
  pod: Pod | null;
  sat: DeploySat | null;
}

export interface ConfirmOk {
  before: Snapshot;
  after: Snapshot;
  log: DeployLog | null;
}

export interface ConfirmFail {
  before: Snapshot;
  after: Snapshot | null;
}

export interface PassStage {
  stage: string;
  status: string;
  packets: number;
  bytes: number;
}

export interface QueueCount {
  mode: string;
  packets: number;
  bytes: number;
}

export interface PassResult {
  stages: PassStage[];
  before: QueueCount[];
  after: QueueCount[];
}

export interface PassContact {
  contact_id: number;
  kind: string;
  from_node: string;
  to_node: string;
  start_ts: string;
  end_ts: string;
  link_score: number;
  min_range_km: number;
}

export const PODS = [
  "POD-A1",
  "POD-A2",
  "POD-A3",
  "POD-A4",
  "POD-B1",
  "POD-B2",
  "POD-B3",
  "POD-B4",
];

export const SIGNALS = ["SEPARATION_SWITCH", "RELEASE_TIMER", "RF_BEACON"] as const;

export const STATES = [
  "STOWED",
  "DEPLOYED",
  "COMMISSIONING",
  "NOMINAL",
  "SAFE",
] as const;

export async function loadDeploy(pod: string): Promise<DeployBundle> {
  const r = await apiFetch<DeployBundle>(`/api/deploy/${encodeURIComponent(pod)}`);
  return r.data;
}

export async function sendSignal(
  pod: string,
  signal: string,
  ok: boolean,
): Promise<{ seq: number }> {
  const r = await apiFetch<{ seq: number }>(
    `/api/deploy/${encodeURIComponent(pod)}/signal`,
    { method: "POST", body: JSON.stringify({ signal, ok }) },
  );
  return r.data;
}

/** Success returns before/after/log; failure throws but carries data. */
export async function confirmDeploy(
  pod: string,
  simulateFailure: boolean,
): Promise<ConfirmOk> {
  const r = await apiFetch<ConfirmOk>(
    `/api/deploy/${encodeURIComponent(pod)}/confirm`,
    { method: "POST", body: JSON.stringify({ simulate_failure: simulateFailure }) },
  );
  return r.data;
}

export async function resetDeploy(): Promise<{ ok: boolean }> {
  const r = await apiFetch<{ ok: boolean }>("/api/deploy/reset", { method: "POST" });
  return r.data;
}

export async function executePass(
  sat: string,
  contactId: number,
  failStage2: boolean,
): Promise<PassResult> {
  const r = await apiFetch<PassResult>("/api/pass/execute", {
    method: "POST",
    body: JSON.stringify({ sat, contact_id: contactId, fail_stage2: failStage2 }),
  });
  return r.data;
}

export async function loadDownlinks(sat: string): Promise<PassContact[]> {
  const at = new Date().toISOString();
  const r = await apiFetch<PassContact[]>(
    `/api/contacts?at=${encodeURIComponent(at)}&window_min=1800`,
  );
  return r.data.filter((c) => c.kind === "DOWNLINK" && c.from_node === sat);
}
