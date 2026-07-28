import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import "./LoginModal.css";

export default function LoginModal() {
  const { loginModal, closeLoginModal, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const emailInputRef = useRef(null);

  useEffect(() => {
    if (loginModal.isOpen) {
      document.body.style.overflow = "hidden";
      setTimeout(() => emailInputRef.current?.focus(), 0);
    } else {
      document.body.style.overflow = "";
      setError(null);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [loginModal.isOpen]);

  useEffect(() => {
    if (!loginModal.isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") closeLoginModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [loginModal.isOpen, closeLoginModal]);

  if (!loginModal.isOpen) return null;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email: email.trim().toLowerCase(), password });
      setEmail("");
      setPassword("");
    } catch (err) {
      setError(err?.message || "Не удалось войти");
    } finally {
      setSubmitting(false);
    }
  };

  const onBackdropClick = (e) => {
    if (e.target === e.currentTarget) closeLoginModal();
  };

  return (
    <div className="login-modal__backdrop" onClick={onBackdropClick}>
      <div className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-modal-title">
        <button
          type="button"
          className="login-modal__close"
          onClick={closeLoginModal}
          aria-label="Закрыть"
        >
          ×
        </button>
        <h2 id="login-modal-title" className="login-modal__title">Вход</h2>
        <form onSubmit={onSubmit} className="login-modal__form" noValidate>
          <label className="login-modal__field">
            <span>Email</span>
            <input
              ref={emailInputRef}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="login-modal__field">
            <span>Пароль</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>
          {error && <div className="login-modal__error" role="alert">{error}</div>}
          <button type="submit" className="login-modal__submit" disabled={submitting}>
            {submitting ? "Вход..." : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
