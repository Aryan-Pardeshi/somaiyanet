import { Link } from "react-router-dom";
import { Brand } from "@/components/story/Brand";

/**
 * Footer: short and quiet. Hairline, brand, one caption,
 * three links, copyright. No canvas, no animation.
 */
export function Footer() {
  return (
    <footer
      className="w-full bg-black text-white"
      style={{ borderTop: "1px solid var(--sx-hairline)", background: "var(--lx-space, #000000)" }}
    >
      <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-8">
        <div className="flex flex-col gap-6">
          <Brand className="self-start text-[20px]" />
          <p className="sx-caption max-w-[62ch]">
            A DBMS mini project at K J Somaiya, built on PostgreSQL 18, FastAPI and React.
          </p>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-3">
            <Link to="/console" className="sx-link" style={{ fontSize: 14 }}>
              Console
            </Link>
            <Link to="/labs/transactions" className="sx-link" style={{ fontSize: 14 }}>
              Labs
            </Link>
            <Link to="/routing" className="sx-link" style={{ fontSize: 14 }}>
              Routing
            </Link>
          </nav>
          <p className="sx-caption">© 2026 SomaiyaNet</p>
        </div>
      </div>
    </footer>
  );
}
