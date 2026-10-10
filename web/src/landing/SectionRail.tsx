import { RAIL, useActiveSection } from "@/landing/space/scroll";

/**
 * SectionRail: the dot rail on the right edge that names where you are.
 *
 * Desktop only. A hairline with one dot per section; the active one fills and grows, and its
 * label stays out while the rest appear on hover or focus. Every dot is a real button with a
 * 44 px hit area, so the rail works with a keyboard and a finger on a trackpad.
 */
export function SectionRail() {
  const active = useActiveSection();

  const goTo = (id: string): void => {
    const el = document.getElementById(id);
    if (!el) return;
    const still =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  };

  return (
    <nav className="lx-rail" aria-label="Sections">
      <ul className="lx-rail-dots">
        {RAIL.map((scene, i) => (
          <li key={scene.id}>
            <button
              type="button"
              className="lx-rail-dot"
              aria-label={`Go to ${scene.label}`}
              aria-current={active === i ? "true" : undefined}
              onClick={() => goTo(scene.id)}
            >
              <span className="lx-rail-mark" aria-hidden="true" />
              <span className="lx-rail-label" aria-hidden="true">
                {scene.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
