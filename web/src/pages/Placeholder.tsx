// adapted from lakshyamody/dbmsproj (landing)
import { Link, useParams } from "react-router-dom"
import { TopBar } from "@/components/layout/TopBar"
import { Footer } from "@/components/layout/Footer"

export function Placeholder({ name }: { name: string }) {
  const { lab } = useParams()
  const label = lab ? `${name} / ${lab}` : name
  return (
    <div className="min-h-screen bg-black text-white">
      <TopBar />
      <main className="shell flex min-h-[70vh] flex-col items-start justify-center py-32">
        <p className="mono-label text-[#3d6bff]">[ COMING ONLINE ]</p>
        <h1 className="mt-6 font-semibold tracking-[-0.03em]" style={{ fontSize: "clamp(36px, 5vw, 72px)" }}>
          {label}
        </h1>
        <p className="mt-4 max-w-[60ch] text-sm leading-[1.8] text-[#8a8a93]">
          This console module is stubbed for a later task. The landing page at{" "}
          <Link to="/" className="text-white underline">/</Link> is live.
        </p>
        <Link to="/" className="mono-label mt-8 text-[#3d6bff]">← back to launch</Link>
      </main>
      <Footer />
    </div>
  )
}
