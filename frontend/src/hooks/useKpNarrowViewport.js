import { useEffect, useState } from "react";

/** Совпадает с `@media (max-width: 767px)` в KpPage.css — узкий режим ниже 768px */
export const KP_NARROW_VIEWPORT_MAX_PX = 767;

export function useKpNarrowViewport() {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(
      `(max-width: ${KP_NARROW_VIEWPORT_MAX_PX}px)`,
    );
    const handleChange = () => setNarrow(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return narrow;
}
