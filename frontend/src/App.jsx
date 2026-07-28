import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import Calculator from './components/Calculator';
import LoginModal from './components/LoginModal';
import RequireAdmin from './components/RequireAdmin';
import { AuthProvider } from './context/AuthContext.jsx';

const ItemInfo = lazy(() => import('./components/ItemInfo'));
const KpList = lazy(() => import('./components/KpList'));
const KpPage = lazy(() => import('./components/KpPage'));
const PricePage = lazy(() => import('./components/PricePage'));
const AdminUsersPage = lazy(() => import('./components/AdminUsersPage'));
const AdminCompaniesPage = lazy(() => import('./components/AdminCompaniesPage'));
const ProfilePage = lazy(() => import('./components/ProfilePage'));

// Определяем basename для GitHub Pages
// В production используем base path из Vite, в dev - пустая строка
const basename = import.meta.env.BASE_URL || '/';

function RouteFallback() {
  return (
    <div style={{ padding: '1.5rem', textAlign: 'center', color: '#5c6570' }}>
      Загрузка…
    </div>
  );
}

function App() {
  return (
    <Router basename={basename}>
      <AuthProvider>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Navigate to="/calc" replace />} />
            <Route element={<AppLayout />}>
              <Route path="/calc/:id?" element={<Calculator />} />
              <Route path="/kp/list" element={<KpList />} />
              <Route path="/kp/:id" element={<KpPage />} />
              <Route path="/price" element={<PricePage />} />
              <Route path="/info/:id" element={<ItemInfo />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
              <Route
                path="/admin/users"
                element={
                  <RequireAdmin>
                    <AdminUsersPage />
                  </RequireAdmin>
                }
              />
              <Route
                path="/admin/companies"
                element={
                  <RequireAdmin>
                    <AdminCompaniesPage />
                  </RequireAdmin>
                }
              />
            </Route>
          </Routes>
        </Suspense>
        <LoginModal />
      </AuthProvider>
    </Router>
  );
}

export default App;
