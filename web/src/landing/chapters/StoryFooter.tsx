import { Brand } from "@/components/story/Brand"

/**
 * Footer: project credit, faculty owners, collaborator, texture credit and
 * team placeholders.
 */
export function StoryFooter() {
  return (
    <footer className="border-t border-[var(--line)] bg-[var(--navy-800)]">
      <div className="shell grid gap-10 py-16 md:grid-cols-[minmax(0,6fr)_minmax(0,6fr)]">
        <div>
          <Brand className="text-2xl" />
          <p className="mt-4 max-w-[52ch] text-[14px] leading-relaxed text-[var(--text-2)]">
            SomaiyaNet — DBMS mini project, K J Somaiya. Eight PocketQubes, one
            database deciding what reaches Earth.
          </p>
          <p className="font-mono mt-4 text-[11px] uppercase tracking-[0.18em] text-[var(--text-3)]">
            Faculty owners
          </p>
          <p className="mt-1 text-[14px] text-[var(--text-2)]">
            Dr. Umesh Shinde (KJSIT) · Dr. Shailesh Nikam (KJSSE)
          </p>
          <p className="mt-1 text-[14px] text-[var(--text-2)]">
            Collaborator: ReOrbit, Finland
          </p>
        </div>
        <div className="text-[13.5px] leading-relaxed text-[var(--text-3)]">
          <p>
            Credits: NASA Blue Marble textures (used on /ops); orbit-math and
            globe textures adapted from lakshyamody/dbmsproj.
          </p>
          <p className="mt-3">Team: Aryan, Teammate.</p>
          <p className="font-mono mt-6 text-[11px] uppercase tracking-[0.18em]">
            SomaiyaNet · KJS-SRS-01 · DBMS mini project
          </p>
        </div>
      </div>
    </footer>
  )
}
