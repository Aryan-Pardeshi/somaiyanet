import { Link } from "react-router-dom";
import { Reveal } from "@/landing/Reveal";
import type { PublicNetwork, PublicSatellite } from "@/landing/publicApi";

const NUMBER_WORDS = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
] as const;

interface StatusLine {
  tone: "ok" | "warn" | "neutral";
  label: string;
}

/** "Four" for the four we fly, the word for any count up to ten, digits past that. */
function fleetWord(satellites: PublicSatellite[] | undefined): string {
  const n = satellites?.length;
  if (n === undefined || n === 4) return "Four";
  if (n >= 1 && n <= 10) return NUMBER_WORDS[n];
  return String(n);
}

/** A state nobody here knows still gets read out, in Title Case. */
function titleCase(state: string): string {
  return state
    .trim()
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function statusFor(satellite: PublicSatellite): StatusLine {
  switch (satellite.state.trim().toUpperCase()) {
    case "NOMINAL":
      return { tone: "ok", label: "Nominal" };
    case "SAFE":
      return { tone: "warn", label: "Safe mode" };
    case "STOWED":
      return { tone: "neutral", label: "Stowed" };
    default:
      return { tone: "neutral", label: titleCase(satellite.state) };
  }
}

interface FleetSectionProps {
  network: PublicNetwork | null;
}

/** Second scene: the fleet itself and what the satellites do with the data they hold. */
export function FleetSection({ network }: FleetSectionProps) {
  const satellites = network?.satellites ?? [];
  const showStatus = network !== null && satellites.length > 0;

  return (
    <section id="satellites" className="lx-section lx-section--satellites">
      <div className="lx-block">
        <Reveal as="div" className="lx-label">
          Meet The Fleet
        </Reveal>
        <Reveal as="h2" className="lx-h2">
          {`${fleetWord(network?.satellites)} PocketQubes\nIn Low Earth Orbit`}
        </Reveal>
        <div className="lx-cols">
          <Reveal as="p" className="lx-body" delay={140}>
            Each satellite is a stack of 5 cm cubes that stores what it collects until it can
            pass it on.
          </Reveal>
          <Reveal as="p" className="lx-body" delay={220}>
            When two satellites are in range they hand packets to each other, so data hops to
            whichever one meets a ground station first.
          </Reveal>
        </div>
        {showStatus && (
          <Reveal as="div" className="lx-cta" delay={300}>
            <ul className="lx-status-line">
              {satellites.map((satellite) => {
                const status = statusFor(satellite);
                return (
                  <li className="lx-status-item" key={satellite.id}>
                    <span className="lx-sat-id">{satellite.id}</span>
                    <span className="sx-status" data-tone={status.tone}>
                      {status.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Reveal>
        )}
        <Reveal as="div" className="lx-cta" delay={380}>
          <Link className="sx-btn lx-btn" to="/ops">
            Watch Them Live
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
