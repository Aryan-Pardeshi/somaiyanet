export function HelpHint({ text }: { text: string }) {
  return (
    <span
      className="inline-flex items-center justify-center size-3.5 rounded-full border border-white/20 bg-white/[0.04] text-[9px] font-mono text-[#8b96b0] hover:text-white hover:border-white/50 cursor-help shrink-0 align-middle ml-1 transition-colors"
      title={text}
      aria-label={text}
    >
      ?
    </span>
  );
}
