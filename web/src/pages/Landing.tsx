import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ScrollTrigger } from "@/lib/gsap"
import { Brand } from "@/components/story/Brand"
import { PacketTag } from "@/components/story/PacketTag"
import type { PacketStatus } from "@/components/story/PacketTag"
import { HeroChapter } from "@/landing/chapters/HeroChapter"
import { CapturedChapter } from "@/landing/chapters/CapturedChapter"
import { ReleasedChapter } from "@/landing/chapters/ReleasedChapter"
import { DecidedChapter } from "@/landing/chapters/DecidedChapter"
import { NoStationChapter } from "@/landing/chapters/NoStationChapter"
import { DownlinkChapter } from "@/landing/chapters/DownlinkChapter"
import { BecomesDataChapter } from "@/landing/chapters/BecomesDataChapter"
import { WhoMaySeeChapter } from "@/landing/chapters/WhoMaySeeChapter"
import { StoryFooter } from "@/landing/chapters/StoryFooter"

const STATUS_BY_SECTION: Array<[string, PacketStatus]> = [
  ["hero", "QUEUED"],
  ["captured", "QUEUED"],
  ["released", "CLAIMED"],
  ["decided", "CLAIMED"],
  ["no-station", "ROUTED"],
  ["downlink", "DELIVERED"],
  ["becomes-data", "DELIVERED"],
  ["who-may-see", "DELIVERED"],
]

const NAV: Array<[string, string]> = [
  ["captured", "Captured"],
  ["released", "Released"],
  ["decided", "Decided"],
  ["no-station", "Routing"],
  ["downlink", "Downlink"],
  ["becomes-data", "Data"],
  ["who-may-see", "Console"],
]

export default function Landing() {
  const [status, setStatus] = useState<PacketStatus>("QUEUED")

  useEffect(() => {
    const triggers = STATUS_BY_SECTION.map(([id, s]) => {
      const el = document.getElementById(id)
      if (!el) return null
      return ScrollTrigger.create({
        trigger: el,
        start: "top center",
        end: "bottom center",
        onToggle: (self) => {
          if (self.isActive) setStatus(s)
        },
      })
    })
    return () => {
      triggers.forEach((t) => t?.kill())
    }
  }, [])

  return (
    <div className="min-h-screen bg-[var(--ink)] text-[var(--cream)]">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-[var(--rule)] bg-[var(--ink)]/85 backdrop-blur-md">
        <div className="shell flex h-14 items-center gap-6">
          <Link to="/" aria-label="SomaiyaNet home">
            <Brand className="text-lg" />
          </Link>
          <nav className="hidden items-center gap-5 lg:flex" aria-label="Story chapters">
            {NAV.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--mute)] transition-colors hover:text-[var(--cream)]"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <PacketTag status={status} className="hidden sm:inline-flex" />
            <Link
              to="/console"
              className="font-mono rounded-full bg-[var(--somaiya)] px-4 py-1.5 text-[11px] uppercase tracking-[0.14em] text-white transition-transform hover:scale-105"
            >
              Console →
            </Link>
          </div>
        </div>
      </header>

      {/* Persistent packet pill for small screens, below the header. */}
      <div className="fixed right-4 top-16 z-40 sm:hidden">
        <PacketTag status={status} />
      </div>

      <main>
        <HeroChapter />
        <CapturedChapter />
        <ReleasedChapter />
        <DecidedChapter />
        <NoStationChapter />
        <DownlinkChapter />
        <BecomesDataChapter />
        <WhoMaySeeChapter />
      </main>
      <StoryFooter />
    </div>
  )
}
