import { Link } from "react-router-dom";

/** CTA banner: blurred earth horizon + navy overlay + solid royal button. */
export function CtaBanner() {
  return (
    <section className="bg-black px-6 py-24" style={{ background: "#000" }}>
      <div className="relative mx-auto max-w-[1200px] overflow-hidden border border-white/15">
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${import.meta.env.BASE_URL}assets/textures/earth_day.jpg)`,
            backgroundSize: "cover",
            backgroundPosition: "center 70%",
            filter: "blur(18px)",
            transform: "scale(1.15)",
          }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: "rgba(5,11,38,0.72)" }}
        />
        <div className="relative flex flex-col items-center px-6 py-20 text-center">
          <h2 className="max-w-[16ch] font-light text-white" style={{ fontSize: 44, lineHeight: 1.1 }}>
            Watch Postgres fly a satellite.
          </h2>
          <Link
            to="/console"
            className="mt-8 inline-block px-8 py-4 text-[15px] font-semibold text-white"
            style={{ background: "var(--royal)" }}
          >
            Take the console ↗
          </Link>
        </div>
      </div>
    </section>
  );
}
