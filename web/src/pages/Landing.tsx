import { SiteHeader } from "@/landing/SiteHeader";
import { CinematicHero } from "@/landing/hero/CinematicHero";
import { Mission } from "@/landing/Mission";
import { Constraints } from "@/landing/Constraints";
import { PacketStepper } from "@/landing/PacketStepper";
import { Spacecraft } from "@/landing/Spacecraft";
import { GroundNetwork } from "@/landing/GroundNetwork";
import { DatabaseRows } from "@/landing/DatabaseRows";
import { Footer } from "@/landing/Footer";

/**
 * Landing: scroll-scrubbed 3D hero, then full-width SpaceX-style bands on
 * pure black (docs/design/DESIGN.md).
 */
export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-clip" style={{ background: "#000", color: "#ffffff" }}>
      <SiteHeader />
      <main>
        <CinematicHero />
        <Mission />
        <Constraints />
        <PacketStepper />
        <Spacecraft />
        <GroundNetwork />
        <DatabaseRows />
      </main>
      <Footer />
    </div>
  );
}
