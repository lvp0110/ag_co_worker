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
  flattenPublicConstructionImages,
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

const imageConstructionTypeId = (row) => {
  const id = Number(row?.construction_type_id ?? row?.construction_type?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
};

const publicImageKey = (row) =>
  `${imageConstructionTypeId(row) || 0}:${entityImageTypeCode(row)}`;

/**
 * Если у admin-записи нет url, подставляем его из публичного каталога
 * (types[].images) по id или по паре тип монтажа + тип картинки.
 */
const enrichAdminImagesFromPublic = (adminRows, publicImages) => {
  if (!Array.isArray(adminRows) || adminRows.length === 0) return adminRows || [];
  const byId = new Map();
  const byType = new Map();
  for (const img of Array.isArray(publicImages) ? publicImages : []) {
    const id = Number(img?.id);
    if (Number.isFinite(id) && id > 0) byId.set(id, img);
    const key = publicImageKey(img);
    if (key !== "0:") byType.set(key, img);
  }

  return adminRows.map((row) => {
    if (resolveAdminPublicImageUrl(row)) return row;
    const pub =
      (row.id && byId.get(Number(row.id))) ||
      byType.get(publicImageKey(row)) ||
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
    return flattenPublicConstructionImages(match);
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

const slotRows = (images, constrType, slot, constructionTypes) => {
  const typeId = Number(constrType?.id);
  const firstTypeId = Number(constructionTypes?.[0]?.id);
  return images.filter((row) => {
    if (!matchSlot(row, slot.code)) return false;
    const rowTypeId = imageConstructionTypeId(row);
    if (rowTypeId) return rowTypeId === typeId;
    return typeId === firstTypeId;
  });
};

export default function AdminConstructionImages({
  constructionId,
  constructionCode = "",
  constructionTypes = [],
}) {
  const [types, setTypes] = useState([]);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busySlot, setBusySlot] = useState("");
  const inputRefs = useRef({});
  const fileInputRef = (typeId, slotCode) => {
    const key = `${typeId}:${slotCode}`;
    if (!inputRefs.current[key]) inputRefs.current[key] = { current: null };
    return inputRefs.current[key];
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

  const imageByTypeSlot = useMemo(() => {
    const map = {};
    for (const constrType of constructionTypes) {
      for (const slot of SLOTS) {
        const rows = slotRows(images, constrType, slot, constructionTypes);
        map[`${constrType.id}:${slot.code}`] = rows[0] || null;
      }
    }
    return map;
  }, [images, constructionTypes]);

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

  const handleUpload = async (slot, fileList, constrType) => {
    const file = fileList?.[0];
    const input = fileInputRef(constrType?.id, slot.code).current;
    if (input) input.value = "";
    if (!file) return;
    if (!hasEntity) {
      setError("Сначала сохраните конструкцию, затем загрузите изображение.");
      return;
    }
    const constructionTypeId = Number(constrType?.id);
    if (!Number.isFinite(constructionTypeId) || constructionTypeId <= 0) {
      setError("Сначала сохраните тип монтажа конструкции.");
      return;
    }

    const slotKey = `${constructionTypeId}:${slot.code}`;
    setBusySlot(slotKey);
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

      const existing = slotRows(images, constrType, slot, constructionTypes);
      for (const row of existing) {
        if (row.id) await deleteAdminEntityImage(row.id);
      }

      const typeName = String(constrType.name || constrType.code || "").trim();
      const created = await createAdminEntityImage({
        entity_type: IMAGE_ENTITY_CONSTR,
        entity_id: numericId,
        construction_type_id: constructionTypeId,
        image_type_id: type.id,
        file_name: uploaded.file_name,
        mime_type: uploaded.mime_type || file.type || "",
        file_size: uploaded.file_size || file.size || 0,
        width: uploaded.width,
        height: uploaded.height,
        title: [constructionCode, typeName, slot.title].filter(Boolean).join(" "),
        alt: [slot.title, constructionCode, typeName].filter(Boolean).join(" "),
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
        const dropIds = new Set(
          slotRows(prev, constrType, slot, constructionTypes)
            .map((row) => row.id)
            .filter(Boolean)
        );
        const rest = prev.filter((row) => {
          if (row.id && dropIds.has(row.id)) return false;
          return !slotRows([row], constrType, slot, constructionTypes).length;
        });
        return [
          ...rest,
          {
            ...(created && typeof created === "object" ? created : {}),
            id: created?.id || null,
            file_name: uploaded.file_name,
            url: durableUrl,
            mime_type: created?.mime_type || uploaded.mime_type || file.type,
            construction_type_id: constructionTypeId,
            construction_type: {
              id: constructionTypeId,
              code: constrType.code || "",
              name: constrType.name || "",
            },
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

  const handleClear = async (slot, constrType) => {
    const existing = slotRows(images, constrType, slot, constructionTypes);
    if (!existing.length) return;
    const constructionTypeId = Number(constrType?.id);
    setBusySlot(`${constructionTypeId}:${slot.code}`);
    setError(null);
    try {
      for (const row of existing) {
        if (row.id) await deleteAdminEntityImage(row.id);
      }
      setImages((prev) =>
        prev.filter(
          (row) => !slotRows([row], constrType, slot, constructionTypes).length
        )
      );
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
      ) : !constructionTypes.length ? (
        <p className="admin-page__empty admin-page__empty--inline">
          Сохраните тип монтажа, чтобы загрузить изображения.
        </p>
      ) : (
        constructionTypes.map((constrType) => {
          const typeLabel =
            String(constrType.name || "").trim() ||
            String(constrType.code || "").trim() ||
            `Тип ${constrType.id}`;
          return (
            <section
              key={constrType.id}
              className="admin-page__image-type"
            >
              <h4 className="admin-page__image-type-title">{typeLabel}</h4>
              <div className="admin-page__image-slots">
                {SLOTS.map((slot) => (
                  <SlotCard
                    key={`${constrType.id}:${slot.code}`}
                    slot={slot}
                    image={
                      imageByTypeSlot[`${constrType.id}:${slot.code}`] || null
                    }
                    busy={Boolean(busySlot) || !hasEntity}
                    fileInputRef={fileInputRef(constrType.id, slot.code)}
                    onPickFile={(e) =>
                      handleUpload(slot, e.target.files, constrType)
                    }
                    onClear={() => handleClear(slot, constrType)}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
