import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import AppHeader from "./AppHeader";
import { getItemsWithApiImages } from "../data/items.js";
import { ensurePriceDataLoaded } from "../services/priceApi";
import "./AppLayout.css";

export default function AppLayout() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");

  useEffect(() => {
    ensurePriceDataLoaded();
    getItemsWithApiImages();
  }, []);

  return (
    <div className="app-layout">
      <AppHeader />
      <div
        className={
          isAdmin
            ? "app-layout__main app-layout__main--dark"
            : "app-layout__main"
        }
      >
        <Outlet />
      </div>
    </div>
  );
}
