import { Navigate, useLocation } from 'react-router-dom';
import { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from '@/components/ui/spinner';

interface ProtectedRouteProps {
  children: ReactNode;
  requiresSuperUser?: boolean;
  minTeamLevel?: number;
}

export function ProtectedRoute({
  children,
  requiresSuperUser,
  minTeamLevel,
}: ProtectedRouteProps) {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-svh items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (requiresSuperUser && Boolean(user.superUser) !== true) {
    return <Navigate to="/timeline" replace />;
  }

  if (
    minTeamLevel !== undefined &&
    Boolean(user.superUser) !== true &&
    (user.teamLevel ?? 0) < minTeamLevel
  ) {
    return <Navigate to="/timeline" replace />;
  }

  return <>{children}</>;
}
