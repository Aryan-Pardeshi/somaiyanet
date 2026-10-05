import type { ReactNode } from "react";

const KEYWORDS = new Set([
  "SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "CALL", "COMMIT",
  "ROLLBACK", "SAVEPOINT", "WITH", "RECURSIVE", "AS", "CYCLE", "SET",
  "USING", "JOIN", "LATERAL", "DISTINCT", "ON", "ORDER", "BY", "LIMIT",
  "UPDATE", "AND", "OR", "NOT", "NULL", "PROCEDURE", "EXCEPTION",
  "UNION", "ALL", "LEAST", "GREATEST", "GROUP", "HAVING", "COUNT",
  "AVG", "SUM", "EXCEPT", "INTERSECT", "FOR", "SECURITY", "DEFINER",
  "TABLE", "VIEW", "INDEX", "TRIGGER", "CREATE", "DROP", "ALTER",
  "DELETE", "BEGIN", "END", "FUNCTION", "RETURNS", "RETURN",
  "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "CHECK", "DEFAULT",
  "IS", "IN", "BETWEEN", "LIKE", "ILIKE", "EXISTS", "CASE", "WHEN",
  "THEN", "ELSE", "COALESCE", "NULLIF", "CAST", "TRUE", "FALSE",
]);

/**
 * Shared SQL syntax highlighter.
 * Brief 27a:
 * Keywords white, identifiers white 80%, strings #ff9f0a at 90%, comments white 40%.
 */
export function highlightSql(slice: string): ReactNode[] {
  const tokenRegex = /(--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|[a-zA-Z_][a-zA-Z0-9_]*|\s+|[^\s\w'"]+)/g;
  const tokens = slice.match(tokenRegex) || [slice];

  return tokens.map((tok, i) => {
    if (tok.startsWith("--") || tok.startsWith("/*")) {
      return (
        <span key={i} className="text-white/40">
          {tok}
        </span>
      );
    }
    if (tok.startsWith("'")) {
      return (
        <span key={i} style={{ color: "rgba(255, 159, 10, 0.9)" }}>
          {tok}
        </span>
      );
    }
    if (tok.startsWith('"')) {
      return (
        <span key={i} className="text-white/80">
          {tok}
        </span>
      );
    }
    if (KEYWORDS.has(tok.toUpperCase())) {
      return (
        <span key={i} className="font-medium text-white">
          {tok}
        </span>
      );
    }
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tok)) {
      return (
        <span key={i} className="text-white/80">
          {tok}
        </span>
      );
    }
    if (/^[0-9]+(\.[0-9]+)?$/.test(tok)) {
      return (
        <span key={i} className="text-white/80">
          {tok}
        </span>
      );
    }
    return (
      <span key={i} className="text-white/60">
        {tok}
      </span>
    );
  });
}
