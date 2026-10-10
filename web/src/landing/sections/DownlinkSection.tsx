import { Link } from "react-router-dom";
import { Reveal } from "@/landing/Reveal";
import type { PublicNetwork } from "@/landing/publicApi";

interface DownlinkSectionProps {
  network: PublicNetwork | null;
}

/** Third scene: the short windows in which a satellite can actually reach the ground. */
export function DownlinkSection({ network }: DownlinkSectionProps) {
  const stations = network
    ? network.stations.map((station) =>
        station.primary ? `${station.name} (primary)` : station.name
      )
    : null;

  return (
    <section id="downlink" className="lx-section lx-section--downlink">
      <div className="lx-block">
        {/* The reference draws the beam into the Earth above the label: 2px lime, fading in at
            the top, ending in a white ring. It draws itself when the section arrives. */}
        <Reveal as="div" className="lx-beam">
          <span className="lx-beam-line" aria-hidden="true" />
          <span className="lx-beam-dot" aria-hidden="true" />
        </Reveal>
        <Reveal as="div" className="lx-label">
          How Data Gets Home
        </Reveal>
        <Reveal as="h2" className="lx-h2">
          {"Data Comes Down\nIn Short Windows"}
        </Reveal>
        <Reveal as="p" className="lx-body lx-body--route" delay={140}>
          A satellite can only talk to a ground station for a few minutes as it passes overhead.
          The database computes every one of these windows from the orbits, then finds the
          earliest way to get each packet home.
        </Reveal>
        {stations && stations.length > 0 && (
          <Reveal as="p" className="lx-meta" delay={240}>
            {stations.join(", ")}
          </Reveal>
        )}
        <Reveal as="div" className="lx-cta" delay={320}>
          <Link className="sx-btn lx-btn" to="/routing">
            Plan A Route
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
