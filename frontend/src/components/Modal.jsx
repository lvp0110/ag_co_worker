import { useEffect } from 'react';
import './Modal.css';
import { getResponsiveImageProps } from '../utils/responsiveImages';

const Modal = ({ isOpen, onClose, title, html, icon, imageUrl, confirmButtonText = 'OK', confirmButtonColor = '#6cabc8' }) => {
  useEffect(() => {
    if (isOpen) {
      // Блокируем скролл body при открытом модальном окне
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const getIconElement = () => {
    if (icon === 'error') {
      return (
        <div className="modal-icon modal-icon-error">
          <span className="modal-x-mark">
            <span className="modal-x-mark-line-left"></span>
            <span className="modal-x-mark-line-right"></span>
          </span>
        </div>
      );
    }
    if (icon === 'warning') {
      return (
        <div className="modal-icon modal-icon-warning">
          <span className="modal-warning-mark">!</span>
        </div>
      );
    }
    if (icon === 'success') {
      return (
        <div className="modal-icon modal-icon-success">
          <div className="modal-success-circular-line-left"></div>
          <span className="modal-success-line-tip"></span>
          <span className="modal-success-line-long"></span>
          <div className="modal-success-ring"></div>
          <div className="modal-success-fix"></div>
          <div className="modal-success-circular-line-right"></div>
        </div>
      );
    }
    if (icon === 'info') {
      return (
        <div className="modal-icon modal-icon-info">
          <span className="modal-info-mark">i</span>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="modal-container" onClick={handleBackdropClick}>
      <div className="modal-popup">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {imageUrl && (() => {
          // Проверяем, является ли это URL из API или статическим
          const isApiImage = imageUrl.includes('/api/v2/public/image/');
          const imageProps = isApiImage
            ? getResponsiveImageProps(imageUrl, 'modal')
            : { src: imageUrl };
          
          return (
            <img 
              {...imageProps}
              alt="" 
              className="modal-image" 
              style={{ width: "100%", height: "auto" }}
              loading="eager"
              decoding="async"
              onError={(e) => {
                // Показываем placeholder при ошибке загрузки
                e.target.style.display = 'none';
              }}
            />
          );
        })()}
        {!imageUrl && getIconElement()}
        {title && <h3 className="modal-title">{title}</h3>}
        {html && (
          <div
            className="modal-html-container"
            lang="ru"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
        <div className="modal-actions">
          <button
            className="modal-confirm-button"
            onClick={onClose}
            style={{ backgroundColor: confirmButtonText === 'Принять' ? confirmButtonColor : confirmButtonColor }}
          >
            {confirmButtonText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Modal;








