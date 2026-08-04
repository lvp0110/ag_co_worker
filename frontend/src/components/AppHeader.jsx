import { useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getImageUrl } from "../services/api.js";
import "./AppHeader.css";

const navLinkClass = ({ isActive }) =>
  `app-header__link${isActive ? " app-header__link--active" : ""}`;

const iconProps = {
  className: "app-header__icon-svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

function HeaderIcon({ children }) {
  return <span className="app-header__icon">{children}</span>;
}

function MaskedNavIcon({ src }) {
  return (
    <span
      className="app-header__icon-svg app-header__masked-icon"
      style={{ "--app-header-mask-icon-src": `url("${src}")` }}
      aria-hidden
    />
  );
}

function IconUser() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20c0-4 3.5-6 7-6s7 2 7 6" />
    </svg>
  );
}

function IconLogin() {
  return <IconUser />;
}

function IconLogout() {
  return (
    <svg {...iconProps}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function IconAdmin() {
  return (
    <svg {...iconProps}>
      <path d="M12 3l7 3v5c0 4.5-2.8 7.8-7 9-4.2-1.2-7-4.5-7-9V6l7-3z" />
      <path d="M9.5 12l1.8 1.8L15 10" />
    </svg>
  );
}

export default function AppHeader() {
  const innerRef = useRef(null);
  const logoSrc = `${import.meta.env.BASE_URL}logo1.png`;
  const calcIconSrc = getImageUrl("calc.svg");
  const kpIconSrc = getImageUrl("kp.svg");
  const priceIconSrc = getImageUrl("price.svg");
  const location = useLocation();
  const { user, status, openLoginModal, logout } = useAuth();
  const kpNavActive =
    location.pathname === "/kp/list" ||
    (location.pathname.startsWith("/kp/") && location.pathname !== "/kp/list");

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    const syncHeaderHeight = () => {
      document.documentElement.style.setProperty(
        "--app-header-inner-height",
        `${el.getBoundingClientRect().height}px`,
      );
    };

    syncHeaderHeight();
    const observer = new ResizeObserver(syncHeaderHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, [user, status]);

  return (
    <header className="app-header">
      <div ref={innerRef} className="app-header__inner">
        <NavLink
          to="/calc"
          className="app-header__brand"
          end={false}
          title="Калькулятор конструкций"
          aria-label="Калькулятор конструкций"
        >
          <img
            src={logoSrc}
            alt=""
            className="app-header__logo"
            width={65}
            height={65}
          />
        </NavLink>
        <nav className="app-header__nav" aria-label="Разделы">
          <NavLink
            to="/calc"
            className={navLinkClass}
            end={false}
            title="Калькулятор"
            aria-label="Калькулятор"
          >
            <HeaderIcon>
              <MaskedNavIcon src={calcIconSrc} />
            </HeaderIcon>
            <span className="app-header__label">Калькулятор</span>
          </NavLink>
          {user && (
            <NavLink
              to="/kp/list"
              className={`app-header__link${kpNavActive ? " app-header__link--active" : ""}`}
              title="Мои КП"
              aria-label="Мои КП"
            >
              <HeaderIcon>
                <MaskedNavIcon src={kpIconSrc} />
              </HeaderIcon>
              <span className="app-header__label">Мои КП</span>
            </NavLink>
          )}
          <NavLink
            to="/price"
            className={navLinkClass}
            title="Прайс"
            aria-label="Прайс"
          >
            <HeaderIcon>
              <MaskedNavIcon src={priceIconSrc} />
            </HeaderIcon>
            <span className="app-header__label">Прайс</span>
          </NavLink>
          {user?.role === "ADMIN" && (
            <NavLink
              to="/admin?list=materials"
              className={({ isActive }) =>
                `app-header__link${
                  isActive || location.pathname.startsWith("/admin")
                    ? " app-header__link--active"
                    : ""
                }`
              }
              title="Админка"
              aria-label="Админка"
            >
              <HeaderIcon>
                <IconAdmin />
              </HeaderIcon>
              <span className="app-header__label">Админка</span>
            </NavLink>
          )}
        </nav>
        <div className="app-header__auth">
          {status === "loading" ? null : user ? (
            <>
              <NavLink
                to="/profile"
                className={({ isActive }) =>
                  `app-header__user${isActive ? " app-header__link--active" : ""}`
                }
                title={user.full_name || user.email}
                aria-label="Профиль"
              >
                <HeaderIcon>
                  <IconUser />
                </HeaderIcon>
                <span className="app-header__label">
                  {user.full_name || user.email}
                </span>
              </NavLink>
              <button
                type="button"
                className="app-header__auth-btn"
                title="Выйти"
                aria-label="Выйти"
                onClick={logout}
              >
                <HeaderIcon>
                  <IconLogout />
                </HeaderIcon>
                <span className="app-header__label">Выйти</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              className="app-header__auth-btn"
              title="Войти"
              aria-label="Войти"
              onClick={openLoginModal}
            >
              <HeaderIcon>
                <IconLogin />
              </HeaderIcon>
              <span className="app-header__label">Войти</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
