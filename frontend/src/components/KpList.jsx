import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
  useOfferEditSession,
  useOfferEditSessionStore,
} from "../stores/offerEditSessionStore.js";
import {
  cloneOffer,
  createOffer,
  deleteOffer,
  fetchOfferPdf,
  listOffers,
} from "../services/offersApi";
import { getRegionCityLabel } from "../constants/regionSelectOptions.js";
import PdfPrintDialog from "./PdfPrintDialog.jsx";
import Pagination from "./Pagination.jsx";
import "./KpList.css";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

function formatRegionCell(region) {
  const label = getRegionCityLabel(region);
  return label || "—";
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function KpList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthed, status } = useAuth();
  const { isEditingDraft, activeOfferId, startDraft, markNewDraftOffer, isNewDraftOffer } =
    useOfferEditSession();
  const clearSession = useOfferEditSessionStore((s) => s.clearSession);
  const hasUnsavedChanges = useOfferEditSessionStore((s) => s.hasUnsavedChanges);
  const kpSnapshot = useOfferEditSessionStore((s) => s.kpSnapshot);
  const kpSnapshotsByOfferId = useOfferEditSessionStore(
    (s) => s.kpSnapshotsByOfferId,
  );
  const allowExitToList = useOfferEditSessionStore((s) => s.allowExitToList);
  const [offers, setOffers] = useState([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1, limit: PAGE_SIZE });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [loadStatus, setLoadStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [cloningId, setCloningId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  // Оффер, для которого открыт диалог печати (null → диалог закрыт).
  const [pdfDialogOffer, setPdfDialogOffer] = useState(null);
  const [pdfDialogError, setPdfDialogError] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim();
      if (next === search) return;
      setPage(1);
      setSearch(next);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

  const handleDateFilterChange = (value) => {
    setDateFilter(value);
    setPage(1);
  };

  const load = useCallback(async () => {
    setLoadStatus((s) => (s === "loaded" || s === "refreshing" ? "refreshing" : "loading"));
    setError(null);
    try {
      const data = await listOffers({
        page,
        limit: PAGE_SIZE,
        q: search,
        date: dateFilter,
      });
      setOffers(Array.isArray(data?.items) ? data.items : []);
      setMeta({ total: data?.total ?? 0, pages: data?.pages ?? 1, limit: data?.limit ?? PAGE_SIZE });
      setLoadStatus("loaded");
    } catch (err) {
      if (err?.status === 401) {
        setLoadStatus("forbidden");
      } else {
        setError(err?.message || "Не удалось загрузить список.");
        setLoadStatus("error");
      }
    }
  }, [page, search, dateFilter]);

  useEffect(() => {
    // После «Выйти» не открывать КП снова (kpExit в state или allowExitToList).
    if (allowExitToList || location.state?.kpExit === true) return;

    const explicitId = location.state?.autoOpenOfferId;
    if (explicitId) {
      navigate(`/kp/${explicitId}`, { replace: true });
      return;
    }

    if (loadStatus !== "loaded" || !isEditingDraft || !activeOfferId) return;

    const inList = offers.some((o) => String(o.id) === String(activeOfferId));
    if (isNewDraftOffer(activeOfferId) || inList) {
      navigate(`/kp/${activeOfferId}`, { replace: true });
      return;
    }

    clearSession();
  }, [
    location.state,
    isEditingDraft,
    activeOfferId,
    allowExitToList,
    loadStatus,
    offers,
    isNewDraftOffer,
    clearSession,
    navigate,
  ]);

  useEffect(() => {
    if (status === "loading") return;
    if (!isAuthed) {
      // LoginModal не открываем — просто показываем подсказку «войдите».
      // Пользователь сам решит, логиниться или уйти.
      setLoadStatus("forbidden");
      return;
    }
    load();
  }, [isAuthed, status, load]);

  const handleClone = async (id) => {
    setCloningId(id);
    try {
      const res = await cloneOffer(id);
      if (res?.id) {
        startDraft(res.id);
        navigate(`/kp/${res.id}`);
      }
    } catch (err) {
      setError(err?.message || "Не удалось скопировать оффер.");
    } finally {
      setCloningId(null);
    }
  };

  const isOfferPdfBlocked = (offerId) => {
    if (offerId == null) return false;
    const offerKey = String(offerId);
    const hasSnapshotInMap = Boolean(kpSnapshotsByOfferId?.[offerKey]);
    const hasActiveSnapshot =
      kpSnapshot != null &&
      activeOfferId != null &&
      String(activeOfferId) === offerKey;
    if (
      hasUnsavedChanges &&
      activeOfferId != null &&
      String(activeOfferId) === offerKey
    ) {
      return true;
    }
    return hasSnapshotInMap || hasActiveSnapshot;
  };

  // Открыть диалог печати: фактическая выгрузка — после заполнения полей
  // (адресат + условия) в handleConfirmPdf.
  const handleDownloadPdf = (offer) => {
    if (downloadingId) return;
    if (isOfferPdfBlocked(offer.id)) {
      setError(
        "Сначала сохраните это КП — у него есть несохранённые изменения.",
      );
      return;
    }
    setError(null);
    setPdfDialogError(null);
    setPdfDialogOffer(offer);
  };

  const handleClosePdfDialog = () => {
    if (downloadingId) return;
    setPdfDialogOffer(null);
    setPdfDialogError(null);
  };

  const handleConfirmPdf = async (printParams) => {
    const offer = pdfDialogOffer;
    if (!offer || downloadingId) return;
    setDownloadingId(offer.id);
    setPdfDialogError(null);
    try {
      const objectPart = offer.object_name?.trim() || offer.id;
      // Blob для предпросмотра в диалоге; скачивание — только по кнопке.
      return await fetchOfferPdf(offer.id, `КП ${objectPart}.pdf`, printParams);
    } catch (err) {
      setPdfDialogError(err?.message || "Не удалось сгенерировать PDF.");
      return null;
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (offer) => {
    const label = offer.object_name || "без названия";
    if (!window.confirm(`Удалить КП «${label}»? Действие нельзя отменить.`)) {
      return;
    }
    setDeletingId(offer.id);
    setError(null);
    try {
      await deleteOffer(offer.id);
      // Если удалили последний элемент на странице (кроме первой) — шаг назад,
      // иначе перезагружаем текущую (пересчитать total/pages).
      if (offers.length === 1 && page > 1) {
        setPage((p) => p - 1);
      } else {
        load();
      }
    } catch (err) {
      setError(err?.message || "Не удалось удалить КП.");
    } finally {
      setDeletingId(null);
    }
  };

  /**
   * «Новое КП»: создаёт пустой оффер (без конструкций) и редиректит на /kp/:id.
   * Пользователь заполнит форму и добавит конструкции через калькулятор позже.
   */
  const handleNew = async () => {
    if (creatingNew) return;
    setCreatingNew(true);
    setError(null);
    try {
      const offer = await createOffer({
        offerDraft: { constructions: [] },
      });
      if (offer?.id) {
        startDraft(offer.id);
        markNewDraftOffer(offer.id);
        navigate(`/kp/${offer.id}`);
      }
    } catch (err) {
      setError(err?.message || "Не удалось создать новое КП.");
    } finally {
      setCreatingNew(false);
    }
  };

  const openOffer = (id) => {
    if (isEditingDraft && activeOfferId) {
      navigate(`/kp/${activeOfferId}`);
      return;
    }
    startDraft(id);
    navigate(`/kp/${id}`);
  };

  const renderOfferActions = (o) => (
    <>
      <button
        type="button"
        className="kp-list__action-btn"
        onClick={() => handleDownloadPdf(o)}
        disabled={
          downloadingId === o.id ||
          cloningId === o.id ||
          deletingId === o.id ||
          isOfferPdfBlocked(o.id)
        }
        title={
          isOfferPdfBlocked(o.id)
            ? "Сначала сохраните КП с несохранёнными изменениями"
            : undefined
        }
      >
        {downloadingId === o.id ? "PDF..." : "Скачать PDF"}
      </button>
      <button
        type="button"
        className="kp-list__action-btn"
        onClick={() => handleClone(o.id)}
        disabled={cloningId === o.id || deletingId === o.id}
      >
        {cloningId === o.id ? "Копирование..." : "Создать на основе"}
      </button>
      <button
        type="button"
        className="kp-list__action-btn kp-list__action-btn--danger"
        onClick={() => handleDelete(o)}
        disabled={deletingId === o.id || cloningId === o.id}
        aria-label="Удалить КП"
      >
        {deletingId === o.id ? "Удаление..." : "Удалить"}
      </button>
    </>
  );

  if (status === "loading" || loadStatus === "loading") {
    return (
      <div className="kp-list">
        <p className="kp-list__empty">Загрузка...</p>
      </div>
    );
  }

  if (loadStatus === "forbidden") {
    return (
      <div className="kp-list">
        <p className="kp-list__empty">Войдите, чтобы увидеть свои КП.</p>
      </div>
    );
  }

  const hasFilters = Boolean(search || dateFilter);
  const emptyMessage = hasFilters
    ? "Ничего не найдено. Измените номер, объект или дату."
    : "Пока нет ни одного КП. Начните с калькулятора.";

  return (
    <div className="kp-list">
      <div className="kp-list__header">
        <h1 className="kp-list__title">Мои КП</h1>
        <button
          type="button"
          className="kp-list__new-btn"
          onClick={handleNew}
          disabled={creatingNew}
        >
          {creatingNew ? "Создание..." : "Новое КП"}
        </button>
      </div>

      <div className="kp-list__filters">
        <div className="kp-list__filter kp-list__filter--search">
          <label className="kp-list__search-label" htmlFor="kp-list-search">
            Поиск по номеру или объекту
          </label>
          <input
            id="kp-list-search"
            className="kp-list__search"
            type="search"
            autoComplete="off"
            placeholder="№ КП или название объекта"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="kp-list__filter kp-list__filter--date">
          <label className="kp-list__search-label" htmlFor="kp-list-date">
            Дата КП
          </label>
          <input
            id="kp-list-date"
            className="kp-list__search kp-list__date"
            type="date"
            value={dateFilter}
            onChange={(e) => handleDateFilterChange(e.target.value)}
          />
        </div>
      </div>

      {error && <div className="kp-list__error" role="alert">{error}</div>}

      {offers.length === 0 ? (
        <p className="kp-list__empty">
          {loadStatus === "refreshing" ? "Загрузка..." : emptyMessage}
        </p>
      ) : (
        <>
          <div
            className={`kp-list__results${loadStatus === "refreshing" ? " kp-list__results--refreshing" : ""}`}
          >
            <div className="kp-list__cards" role="list">
              {offers.map((o) => (
                <article key={o.id} className="kp-list__card" role="listitem">
                  <div className="kp-list__card-header">
                    <span className="kp-list__card-num">{o.kp_code || "—"}</span>
                    <button
                      type="button"
                      className="kp-list__link kp-list__card-title"
                      onClick={() => openOffer(o.id)}
                    >
                      {o.object_name || "(без названия)"}
                    </button>
                  </div>
                  <dl className="kp-list__card-meta">
                    <div className="kp-list__card-row">
                      <dt>Регион</dt>
                      <dd>{formatRegionCell(o.region)}</dd>
                    </div>
                    <div className="kp-list__card-row">
                      <dt>Дата КП</dt>
                      <dd>{o.kp_date || "—"}</dd>
                    </div>
                    <div className="kp-list__card-row">
                      <dt>Обновлено</dt>
                      <dd>{formatDate(o.updated_at)}</dd>
                    </div>
                  </dl>
                  <div className="kp-list__card-actions">{renderOfferActions(o)}</div>
                </article>
              ))}
            </div>

            <table className="kp-list__table">
              <thead>
                <tr>
                  <th className="kp-list__num-col">№</th>
                  <th>Объект</th>
                  <th>Регион</th>
                  <th>Дата КП</th>
                  <th>Обновлено</th>
                  <th className="kp-list__actions-col">Действия</th>
                </tr>
              </thead>
              <tbody>
                {offers.map((o) => (
                  <tr key={o.id}>
                    <td className="kp-list__num-cell">{o.kp_code || "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="kp-list__link"
                        onClick={() => openOffer(o.id)}
                      >
                        {o.object_name || "(без названия)"}
                      </button>
                    </td>
                    <td>{formatRegionCell(o.region)}</td>
                    <td>{o.kp_date || "—"}</td>
                    <td>{formatDate(o.updated_at)}</td>
                    <td className="kp-list__actions">{renderOfferActions(o)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            pages={meta.pages}
            total={meta.total}
            limit={meta.limit}
            onChange={setPage}
          />
        </>
      )}

      <PdfPrintDialog
        open={pdfDialogOffer != null}
        isDownloading={downloadingId != null && downloadingId === pdfDialogOffer?.id}
        error={pdfDialogError}
        onClose={handleClosePdfDialog}
        onConfirm={handleConfirmPdf}
      />
    </div>
  );
}
