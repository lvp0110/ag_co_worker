import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  useOfferEditSession,
  useOfferEditSessionStore,
} from "../stores/offerEditSessionStore.js";

/**
 * Блокирует уход с черновика КП на посторонние страницы (без useBlocker —
 * совместимо с BrowserRouter). Разрешены: /calc, /price, /info/:id, /kp/:activeOfferId.
 */
export default function OfferDraftGuard() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    isEditingDraft,
    activeOfferId,
    isPathAllowedDuringDraft,
    consumeExitToList,
  } = useOfferEditSession();
  const allowExitToList = useOfferEditSessionStore((s) => s.allowExitToList);

  useEffect(() => {
    const path = location.pathname;
    const exitingToList =
      path === "/kp/list" &&
      (allowExitToList || location.state?.kpExit === true);

    // Кнопка «Выйти»: не возвращать на /kp/:id (state.kpExit — до обновления zustand).
    if (exitingToList) {
      consumeExitToList();
      return;
    }

    if (!isEditingDraft || !activeOfferId) return;

    const session = useOfferEditSessionStore.getState();
    const hasActiveDraftWork =
      session.hasUnsavedChanges ||
      Boolean(session.kpSnapshot) ||
      session.isNewDraftOffer(activeOfferId);

    if (path === "/kp/list") {
      // Только isDraft без правок — устаревший id (другой пользователь, удалённое КП).
      if (!hasActiveDraftWork) return;
      navigate(`/kp/${activeOfferId}`, { replace: true });
      return;
    }

    if (!isPathAllowedDuringDraft(path)) {
      navigate(`/kp/${activeOfferId}`, { replace: true });
    }
  }, [
    allowExitToList,
    isEditingDraft,
    activeOfferId,
    location.pathname,
    location.state,
    navigate,
    isPathAllowedDuringDraft,
    consumeExitToList,
  ]);

  return null;
}
