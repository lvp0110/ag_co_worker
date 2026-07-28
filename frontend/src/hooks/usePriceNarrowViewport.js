import { useEffect, useState } from "react";

/** Совпадает с `@media (max-width: 569px)` в PricePage.css — узкий прайс ниже 570px */
export const PRICE_NARROW_VIEWPORT_MAX_PX = 569;

export function usePriceNarrowViewport() {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(
      `(max-width: ${PRICE_NARROW_VIEWPORT_MAX_PX}px)`,
    );
    const handleChange = () => setNarrow(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return narrow;
}
