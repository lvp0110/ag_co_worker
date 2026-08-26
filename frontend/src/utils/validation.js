import { getValidationMessage } from "../constants/validationMessages";

/**
 * Проверяет, является ли конструкция ЗИПС потолком
 */
export const isZIPSCeiling = (currentSubCategory, template, itemTemplate, itemCId, itemAgId) => {
  return (
    (currentSubCategory == "C" && (template == 4 || itemTemplate == 4)) ||
    (itemCId == "C" && itemTemplate == 4) ||
    (itemAgId && itemAgId.startsWith("AG.Z"))
  );
};

export const hasApiSizeLimits = (sizeLimits) =>
  Array.isArray(sizeLimits) && sizeLimits.length > 0;

const paramCodeForCondition = (condition, params = []) => {
  if (condition?.code) return condition.code;
  const paramId = Number(condition?.construction_system_param_id);
  if (Number.isFinite(paramId) && paramId > 0) {
    const byId = params.find((param) => Number(param?.id) === paramId);
    if (byId?.code) return byId.code;
  }
  if (condition?.value_int != null) return "step";
  return "";
};

export const sizeLimitApplies = (limit, paramValues = {}, params = []) => {
  if (!limit) return false;
  if (limit.mode !== "parametric") return true;
  const conditions = Array.isArray(limit.conditions) ? limit.conditions : [];
  if (conditions.length === 0) return false;
  return conditions.every((condition) => {
    const code = paramCodeForCondition(condition, params);
    const current = code ? paramValues[code] : null;
    if (condition.value_bool != null && condition.value_int == null) {
      return Boolean(current?.value_bool) === Boolean(condition.value_bool);
    }
    if (condition.value_int != null) {
      return Number(current?.value_int) === Number(condition.value_int);
    }
    return Boolean(current);
  });
};

const formatSizeLimitMessage = (limit, kind) => {
  const title =
    limit?.warning?.title ||
    (kind === "min" ? "Введите правильный размер" : "Внимание!");
  const fallback =
    kind === "min"
      ? `Минимальный размер конструкции ${limit?.min_value} мм`
      : `Максимальный размер конструкции ${limit?.max_value} мм`;
  const message = limit?.warning?.message || fallback;
  if (title) return `<span class="p1">${title}</span> <br>${message}`;
  return message;
};

const toMm = (raw) => {
  if (raw === null || raw === undefined || raw === "") return NaN;
  const n = +raw;
  return Number.isFinite(n) ? n : NaN;
};

const dimensionValueMm = (dimension, constR) => {
  const lenX = toMm(constR?.lenX);
  const lenY = toMm(constR?.lenY);
  const lenZ = toMm(constR?.lenZ);
  if (dimension === "len_x") return lenX;
  if (dimension === "len_y") return lenY;
  if (dimension === "len_z") return Number.isFinite(lenZ) ? lenZ : lenY;
  return NaN;
};

/**
 * Валидация размеров по size_limits из calculation-params.
 * Пустой список — null (тогда Calculator использует абсолютные bounds ниже).
 */
export const validateConstructionSizeLimits = (
  constR,
  sizeLimits,
  paramValues = {},
  params = []
) => {
  if (!hasApiSizeLimits(sizeLimits)) return null;
  for (const limit of sizeLimits) {
    if (!sizeLimitApplies(limit, paramValues, params)) continue;
    const value = dimensionValueMm(limit.dimension, constR);
    if (limit.min_value != null && (!Number.isFinite(value) || value < limit.min_value)) {
      return formatSizeLimitMessage(limit, "min");
    }
    if (limit.max_value != null && Number.isFinite(value) && value > limit.max_value) {
      return formatSizeLimitMessage(limit, "max");
    }
  }
  return null;
};

/** Макс. высота (м) из API size_limits для шага профиля. */
export const getMaxLenZFromSizeLimits = (sizeLimits, step, params = []) => {
  if (!hasApiSizeLimits(sizeLimits)) return null;
  const paramValues = { step: { value_int: Number(step) } };
  const maxes = sizeLimits
    .filter(
      (limit) =>
        limit.dimension === "len_z" &&
        limit.max_value != null &&
        sizeLimitApplies(limit, paramValues, params)
    )
    .map((limit) => limit.max_value);
  if (!maxes.length) return null;
  return (Math.min(...maxes) / 1000).toFixed(1);
};

/**
 * Абсолютные min/max размеров, когда у конструкции нет API size_limits.
 * Макс. высота по шагу профиля — только через validateConstructionSizeLimits.
 */
export const validateInput = (
  constR,
  currentSubCategory,
  currentItems,
  template,
  itemsWithImages
) => {
  const currentItem = itemsWithImages.find((el) => el.id == currentItems);
  const itemTemplate = currentItem?.template;
  const itemAgId = currentItem?.ag_id;
  const itemCId = currentItem?.c_id;

  const isZIPS = isZIPSCeiling(
    currentSubCategory,
    template,
    itemTemplate,
    itemCId,
    itemAgId
  );

  if (currentSubCategory == "W") {
    if (isNaN(+constR.lenX) || +constR.lenX < 100)
      return getValidationMessage("W_LENX_MIN_100");
    else if (+constR.lenX > 50000)
      return getValidationMessage("W_LENX_MAX_50000");
    else if (isNaN(+constR.lenZ) || +constR.lenZ < 100)
      return getValidationMessage("W_LENZ_MIN_100");
  } else if (currentSubCategory == "L" && template != 6) {
    if (isNaN(+constR.lenX) || +constR.lenX < 100)
      return getValidationMessage("L_NOT6_LENX_MIN_100");
    else if (+constR.lenX > 50000)
      return getValidationMessage("L_NOT6_LENX_MAX_50000");
    else if (isNaN(+constR.lenZ) || +constR.lenZ < 100)
      return getValidationMessage("L_NOT6_LENZ_MIN_100");
  } else if (currentSubCategory == "L" && template == 6) {
    if (isNaN(+constR.lenX) || +constR.lenX < 200)
      return getValidationMessage("L_T6_LENX_MIN_200");
    else if (+constR.lenX > 50000)
      return getValidationMessage("L_T6_LENX_MAX_50000");
    else if (isNaN(+constR.lenZ) || +constR.lenZ < 200)
      return getValidationMessage("L_T6_LENZ_MIN_200");
  } else if (currentSubCategory == "C" && template == 5) {
    if (isNaN(+constR.lenX) || +constR.lenX < 250)
      return getValidationMessage("C_T5_LENX_MIN_250");
    else if (+constR.lenX > 50000)
      return getValidationMessage("C_T5_LENX_MAX_50000");
    else if (isNaN(+constR.lenY) || +constR.lenY < 250)
      return getValidationMessage("C_T5_LENY_MIN_250");
    else if (+constR.lenY > 50000)
      return getValidationMessage("C_T5_LENY_MAX_50000");
  } else if (currentSubCategory == "5" && template == 201) {
    if (isNaN(+constR.lenX) || +constR.lenX < 250)
      return getValidationMessage("CAT5_T201_LENX_MIN_250");
    else if (+constR.lenX > 50000)
      return getValidationMessage("CAT5_T201_LENX_MAX_50000");
    else if (isNaN(+constR.lenZ) || +constR.lenZ < 250)
      return getValidationMessage("CAT5_T201_LENZ_MIN_250");
    else if (+constR.lenZ > 50000)
      return getValidationMessage("CAT5_T201_LENZ_MAX_50000");
  } else if (currentSubCategory == "6" && template == 202) {
    if (isNaN(+constR.lenX) || +constR.lenX < 250)
      return getValidationMessage("CAT6_T202_LENX_MIN_250");
    else if (+constR.lenX > 50000)
      return getValidationMessage("CAT6_T202_LENX_MAX_50000");
    else if (isNaN(+constR.lenY) || +constR.lenY < 250)
      return getValidationMessage("CAT6_T202_LENY_MIN_250");
    else if (+constR.lenY > 50000)
      return getValidationMessage("CAT6_T202_LENY_MAX_50000");
  } else if (isZIPS) {
    const lenX = +constR.lenX || 0;
    const lenY = +constR.lenY || 0;

    if (
      !constR.lenX ||
      constR.lenX === null ||
      constR.lenX === undefined ||
      constR.lenX === "" ||
      isNaN(lenX) ||
      lenX < 200 ||
      lenX === 0
    ) {
      return getValidationMessage("ZIPS_CEILING_LENX_MIN_200");
    }
    if (lenX > 50000) {
      return getValidationMessage("ZIPS_CEILING_LENX_MAX_50000");
    }
    if (
      !constR.lenY ||
      constR.lenY === null ||
      constR.lenY === undefined ||
      constR.lenY === "" ||
      isNaN(lenY) ||
      lenY < 200 ||
      lenY === 0
    ) {
      return getValidationMessage("ZIPS_CEILING_LENY_MIN_200");
    }
    if (lenY > 50000) {
      return getValidationMessage("ZIPS_CEILING_LENY_MAX_50000");
    }
  }
  return null;
};

/**
 * Валидация входных данных для полов
 */
export const validateFloorInput = (constR, currentSubCategory, template) => {
  if (currentSubCategory == "F" && template != 111 && template != 3) {
    if (isNaN(+constR.lenX) || +constR.lenX < 500)
      return getValidationMessage("F_NOT111_NOT3_LENX_MIN_500");
    else if (isNaN(+constR.lenY) || +constR.lenY < 500)
      return getValidationMessage("F_NOT111_NOT3_LENY_MIN_500");
  } else if (currentSubCategory == "F" && template == 111) {
    if (isNaN(+constR.lenX) || +constR.lenX < 200)
      return getValidationMessage("F_T111_LENX_MIN_200");
    else if (isNaN(+constR.lenY) || +constR.lenY < 200)
      return getValidationMessage("F_T111_LENY_MIN_200");
    else if (+constR.lenY > 18000)
      return getValidationMessage("F_T111_LENY_MAX_18000");
  } else if (currentSubCategory == "F" && template == 3) {
    if (isNaN(+constR.lenX) || +constR.lenX < 500)
      return getValidationMessage("F_T3_LENX_MIN_500");
    else if (isNaN(+constR.lenY) || +constR.lenY < 500)
      return getValidationMessage("F_T3_LENY_MIN_500");
  }
  return null;
};

/**
 * Валидация максимальных размеров для полов
 */
export const validateFloorMaxInput = (constR, currentSubCategory, template) => {
  if (currentSubCategory == "F" && template != 111 && template != 3) {
    if (+constR.lenX > 18000)
      return getValidationMessage("F_NOT111_NOT3_LENX_MAX_18000");
    else if (+constR.lenY > 18000)
      return getValidationMessage("F_NOT111_NOT3_LENY_MAX_18000");
  } else if (currentSubCategory == "F" && template == 111) {
    if (+constR.lenX > 18000)
      return getValidationMessage("F_T111_LENX_MAX_18000");
    else if (+constR.lenY > 18000)
      return getValidationMessage("F_T111_LENY_MAX_18000");
  } else if (currentSubCategory == "F" && template == 3) {
    if (+constR.lenX > 18000)
      return getValidationMessage("F_T3_LENX_MAX_18000");
    else if (+constR.lenY > 18000)
      return getValidationMessage("F_T3_LENY_MAX_18000");
  }
  return null;
};
