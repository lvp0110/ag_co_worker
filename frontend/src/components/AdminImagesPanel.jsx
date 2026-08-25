import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  IMAGE_ENTITY_CONSTR,
  IMAGE_TYPE_PREVIEW,
  ensureConstructionImageTypes,
  uploadAdminImage,
} from "../services/adminApi.js";
import { formatRequestError } from "../services/apiClient.js";
import {
  addToAdminImageLibrary,
  removeFromAdminImageLibrary,
  useAdminImageLibrary,
} from "../utils/adminImageLibrary.js";
import {
  adminImageSrc,
  clearAdminImageBlobPreview,
  setAdminImageBlobPreview,
} from "../utils/adminImageSrc.js";
import AdminZoomableImage from "./AdminZoomableImage.jsx";

export default function AdminImagesPanel() {
  const library = useAdminImageLibrary();
  const [fileKey, setFileKey] = useState(0);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  // bump after blob cache write so thumbs re-render
  const [previewTick, setPreviewTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const types = await ensureConstructionImageTypes();
        if (cancelled) return;
        if (!types.some((row) => row.code === IMAGE_TYPE_PREVIEW)) {
          throw new Error(
            "Нет типа «preview». Нужен для загрузки в раздел «Изображения»."
          );
        }
        setReady(true);
      } catch (err) {
        if (!cancelled) {
          setReady(false);
          setError(formatRequestError(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!files.length || !ready) return;
    setUploading(true);
    setError(null);
    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        setProgress(`Загрузка ${i + 1} из ${files.length}: ${file.name}`);
        const uploaded = await uploadAdminImage({
          entity_type: IMAGE_ENTITY_CONSTR,
          image_type_code: IMAGE_TYPE_PREVIEW,
          file,
        });
        if (!uploaded?.file_name) {
          throw new Error(`Upload не вернул file_name для «${file.name}».`);
        }
        // Превью из файла — public/image с вложенным constr/preview/… сейчас 404.
        setAdminImageBlobPreview(uploaded.file_name, URL.createObjectURL(file));
        addToAdminImageLibrary({
          ...uploaded,
          title: file.name,
        });
        setPreviewTick((n) => n + 1);
      }
      setFiles([]);
      setFileKey((n) => n + 1);
      setProgress("");
    } catch (err) {
      setError(formatRequestError(err));
    } finally {
      setUploading(false);
      setProgress("");
    }
  };

  return (
    <section className="admin-page__card">
      <div className="admin-page__card-head">
        <h2 className="admin-page__card-title">
          Изображения
          <span className="admin-page__count">{library.length}</span>
        </h2>
      </div>

      <p className="admin-page__images-hint">
        Здесь только загрузка файлов. Превью и чертёж выбираются в карточке
        конструкции на вкладке{" "}
        <Link to="/admin?list=constructions">Конструкции</Link>.
      </p>

      <form className="admin-page__images-upload" onSubmit={handleUpload}>
        <label className="admin-page__field">
          <span className="admin-page__field-label">Файлы</span>
          <input
            key={fileKey}
            className="admin-page__input"
            type="file"
            accept="image/*"
            multiple
            disabled={uploading || !ready}
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
          />
        </label>
        <div className="admin-page__field admin-page__field--action">
          <button
            type="submit"
            className="admin-page__btn admin-page__btn--inline"
            disabled={uploading || !ready || !files.length}
          >
            {uploading ? "Загрузка…" : "Загрузить"}
          </button>
        </div>
      </form>

      {progress ? (
        <p className="admin-page__empty admin-page__empty--inline" role="status">
          {progress}
        </p>
      ) : null}

      {error ? (
        <div className="admin-page__error" role="alert">
          <p className="admin-page__error-title">Не удалось загрузить</p>
          <pre className="admin-page__error-body">{error}</pre>
        </div>
      ) : null}

      {!library.length ? (
        <p className="admin-page__empty">Пока нет загруженных картинок.</p>
      ) : (
        <ul className="admin-page__images-grid" data-preview-tick={previewTick}>
          {library.map((item) => {
            const src = adminImageSrc(item);
            return (
              <li key={item.file_name} className="admin-page__images-card">
                {src ? (
                  <AdminZoomableImage
                    className="admin-page__images-thumb"
                    src={src}
                    alt={item.title || item.file_name}
                  />
                ) : (
                  <div className="admin-page__images-thumb admin-page__images-thumb--empty">
                    нет превью
                  </div>
                )}
                <p className="admin-page__images-item-title">
                  {item.title || item.file_name}
                </p>
                <button
                  type="button"
                  className="admin-page__btn admin-page__btn--icon admin-page__btn--danger"
                  aria-label={`Убрать ${item.title || item.file_name}`}
                  title="Убрать из раздела"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearAdminImageBlobPreview(item.file_name);
                    removeFromAdminImageLibrary(item.file_name);
                  }}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
