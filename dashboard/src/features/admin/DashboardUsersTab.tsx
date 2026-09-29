import { useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { UserAvatar } from '@/components/UserAvatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DataTable } from '@/components/data-table';
import {
  useDashboardUsers,
  useToggleUserActive,
  useResetPassword,
  useCurrentUser,
  type DashboardUserRow,
} from '@/hooks/queries';

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds === 0) return '0s';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Nie';
  try {
    return new Date(dateStr).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Ungültig';
  }
}

function displayName(row: DashboardUserRow): string {
  if (row.mocoUser) {
    const fn = `${row.mocoUser.firstname ?? ''} ${row.mocoUser.lastname ?? ''}`.trim();
    if (fn) return fn;
  }
  return row.name;
}

interface DashboardUsersTabProps {
  globalFilter?: string;
}

/**
 * Dashboard-Zugänge: Aktivieren/Deaktivieren per Switch (mit Bestätigung beim Deaktivieren).
 * Suche kommt vom Parent-Tab über `globalFilter`.
 */
export function DashboardUsersTab({ globalFilter = '' }: DashboardUsersTabProps) {
  const [confirm, setConfirm] = useState<DashboardUserRow | null>(null);
  const [confirmReset, setConfirmReset] = useState<DashboardUserRow | null>(null);

  const { data: users = [], isLoading } = useDashboardUsers();
  const { data: currentUser } = useCurrentUser();
  const toggleActive = useToggleUserActive();
  const resetPassword = useResetPassword();

  const canResetPasswords = currentUser?.superUser === true;

  const handleResetPassword = async () => {
    if (!confirmReset) return;
    try {
      await resetPassword.mutateAsync(confirmReset.id);
      toast.success(`Passwort von ${displayName(confirmReset)} wurde zurückgesetzt`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Passwort-Reset fehlgeschlagen');
    } finally {
      setConfirmReset(null);
    }
  };

  const runToggle = async (target: DashboardUserRow, active: boolean) => {
    try {
      await toggleActive.mutateAsync({ userId: target.id, active });
      toast.success(
        active
          ? `${displayName(target)} aktiviert`
          : `${displayName(target)} deaktiviert`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Aktualisieren fehlgeschlagen');
    } finally {
      setConfirm(null);
    }
  };

  const columns: ColumnDef<DashboardUserRow>[] = [
    {
      accessorKey: 'name',
      header: 'User',
      cell: ({ row }) => {
        const u = row.original;
        const url = u.mocoUser?.avatar ?? null;
        return (
          <div className="flex items-center gap-3">
            <UserAvatar avatarUrl={url} displayName={displayName(u)} size="md" />
            <div className="flex flex-col leading-tight">
              <span className="font-medium">{displayName(u)}</span>
              {u.mocoUser?.title && (
                <span className="text-xs text-muted-foreground">{u.mocoUser.title}</span>
              )}
            </div>
          </div>
        );
      },
      filterFn: (row, _id, value) => {
        const text = `${displayName(row.original)} ${row.original.email}`.toLowerCase();
        return text.includes(String(value).toLowerCase());
      },
    },
    {
      accessorKey: 'email',
      header: 'E-Mail',
      cell: ({ row }) => row.original.email,
    },
    {
      accessorKey: 'mocoUnitName',
      header: 'Team',
      cell: ({ row }) => row.original.mocoUnitName ?? '—',
    },
    {
      id: 'dashboardAccess',
      header: 'Dashboard-Zugang',
      cell: ({ row }) => {
        const u = row.original;
        const busy =
          toggleActive.isPending &&
          toggleActive.variables &&
          toggleActive.variables.userId === u.id;
        return (
          <div className="flex items-center gap-3">
            <Switch
              checked={u.active}
              disabled={busy}
              onCheckedChange={(on) => {
                if (on === u.active) return;
                if (!on && u.active) {
                  setConfirm(u);
                  return;
                }
                if (on && !u.active) {
                  void runToggle(u, true);
                }
              }}
              aria-label={
                u.active ? 'Dashboard-Zugang deaktivieren' : 'Dashboard-Zugang aktivieren'
              }
            />
            {u.active ? (
              <Badge className="bg-billable text-billable-foreground hover:bg-billable/90">
                Aktiv
              </Badge>
            ) : (
              <Badge variant="destructive">Inaktiv</Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'lastLoginAt',
      header: 'Letzter Login',
      cell: ({ row }) => formatDate(row.original.lastLoginAt),
    },
    {
      accessorKey: 'lastSessionDuration',
      header: 'Letzte Session',
      cell: ({ row }) => formatDuration(row.original.lastSessionDuration),
    },
    {
      accessorKey: 'totalSessionTime',
      header: 'Gesamtzeit',
      cell: ({ row }) => formatDuration(row.original.totalSessionTime),
    },
    ...(canResetPasswords
      ? ([
          {
            id: 'actions',
            header: '',
            cell: ({ row }: { row: { original: DashboardUserRow } }) => {
              const u = row.original;
              if (!u.active) return null;
              return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setConfirmReset(u)}
                      aria-label="Passwort zurücksetzen"
                    >
                      <KeyRound className="text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Passwort zurücksetzen</TooltipContent>
                </Tooltip>
              );
            },
          },
        ] as ColumnDef<DashboardUserRow>[])
      : []),
  ];

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={users}
            loading={isLoading}
            globalFilter={globalFilter}
            emptyTitle="Keine Dashboard-Zugänge"
            emptyDescription="Nach Einladung und Passwort-Setzung erscheinen Nutzer hier — Zugang per Schalter steuerbar."
          />
        </CardContent>
      </Card>

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dashboard-Zugang deaktivieren?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm
                ? `${displayName(confirm)} verliert sofort die Anmeldung am Dashboard.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirm && void runToggle(confirm, false)}
              disabled={toggleActive.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deaktivieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmReset} onOpenChange={(open) => !open && setConfirmReset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Passwort zurücksetzen?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmReset
                ? `Das Passwort von ${displayName(confirmReset)} wird ungültig. Der Account wird deaktiviert und eine Reset-E-Mail mit einem neuen Link (7 Tage gültig) gesendet.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleResetPassword()}
              disabled={resetPassword.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resetPassword.isPending && <Spinner data-icon="inline-start" />}
              Passwort zurücksetzen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
