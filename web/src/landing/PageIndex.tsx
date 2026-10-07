import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

interface PageRow {
  readonly to: string;
  readonly title: string;
  readonly caption: string;
}

const ROWS: readonly PageRow[] = [
  {
    to: "/ops",
    title: "Ops",
    caption: "Live globe of the satellites, their contact windows and alerts",
  },
  {
    to: "/routing",
    title: "Routing",
    caption: "Plan a packet's route with cgr_routes() and inspect every hop",
  },
  {
    to: "/brain",
    title: "AI Brain",
    caption: "The decision tree that chooses what each satellite sends",
  },
  {
    to: "/deploy",
    title: "Deploy",
    caption: "Release a satellite from its SomaiyaPod in one transaction",
  },
  {
    to: "/labs/transactions",
    title: "Labs",
    caption: "Transactions, security, indexing, normalization, schema and SQL",
  },
  {
    to: "/console",
    title: "Console",
    caption: "Choose a login role and start",
  },
];

/**
 * PageIndex: a list of the console pages. One inset group,
 * each row a link with a chevron.
 */
export function PageIndex() {
  return (
    <section id="pages" className="sx-section scroll-mt-[72px]">
      <div className="mx-auto max-w-[1200px] px-4 md:px-8">
        <h2 className="sx-h2">Open A Page</h2>
        <div className="sx-group mt-6">
          {ROWS.map((row) => (
            <Link
              key={row.to + row.title}
              to={row.to}
              className="sx-row transition-colors"
              style={{ minHeight: 64, textDecoration: "none" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--sx-surface-2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span>
                <span className="sx-h3 block" style={{ fontSize: 17 }}>
                  {row.title}
                </span>
                <span className="sx-caption mt-1 block">{row.caption}</span>
              </span>
              <ChevronRight size={16} style={{ color: "var(--sx-text-3)", flex: "none" }} />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
