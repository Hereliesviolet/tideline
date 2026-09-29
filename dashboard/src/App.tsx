import { Route, Routes, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AppShell } from './app/shell/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Spinner } from './components/ui/spinner';
import { ErrorBoundary } from './components/ErrorBoundary';

const LoginPage = lazy(() => import('./features/auth/LoginPage'));
const AcceptInvitePage = lazy(() => import('./features/auth/AcceptInvitePage'));
const OverviewPage = lazy(() => import('./features/overview/OverviewPage'));
const TimelinePage = lazy(() => import('./features/timeline/TimelinePage'));
const AdminUsersPage = lazy(() => import('./features/admin/AdminUsersPage'));
const AdminSessionsPage = lazy(() => import('./features/admin/AdminSessionsPage'));
const ProfilePage = lazy(() => import('./features/profile/ProfilePage'));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage'));

function PageFallback() {
  return (
    <div className="flex h-full items-center justify-center p-12">
      <Spinner className="size-6" />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/accept-invite" element={<AcceptInvitePage />} />

        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/timeline" replace />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute requiresSuperUser>
                <OverviewPage />
              </ProtectedRoute>
            }
          />
          <Route path="/overview" element={<Navigate to="/dashboard" replace />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />

          <Route
            path="/users"
            element={
              <ProtectedRoute requiresSuperUser>
                <Navigate to="/admin/users?tab=dashboard" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users/:userId"
            element={
              <ProtectedRoute requiresSuperUser>
                <Navigate to="/admin/users?tab=dashboard" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute requiresSuperUser>
                <AdminUsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/sessions"
            element={
              <ProtectedRoute requiresSuperUser>
                <AdminSessionsPage />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/timeline" replace />} />
      </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
