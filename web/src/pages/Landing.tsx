import { useEffect, useRef, useState } from "react";
import "@fontsource/barlow-condensed/300.css";
import "@fontsource/barlow-condensed/400.css";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/lexend/300.css";
import "@fontsource/lexend/400.css";
import "@fontsource/lexend/600.css";
import "@/landing/landing.css";
import { SiteHeader } from "@/landing/SiteHeader";
import { SectionRail } from "@/landing/SectionRail";
import { Footer } from "@/landing/Footer";
import { SpaceScene } from "@/landing/space/SpaceScene";
import { HeroSection } from "@/landing/sections/HeroSection";
import { FleetSection } from "@/landing/sections/FleetSection";
import { DownlinkSection } from "@/landing/sections/DownlinkSection";
import { DatabaseSection } from "@/landing/sections/DatabaseSection";
import { RouteSection } from "@/landing/sections/RouteSection";
import { PacketStepper } from "@/landing/PacketStepper";
import { Spacecraft } from "@/landing/Spacecraft";
import { CursorReadout } from "@/landing/hero/CursorReadout";
import { getNetwork, getSchema, type PublicNetwork, type PublicSchema } from "@/landing/publicApi";

/**
 * Landing: one fixed WebGL scene, four transparent sections scrolling over it (with the packet
 * stepper, route diagram and spacecraft bands restored between Downlink and Database), the footer on the
 * same deep navy-black the scene clears to. Nothing here is a card or a diagram. The live facts
 * come from the public API; if the database is down the copy simply drops its numbers and the
 * page still works.
 */
export default function Landing() {
  const [network, setNetwork] = useState<PublicNetwork | null>(null);
  const [schema, setSchema] = useState<PublicSchema | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.title = "SomaiyaNet";
  }, []);

  useEffect(() => {
    let alive = true;
    getNetwork()
      .then((res) => {
        if (alive) setNetwork(res.data);
      })
      .catch(() => {
        // No network facts; the sections fall back to words.
      });
    getSchema()
      .then((res) => {
        if (alive) setSchema(res.data);
      })
      .catch(() => {
        // No schema counts; the last section falls back to words.
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="lx-root relative min-h-screen">
      <SpaceScene network={network} />
      <SiteHeader />
      <SectionRail />
      <main ref={mainRef} className="relative z-10">
        <HeroSection network={network} />
        <FleetSection network={network} />
        <DownlinkSection network={network} />
        <PacketStepper />
        <RouteSection />
        <Spacecraft />
        <DatabaseSection schema={schema} />
      </main>
      <CursorReadout targetRef={mainRef} />
      <div className="relative z-10" style={{ background: "var(--lx-space)" }}>
        <Footer />
      </div>
    </div>
  );
}