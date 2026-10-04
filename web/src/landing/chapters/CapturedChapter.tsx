import { useEffect, useRef } from "react"
import type { RefObject } from "react"
import { ChapterShell } from "@/landing/ChapterShell"
import { RowCard } from "@/components/story/RowCard"
import { SqlRibbon } from "@/components/story/SqlRibbon"
import { usePinnedScrub, useReveal } from "@/landing/usePinnedScrub"

/**
 * 01 / CAPTURED. SAT-A3 grabs an SSTV frame over the Pacific. The canvas
 * builds a procedural Earth-limb image scanline by scanline as you scroll,
 * while two RowCards insert beside it.
 */
function useEarthLimb(canvasRef: RefObject<HTMLCanvasElement | null>) {
  const imgRef = useRef<ImageData | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const W = 320
    const H = 240
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const img = ctx.createImageData(W, H)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4
        const horizon = H * 0.42 + Math.sin(x / 46) * 10
        const d = (y - horizon) / (H * 0.5)
        const grain = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
        const noise = (grain - Math.floor(grain) - 0.5) * 22
        let r: number
        let g: number
        let b: number
        if (y < horizon - 4) {
          r = 6
          g = 9
          b = 26
        } else if (y < horizon + 6) {
          const k = (y - (horizon - 4)) / 10
          r = 6 + k * 110
          g = 9 + k * 168
          b = 26 + k * 230
        } else {
          const land = Math.sin(x / 31 + y / 57) > 0.25
          const base = Math.max(0, 1 - d)
          r = land ? 24 + base * 60 : 8 + base * 40
          g = land ? 52 + base * 70 : 20 + base * 90
          b = land ? 44 + base * 40 : 60 + base * 130
        }
        img.data[i] = Math.max(0, Math.min(255, r + noise))
        img.data[i + 1] = Math.max(0, Math.min(255, g + noise))
        img.data[i + 2] = Math.max(0, Math.min(255, b + noise))
        img.data[i + 3] = 255
      }
    }
    imgRef.current = img
    ctx.fillStyle = "#0b1020"
    ctx.fillRect(0, 0, W, H)
  }, [canvasRef])

  return (p: number) => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const W = 320
    const H = 240
    const rows = Math.floor(p * H)
    ctx.fillStyle = "#0b1020"
    ctx.fillRect(0, 0, W, H)
    if (rows <= 0) return
    const part = ctx.createImageData(W, rows)
    part.data.set(img.data.subarray(0, W * rows * 4))
    ctx.putImageData(part, 0, 0)
    ctx.fillStyle = "rgba(215,38,61,0.9)"
    ctx.fillRect(0, rows - 1, W, 2)
  }
}

export function CapturedChapter() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const draw = useEarthLimb(canvasRef)

  useReveal(rootRef)
  usePinnedScrub(rootRef, draw)

  return (
    <div ref={rootRef}>
      <ChapterShell
        index="01"
        title="Captured"
        sectionId="captured"
        status="QUEUED"
        headline="SAT-A3 captures an SSTV frame over the Pacific."
        copy={[
          "A Robot36 pass paints the Earth limb line by line — 320 by 240 pixels, 41,216 bytes. The frame lands in the packet queue with status QUEUED, beside its sstv_image subtype row.",
          "This is the EER specialization at work: one packet table, three disjoint subtypes — ttc_frame, sstv_image, voice_frame — so every mode carries exactly the columns it needs.",
        ]}
        visual={
          <div className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] p-4">
              <p className="font-mono mb-3 text-[11px] tracking-[0.18em] text-[var(--cream-dim)]">
                SSTV · Robot36 · 320×240 · building scanlines
              </p>
              <canvas
                ref={canvasRef}
                className="h-auto w-full rounded-lg"
                aria-label="SSTV Earth-limb image building line by line"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <RowCard
                title="packet"
                rows={[
                  ["packet_id", "412"],
                  ["origin_sat", "SAT-A3"],
                  ["mode", "SSTV"],
                  ["size_bytes", "41216"],
                  ["status", "QUEUED"],
                ]}
              />
              <RowCard
                title="sstv_image"
                rows={[
                  ["packet_id", "412"],
                  ["sstv_mode", "Robot36"],
                  ["width", "320"],
                  ["height", "240"],
                ]}
              />
            </div>
            <SqlRibbon
              sql={`INSERT INTO packet (origin_sat, mode, size_bytes)
VALUES ('SAT-A3', 'SSTV', 41216);
INSERT INTO sstv_image (packet_id, sstv_mode, width, height)
VALUES (412, 'Robot36', 320, 240);`}
              caption="Exp 4 · DML — one row in packet, one in its subtype"
            />
          </div>
        }
      />
    </div>
  )
}
