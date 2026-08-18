import ItemsBase from "./itemsBase.js";

/** Канонические title/description конструкций для таблиц и КП (не из API). */
export { ItemsBase };
export default ItemsBase;

// Новые файлы для потолков ЗИПС (загружаются через API, а не локально)
const zipsCeilingApiImages = {
  201: "ceiling_zips_vector.jpg",
  202: "ceiling_zips_module.jpg",
  203: "ceiling_zips_IIIultra.jpg",
  204: "ceiling_zips_Z4.jpg",
  205: "ceiling_zips_cinema.jpg",
};

const sizeLimitId = (item) => item?.size_limit_id ?? item?.id;

/**
 * Картинки — опционально из AllIsolationConstr; состав каталога только из v2.
 */
const enrichItemsWithImages = (items, imagesMap, getImageUrl) => {
  return items.map((item) => {
    if (item.c_id === "C" && zipsCeilingApiImages[sizeLimitId(item)]) {
      const newImgPath = zipsCeilingApiImages[sizeLimitId(item)];
      return {
        ...item,
        Img: getImageUrl(newImgPath),
      };
    }

    let apiImage = imagesMap.get(item.ag_id);

    if (!apiImage && sizeLimitId(item) === "P") {
      const oldPath = "/Img_constr/floor/c2k2_1.png";
      apiImage = getImageUrl(oldPath);
    }

    return {
      ...item,
      Img: apiImage || null,
    };
  });
};

let itemsWithApiImagesCache = null;
let itemsWithApiImagesInFlight = null;
const ITEMS_WITH_IMAGES_CACHE_VERSION = 4;

const loadItemsWithApiImages = async () => {
  const { listPublicConstructions } = await import(
    "../services/constructionApi.js"
  );
  const { calcItemsFromPublicConstructions } = await import(
    "../utils/isolationCalcV2.js"
  );

  const rows = await listPublicConstructions();
  const catalog = calcItemsFromPublicConstructions(rows, ItemsBase);

  try {
    const {
      getAllIsolationConstr,
      buildImagesMapFromConstructions,
      getImageUrl,
    } = await import("../services/api.js");
    const constructions = await getAllIsolationConstr();
    const imagesMap = buildImagesMapFromConstructions(constructions);
    return enrichItemsWithImages(catalog, imagesMap, getImageUrl);
  } catch {
    const { getImageUrl } = await import("../services/api.js");
    return enrichItemsWithImages(catalog, new Map(), getImageUrl);
  }
};

/**
 * Каталог калькулятора: GET /api/v2/constructions/sound (кэш на сессию вкладки).
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
