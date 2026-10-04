import { apiFetch } from "@/app/api";

export type RouterAction =
  | "SAFE_TTC_ONLY"
  | "TTC_VOICE"
  | "FULL_DOWNLINK"
  | "RELAY_VIA_ISL"
  | "HOLD";

export interface AiMetric {
  class_label: string;
  precision_: number | null;
  recall: number | null;
  f1: number | null;
  support: number | null;
}

export interface AiModel {
  model_id: number;
  name: string;
  version: number;
  algorithm: string;
  features: string[];
  classes: RouterAction[];
  max_depth: number | null;
  train_rows: number | null;
  test_accuracy: number | null;
  confusion: { labels: string[]; matrix: number[][] } | null;
  is_active: boolean;
  trained_at: string;
  metrics: AiMetric[];
}

export interface DtNode {
  model_id: number;
  node_id: number;
  depth: number;
  feature: string | null;
  threshold: number | null;
  left_child: number | null;
  right_child: number | null;
  leaf_action: RouterAction | null;
  samples: number;
  gini: number;
  class_counts: Record<string, number>;
}

export type Features = Record<string, number>;

export interface PreviewData {
  preview: {
    sat_id: string;
    contact_id: number | null;
    model_id: number | null;
    features: Features;
    ai_action: RouterAction | null;
    ai_path: string[];
    rule_action: RouterAction;
    final_action: RouterAction;
    overridden: boolean;
    override_reason: string | null;
    source: string;
  } | null;
  features: Features;
  rule_reason: string | null;
}

export interface WhatIfData {
  ai: { action: RouterAction; path: string[]; leaf_node: number; model_id: number } | null;
  rule_action: RouterAction;
  final_rule: RouterAction;
  rule_reason: string | null;
  watchdog: string | null;
  watchdog_full: string | null;
}

export interface DecisionRow {
  decision_id: number;
  sat_id: string;
  contact_id: number | null;
  model_id: number | null;
  features: Features;
  ai_action: RouterAction | null;
  ai_path: string[] | null;
  rule_action: RouterAction;
  final_action: RouterAction;
  overridden: boolean;
  override_reason: string | null;
  source: string;
  decided_by: string;
  decided_at: string;
}

export const ACTION_COLORS: Record<RouterAction, string> = {
  SAFE_TTC_ONLY: "#d7263d",
  TTC_VOICE: "#ffb020",
  FULL_DOWNLINK: "#4cc38a",
  RELAY_VIA_ISL: "#6ea8ff",
  HOLD: "#7d7a73",
};

export const FEATURE_KEYS = [
  "battery_v",
  "link_score",
  "contact_s",
  "queue_ttc_kb",
  "queue_sstv_kb",
  "queue_voice_kb",
  "sunlit",
  "isl_available",
] as const;

export const DEFAULT_WHATIF: Features = {
  battery_v: 7.4,
  link_score: 70,
  contact_s: 300,
  queue_ttc_kb: 12,
  queue_sstv_kb: 80,
  queue_voice_kb: 20,
  sunlit: 1,
  isl_available: 1,
};

/** Preset tuned so FULL_DOWNLINK trips the battery<7.2 watchdog rule. */
export const OVERRIDE_PRESET: Features = {
  battery_v: 6.95,
  link_score: 85,
  contact_s: 300,
  queue_ttc_kb: 4,
  queue_sstv_kb: 400,
  queue_voice_kb: 60,
  sunlit: 0,
  isl_available: 1,
};

export async function loadModels(): Promise<AiModel[]> {
  const r = await apiFetch<AiModel[]>("/api/ai/models");
  return r.data;
}

export async function loadTree(modelId: number): Promise<DtNode[]> {
  const r = await apiFetch<DtNode[]>(`/api/ai/models/${modelId}/tree`);
  return r.data;
}

export async function loadPreview(sat: string): Promise<PreviewData> {
  const r = await apiFetch<PreviewData>(`/api/ai/preview/${encodeURIComponent(sat)}`);
  return r.data;
}

export async function postWhatIf(
  features: Features,
  modelId?: number | null,
): Promise<WhatIfData> {
  const r = await apiFetch<WhatIfData>("/api/ai/whatif", {
    method: "POST",
    body: JSON.stringify({ features, model_id: modelId ?? null }),
  });
  return r.data;
}

export async function recordDecision(sat: string): Promise<DecisionRow> {
  const r = await apiFetch<DecisionRow>(`/api/ai/decide/${encodeURIComponent(sat)}`, {
    method: "POST",
  });
  return r.data;
}

export async function loadDecisions(limit = 50): Promise<DecisionRow[]> {
  const r = await apiFetch<DecisionRow[]>(`/api/ai/decisions?limit=${limit}`);
  return r.data;
}

/** Walk dt_nodes in JS with sklearn semantics to recover path node ids. */
export function walkPath(nodes: DtNode[], features: Features): number[] {
  const byId = new Map(nodes.map((n) => [n.node_id, n]));
  const root = byId.get(0);
  if (!root) return [];
  const path: number[] = [0];
  let cur = root;
  for (let i = 0; i < 64; i++) {
    if (cur.leaf_action !== null || cur.feature === null) break;
    const v = Number(features[cur.feature] ?? 0);
    const goLeft = v <= Number(cur.threshold ?? 0);
    const next = goLeft ? cur.left_child : cur.right_child;
    if (next === null || next === undefined) break;
    const nxt = byId.get(next);
    if (!nxt) break;
    path.push(next);
    cur = nxt;
  }
  return path;
}
