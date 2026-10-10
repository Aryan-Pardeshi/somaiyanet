import React, { useEffect, useRef, useState, useCallback } from "react";
import "./AnimationLoader.css";

export interface AnimationLoaderProps {
  /**
   * Brand name text displayed at the top left.
   * Defaults to "SOMAIYANET®" (matches Framer's signature "bsr®" style).
   */
  brandName?: string;
  /**
   * Total duration of the counter and progress bar in seconds.
   * Default: 3s (from Framer component).
   */
  counterDuration?: number;
  /**
   * Text and line color.
   * Dark mode default: "#ffffff".
   */
  textColor?: string;
  /**
   * Background color of the loader curtain.
   * Dark mode default: "#000000".
   */
  backgroundColor?: string;
  /**
   * Optional mission / project sub-label (e.g. "KJS-SRS-01 · ORBITAL DBMS").
   */
  metaLabel?: string;
  /**
   * Whether clicking anywhere or pressing Escape allows skipping the intro.
   * Default: true.
   */
  allowSkip?: boolean;
  /**
   * Callback fired once the curtain exit transition has fully completed.
   */
  onComplete?: () => void;
}

type LoaderVariant = "variant-1" | "variant-2" | "variant-3" | "finished";

/**
 * AnimationLoader
 * Direct high-fidelity implementation of Framer's Animation Loader component
 * (https://framer.com/m/Animation-loader-eHagKV.js@ijRh61gfd3rmanud1uxr)
 *
 * Variants:
 *  - Variant 1: Initial mount state (brand character blur, bar 0 width, counter 0%).
 *  - Variant 2: Progressing (3s duration tween expanding bar, spring counter 0-100%).
 *  - Variant 3: Exit transition (at 3.1s, border-radius morphs to 50% dome, curtain pulls up).
 *  - Finished: Cleanly unmounts and hands over full pointer events to the page.
 */
export function AnimationLoader({
  brandName = "SOMAIYANET®",
  counterDuration = 3,
  textColor = "#ffffff",
  backgroundColor = "#000000",
  metaLabel = "KJS-SRS-01 · DBMS MISSION CONTROL",
  allowSkip = true,
  onComplete,
}: AnimationLoaderProps) {
  const [variant, setVariant] = useState<LoaderVariant>("variant-1");
  const [count, setCount] = useState<number>(0);
  const [animateChars, setAnimateChars] = useState<boolean>(false);

  const reqIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const exitTimeoutRef = useRef<number | null>(null);
  const finishTimeoutRef = useRef<number | null>(null);

  // Trigger exit sequence (Variant 3)
  const triggerExit = useCallback(() => {
    setCount(100);
    setVariant("variant-3");

    // Exit transition duration is ~700ms (matching Framer's transition1: 0.6s)
    if (finishTimeoutRef.current) clearTimeout(finishTimeoutRef.current);
    finishTimeoutRef.current = window.setTimeout(() => {
      setVariant("finished");
      if (onComplete) onComplete();
    }, 750);
  }, [onComplete]);

  // Skip loader on user action
  const handleSkip = useCallback(
    (e?: React.MouseEvent) => {
      if (!allowSkip || variant === "variant-3" || variant === "finished") return;
      if (e) e.stopPropagation();
      if (reqIdRef.current) cancelAnimationFrame(reqIdRef.current);
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
      triggerExit();
    },
    [allowSkip, variant, triggerExit]
  );

  // Restart / Replay sequence
  const startAnimation = useCallback(() => {
    if (reqIdRef.current) cancelAnimationFrame(reqIdRef.current);
    if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
    if (finishTimeoutRef.current) clearTimeout(finishTimeoutRef.current);

    setVariant("variant-1");
    setCount(0);
    setAnimateChars(false);
    startTimeRef.current = null;

    // Immediately trigger Variant 2 on appear (like Framer's onAppear callback)
    const appearTimer = window.setTimeout(() => {
      setVariant("variant-2");
      setAnimateChars(true);

      const durationMs = counterDuration * 1000;

      // Silky counter animation with easeOutCubic curve
      const animateCounter = (timestamp: number) => {
        if (!startTimeRef.current) startTimeRef.current = timestamp;
        const elapsed = timestamp - startTimeRef.current;
        const progress = Math.min(elapsed / durationMs, 1);

        // Cubic easing matching Framer spring feel
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentCount = Math.round(easeOut * 100);
        setCount(currentCount);

        if (progress < 1) {
          reqIdRef.current = requestAnimationFrame(animateCounter);
        } else {
          setCount(100);
        }
      };

      reqIdRef.current = requestAnimationFrame(animateCounter);

      // Framer schedules Variant 3 at counterDuration + 100ms (3100ms default)
      exitTimeoutRef.current = window.setTimeout(() => {
        triggerExit();
      }, durationMs + 100);
    }, 30);

    return () => clearTimeout(appearTimer);
  }, [counterDuration, triggerExit]);

  // Initial play on mount
  useEffect(() => {
    const cleanup = startAnimation();
    return () => {
      cleanup?.();
      if (reqIdRef.current) cancelAnimationFrame(reqIdRef.current);
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
      if (finishTimeoutRef.current) clearTimeout(finishTimeoutRef.current);
    };
  }, [startAnimation]);

  // Listen for global replay events
  useEffect(() => {
    const handleReplay = () => {
      startAnimation();
    };
    window.addEventListener("somaiyanet:replay-loader", handleReplay);
    return () => {
      window.removeEventListener("somaiyanet:replay-loader", handleReplay);
    };
  }, [startAnimation]);

  // Escape key to skip
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && allowSkip) {
        handleSkip();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [allowSkip, handleSkip]);

  if (variant === "finished") {
    return null;
  }

  // Tokenize characters for the signature blur-in spring effect
  const characters = Array.from(brandName);

  return (
    <aside
      className={`fl-root fl-${variant} ${animateChars ? "fl-animate-chars" : ""}`}
      style={
        {
          "--loader-bg": backgroundColor,
          "--loader-text": textColor,
          "--loader-line": textColor,
        } as React.CSSProperties
      }
      onClick={allowSkip ? () => handleSkip() : undefined}
      aria-label="Loading SomaiyaNet"
      role="status"
    >
      <div className="fl-container-wrap">
        <div className="fl-container-mask">
          <div className="fl-glow-ambient" />
          <div className="fl-content-container">
            {/* Top: Brand wordmark with character blur-spring appearance */}
            <div className="fl-top-block-wrap">
              <h1 className="fl-brand-name">
                {characters.map((char, index) => (
                  <span
                    key={`${char}-${index}`}
                    className="fl-char"
                    style={{
                      transitionDelay: `${0.04 * index}s`,
                    }}
                  >
                    {char === " " ? "\u00A0" : char}
                  </span>
                ))}
              </h1>
            </div>

            {/* Middle: Expanding horizontal line */}
            <div className="fl-middle">
              <div
                className="fl-bar-mask"
                style={{
                  transitionDuration: `${counterDuration}s`,
                }}
              >
                <div className="fl-bar-line" />
              </div>
            </div>

            {/* Bottom Row: Meta label on left, Giant typographic counter on right */}
            <div className="fl-bottom-row">
              <div className="fl-bottom-meta">
                <span>{metaLabel}</span>
                {allowSkip && (
                  <button
                    type="button"
                    className="fl-skip-btn"
                    onClick={handleSkip}
                    title="Press Esc or click to skip intro"
                  >
                    Skip [Esc]
                  </button>
                )}
              </div>
              <div className="fl-counter-wrapper">
                <div className="fl-counter-display">
                  <span>{count}</span>
                  <span className="fl-counter-percent">%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default AnimationLoader;
