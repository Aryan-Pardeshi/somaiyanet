/** Footer: credits + earth horizon with PocketQube silhouette. */
export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black" style={{ background: "#000" }}>
      <div className="mx-auto grid max-w-[1200px] gap-8 px-6 py-12 md:grid-cols-2">
        <div>
          <p className="flex items-center gap-2 text-white">
            <span aria-hidden="true" className="inline-block size-[8px] rounded-full" style={{ background: "var(--somaiya)" }} />
            <span className="text-[16px] font-light">SomaiyaNet</span>
          </p>
          <p className="mt-3 text-[13px]" style={{ color: "#9aa3b8" }}>
            DBMS mini project · K J Somaiya
          </p>
          <p className="mt-1 text-[13px]" style={{ color: "#9aa3b8" }}>
            Dr. Umesh Shinde, KJSIT · Dr. Shailesh Nikam, KJSSE · ReOrbit, Finland
          </p>
        </div>
        <div className="md:text-right">
          <p className="text-[13px]" style={{ color: "#9aa3b8" }}>Team: Aryan and Teammate</p>
          <p className="mt-1 text-[13px]" style={{ color: "#9aa3b8" }}>
            Use case KJS-SRS-01 · SomaiyaSat PocketQube · SomaiyaPod deployer
          </p>
        </div>
      </div>
      <div className="relative h-28 overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-x-[-20%] bottom-[-140px] h-[220px] rounded-[50%]"
          style={{
            backgroundImage: `url(${import.meta.env.BASE_URL}assets/textures/earth_day.jpg)`,
            backgroundSize: "cover",
            backgroundPosition: "center top",
          }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-[-20%] bottom-[-140px] h-[220px] rounded-[50%]"
          style={{ boxShadow: "0 -2px 24px rgba(110,168,255,0.55), inset 0 2px 12px rgba(110,168,255,0.35)" }}
        />
        <div aria-hidden="true" className="absolute bottom-14 left-1/2 h-3 w-5 -translate-x-1/2 border border-white/70" />
        <p className="absolute bottom-2 right-6 text-[11px]" style={{ color: "#9aa3b8" }}>
          NASA Blue Marble imagery
        </p>
      </div>
    </footer>
  );
}
