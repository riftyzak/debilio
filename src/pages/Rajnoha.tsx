import { useEffect, useMemo, useRef } from "react";
import BackgroundText from "../components/BackgroundText";
import useBodyClass from "../lib/useBodyClass";

const galleryItems = [
  { src: "/assets/1.webp", caption: "ricardo" },
  { src: "/assets/2.webp", caption: "alu" },
  { src: "/assets/3.webp", caption: "alza.sk" },
  { src: "/assets/4.webp", caption: "gandalf?" },
  { src: "/assets/5.webp", caption: "jumpscare" },
  { src: "/assets/6.webp", caption: "alza.sk #2" },
];

export default function Rajnoha() {
  useBodyClass("body-courier");
  const isMobile = typeof window !== "undefined" ? window.innerWidth < 768 : false;
  const rows = isMobile ? 50 : 100;
  const cols = isMobile ? 5 : 10;
  const bgClass = useMemo(() => "background-text", []);
  const itemRefs = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    document.title = "Rajnoha Gallery";
    if (window.innerWidth >= 768 && (window as any).VanillaTilt) {
      (window as any).VanillaTilt.init(itemRefs.current, {
        max: 5,
        speed: 400,
        glare: true,
        "max-glare": 0.05,
      });
    }
  }, []);

  return (
    <div className="page rajnoha-page">
      <BackgroundText text="I LOVE RADEK NEVARIL " rows={rows} cols={cols} className={bgClass} />

      <a href="/" className="back-button">
        ← Back
      </a>
      <a href="/rosina-shop" className="shop-button">
        <i className="fas fa-store"></i> Rosina Shop
      </a>

      <div className="container">
        <div className="header">
          <div className="title">Rajnoha Gallery</div>
          <div className="subtitle">“Exclusive” collection of moments</div>
        </div>

        <div className="gallery">
          {galleryItems.map((item, index) => (
            <div
              key={item.src}
              className="gallery-item"
              data-tilt-disable="true"
              ref={(el) => {
                if (el) itemRefs.current[index] = el;
              }}
            >
              <div className="image-container">
                <img src={item.src} alt={item.caption} loading="lazy" />
              </div>
              <div className="image-caption">{item.caption}</div>
            </div>
          ))}
        </div>

        <div className="upload-note">Exclusive gallery for rajnoha. Image uploads are restricted.</div>
      </div>
    </div>
  );
}
