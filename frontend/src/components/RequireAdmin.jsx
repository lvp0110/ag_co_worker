import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * Гард для админ-роутов: пускает только пользователей с role === 'ADMIN'.
 * Во время bootstrap (status === 'loading') ничего не рендерим, иначе редирект на /calc.
 */
export default function RequireAdmin({ children }) {
  const { user, status } = useAuth();

  if (status === "loading") return null;
  if (user?.role !== "ADMIN") return <Navigate to="/calc" replace />;

  return children;
}
