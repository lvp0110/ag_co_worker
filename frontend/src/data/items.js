import ItemsBase from "./itemsBase.js";

/** Fallback template/size_limit_id из ItemsBase (каталог / UI), не лимиты размеров. */
export { ItemsBase };
export default ItemsBase;

let itemsWithApiImagesCache = null;
let itemsWithApiImagesInFlight = new Map();
const ITEMS_WITH_IMAGES_CACHE_VERSION = 8;

const cacheKeyForRegion = (region) =>
  `${ITEMS_WITH_IMAGES_CACHE_VERSION}:${region || "_"}`;

const loadItemsWithApiImages = async (regionCode) => {
  const { listPublicConstructions } = await import(
    "../services/constructionApi.js"
  );
  const { calcItemsFromPublicConstructions } = await import(
    "../utils/isolationCalcV2.js"
  );

  const rows = await listPublicConstructions(
    undefined,
    "",
    regionCode
  );
  const catalog = calcItemsFromPublicConstructions(rows, ItemsBase);
  // imageUrl / cadImageUrl уже из images[] админки (resolveAdminPublicImageUrl).
  return catalog.map((item) => ({
    ...item,
    Img: item.imageUrl || null,
    CadImg: item.cadImageUrl || null,
  }));
};

/**
 * Каталог калькулятора: GET /api/v2/constructions/sound/{regionCode}
 * (публичное чтение конструкций, доступных в выбранном регионе цен).
 * Картинки — только из admin images[] / public/image, без legacy Img_constr.
 */
export const getItemsWithApiImages = async (regionCode) => {
  const { resolveConstructionRegionCode } = await import(
    "../services/constructionApi.js"
  );
  const region = resolveConstructionRegionCode(regionCode);
  const cacheKey = cacheKeyForRegion(region);

  if (
    itemsWithApiImagesCache &&
    itemsWithApiImagesCache.key === cacheKey
  ) {
    return itemsWithApiImagesCache.items;
  }

  if (itemsWithApiImagesInFlight.has(cacheKey)) {
    return itemsWithApiImagesInFlight.get(cacheKey);
  }

  const pending = loadItemsWithApiImages(region)
    .then((items) => {
      itemsWithApiImagesCache = { key: cacheKey, items };
      return items;
    })
    .finally(() => {
      itemsWithApiImagesInFlight.delete(cacheKey);
    });

  itemsWithApiImagesInFlight.set(cacheKey, pending);
  return pending;
};
