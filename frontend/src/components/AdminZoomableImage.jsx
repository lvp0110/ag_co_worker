import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function AdminZoomableImage({ src, alt = "", className }) {
  const imgRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [zoomSize, setZoomSize] = useState({ width: 0, height: 0 });

  const openZoom = () => {
    const el = imgRef.current;
    if (!el || !src) return;
    const width = Math.round(el.clientWidth * 2);
    const height = Math.round(el.clientHeight * 2);
    if (width < 2 || height < 2) return;
    setZoomSize({ width, height });
    setOpen(true);
  };

  const closeZoom = () => setOpen(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") closeZoom();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <img
        ref={imgRef}
        className={`${className} admin-page__images-zoomable`.trim()}
        src={src}
        alt={alt}
        onClick={openZoom}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openZoom();
          }
        }}
      />
      {open
        ? createPortal(
            <div
              className="admin-page__image-zoom"
              role="dialog"
              aria-modal="true"
              aria-label={alt || "Просмотр изображения"}
              onClick={closeZoom}
            >
              <img
                className="admin-page__image-zoom-img"
                src={src}
                alt={alt}
                style={{ width: zoomSize.width, height: zoomSize.height }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>,
            document.body
          )
        : null}
    </>
  );
}
