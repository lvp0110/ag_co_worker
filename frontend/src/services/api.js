/**
 * API сервис для получения данных о конструкциях
 */

import { BASE_URL } from './apiClient';
import {
  getMaterialsListViaCalc,
  getPublicConstruction,
} from './constructionApi';
import { resolveAdminPublicImageUrl } from '../utils/adminImageSrc.js';
import {
  mapPublicConstructionToInfoRecord,
  materialsFromPublicComposition,
  unwrapPublicConstructionDetail,
} from '../utils/isolationCalcV2';

// Все calc-запросы идут на backend (calc.ts proxy → внешний calcService).
// BASE_URL пустой → относительные `/api/v1/*` (Vite/nginx проксируют на backend).
const API_BASE_URL = `${BASE_URL}/api/v1`;

/** Каталог конструкций на внешнем calc-сервисе иногда отвечает 25–35s. */
const ALL_ISOLATION_CONSTR_TIMEOUT_MS = 60000;

const allIsolationConstrCache = {
  list: null,
  loaded: false,
  loadingPromise: null,
};

const resolveConstrPreviewUrl = (processedImageName) => {
  return `${BASE_URL}/api/v2/public/image/${processedImageName}`;
};

/** Нормализует тело ответа GET /api/v1/AllIsolationConstr к массиву записей. */
const parseAllIsolationConstrBody = (result) => {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.data)) return result.data;
  return [];
};

/**
 * Получает все конструкции изоляции из API (GET …/AllIsolationConstr, Accept: application/json)
 * @returns {Promise<Array>} Массив конструкций (Code, Name, Description, Img и др.)
 */
const fetchAllIsolationConstr = async () => {
  const url = `${API_BASE_URL}/AllIsolationConstr`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ALL_ISOLATION_CONSTR_TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return parseAllIsolationConstrBody(result);
  } catch {
    return [];
  }
};

/**
 * Каталог конструкций с in-memory кэшем (как прайс).
 * Повторные заходы на КП/калькулятор не ждут 25–35s ответа dev3.
 */
export const getAllIsolationConstr = async () => {
  if (allIsolationConstrCache.loaded && Array.isArray(allIsolationConstrCache.list)) {
    return allIsolationConstrCache.list;
  }
  if (allIsolationConstrCache.loadingPromise) {
    return allIsolationConstrCache.loadingPromise;
  }

  allIsolationConstrCache.loadingPromise = fetchAllIsolationConstr()
    .then((list) => {
      allIsolationConstrCache.list = list;
      allIsolationConstrCache.loaded = true;
      return list;
    })
    .finally(() => {
      allIsolationConstrCache.loadingPromise = null;
    });

  return allIsolationConstrCache.loadingPromise;
};

/**
 * URL для UI-иконок и уже готовых admin public/image ссылок.
 * Nested ключи (constr/preview/…) кодируются одним сегментом (%2F), как на :3005.
 * Legacy Img_constr / zips_ceiling не поддерживаются — конструкции только через админку.
 * @param {string} imageName
 * @returns {string}
 */
export const getImageUrl = (imageName) => {
  if (!imageName) return '';

  const s = String(imageName).trim();
  if (!s) return '';
  if (s.startsWith('blob:') || s.startsWith('data:')) return s;

  // Legacy construction paths больше не резолвим.
  if (
    s.startsWith('/Img_constr/') ||
    s.includes('zips_ceiling/') ||
    s.startsWith('Img_constr/')
  ) {
    return '';
  }

  // Admin public/image (в т.ч. absolute localhost:3005) → same-origin с %2F.
  // Не брать URL.pathname: браузер может раскодировать %2F в `/` и сломать :img.
  const adminPublic = resolveAdminPublicImageUrl(s);
  if (adminPublic) {
    return `${BASE_URL}${adminPublic}`;
  }

  // Внешний CDN без public/image.
  if (s.startsWith('http://') || s.startsWith('https://')) {
    return s;
  }

  // UI-иконки (calc.svg, section icons) — плоский ключ на public/image.
  const fileName = s.replace(/^\/+/, '');
  if (!fileName || fileName.includes('/')) return '';
  return resolveConstrPreviewUrl(fileName);
};


/**
 * Мапа Code → URL превью по images[] / public/image (admin), без legacy Img_constr.
 * @param {Array} constructions
 * @returns {Map<string, string>}
 */
export const buildImagesMapFromConstructions = (constructions) => {
  const imagesMap = new Map();
  if (!Array.isArray(constructions)) return imagesMap;
  constructions.forEach((item) => {
    const code = item.Code ?? item.code;
    const img = item.Img ?? item.img ?? item.imageUrl;
    if (code && img) {
      const url = getImageUrl(img);
      if (url) imagesMap.set(code, url);
    }
  });
  return imagesMap;
};

/**
 * Получает данные конкретной конструкции по коду
 * @param {string} code - Код конструкции (например, "AG.W101")
 * @returns {Promise<Object|null>} Объект с данными конструкции или null, если не найдена
 */
export const getConstructionByCode = async (code) => {
  if (!code) return null;

  try {
    const detail = await getPublicConstruction(code);
    const record = mapPublicConstructionToInfoRecord(detail);
    if (!record) return null;
    // Img/CadImg уже через pickEntityImageUrl → resolveAdminPublicImageUrl.
    return {
      ...record,
      Img: record.Img || "",
      CadImg: record.CadImg || "",
    };
  } catch {
    return null;
  }
};

/**
 * Достаёт плоский список материалов из ответа getConstructionProps (разные форматы бэкенда).
 * @param {Object|null} props
 * @returns {Array|null}
 */
export const extractMaterialsFromProps = (props) => {
  if (!props?.constr_materials) return null;
  const cm = props.constr_materials;
  if (!Array.isArray(cm) || cm.length === 0) return null;

  const materialsBlock = cm.find(
    (item) =>
      item &&
      typeof item === "object" &&
      (item.type === "Materials" || item.Type === "Materials")
  );
  if (materialsBlock) {
    const nested =
      materialsBlock.constr_materials ||
      materialsBlock.ConstrMaterials ||
      materialsBlock.materials;
    if (Array.isArray(nested) && nested.length > 0) return nested;
  }

  const first = cm[0];
  if (
    first &&
    (first.name != null ||
      first.Name != null ||
      first.code != null ||
      first.Code != null)
  ) {
    return cm;
  }
  return null;
};

/**
 * Получает свойства (материалы) конструкции по коду
 * @param {string} code - Код конструкции (например, "AG.W101")
 * @returns {Promise<Object|null>} Объект с данными свойств конструкции или null, если не найдена
 */
/**
 * Материалы звукоизоляционной конструкции (GET …/IsolationConstrMaterials/{code})
 * @param {string} isolationConstrCode — шифр конструкции, напр. "AG.W101"
 * @returns {Promise<{ code?: number, data?: Array|null }|null>}
 */
export const getIsolationConstrMaterials = async (isolationConstrCode) => {
  if (!isolationConstrCode) return null;
  const encoded = encodeURIComponent(String(isolationConstrCode).trim());
  const url = `${API_BASE_URL}/IsolationConstrMaterials/${encoded}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const result = await response.json();
    return result && typeof result === "object" ? result : null;
  } catch {
    return null;
  }
};

/**
 * Список материалов для страницы «Инфо»: состав из админки,
 * затем legacy IsolationConstrMaterials / calc.
 */
export const loadInfoPageMaterialsList = async (code) => {
  if (!code) return null;

  try {
    const detail = await getPublicConstruction(code);
    const unwrapped = unwrapPublicConstructionDetail(detail);
    const fromAdmin = materialsFromPublicComposition(unwrapped?.composition);
    if (fromAdmin.length) return fromAdmin;
  } catch {
    // fallback ниже
  }

  const isolation = await getIsolationConstrMaterials(code);
  const fromIsolation = Array.isArray(isolation?.data) ? isolation.data : null;
  if (fromIsolation?.length) return fromIsolation;

  const fromCalc = await getMaterialsListViaCalc(code);
  if (fromCalc?.length) return fromCalc;

  const props = await getConstructionProps(code);
  return extractMaterialsFromProps(props);
};

export const getConstructionProps = async (code) => {
  if (!code) return null;

  const encodedCode = encodeURIComponent(code);
  const url = `${BASE_URL}/api/v2/isolationConstructions/props/${encodedCode}`;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      // Для 404 ошибок - это нормально, данные могут отсутствовать
      if (response.status === 404) {
        // Тихо возвращаем null, не логируем ошибку
        return null;
      }
      
      return null;
    }
    
    const result = await response.json();
    
    // Если result - это массив (прямой ответ с материалами)
    if (Array.isArray(result)) {
      return { constr_materials: result };
    }
    
    // Возвращаем данные из поля data, если есть
    if (result.code === 200 && result.data) {
      // Проверяем, есть ли constr_materials в data
      if (result.data.constr_materials) {
        return result.data;
      }
      // Если data - это массив
      if (Array.isArray(result.data)) {
        return { constr_materials: result.data };
      }
      // Если constr_materials в корне data, возвращаем data
      return result.data;
    }
    
    // Если структура другая, проверяем корневой уровень
    if (result.constr_materials) {
      return result;
    }
    
    // Если data содержит constr_materials напрямую
    if (result.data && result.data.constr_materials) {
      return result.data;
    }
    
    // Если result.data - это массив
    if (result.data && Array.isArray(result.data)) {
      return { constr_materials: result.data };
    }
    
    // Если весь result - это объект с материалами (может быть прямая структура)
    if (result && typeof result === 'object' && !result.code && !result.data) {
      return result;
    }
    
    return null;
  } catch {
    return null;
  }
};
