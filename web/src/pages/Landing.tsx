import { useEffect } from "react";
import { SiteHeader } from "@/landing/SiteHeader";
import { LiveHero } from "@/landing/LiveHero";
import { SchemaMap } from "@/landing/SchemaMap";
import { RoleLens } from "@/landing/RoleLens";
import { PageIndex } from "@/landing/PageIndex";
import { Footer } from "@/landing/Footer";

/**
 * Landing: hands-on tool. Header, live route finder hero,
 * schema map, role lens, page index, footer. Pure black.
 */
export default function Landing() {
  useEffect(() => {
    document.title = "SomaiyaNet";
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "#000", color: "#ffffff" }}>
      <SiteHeader />
      <main>
        <LiveHero />
        <SchemaMap />
        <RoleLens />
        <PageIndex />
      </main>
      <Footer />
    </div>
  );
}
