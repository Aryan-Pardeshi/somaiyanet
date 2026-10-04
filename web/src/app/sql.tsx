import type { ReactNode } from "react";

const KEYWORDS = new Set([
  "SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "CALL", "COMMIT",
  "ROLLBACK", "SAVEPOINT", "WITH", "RECURSIVE", "AS", "CYCLE", "SET",
  "USING", "JOIN", "LATERAL", "DISTINCT", "ON", "ORDER", "BY", "LIMIT",
  "UPDATE", "AND", "OR", "NOT", "NULL", "PROCEDURE", "EXCEPTION",
  "UNION", "ALL", "LEAST", "GREATEST", "GROUP", "HAVING", "COUNT",
  "AVG", "SUM", "EXCEPT", "INTERSECT", "FOR", "SECURITY", "DEFINER",
]);

/**
 * Shared SQL keyword highlighter (extracted from SqlRibbon's logic so both
 * the landing ribbon and the "SQL under the hood" drawer match).
 * Keywords render amber, identifiers cream.
 */
export function highlightSql(slice: string): ReactNode[] {
  const parts = slice.split(/(\s+|[(),;])/g);
  return parts.map((tok, i) =>
    KEYWORDS.has(tok.toUpperCase()) ? (
      <span key={i} className="text-[var(--amber)]">
        {tok}
      </span>
    ) : (
      <span key={i}>{tok}</span>
    ),
  );
}
