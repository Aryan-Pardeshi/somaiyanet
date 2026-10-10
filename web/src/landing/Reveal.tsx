import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Reveal: a block that rises 18px and fades in the first time it reaches the viewport.
 *
 * Headings split on "\n" and each line sits in its own overflow clip, so the lines slide up
 * one after another instead of the whole block sliding. Runs once. With reduced motion there is
 * no animation at all: the content is simply there.
 */

type RevealTag = "h1" | "h2" | "p" | "div";

/** CSSProperties has no index signature, so the custom property is declared here. */
type RevealStyle = CSSProperties & { "--lx-reveal-delay": string };

const SPLIT_TAGS: readonly RevealTag[] = ["h1", "h2"];

interface RevealProps {
  as: RevealTag;
  /** Milliseconds to wait before the animation starts. */
  delay?: number;
  className?: string;
  children?: ReactNode;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function Reveal({ as, delay = 0, className, children }: RevealProps) {
  const [shown, setShown] = useState(false);
  const nodeRef = useRef<HTMLElement | null>(null);

  const setNode = useCallback((node: HTMLElement | null): void => {
    nodeRef.current = node;
  }, []);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined" || prefersReducedMotion()) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        io.disconnect();
        setShown(true);
      },
      { threshold: 0.35 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const text = typeof children === "string" ? children : null;
  const lines =
    text !== null && SPLIT_TAGS.includes(as) && text.includes("\n") ? text.split("\n") : null;

  const content = lines
    ? lines.map((line, i) => (
        <span className="lx-line" key={i}>
          <span className="lx-line-inner">{line}</span>
        </span>
      ))
    : children;

  const cls = ["lx-reveal", lines ? "lx-reveal--lines" : "", shown ? "is-in" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  const style: RevealStyle = { "--lx-reveal-delay": `${delay}ms` };
  const shared = { className: cls, style, ref: setNode };

  if (as === "h1") return <h1 {...shared}>{content}</h1>;
  if (as === "h2") return <h2 {...shared}>{content}</h2>;
  if (as === "p") return <p {...shared}>{content}</p>;
  return <div {...shared}>{content}</div>;
}

export type { RevealTag };
