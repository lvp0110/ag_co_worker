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

/** Каталог API — только для картинок; title/description остаются из ItemsBase. */
const mergeCatalogFromApi = (items) => items.map((item) => ({ ...item }));

/**
 * Обогащает items изображениями из API по совпадению ag_id и Code
 */
const enrichItemsWithImages = (items, imagesMap, getImageUrl) => {
  return items.map((item) => {
    if (item.c_id === "C" && zipsCeilingApiImages[item.id]) {
      const newImgPath = zipsCeilingApiImages[item.id];
      return {
        ...item,
        Img: getImageUrl(newImgPath),
      };
    }

    let apiImage = imagesMap.get(item.ag_id);

    if (!apiImage && item.id === "P") {
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
const ITEMS_WITH_IMAGES_CACHE_VERSION = 3;

const loadItemsWithApiImages = async () => {
  const {
    getAllIsolationConstr,
    buildImagesMapFromConstructions,
    getImageUrl,
  } = await import("../services/api.js");

  try {
    const constructions = await getAllIsolationConstr();
    const withCatalog = mergeCatalogFromApi(ItemsBase);
    const imagesMap = buildImagesMapFromConstructions(constructions);
    return enrichItemsWithImages(withCatalog, imagesMap, getImageUrl);
  } catch {
    const { getImageUrl } = await import("../services/api.js");
    return ItemsBase.map((item) => {
      let img = null;
      if (item.id === "P") {
        const oldPath = "/Img_constr/floor/c2k2_1.png";
        img = getImageUrl(oldPath);
      }
      return {
        ...item,
        Img: img,
      };
    });
  }
};

/**
 * Обогащённые items с картинками из API (кэш на сессию вкладки).
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
