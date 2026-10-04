/**
 * Story counters for the landing page: live numbers from GET /api/stats,
 * falling back to public/data/stats.json, then to a built-in snapshot with
 * the identical shape so the strip never renders empty.
 */
import { useEffect, useState } from "react"

export interface StoryStats {
  source: "live" | "mock" | "fallback"
  sats_total: number
  sats_operational: number
  telemetry_rows: number
  packets_queued: number
  packets_delivered_24h: number
  contacts_next_24h: number
  isl_contacts_next_24h: number
  ai_decisions: number
  stations: number
}

export const FALLBACK_STORY_STATS: StoryStats = {
  source: "fallback",
  sats_total: 8,
  sats_operational: 7,
  telemetry_rows: 70560,
  packets_queued: 420,
  packets_delivered_24h: 144,
  contacts_next_24h: 697,
  isl_contacts_next_24h: 480,
  ai_decisions: 7,
  stations: 6,
}

function isStoryStats(json: unknown): json is StoryStats {
  if (!json || typeof json !== "object") return false
  const o = json as Record<string, unknown>
  return (
    typeof o.sats_total === "number" &&
    typeof o.packets_queued === "number" &&
    typeof o.contacts_next_24h === "number"
  )
}

export function useStoryStats(): { stats: StoryStats; loading: boolean } {
  const [stats, setStats] = useState<StoryStats>(FALLBACK_STORY_STATS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const local = `${import.meta.env.BASE_URL}data/stats.json`

    const load = async (): Promise<void> => {
      try {
        const r = await fetch("/api/stats", { cache: "no-cache" })
        if (r.ok) {
          const json: unknown = await r.json()
          const data = (json as { data?: unknown }).data ?? json
          if (alive && isStoryStats(data)) {
            setStats({ ...(data as StoryStats), source: "live" })
            return
          }
        }
      } catch {
        /* backend not up yet — fall through to the static file */
      }
      try {
        const r = await fetch(local, { cache: "no-cache" })
        if (r.ok) {
          const json: unknown = await r.json()
          if (alive && isStoryStats(json)) {
            setStats(json as StoryStats)
            return
          }
        }
      } catch {
        /* keep the built-in snapshot */
      }
    }

    void load().finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  return { stats, loading }
}
