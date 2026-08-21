/**
 * API сервис для получения данных о конструкциях
 */

import { BASE_URL } from './apiClient';
import {
  getMaterialsListViaCalc,
  getPublicConstruction,
} from './constructionApi';
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

const isLocalApiHost = (hostname) => {
  const host = String(hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
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
 * Формирует полный URL для изображения из API
 * @param {string} imageName - Имя файла изображения из API или путь вида /Img_constr/...
 * @returns {string} Полный URL изображения
 */
export const getImageUrl = (imageName) => {
  if (!imageName) return '';

  const s = String(imageName).trim();

  // Готовый публичный URL с локального ConstrTodo (:3005) нельзя сжимать
  // в относительный `/api/v2/...`: Vite проксирует `/api/v2` на CALC
  // (часто staging), а файл лежит в локальном MinIO.
  if (s.startsWith('http://') || s.startsWith('https://')) {
    try {
      const parsed = new URL(s);
      if (parsed.pathname.startsWith('/api/v2/public/image/')) {
        if (isLocalApiHost(parsed.hostname)) {
          return s;
        }
        return `${BASE_URL}${parsed.pathname}${parsed.search}`;
      }
    } catch {
      // Если URL не распарсился, продолжаем старую логику.
    }
  }

  if (s.startsWith('/api/v2/public/image/')) {
    return `${BASE_URL}${s}`;
  }

  imageName = s;

  // Сторонний абсолютный URL (картинка с какого-то CDN/origin) — отдаём как есть.
  // Свои v2-ссылки уже обработаны выше.
  if (imageName.startsWith('http://') || imageName.startsWith('https://')) {
    return imageName;
  }
  
  // Специальный случай: картинки потолков ЗИПС хранятся без папки zips_ceiling на API.
  // Если приходит путь zips_ceiling/filename.jpg — отправляем только filename.jpg.
  const zipsCeilingPrefix = 'zips_ceiling/';
  if (imageName.includes(zipsCeilingPrefix)) {
    const fileName = imageName.split(zipsCeilingPrefix).pop();
    if (fileName) {
      imageName = fileName;
    }
  }
  
  // Обрабатываем имя изображения
  let processedImageName = imageName;
  if (imageName.startsWith('/Img_constr/')) {
    const pathWithoutPrefix = imageName.replace('/Img_constr/', '');
    const parts = pathWithoutPrefix.split('/');
    if (parts.length >= 2) {
      const folder = parts[0];
      const fileName = parts[parts.length - 1];
      const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
      processedImageName = `${folder}_${fileNameWithoutExt}.jpg`;
    }
  } else if (imageName.startsWith('/')) {
    processedImageName = imageName.slice(1);
  }

  return resolveConstrPreviewUrl(processedImageName);
};


/**
 * Мапа Code → URL превью по уже загруженному списку из AllIsolationConstr
 * @param {Array} constructions
 * @returns {Map<string, string>}
 */
export const buildImagesMapFromConstructions = (constructions) => {
  const imagesMap = new Map();
  if (!Array.isArray(constructions)) return imagesMap;
  constructions.forEach((item) => {
    const code = item.Code ?? item.code;
    const img = item.Img ?? item.img;
    if (code && img) {
      imagesMap.set(code, getImageUrl(img));
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
    return {
      ...record,
      Img: record.Img ? getImageUrl(record.Img) : "",
      CadImg: record.CadImg ? getImageUrl(record.CadImg) : "",
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
