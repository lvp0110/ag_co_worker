import { useEffect, useState } from "react";
import { savePdfBlob } from "../services/offersApi.js";
import "./PdfPrintDialog.css";

// Транзитные поля печати (в БД не хранятся). recipient обязателен, остальные —
// необязательные (пустые → бэк отрендерит пустую строку в PDF).
const EMPTY_FIELDS = {
  recipient: "",
  paymentSchedule: "",
  deliveryMethod: "",
  warehouse: "",
  offerValidity: "",
};

/**
 * Модалка «Данные для печати КП». Собирает транзитные параметры печати,
 * запрашивает PDF через onConfirm и показывает предпросмотр до скачивания.
 *
 * Пропсы:
 *   open         — открыта ли модалка;
 *   isDownloading — идёт ли генерация PDF (блокирует поля и кнопки);
 *   error        — текст ошибки генерации от родителя (необязательно);
 *   onClose()    — закрыть модалку;
 *   onConfirm(printParams) — сгенерировать PDF. Должен вернуть
 *                  Promise<{ blob, filename }>. printParams: { recipient,
 *                  payment_schedule, delivery_method, warehouse, offer_validity }.
 */
export default function PdfPrintDialog({
  open,
  isDownloading = false,
  error = null,
  onClose,
  onConfirm,
}) {
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [localError, setLocalError] = useState(null);
  const [step, setStep] = useState("form"); // "form" | "preview"
  const [preview, setPreview] = useState(null); // { url, blob, filename }

  // Сброс полей при каждом открытии без эффекта: сравниваем `open` с прошлым
  // значением прямо в рендере (рекомендованный React-паттерн).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setFields(EMPTY_FIELDS);
    setLocalError(null);
    setStep("form");
    setPreview(null);
  }

  // Освобождаем object URL при смене/сбросе превью и при размонтировании.
  useEffect(() => {
    const url = preview?.url;
    if (!url) return undefined;
    return () => URL.revokeObjectURL(url);
  }, [preview]);

  if (!open) return null;

  const update = (key) => (e) =>
    setFields((prev) => ({ ...prev, [key]: e.target.value }));

  const handleClose = () => {
    if (isDownloading) return;
    setStep("form");
    setPreview(null);
    onClose?.();
  };

  const handleBackToForm = () => {
    if (isDownloading) return;
    setPreview(null);
    setStep("form");
    setLocalError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isDownloading) return;
    const recipient = (fields.recipient ?? "").trim();
    if (recipient === "") {
      setLocalError("Укажите, кому адресовано КП.");
      return;
    }
    setLocalError(null);
    const printParams = {
      recipient,
      payment_schedule: fields.paymentSchedule,
      delivery_method: fields.deliveryMethod,
      warehouse: fields.warehouse,
      offer_validity: fields.offerValidity,
    };
    const result = await onConfirm?.(printParams);
    if (result?.blob) {
      setPreview({
        blob: result.blob,
        filename: result.filename || "КП.pdf",
        url: URL.createObjectURL(result.blob),
      });
      setStep("preview");
    }
  };

  const handleDownload = () => {
    if (!preview?.blob || isDownloading) return;
    savePdfBlob(preview.blob, preview.filename);
    setStep("form");
    setPreview(null);
    onClose?.();
  };

  const shownError = localError || error;

  if (step === "preview" && preview?.url) {
    return (
      <div
        className="kp-pdf-dialog__backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kp-pdf-dialog-preview-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) handleClose();
        }}
      >
        <div className="kp-pdf-dialog kp-pdf-dialog--preview">
          <button
            type="button"
            className="kp-pdf-dialog__close"
            onClick={handleClose}
            aria-label="Закрыть"
          >
            ×
          </button>
          <h3 id="kp-pdf-dialog-preview-title" className="kp-pdf-dialog__title">
            Предпросмотр КП
          </h3>
          <iframe
            className="kp-pdf-dialog__preview"
            src={preview.url}
            title={preview.filename}
          />
          <div className="kp-pdf-dialog__actions">
            <button
              type="button"
              className="kp-pdf-dialog__btn kp-pdf-dialog__btn--ghost"
              onClick={handleBackToForm}
            >
              Назад
            </button>
            <button
              type="button"
              className="kp-pdf-dialog__btn kp-pdf-dialog__btn--primary"
              onClick={handleDownload}
            >
              Скачать PDF
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="kp-pdf-dialog__backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kp-pdf-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="kp-pdf-dialog">
        <button
          type="button"
          className="kp-pdf-dialog__close"
          onClick={handleClose}
          aria-label="Закрыть"
          disabled={isDownloading}
        >
          ×
        </button>
        <h3 id="kp-pdf-dialog-title" className="kp-pdf-dialog__title">
          Данные для печати КП
        </h3>
        <form className="kp-pdf-dialog__form" onSubmit={handleSubmit}>
          <label className="kp-pdf-dialog__label" htmlFor="kp-pdf-dialog-recipient">
            Кому адресовано
          </label>
          <input
            id="kp-pdf-dialog-recipient"
            type="text"
            className="kp-pdf-dialog__input"
            value={fields.recipient}
            onChange={update("recipient")}
            autoFocus
            disabled={isDownloading}
          />
          <label className="kp-pdf-dialog__label" htmlFor="kp-pdf-dialog-payment">
            График оплаты (необязательно)
          </label>
          <input
            id="kp-pdf-dialog-payment"
            type="text"
            className="kp-pdf-dialog__input"
            value={fields.paymentSchedule}
            onChange={update("paymentSchedule")}
            disabled={isDownloading}
          />
          <label className="kp-pdf-dialog__label" htmlFor="kp-pdf-dialog-delivery">
            Способ доставки (необязательно)
          </label>
          <input
            id="kp-pdf-dialog-delivery"
            type="text"
            className="kp-pdf-dialog__input"
            value={fields.deliveryMethod}
            onChange={update("deliveryMethod")}
            disabled={isDownloading}
          />
          <label className="kp-pdf-dialog__label" htmlFor="kp-pdf-dialog-warehouse">
            Склад (необязательно)
          </label>
          <input
            id="kp-pdf-dialog-warehouse"
            type="text"
            className="kp-pdf-dialog__input"
            value={fields.warehouse}
            onChange={update("warehouse")}
            disabled={isDownloading}
          />
          <label className="kp-pdf-dialog__label" htmlFor="kp-pdf-dialog-validity">
            Срок действия предложения (необязательно)
          </label>
          <input
            id="kp-pdf-dialog-validity"
            type="text"
            className="kp-pdf-dialog__input"
            value={fields.offerValidity}
            onChange={update("offerValidity")}
            disabled={isDownloading}
          />
          {shownError && (
            <div className="kp-pdf-dialog__error" role="alert">
              {shownError}
            </div>
          )}
          <div className="kp-pdf-dialog__actions">
            <button
              type="button"
              className="kp-pdf-dialog__btn kp-pdf-dialog__btn--ghost"
              onClick={handleClose}
              disabled={isDownloading}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="kp-pdf-dialog__btn kp-pdf-dialog__btn--primary"
              disabled={isDownloading}
            >
              {isDownloading ? "Готовим PDF..." : "Предпросмотр"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
