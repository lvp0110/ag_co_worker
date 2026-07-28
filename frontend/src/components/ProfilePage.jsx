import { useAuth } from "../context/AuthContext.jsx";
import "./ProfilePage.css";

function Row({ label, value }) {
  return (
    <div className="profile-page__row">
      <dt className="profile-page__label">{label}</dt>
      <dd className="profile-page__value">{value || "—"}</dd>
    </div>
  );
}

export default function ProfilePage() {
  const { user, status } = useAuth();

  if (status === "loading") {
    return (
      <div className="profile-page">
        <p className="profile-page__empty">Загрузка...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="profile-page">
        <p className="profile-page__empty">Войдите, чтобы увидеть профиль.</p>
      </div>
    );
  }

  const company = user.company;

  return (
    <div className="profile-page">
      <h1 className="profile-page__title">Профиль</h1>

      <section className="profile-page__card">
        <h2 className="profile-page__card-title">Пользователь</h2>
        <dl className="profile-page__list">
          <Row label="ФИО" value={user.full_name} />
          <Row label="Email" value={user.email} />
          <Row label="Телефон" value={user.phone} />
          <Row label="Адрес офиса" value={user.office_address} />
          <Row
            label="Роль"
            value={user.role === "ADMIN" ? "Администратор" : "Пользователь"}
          />
        </dl>
      </section>

      <section className="profile-page__card">
        <h2 className="profile-page__card-title">Компания</h2>
        {company ? (
          <dl className="profile-page__list">
            <Row label="Название фирмы" value={company.name} />
            <Row label="Адрес фирмы" value={company.address} />
            <Row label="Телефон" value={company.phone} />
            <Row label="Страна" value={company.country} />
            <Row label="ОГРН" value={company.ogrn} />
            <Row label="ОГРНИП" value={company.ogrnip} />
            <Row label="КПП" value={company.kpp} />
            <Row label="ИНН" value={company.inn} />
          </dl>
        ) : (
          <p className="profile-page__empty">Компания не привязана.</p>
        )}
      </section>
    </div>
  );
}
