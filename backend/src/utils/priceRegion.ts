/**
 * Порт frontend/src/constants/regionSelectOptions.js — slug города из Offer.region
 * → ключ региональных цен в прайсе (msk, ural, kazan, south).
 */

const REGION_KEY_ALIASES: Record<string, string> = {
  msk: "msk",
  moscow: "msk",
  москва: "msk",
  "санкт-петербург": "msk",
  "saint-petersburg": "msk",
  spb: "msk",
  спб: "msk",
  ural: "ural",
  урал: "ural",
  yekaterinburg: "ural",
  екатеринбург: "ural",
  chelyabinsk: "ural",
  челябинск: "ural",
  perm: "ural",
  пермь: "ural",
  tyumen: "ural",
  тюмень: "ural",
  surgut: "ural",
  сургут: "ural",
  novosibirsk: "ural",
  новосибирск: "ural",
  ufa: "ural",
  уфа: "ural",
  south: "south",
  юг: "south",
  krasnodar: "south",
  краснодар: "south",
  kazan: "kazan",
  kasan: "kazan",
  казань: "kazan",
};

/** Значение offer.region (город или ключ) → ключ regionalPrices в /api/v2/data. */
export const resolvePriceRegionKey = (region: string | null | undefined): string => {
  const normalized = String(region ?? "").trim().toLowerCase();
  if (!normalized) return "";
  return REGION_KEY_ALIASES[normalized] ?? normalized;
};

/** Множитель к цене ural (Екатеринбург) для городов с отдельным коэффициентом. */
const URAL_CITY_PRICE_COEFFICIENTS: Record<string, number> = {
  chelyabinsk: 1.05,
  челябинск: 1.05,
  perm: 1.1,
  пермь: 1.1,
  tyumen: 1.1,
  тюмень: 1.1,
  surgut: 1.15,
  сургут: 1.15,
  novosibirsk: 1.05,
  новосибирск: 1.05,
};

export const getPriceRegionCoefficient = (region: string | null | undefined): number => {
  const normalized = String(region ?? "").trim().toLowerCase();
  if (!normalized) return 1;
  return URAL_CITY_PRICE_COEFFICIENTS[normalized] ?? 1;
};
