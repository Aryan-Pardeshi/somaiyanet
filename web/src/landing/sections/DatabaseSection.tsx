import { Link } from "react-router-dom";
import { Reveal } from "@/landing/Reveal";
import type { PublicSchema } from "@/landing/publicApi";

interface DatabaseSectionProps {
  schema: PublicSchema | null;
}

/** Last scene: the one database behind every screen, and the way into it. */
export function DatabaseSection({ schema }: DatabaseSectionProps) {
  const body = schema
    ? `${schema.tables.length} tables, ${schema.counts.functions} functions, ${schema.counts.triggers} triggers and row-level security decide who can see and change what. Every screen in the console shows the SQL behind it.`
    : "Tables, functions, triggers and row-level security decide who can see and change what. Every screen in the console shows the SQL behind it.";

  return (
    <section id="database" className="lx-section lx-section--database">
      <div className="lx-block">
        <Reveal as="div" className="lx-label">
          Under The Hood
        </Reveal>
        <Reveal as="h2" className="lx-h2">
          {"One Database\nRuns The Whole Mission"}
        </Reveal>
        <Reveal as="p" className="lx-body lx-body--wide" delay={140}>
          {body}
        </Reveal>
        <Reveal as="div" className="lx-cta" delay={260}>
          <Link className="sx-btn sx-btn--filled lx-btn" to="/console">
            Open Console
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
