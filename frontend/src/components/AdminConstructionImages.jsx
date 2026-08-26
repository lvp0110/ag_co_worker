import { useEffect, useMemo, useRef, useState } from "react";
import {
  IMAGE_ENTITY_CONSTR,
  IMAGE_TYPE_CAD,
  IMAGE_TYPE_PREVIEW,
  createAdminEntityImage,
  deleteAdminEntityImage,
  ensureConstructionImageTypes,
  listAdminEntityImages,
  uploadAdminImage,
} from "../services/adminApi.js";
import { formatRequestError } from "../services/apiClient.js";
import { listPublicConstructions } from "../services/constructionApi.js";
import {
  adminImageSrc,
  resolveAdminPublicImageUrl,
  setAdminImageBlobPreview,
} from "../utils/adminImageSrc.js";
import {
  imageTypeCode as entityImageTypeCode,
  isCadEntityImage,
} from "../utils/isolationCalcV2.js";
import AdminZoomableImage from "./AdminZoomableImage.jsx";

const SLOTS = [
  { code: IMAGE_TYPE_PREVIEW, title: "Превью", primary: true, sortOrder: 10 },
  { code: IMAGE_TYPE_CAD, title: "Чертёж", primary: false, sortOrder: 20 },
];

const matchSlot = (row, slotCode) => {
  const code = entityImageTypeCode(row);
  if (slotCode === IMAGE_TYPE_CAD) {
    return code === IMAGE_TYPE_CAD || isCadEntityImage(row);
  }
  if (slotCode === IMAGE_TYPE_PREVIEW) {
    return !isCadEntityImage(row);
  }
  return code === slotCode;
};

/**
 * GET /admin/images на сервисе не SELECT'ит file_name → URL пустой stub.
 * Публичный каталог отдаёт url — подмешиваем по id / типу.
 */
const enrichAdminImagesFromPublic = (adminRows, publicImages) => {
  if (!Array.isArray(adminRows) || adminRows.length === 0) return adminRows || [];
  const byId = new Map();
  const byType = new Map();
  for (const img of Array.isArray(publicImages) ? publicImages : []) {
    const id = Number(img?.id);
    if (Number.isFinite(id) && id > 0) byId.set(id, img);
    const code = entityImageTypeCode(img);
    if (code) byType.set(code, img);
  }

  return adminRows.map((row) => {
    if (resolveAdminPublicImageUrl(row)) return row;
    const pub =
      (row.id && byId.get(Number(row.id))) ||
      byType.get(entityImageTypeCode(row)) ||
      null;
    if (!pub) return row;
    const fileName =
      String(row.file_name || "").trim() ||
      String(pub.file_name || "").trim() ||
      "";
    const rawUrl = String(pub.url || "").trim();
    const url =
      resolveAdminPublicImageUrl({
        file_name: fileName,
        url: rawUrl,
      }) || rawUrl;
    if (!url && !fileName) return row;
    return {
      ...row,
      file_name: fileName || row.file_name,
      url,
      type: row.type || pub.type || null,
      mime_type: row.mime_type || pub.mime_type || "",
      width: row.width || pub.width || 0,
      height: row.height || pub.height || 0,
    };
  });
};

const fetchPublicImagesForCode = async (constructionCode) => {
  const code = String(constructionCode || "").trim();
  if (!code) return [];
  try {
    const catalog = await listPublicConstructions();
    const match = catalog.find(
      (row) => String(row?.code || "").trim() === code
    );
    return Array.isArray(match?.images) ? match.images : [];
  } catch {
    return [];
  }
};

const SlotCard = ({ slot, image, busy, fileInputRef, onPickFile, onClear }) => {
  const src = adminImageSrc(image);
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
      <input
        ref={fileInputRef}
        className="admin-page__image-file-input"
        type="file"
        accept="image/*"
        disabled={busy}
        onChange={onPickFile}
      />
      <div className="admin-page__region-actions">
        <button
          type="button"
          className="admin-page__btn admin-page__btn--inline"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {busy ? "Загрузка…" : image ? "Заменить" : "Загрузить"}
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
  const [types, setTypes] = useState([]);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busySlot, setBusySlot] = useState("");
  const previewInputRef = useRef(null);
  const cadInputRef = useRef(null);
  const inputRefByCode = {
    [IMAGE_TYPE_PREVIEW]: previewInputRef,
    [IMAGE_TYPE_CAD]: cadInputRef,
  };

  const numericId = Number(constructionId);
  const hasEntity = Number.isFinite(numericId) && numericId > 0;

  const loadImages = async () => {
    if (!hasEntity) {
      setImages([]);
      return [];
    }
    const rows = await listAdminEntityImages(IMAGE_ENTITY_CONSTR, numericId);
    const needsUrl = rows.some((row) => !resolveAdminPublicImageUrl(row));
    if (!needsUrl) {
      setImages(rows);
      return rows;
    }
    const publicImages = await fetchPublicImagesForCode(constructionCode);
    const merged = enrichAdminImagesFromPublic(rows, publicImages);
    setImages(merged);
    return merged;
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
          const needsUrl = rows.some((row) => !resolveAdminPublicImageUrl(row));
          if (needsUrl) {
            const publicImages = await fetchPublicImagesForCode(
              constructionCode
            );
            if (cancelled) return;
            setImages(enrichAdminImagesFromPublic(rows, publicImages));
          } else {
            setImages(rows);
          }
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
  }, [hasEntity, numericId, constructionCode]);

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

  const resolveSlotType = async (slot) => {
    let type = typeByCode[slot.code];
    if (type?.id) return type;
    const typeRows = await ensureConstructionImageTypes();
    setTypes(typeRows);
    type = typeRows.find((row) => row.code === slot.code) || null;
    if (!type?.id) {
      throw new Error(
        `Нет типа «${slot.title}» (${slot.code}). Нужен для привязки в карточке.`
      );
    }
    return type;
  };

  const handleUpload = async (slot, fileList) => {
    const file = fileList?.[0];
    const input = inputRefByCode[slot.code]?.current;
    if (input) input.value = "";
    if (!file) return;
    if (!hasEntity) {
      setError("Сначала сохраните конструкцию, затем загрузите изображение.");
      return;
    }

    setBusySlot(slot.code);
    setError(null);
    try {
      const type = await resolveSlotType(slot);
      const uploaded = await uploadAdminImage({
        entity_type: IMAGE_ENTITY_CONSTR,
        image_type_code: slot.code,
        entity_code: constructionCode,
        file,
      });
      if (!uploaded?.file_name) {
        throw new Error(`Upload не вернул file_name для «${file.name}».`);
      }

      const existing = images.filter((row) => matchSlot(row, slot.code));
      for (const row of existing) {
        if (row.id) await deleteAdminEntityImage(row.id);
      }

      const created = await createAdminEntityImage({
        entity_type: IMAGE_ENTITY_CONSTR,
        entity_id: numericId,
        image_type_id: type.id,
        file_name: uploaded.file_name,
        mime_type: uploaded.mime_type || file.type || "",
        file_size: uploaded.file_size || file.size || 0,
        width: uploaded.width,
        height: uploaded.height,
        title: constructionCode
          ? `${constructionCode} ${slot.title}`
          : slot.title,
        alt: constructionCode
          ? `${slot.title} ${constructionCode}`
          : slot.title,
        sort_order: slot.sortOrder,
        is_primary: slot.primary,
      });

      const durableUrl =
        resolveAdminPublicImageUrl({
          file_name: uploaded.file_name,
          url: created?.url || uploaded.url,
        }) ||
        uploaded.url ||
        "";
      setAdminImageBlobPreview(uploaded.file_name, URL.createObjectURL(file));

      // GET /admin/images не отдаёт file_name → url пустой. Не делаем reload:
      // optimistic row + blob держат превью; после F5 url берём из публичного каталога.
      setImages((prev) => {
        const rest = prev.filter((row) => !matchSlot(row, slot.code));
        return [
          ...rest,
          {
            ...(created && typeof created === "object" ? created : {}),
            id: created?.id || null,
            file_name: uploaded.file_name,
            url: durableUrl,
            mime_type: created?.mime_type || uploaded.mime_type || file.type,
            type: created?.type || {
              id: type.id,
              code: slot.code,
              name: slot.title,
            },
            image_type_id: type.id,
            is_primary: slot.primary,
            sort_order: slot.sortOrder,
          },
        ];
      });
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
      setImages((prev) => prev.filter((row) => !matchSlot(row, slot.code)));
      await loadImages();
    } catch (err) {
      setError(formatRequestError(err));
    } finally {
      setBusySlot("");
    }
  };

  return (
    <div
      className="admin-page__construction-images"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="admin-page__composition-head admin-page__composition-head--spaced">
        <h3 className="admin-page__composition-title">Изображения</h3>
      </div>

      {!hasEntity ? (
        <p className="admin-page__empty admin-page__empty--inline">
          Сохраните конструкцию, чтобы загрузить превью и чертёж.
        </p>
      ) : null}

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
              busy={Boolean(busySlot) || !hasEntity}
              fileInputRef={inputRefByCode[slot.code]}
              onPickFile={(e) => handleUpload(slot, e.target.files)}
              onClear={() => handleClear(slot)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
