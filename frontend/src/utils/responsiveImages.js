/**
 * Утилиты для работы с responsive images
 */

import { getImageUrl } from '../services/api';

/**
 * Генерирует srcset для изображения
 * @param {string} imageName - Имя файла изображения
 * @param {Array<number>} widths - Массив ширин для srcset (например, [300, 600, 900, 1200])
 * @param {boolean} apiSupportsSizeParams - Поддерживает ли API параметры размера (например, ?w=300)
 * @returns {string} Строка srcset или пустая строка
 */
export const generateSrcSet = (imageName, widths = [300, 600, 900, 1200], apiSupportsSizeParams = false) => {
  if (!imageName) return '';
  
  // Если API не поддерживает параметры размера, не генерируем srcset
  // Браузер будет использовать CSS для масштабирования
  if (!apiSupportsSizeParams) {
    return '';
  }
  
  // Если это уже полный URL, используем его как базовый
  const baseUrl = imageName.startsWith('http://') || imageName.startsWith('https://')
    ? imageName
    : getImageUrl(imageName);
  
  if (!baseUrl) return '';
  
  // Проверяем, поддерживает ли URL параметры (например, query string)
  const urlParts = baseUrl.split('?');
  const baseUrlWithoutParams = urlParts[0];
  const existingParams = urlParts[1] || '';
  
  // Генерируем srcset с разными размерами
  const srcsetEntries = widths.map(width => {
    const paramSeparator = existingParams ? '&' : '?';
    return `${baseUrlWithoutParams}${paramSeparator}w=${width} ${width}w`;
  });
  
  // Добавляем оригинальный размер в конец
  srcsetEntries.push(`${baseUrl} 1x`);
  
  return srcsetEntries.join(', ');
};

/**
 * Генерирует sizes атрибут для изображения
 * @param {string} type - Тип изображения: 'icon', 'item', 'modal', 'section'
 * @returns {string} Строка sizes
 */
export const generateSizes = (type = 'item') => {
  const sizesMap = {
    // Иконки элементов (const_page) - адаптивные размеры
    item: '(max-width: 375px) 48vw, (max-width: 550px) 35vw, clamp(150px, 15vw, 200px)',
    // Иконки секций
    section: '(max-width: 550px) 60px, 80px',
    // Изображения в модальном окне
    modal: '(max-width: 550px) 90vw, 32em',
    // Иконки (общие)
    icon: 'auto',
  };
  
  return sizesMap[type] || sizesMap.item;
};

/**
 * Создает объект с атрибутами для responsive image
 * @param {string} imageName - Имя файла изображения
 * @param {string} type - Тип изображения: 'icon', 'item', 'modal', 'section'
 * @returns {Object} Объект с атрибутами src, srcSet, sizes
 */
export const getResponsiveImageProps = (imageName, type = 'item') => {
  if (!imageName) {
    return { src: '', srcSet: '', sizes: '' };
  }
  
  // Всегда через getImageUrl: нормализация путей / полных URL к превью и одинаковая логика с калькулятором
  const src =
    imageName.startsWith('data:') || imageName.startsWith('blob:')
      ? imageName
      : getImageUrl(imageName);
  
  // Генерируем srcset (пока API не поддерживает параметры размера, возвращается пустая строка)
  // В будущем, если API начнет поддерживать параметры размера, можно передать true в apiSupportsSizeParams
  const srcSet = generateSrcSet(imageName, [300, 600, 900, 1200], false);
  
  // Генерируем sizes
  const sizes = generateSizes(type);
  
  return {
    src,
    srcSet: srcSet || undefined, // Убираем пустую строку
    sizes: sizes || undefined,
  };
};

