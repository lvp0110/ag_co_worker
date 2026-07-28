import SizeLimits from "../data/sizeLimits";
import { getValidationMessage } from "../constants/validationMessages";

export const FACING_PROFILE_STEPS = [300, 400, 600];
export const LAG_PROFILE_STEPS = [300, 400];
export const FACING_TEMPLATES = [
  6, 50, 75, 100, 101, 50.1, 75.1, 100.1, 101.1, 50.2, 75.2, 100.2, 8.1,
];

/** Шаг профиля для облицовки/перегородок: 300 | 400 | 600, иначе 600. */
export const normalizeFacingProfileStep = (value) => {
  const n = Number(value);
  return FACING_PROFILE_STEPS.includes(n) ? n : 600;
};

/** Шаг лаг: 300 | 400, иначе 400. */
export const normalizeLagProfileStep = (value) => {
  const n = Number(value);
  return LAG_PROFILE_STEPS.includes(n) ? n : 400;
};

export const isFacingTemplate = (template) =>
  FACING_TEMPLATES.includes(template);

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

/**
 * Получить максимальную высоту конструкции из sizeLimits в метрах
 */
export const getMaxLenZInMeters = (idConstr, step, subCategory) => {
  const sizeLimit = SizeLimits.find(
    (el) =>
      el.id == subCategory &&
      el.id_constr == idConstr &&
      el.step == String(step)
  );
  if (sizeLimit && sizeLimit.max_lenZ) {
    return (sizeLimit.max_lenZ / 1000).toFixed(1);
  }
  return null;
};

/**
 * Валидация входных данных для конструкций
 */
export const validateInput = (constR, currentSubCategory, currentItems, template, profileStep, itemsWithImages) => {
  const currentItem = itemsWithImages.find((el) => el.id == currentItems);
  const itemTemplate = currentItem?.template;
  const itemAgId = currentItem?.ag_id;
  const itemCId = currentItem?.c_id;

  const isZIPS = isZIPSCeiling(currentSubCategory, template, itemTemplate, itemCId, itemAgId);
  const stepForLimits =
    currentSubCategory == "W" || currentSubCategory == "L"
      ? normalizeFacingProfileStep(profileStep)
      : profileStep;

  let objectX;
  let max_constr_size;

  if (currentSubCategory == "W") {
    objectX = SizeLimits.find(
      (el) => el.id_constr == currentItems && el.step == stepForLimits
    );
    if (!objectX) return null;
    max_constr_size = objectX.max_lenZ;

    if (isNaN(+constR.lenX) || +constR.lenX < 100)
      return getValidationMessage("W_LENX_MIN_100");
    else if (+constR.lenX > 50000)
      return getValidationMessage("W_LENX_MAX_50000");
    else if (isNaN(+constR.lenZ) || +constR.lenZ < 100)
      return getValidationMessage("W_LENZ_MIN_100");
    else if (+constR.lenZ > max_constr_size)
      return getValidationMessage("W_LENZ_MAX");
  } else if (currentSubCategory == "L" && template != 6) {
    objectX = SizeLimits.find(
      (el) => el.id_constr == currentItems && el.step == stepForLimits
    );
    if (!objectX) return null;
    max_constr_size = objectX.max_lenZ;

    if (isNaN(+constR.lenX) || +constR.lenX < 100)
      return getValidationMessage("L_NOT6_LENX_MIN_100");
    else if (+constR.lenX > 50000)
      return getValidationMessage("L_NOT6_LENX_MAX_50000");
    else if (isNaN(+constR.lenZ) || +constR.lenZ < 100)
      return getValidationMessage("L_NOT6_LENZ_MIN_100");
    else if (+constR.lenZ > max_constr_size)
      return getValidationMessage("L_NOT6_LENZ_MAX");
  } else if (currentSubCategory == "L" && template == 6) {
    objectX = SizeLimits.find(
      (el) => el.id_constr == currentItems && el.step == stepForLimits
    );
    if (!objectX) return null;
    max_constr_size = objectX.max_lenZ;

    if (isNaN(+constR.lenX) || +constR.lenX < 200)
      return getValidationMessage("L_T6_LENX_MIN_200");
    else if (+constR.lenX > 50000)
      return getValidationMessage("L_T6_LENX_MAX_50000");
    else if (isNaN(+constR.lenZ) || +constR.lenZ < 200)
      return getValidationMessage("L_T6_LENZ_MIN_200");
    else if (+constR.lenZ > max_constr_size)
      return getValidationMessage("L_T6_LENZ_MAX");
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












