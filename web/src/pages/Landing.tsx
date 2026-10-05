import "@fontsource/geist-sans/latin-300.css";
import { SiteHeader } from "@/landing/SiteHeader";
import { CinematicHero } from "@/landing/hero/CinematicHero";
import { Mission } from "@/landing/Mission";
import { Constraints } from "@/landing/Constraints";
import { PacketStepper } from "@/landing/PacketStepper";
import { Spacecraft } from "@/landing/Spacecraft";
import { GroundNetwork } from "@/landing/GroundNetwork";
import { DatabaseRows } from "@/landing/DatabaseRows";
import { RoleEllipses } from "@/landing/RoleEllipses";
import { CtaBanner } from "@/landing/CtaBanner";
import { Footer } from "@/landing/Footer";

/**
 * Landing rebuilt in the exosat cinematic structure: scroll-scrubbed 3D
 * hero (400vh), then calm sparse sections on pure black with 1px borders.
 */
export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-clip font-light" style={{ background: "#000", color: "#ffffff" }}>
      <SiteHeader />
      <main>
        <CinematicHero />
        <Mission />
        <Constraints />
        <PacketStepper />
        <Spacecraft />
        <GroundNetwork />
        <DatabaseRows />
        <RoleEllipses />
        <CtaBanner />
      </main>
      <Footer />
    </div>
  );
}
