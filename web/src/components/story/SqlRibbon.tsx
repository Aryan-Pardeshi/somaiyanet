import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ScrollTrigger } from "@/lib/gsap";
import { cn } from "@/lib/utils";

const KEYWORDS = new Set([
  "SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "CALL", "COMMIT",
  "ROLLBACK", "SAVEPOINT", "WITH", "RECURSIVE", "AS", "CYCLE", "SET",
  "USING", "JOIN", "LATERAL", "DISTINCT", "ON", "ORDER", "BY", "LIMIT",
  "UPDATE", "AND", "OR", "NOT", "NULL", "PROCEDURE", "EXCEPTION",
  "UNION", "ALL", "LEAST", "GREATEST",
]);

function highlight(slice: string): ReactNode[] {
  const parts = slice.split(/(\s+|[(),;])/g);
  return parts.map((tok, i) => {
    if (KEYWORDS.has(tok.toUpperCase())) {
      return (
        <span key={i} className="font-semibold text-white">
          {tok}
        </span>
      );
    }
    return <span key={i}>{tok}</span>;
  });
}

/**
 * A strip of real SQL in `.sx-code`, labelled with `.sx-eyebrow` and a
 * quiet copy/show button. Typing starts when scrolled into view (once);
 * reduced motion shows the full text immediately.
 */
export function SqlRibbon({
  sql,
  caption,
  className,
}: {
  sql: string;
  caption?: string;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const full = useMemo(() => sql.trim(), [sql]);
  const [typed, setTyped] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? full.length
      : 0,
  );
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const el = boxRef.current;
    if (!el) return;
    let timer: number | undefined;
    const st = ScrollTrigger.create({
      trigger: el,
      start: "top 85%",
      once: true,
      onEnter: () => {
        let n = 0;
        timer = window.setInterval(() => {
          n += 3;
          if (n >= full.length) {
            n = full.length;
            if (timer !== undefined) window.clearInterval(timer);
          }
          setTyped(n);
        }, 16);
      },
    });
    return () => {
      st.kill();
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [full]);

  const slice = full.slice(0, typed);
  const done = typed >= full.length;
  const long = full.length > 420;
  const visible = !long || expanded ? slice : slice.slice(0, 420);

  const onCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <figure className={cn("w-full", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="sx-eyebrow">SQL</span>
        <div className="flex items-center gap-1">
          {long && done && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="sx-btn sx-btn--quiet sx-btn--sm"
              aria-expanded={expanded}
            >
              {expanded ? "Show less" : "Show all"}
            </button>
          )}
          <button
            type="button"
            onClick={() => void onCopy()}
            className="sx-btn sx-btn--quiet sx-btn--sm"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <div ref={boxRef} className="sx-code overflow-x-auto">
        <pre className="whitespace-pre-wrap">
          {highlight(visible)}
          {!done && (
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block h-[1em] w-[0.55em] translate-y-[0.15em] bg-white motion-safe:animate-pulse"
            />
          )}
        </pre>
      </div>
      {caption && <figcaption className="sx-caption mt-2">{caption}</figcaption>}
    </figure>
  );
}
