import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import {
  createCompany,
  deleteCompany,
  listCompanies,
  listCountries,
  updateCompany,
  uploadLogo,
} from "../services/adminApi.js";
import Pagination from "./Pagination.jsx";
import "./Admin.css";

const PAGE_SIZE = 20;
const DEFAULT_COUNTRY_CODE = "RU";

const EMPTY_FORM = {
  name: "",
  address: "",
  phone: "",
  country_code: DEFAULT_COUNTRY_CODE,
  ogrn: "",
  ogrnip: "",
  kpp: "",
  inn: "",
};

function CompanyModal({ initial, countries, onClose, onSaved }) {
  const isEdit = Boolean(initial?.id);
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    address: initial?.address ?? "",
    phone: initial?.phone ?? "",
    country_code: initial?.country_code ?? DEFAULT_COUNTRY_CODE,
    ogrn: initial?.ogrn ?? "",
    ogrnip: initial?.ogrnip ?? "",
    kpp: initial?.kpp ?? "",
    inn: initial?.inn ?? "",
    logo_url: initial?.logo_url ?? "",
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef(null);

  const onChange = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const onLogoPick = () => {
    if (uploadingLogo || saving) return;
    logoInputRef.current?.click();
  };

  const onLogoFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // позволяет выбрать тот же файл повторно
    if (!file) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const { url } = await uploadLogo(file);
      setForm((prev) => ({ ...prev, logo_url: url }));
    } catch (err) {
      setError(err?.message || "Не удалось загрузить логотип");
    } finally {
      setUploadingLogo(false);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Укажите название фирмы");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        country_code: form.country_code,
        ogrn: form.ogrn.trim() || null,
        ogrnip: form.ogrnip.trim() || null,
        kpp: form.kpp.trim() || null,
        inn: form.inn.trim() || null,
        logo_url: form.logo_url || null,
      };
      const saved = isEdit
        ? await updateCompany(initial.id, body)
        : await createCompany(body);
      onSaved(saved, isEdit);
    } catch (err) {
      setError(err?.message || "Не удалось сохранить компанию");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal__backdrop" onClick={() => !saving && onClose()}>
      <form
        className="admin-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <h2 className="admin-modal__title">
          {isEdit ? "Редактировать компанию" : "Новая компания"}
        </h2>
        {error && <div className="admin-modal__error">{error}</div>}
        <label className="admin-modal__field">
          <span>Название фирмы *</span>
          <input value={form.name} onChange={onChange("name")} required />
        </label>
        <label className="admin-modal__field">
          <span>Адрес фирмы</span>
          <input value={form.address} onChange={onChange("address")} />
        </label>
        <label className="admin-modal__field">
          <span>Телефон</span>
          <input value={form.phone} onChange={onChange("phone")} inputMode="tel" />
        </label>
        <label className="admin-modal__field">
          <span>Страна *</span>
          <select value={form.country_code} onChange={onChange("country_code")} required>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-modal__field">
          <span>ОГРН</span>
          <input value={form.ogrn} onChange={onChange("ogrn")} inputMode="numeric" />
        </label>
        <label className="admin-modal__field">
          <span>ОГРНИП</span>
          <input value={form.ogrnip} onChange={onChange("ogrnip")} inputMode="numeric" />
        </label>
        <label className="admin-modal__field">
          <span>КПП</span>
          <input value={form.kpp} onChange={onChange("kpp")} inputMode="numeric" />
        </label>
        <label className="admin-modal__field">
          <span>ИНН</span>
          <input value={form.inn} onChange={onChange("inn")} inputMode="numeric" />
        </label>
        <div className="admin-modal__field">
          <span>Логотип</span>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: "none" }}
            onChange={onLogoFileChange}
          />
          <div className="admin-logo">
            {form.logo_url ? (
              <img className="admin-logo__preview" src={form.logo_url} alt="Логотип" />
            ) : (
              <div className="admin-logo__placeholder">Не загружен</div>
            )}
            <button
              type="button"
              className="admin-modal__btn admin-modal__btn--ghost"
              onClick={onLogoPick}
              disabled={uploadingLogo || saving}
            >
              {uploadingLogo
                ? "Загрузка..."
                : form.logo_url
                ? "Заменить"
                : "Загрузить"}
            </button>
          </div>
          <small className="admin-logo__hint">PNG, JPEG или WebP, до 1 MB.</small>
        </div>
        <div className="admin-modal__actions">
          <button
            type="button"
            className="admin-modal__btn admin-modal__btn--ghost"
            onClick={onClose}
            disabled={saving}
          >
            Отмена
          </button>
          <button
            type="submit"
            className="admin-modal__btn admin-modal__btn--primary"
            disabled={saving}
          >
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState([]);
  const [countries, setCountries] = useState([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1, limit: PAGE_SIZE });
  const [loadStatus, setLoadStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null); // null | { initial }
  const [deletingId, setDeletingId] = useState(null);
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get("focus");
  const focusedRowRef = useRef(null);

  // Справочник стран грузим один раз — нужен для селекта в форме.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listCountries();
        if (!cancelled) setCountries(Array.isArray(data) ? data : []);
      } catch {
        // Не критично: без справочника селект будет пустым.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoadStatus("loading");
    setError(null);
    try {
      const data = await listCompanies({ page, limit: PAGE_SIZE });
      setCompanies(Array.isArray(data?.items) ? data.items : []);
      setMeta({ total: data?.total ?? 0, pages: data?.pages ?? 1, limit: data?.limit ?? PAGE_SIZE });
      setLoadStatus("loaded");
    } catch (err) {
      setError(err?.message || "Не удалось загрузить компании");
      setLoadStatus("error");
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (focusId && focusedRowRef.current) {
      focusedRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusId, companies]);

  const handleSaved = () => {
    setModal(null);
    load();
  };

  const handleDelete = async (company) => {
    if (company.users_count > 0) {
      setError("Нельзя удалить компанию с привязанными сотрудниками");
      return;
    }
    if (!window.confirm(`Удалить компанию «${company.name}»?`)) return;
    setDeletingId(company.id);
    setError(null);
    try {
      await deleteCompany(company.id);
      // Если удалили последний элемент на странице (кроме первой) — шаг назад,
      // иначе перезагружаем текущую (пересчитать total/pages).
      if (companies.length === 1 && page > 1) {
        setPage((p) => p - 1);
      } else {
        load();
      }
    } catch (err) {
      setError(err?.message || "Не удалось удалить компанию");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Админка</h1>
        <button
          type="button"
          className="admin-page__primary-btn"
          onClick={() => setModal({ initial: EMPTY_FORM })}
        >
          Новая компания
        </button>
      </div>

      <nav className="admin-page__tabs">
        <NavLink
          to="/admin/users"
          className={({ isActive }) =>
            `admin-page__tab${isActive ? " admin-page__tab--active" : ""}`
          }
        >
          Пользователи
        </NavLink>
        <NavLink
          to="/admin/companies"
          className={({ isActive }) =>
            `admin-page__tab${isActive ? " admin-page__tab--active" : ""}`
          }
        >
          Компании
        </NavLink>
      </nav>

      {error && <div className="admin-page__error" role="alert">{error}</div>}

      {loadStatus === "loading" ? (
        <p className="admin-page__empty">Загрузка...</p>
      ) : companies.length === 0 ? (
        <p className="admin-page__empty">Пока нет ни одной компании.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Лого</th>
              <th>Название</th>
              <th>Адрес</th>
              <th>Телефон</th>
              <th>Страна</th>
              <th>ОГРН</th>
              <th>ОГРНИП</th>
              <th>КПП</th>
              <th>ИНН</th>
              <th>Сотрудников</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr
                key={c.id}
                ref={c.id === focusId ? focusedRowRef : null}
                className={c.id === focusId ? "admin-table__row--focused" : undefined}
              >
                <td>
                  {c.logo_url ? (
                    <img
                      className="admin-table__logo"
                      src={c.logo_url}
                      alt={`Логотип ${c.name}`}
                    />
                  ) : (
                    "—"
                  )}
                </td>
                <td>{c.name}</td>
                <td>{c.address || "—"}</td>
                <td>{c.phone || "—"}</td>
                <td>{c.country || "—"}</td>
                <td>{c.ogrn || "—"}</td>
                <td>{c.ogrnip || "—"}</td>
                <td>{c.kpp || "—"}</td>
                <td>{c.inn || "—"}</td>
                <td>{c.users_count}</td>
                <td>
                  <button
                    type="button"
                    className="admin-table__action-btn"
                    onClick={() => setModal({ initial: c })}
                  >
                    Изменить
                  </button>
                  <button
                    type="button"
                    className="admin-table__action-btn admin-table__action-btn--danger"
                    onClick={() => handleDelete(c)}
                    disabled={deletingId === c.id || c.users_count > 0}
                    title={
                      c.users_count > 0
                        ? "Сначала отвяжите всех сотрудников"
                        : undefined
                    }
                  >
                    {deletingId === c.id ? "Удаление..." : "Удалить"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {loadStatus === "loaded" && (
        <Pagination
          page={page}
          pages={meta.pages}
          total={meta.total}
          limit={meta.limit}
          onChange={setPage}
        />
      )}

      {modal && (
        <CompanyModal
          initial={modal.initial}
          countries={countries}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
