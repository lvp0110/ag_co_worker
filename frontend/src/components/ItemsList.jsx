import { useState } from "react";
import { getImageUrl } from "../services/api";
import { getResponsiveImageProps } from "../utils/responsiveImages";

/**
 * Компонент списка элементов конструкции
 */
const ItemsList = ({ items, onItemSelect, selectedItemId }) => {
  // Состояние для отслеживания ошибок загрузки изображений
  const [imageErrors, setImageErrors] = useState(new Set());

  if (items.length === 0) {
    return (
      <div
        style={{
          padding: "20px",
          textAlign: "center",
          color: "#878181",
        }}
      >
        Нет элементов в этой подкатегории
      </div>
    );
  }

  const handleImageError = (elem, imageSrc) => {
    const errorKey = `${elem.id}-${imageSrc}`;
    if (!imageErrors.has(errorKey)) {
      setImageErrors(prev => new Set([...prev, errorKey]));
      // Пробуем загрузить через прямой URL
      const fallbackUrl = getImageUrl(imageSrc);
      const img = new Image();
      img.onload = () => {
        // Если прямой URL работает, обновляем изображение
        const element = document.querySelector(`[data-image-key="${errorKey}"]`);
        if (element) {
          element.src = fallbackUrl;
        }
      };
      img.src = fallbackUrl;
    }
  };

  return (
    <div className="items content-item">
      {items.map((elem, index) => {
        const imageSrc = elem.Img || elem.img;
        const imageProps = imageSrc
          ? getResponsiveImageProps(imageSrc, 'item')
          : null;

        const catalogId = elem.size_limit_id ?? elem.id;
        const isZIPSCeiling =
          (elem.c_id === "C" &&
            ((catalogId >= 201 && catalogId <= 205) ||
              String(elem.ag_id || "").startsWith("AG.Z"))) ||
          (elem.c_id === "C" &&
            elem.title &&
            String(elem.title).toUpperCase().includes("ЗИПС"));
        
        const isSelected = selectedItemId === elem.id;
        const buttonClassName = [
          "const_page",
          isZIPSCeiling ? "const_page-zips-ceiling" : null,
          isSelected ? "const_page--selected" : null,
        ]
          .filter(Boolean)
          .join(" ");
        const buttonStyle = isZIPSCeiling 
          ? { 
              transform: 'rotate(-90deg)', 
              transformOrigin: 'center center',
              WebkitTransform: 'rotate(-90deg)',
              msTransform: 'rotate(-90deg)',
              MozTransform: 'rotate(-90deg)'
            }
          : {};

        // Первые 4 изображения загружаем eagerly для улучшения LCP
        // Первое изображение получает высокий приоритет
        const isAboveTheFold = index < 4;
        const isLCPCandidate = index === 0;
        const loadingStrategy = isAboveTheFold ? "eager" : "lazy";
        const fetchPriority = isLCPCandidate ? "high" : isAboveTheFold ? "auto" : undefined;

        return (
          <div key={`${elem.id}-${elem.c_id}`} className="const-item-container">
            <button
              value={elem.id}
              className={buttonClassName}
              onClick={() => onItemSelect(elem)}
              data-zips-ceiling={isZIPSCeiling ? "true" : undefined}
              style={buttonStyle}
            >
              <p>{elem.title}</p>
              {imageProps && imageProps.src && (
                <img 
                  {...imageProps}
                  alt="" 
                  className="img-icon" 
                  loading={loadingStrategy}
                  decoding="async"
                  fetchPriority={fetchPriority}
                  width="200"
                  height="200"
                  data-image-key={`${elem.id}-${imageSrc}`}
                  onError={(e) => {
                    handleImageError(elem, imageSrc);
                  }}
                />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ItemsList;


