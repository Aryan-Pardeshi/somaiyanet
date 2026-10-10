import { Reveal } from "@/landing/Reveal";
import type { PublicNetwork } from "@/landing/publicApi";

/* Lower case: both counts sit mid-sentence, and the sentence's first word gets its own cap. */
const NUMBER_WORDS = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
] as const;

/** "four" for the four we fly, the word for any count up to ten, digits past that. */
function countWord(n: number): string {
  if (n >= 1 && n <= 10) return NUMBER_WORDS[n];
  return String(n);
}

/** "Four" from "four", for the one count that opens the line. */
function sentenceCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

interface HeroSectionProps {
  network: PublicNetwork | null;
}

/**
 * First scene: the promise. One headline across a wide screen, the lime sub line under it and a
 * ghost pill below, all centred above the Earth.
 */
export function HeroSection({ network }: HeroSectionProps) {
  const sub = network
    ? `${sentenceCase(countWord(network.satellites.length))} PocketQubes, ${countWord(
        network.stations.length
      )} ground stations, one PostgreSQL database planning every downlink.`
    : "A fleet of PocketQubes and the one PostgreSQL database that plans every downlink.";

  return (
    <section id="network" className="lx-section lx-section--network">
      <div className="lx-block">
        <Reveal as="h1" className="lx-display">
          Satellites That Route Themselves
        </Reveal>
        <Reveal as="p" className="lx-sub" delay={120}>
          {sub}
        </Reveal>
        <Reveal as="div" className="lx-cta" delay={280}>
          <a className="sx-btn lx-btn" href="#satellites">
            See How It Works
          </a>
        </Reveal>
      </div>
    </section>
  );
}