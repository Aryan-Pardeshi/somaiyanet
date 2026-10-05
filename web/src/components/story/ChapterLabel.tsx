import { cn } from "@/lib/utils";

/**
 * Quiet section label: a small white dot plus DIN caps words.
 */
export function ChapterLabel({
  index,
  title,
  className,
}: {
  index: string;
  title: string;
  className?: string;
}) {
  return (
    <p className={cn("sx-eyebrow flex items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className="inline-block size-[6px] shrink-0 rounded-full bg-white"
      />
      Chapter {Number.parseInt(index, 10)} · {title}
      <span className="sr-only">{` (section ${index}: ${title})`}</span>
    </p>
  );
}
