import { useEffect, useMemo, useRef } from "react";
import BackgroundText from "../components/BackgroundText";
import useBodyClass from "../lib/useBodyClass";

export default function Home() {
  useBodyClass("body-courier");
  const cardRef = useRef<HTMLDivElement | null>(null);
  const isMobile = typeof window !== "undefined" ? window.innerWidth < 768 : false;
  const rows = isMobile ? 50 : 100;
  const cols = isMobile ? 5 : 10;
  const bgClass = useMemo(() => "background-text", []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    document.title = "I LOVE RADEK NEVARIL";
    if (window.innerWidth >= 768 && cardRef.current && (window as any).VanillaTilt) {
      (window as any).VanillaTilt.init(cardRef.current, {
        max: 10,
        speed: 400,
        glare: true,
        "max-glare": 0.05,
      });
    }
  }, []);

  return (
    <div className="page center-page">
      <BackgroundText text="I LOVE RADEK NEVARIL " rows={rows} cols={cols} className={bgClass} />

      <div className="container">
        <div className="profile-card" data-tilt-disable="true" ref={cardRef}>
          <div className="profile-header">
            <div className="avatar" onClick={() => (window.location.href = "/rajnoha")}>
              SR
            </div>
            <div className="username">sebastian rosina</div>
            <div className="status">commits taxfraud</div>
          </div>

          <div className="info-section">
            <div className="info-item">
              <span className="info-label">Status</span>
              <span className="info-value">Gangster (retired pistolnik)</span>
            </div>
            <div className="info-item">
              <span className="info-label">Last Seen</span>
              <span className="info-value">Nove Mesto nad Vahom</span>
            </div>
          </div>

          <div className="footer">est. 2025</div>
        </div>
      </div>
    </div>
  );
}
