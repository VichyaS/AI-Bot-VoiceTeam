import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import PortalPage from './pages/PortalPage';
import ConfigPage from './pages/ConfigPage';
import MonitorPage from './pages/MonitorPage';
import UnhandledPage from './pages/UnhandledPage';
import DepartmentPage from './pages/DepartmentPage';
import UsersPage from './pages/UsersPage';
import FallbackMappingsPage from './pages/FallbackMappingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/portal"
            element={
              <ProtectedRoute>
                <PortalPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/config"
            element={
              <ProtectedRoute allowedRole="SUPER_ADMIN">
                <ConfigPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/monitor"
            element={
              <ProtectedRoute>
                <MonitorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/unhandled"
            element={
              <ProtectedRoute>
                <UnhandledPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/departments"
            element={
              <ProtectedRoute>
                <DepartmentPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/fallback-mappings"
            element={
              <ProtectedRoute allowedRole="SUPER_ADMIN">
                <FallbackMappingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute allowedRole="SUPER_ADMIN">
                <UsersPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}