import { cn } from "@/lib/utils";

/**
 * SomaiyaNet logo: a wide, engineered uppercase wordmark (Michroma) with one
 * tapered launch-trajectory swoosh that runs under the word and climbs past
 * its end, finishing in the red packet dot. Everything is sized in em, so the
 * logo scales with the font size set through `className` (e.g. "text-lg").
 */

// Swoosh drawn in a 200x39 box that spans the word plus the climb-out on the
// right. Outer edge then inner edge back, so it tapers from a hairline at the
// start to its full width at the tip.
const SWOOSH = "M 2 31 Q 170 44 197 5 L 196.2 8.6 Q 166 40.2 2 31 Z";

export function Brand({ className }: { className?: string }) {
  return (
    <span
      className={cn("relative inline-flex select-none items-center leading-none text-white", className)}
      style={{ paddingRight: "2.1em", paddingTop: "0.5em", paddingBottom: "0.45em" }}
    >
      <span
        aria-hidden="true"
        className="relative z-10 uppercase"
        style={{ fontFamily: "Michroma, var(--font-sans)", letterSpacing: "0.14em", fontSize: "0.8em" }}
      >
        <span style={{ color: "#ffffff" }}>Somaiya</span>
        <span style={{ color: "rgba(255, 255, 255, 0.7)" }}>Net</span>
      </span>
      <svg
        aria-hidden="true"
        viewBox="0 0 200 39"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <path d={SWOOSH} fill="#ffffff" />
      </svg>
      {/* The packet at the end of the trajectory (an HTML dot so it stays round). */}
      <span
        aria-hidden="true"
        className="absolute rounded-full"
        style={{
          width: "0.26em",
          height: "0.26em",
          right: "0.08em",
          top: "0.12em",
          background: "#ff453a",
        }}
      />
      <span className="sr-only">SomaiyaNet</span>
    </span>
  );
}

/** The trajectory and packet alone, for tight spots and the favicon. */
export function BrandMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={cn("shrink-0", className)}>
      <path d="M 2 20 Q 15 24 21 5 L 20 4.6 Q 13.5 21.6 2 20 Z" fill="#ffffff" />
      <circle cx="21" cy="4" r="2.1" fill="#ff453a" />
    </svg>
  );
}
