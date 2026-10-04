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
    <div className="min-h-screen bg-[var(--space)] text-[var(--text)]">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-[var(--line)] bg-[var(--space)]/85 backdrop-blur-md">
        <div className="shell flex h-14 items-center gap-6">
          <Link to="/" aria-label="SomaiyaNet home">
            <Brand className="text-lg" />
          </Link>
          <nav className="hidden items-center gap-5 lg:flex" aria-label="Story chapters">
            {NAV.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="text-[13px] text-[var(--text-2)] transition-colors hover:text-[var(--text)]"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <PacketTag status={status} className="hidden sm:inline-flex" />
            <Link
              to="/console"
              className="h-9 rounded-lg bg-[var(--ice)] px-4 py-2 text-[13px] font-semibold text-[#04122e] hover:bg-[var(--ice-strong)]"
            >
              Take the console
            </Link>
          </div>
        </div>
      </header>

      {/* Persistent packet pill for small screens, below the header. */}
      <div className="fixed right-4 top-16 z-40 sm:hidden">
        <PacketTag status={status} />
      </div>

      <main className="[&>section:nth-child(even)]:bg-[var(--navy-900)]">
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
