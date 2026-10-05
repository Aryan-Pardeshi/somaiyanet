import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Quiet framed figure: one inset-grouped surface with a `.sx-caption`
 * underneath. No coloured borders, no glows.
 */
export function LineArtBox({
  caption,
  children,
  className,
}: {
  caption: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("w-full", className)}>
      <div className="sx-group p-4">{children}</div>
      <figcaption className="sx-caption mt-2">{caption}</figcaption>
    </figure>
  );
}
