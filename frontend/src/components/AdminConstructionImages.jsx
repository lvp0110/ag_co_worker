import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  IMAGE_ENTITY_CONSTR,
  IMAGE_TYPE_CAD,
  IMAGE_TYPE_PREVIEW,
  createAdminEntityImage,
  deleteAdminEntityImage,
  ensureConstructionImageTypes,
  listAdminEntityImages,
} from "../services/adminApi.js";
import { formatRequestError } from "../services/apiClient.js";
import { addToAdminImageLibrary, useAdminImageLibrary } from "../utils/adminImageLibrary.js";
import { isCadEntityImage } from "../utils/isolationCalcV2.js";
import AdminZoomableImage from "./AdminZoomableImage.jsx";

const SLOTS = [
  { code: IMAGE_TYPE_PREVIEW, title: "Превью", primary: true, sortOrder: 10 },
  { code: IMAGE_TYPE_CAD, title: "Чертёж", primary: false, sortOrder: 20 },
];

const displayUrl = (url) => {
  const s = String(url || "").trim();
  if (!s) return "";
  const path = s.split("?")[0];
  if (/\/api\/v2\/public\/image\/?$/i.test(path)) return "";
  return s;
};

const imageTypeCode = (row) =>
  String(row?.type?.code ?? row?.image_type_code ?? "")
    .trim()
    .toLowerCase();

const matchSlot = (row, slotCode) => {
  const code = imageTypeCode(row);
  if (slotCode === IMAGE_TYPE_CAD) {
    return code === IMAGE_TYPE_CAD || isCadEntityImage(row);
  }
  if (slotCode === IMAGE_TYPE_PREVIEW) {
    return !isCadEntityImage(row);
  }
  return code === slotCode;
};

const SlotCard = ({
  slot,
  image,
  busy,
  onPick,
  onClear,
}) => {
  const src = displayUrl(image?.url);
  return (
    <div className="admin-page__image-slot">
      <h4 className="admin-page__image-slot-title">{slot.title}</h4>
      {src ? (
        <AdminZoomableImage
          className="admin-page__images-preview"
          src={src}
          alt={slot.title}
        />
      ) : (
        <div className="admin-page__images-preview admin-page__images-thumb--empty">
          Нет картинки
        </div>
      )}
      <div className="admin-page__region-actions">
        <button
          type="button"
          className="admin-page__btn admin-page__btn--inline"
          disabled={busy}
          onClick={onPick}
        >
          Выбрать из раздела
        </button>
        {image ? (
          <button
            type="button"
            className="admin-page__btn admin-page__btn--inline admin-page__btn--danger"
            disabled={busy}
            onClick={onClear}
          >
            Снять
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default function AdminConstructionImages({
  constructionId,
  constructionCode = "",
}) {
  const library = useAdminImageLibrary();
  const [types, setTypes] = useState([]);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busySlot, setBusySlot] = useState("");
  const [pickerSlot, setPickerSlot] = useState("");

  const numericId = Number(constructionId);
  const hasEntity = Number.isFinite(numericId) && numericId > 0;

  const reload = async () => {
    if (!hasEntity) {
      setImages([]);
      return;
    }
    const rows = await listAdminEntityImages(IMAGE_ENTITY_CONSTR, numericId);
    for (const row of rows) {
      addToAdminImageLibrary(row);
    }
    setImages(rows);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const typeRows = await ensureConstructionImageTypes();
        if (cancelled) return;
        setTypes(typeRows);
        if (hasEntity) {
          const rows = await listAdminEntityImages(
            IMAGE_ENTITY_CONSTR,
            numericId
          );
          if (cancelled) return;
          for (const row of rows) addToAdminImageLibrary(row);
          setImages(rows);
        } else {
          setImages([]);
        }
      } catch (err) {
        if (!cancelled) setError(formatRequestError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasEntity, numericId]);

  const bySlot = useMemo(() => {
    const map = {};
    for (const slot of SLOTS) {
      map[slot.code] = images.find((row) => matchSlot(row, slot.code)) || null;
    }
    return map;
  }, [images]);

  const typeByCode = useMemo(() => {
    const map = {};
    for (const row of types) {
      map[row.code] = row;
    }
    return map;
  }, [types]);

  const handleAssign = async (slot, libraryItem) => {
    const type = typeByCode[slot.code];
    if (!hasEntity || !type || !libraryItem?.file_name) return;
    setBusySlot(slot.code);
    setError(null);
    try {
      const existing = images.filter((row) => matchSlot(row, slot.code));
      for (const row of existing) {
        if (row.id) await deleteAdminEntityImage(row.id);
      }
      await createAdminEntityImage({
        entity_type: IMAGE_ENTITY_CONSTR,
        entity_id: numericId,
        image_type_id: type.id,
        file_name: libraryItem.file_name,
        mime_type: libraryItem.mime_type,
        file_size: libraryItem.file_size,
        width: libraryItem.width,
        height: libraryItem.height,
        title: constructionCode
          ? `${constructionCode} ${slot.title}`
          : slot.title,
        alt: constructionCode
          ? `${slot.title} ${constructionCode}`
          : slot.title,
        sort_order: slot.sortOrder,
        is_primary: slot.primary,
      });
      await reload();
      setPickerSlot("");
    } catch (err) {
      setError(formatRequestError(err));
    } finally {
      setBusySlot("");
    }
  };

  const handleClear = async (slot) => {
    const existing = images.filter((row) => matchSlot(row, slot.code));
    if (!existing.length) return;
    setBusySlot(slot.code);
    setError(null);
    try {
      for (const row of existing) {
        if (row.id) await deleteAdminEntityImage(row.id);
      }
      await reload();
    } catch (err) {
      setError(formatRequestError(err));
    } finally {
      setBusySlot("");
    }
  };

  const picker = SLOTS.find((slot) => slot.code === pickerSlot) || null;

  return (
    <div className="admin-page__construction-images" onClick={(e) => e.stopPropagation()}>
      <div className="admin-page__composition-head admin-page__composition-head--spaced">
        <h3 className="admin-page__composition-title">Изображения</h3>
      </div>

      {error ? (
        <div className="admin-page__error" role="alert">
          <p className="admin-page__error-title">Ошибка изображений</p>
          <pre className="admin-page__error-body">{error}</pre>
        </div>
      ) : null}

      {loading ? (
        <p className="admin-page__empty admin-page__empty--inline">
          Загрузка изображений…
        </p>
      ) : (
        <div className="admin-page__image-slots">
          {SLOTS.map((slot) => (
            <SlotCard
              key={slot.code}
              slot={slot}
              image={bySlot[slot.code]}
              busy={Boolean(busySlot)}
              onPick={() => setPickerSlot(slot.code)}
              onClear={() => handleClear(slot)}
            />
          ))}
        </div>
      )}

      {picker ? (
        <div
          className="admin-page__image-picker"
          role="dialog"
          aria-label={`Выбор: ${picker.title}`}
        >
          <div className="admin-page__image-picker-head">
            <h4 className="admin-page__image-slot-title">
              Выберите {picker.title.toLowerCase()}
            </h4>
            <button
              type="button"
              className="admin-page__btn admin-page__btn--inline"
              onClick={() => setPickerSlot("")}
            >
              Закрыть
            </button>
          </div>
          {!library.length ? (
            <p className="admin-page__empty admin-page__empty--inline">
              В разделе пока нет файлов.{" "}
              <Link to="/admin?list=images">Загрузить изображения</Link>
            </p>
          ) : (
            <ul className="admin-page__images-grid">
              {library.map((item) => {
                const src = displayUrl(item.url);
                return (
                  <li key={item.file_name}>
                    <button
                      type="button"
                      className="admin-page__images-card admin-page__images-card--pick"
                      disabled={Boolean(busySlot)}
                      onClick={() => handleAssign(picker, item)}
                    >
                      {src ? (
                        <img
                          className="admin-page__images-thumb"
                          src={src}
                          alt=""
                        />
                      ) : (
                        <div className="admin-page__images-thumb admin-page__images-thumb--empty">
                          нет превью
                        </div>
                      )}
                      <span className="admin-page__images-item-title">
                        {item.title || item.file_name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
