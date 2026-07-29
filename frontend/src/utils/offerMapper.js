import { resolveDisplayCipher } from "./calculations.js";
import {
  getItemsAgIdKeyMap,
  itemsBaseTableName,
  resolveItemsDisplayMeta,
} from "./itemsCatalog.js";

/** Сохраняет UI-название в calc_params из ItemsBase (не из API-каталога). */
function mergeUiDisplayIntoCalcParams(calcParams, ui) {
  if (!calcParams || typeof calcParams !== "object") return calcParams;
  const cipher = resolveDisplayCipher(calcParams.Code, getItemsAgIdKeyMap());
  const sectionId = ui?.section_id || calcParams.SectionId;
  const fromItems = resolveItemsDisplayMeta({
    calcCode: calcParams.Code,
    cipher,
    sectionId,
    catalogId: ui?.catalog_id ?? ui?.id,
  });
  const title = itemsBaseTableName(fromItems);
  const description = fromItems.description;
  const next = { ...calcParams };
  if (title) next.DisplayTitle = title;
  if (description) next.DisplayDescription = description;
  return next;
}

/**
 * Конструкции для POST /api/offers → 1С.
 * Возвращает [{ calc_params }] из состояния калькулятора.
 */
export function buildCreateOfferPayload({
  constrToCalcToSent,
  constrToCalc,
}) {
  const constructions = constrToCalcToSent.map((calcParams, index) => ({
    calc_params: mergeUiDisplayIntoCalcParams(
      calcParams,
      (constrToCalc || [])[index],
    ),
  }));

  return {
    offerDraft: {
      constructions,
    },
  };
}
