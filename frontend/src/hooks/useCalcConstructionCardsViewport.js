import { useEffect, useState } from "react";

/** Совпадает с `@media (max-width: 429px)` — список конструкций калькулятора карточками */
export const CALC_CONSTRUCTION_CARDS_MAX_PX = 429;

export function useCalcConstructionCardsViewport() {
  const [cardsLayout, setCardsLayout] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(
      `(max-width: ${CALC_CONSTRUCTION_CARDS_MAX_PX}px)`,
    );
    const handleChange = () => setCardsLayout(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return cardsLayout;
}
