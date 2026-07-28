import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import AppHeader from "./AppHeader";
import OfferDraftGuard from "./OfferDraftGuard";
import { getAllIsolationConstr } from "../services/api";
import { ensurePriceDataLoaded } from "../services/priceApi";
import "./AppLayout.css";

export default function AppLayout() {
  useEffect(() => {
    ensurePriceDataLoaded();
    getAllIsolationConstr();
  }, []);

  return (
    <div className="app-layout">
      <AppHeader />
      <div className="app-layout__main">
        <OfferDraftGuard />
        <Outlet />
      </div>
    </div>
  );
}
