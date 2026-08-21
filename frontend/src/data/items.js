import ItemsBase from "./itemsBase.js";

/** Fallback template/size_limit_id, пока лимиты не заведены в админке. */
export { ItemsBase };
export default ItemsBase;

let itemsWithApiImagesCache = null;
let itemsWithApiImagesInFlight = null;
const ITEMS_WITH_IMAGES_CACHE_VERSION = 6;

const loadItemsWithApiImages = async () => {
  const { listPublicConstructions } = await import(
    "../services/constructionApi.js"
  );
  const { calcItemsFromPublicConstructions } = await import(
    "../utils/isolationCalcV2.js"
  );
  const { getImageUrl } = await import("../services/api.js");

  const rows = await listPublicConstructions();
  const catalog = calcItemsFromPublicConstructions(rows, ItemsBase);
  return catalog.map((item) => ({
    ...item,
    Img: item.imageUrl ? getImageUrl(item.imageUrl) : null,
    CadImg: item.cadImageUrl ? getImageUrl(item.cadImageUrl) : null,
  }));
};

/**
 * Каталог калькулятора: GET /api/v2/constructions/sound
 * (публичное чтение тех же конструкций, что в админке).
 */
export const getItemsWithApiImages = async () => {
  if (
    itemsWithApiImagesCache &&
    itemsWithApiImagesCache.version === ITEMS_WITH_IMAGES_CACHE_VERSION
  ) {
    return itemsWithApiImagesCache.items;
  }
  if (!itemsWithApiImagesInFlight) {
    itemsWithApiImagesInFlight = loadItemsWithApiImages()
      .then((items) => {
        itemsWithApiImagesCache = {
          version: ITEMS_WITH_IMAGES_CACHE_VERSION,
          items,
        };
        return items;
      })
      .finally(() => {
        itemsWithApiImagesInFlight = null;
      });
  }
  return itemsWithApiImagesInFlight;
};
