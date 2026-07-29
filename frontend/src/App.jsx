import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import Calculator from './components/Calculator';
import LoginModal from './components/LoginModal';
import { AuthProvider } from './context/AuthContext.jsx';

const ItemInfo = lazy(() => import('./components/ItemInfo'));
const KpList = lazy(() => import('./components/KpList'));
const KpPage = lazy(() => import('./components/KpPage'));
const PricePage = lazy(() => import('./components/PricePage'));
const ProfilePage = lazy(() => import('./components/ProfilePage'));

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
            </Route>
          </Routes>
        </Suspense>
        <LoginModal />
      </AuthProvider>
    </Router>
  );
}

export default App;
