import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ColumnDef } from '@tanstack/react-table';
import { Users, UserPlus, Shield, Search, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import {
  useAdminTimelineUsers,
  useAdminMocoUsers,
  useToggleAdminUserField,
  useToggleTimelineUserActive,
  useInviteFromMoco,
  useResendInvitation,
  type TimelineUserRow,
  type MocoUserRow,
} from '@/hooks/queries';
import { mapMocoUnitToTeamLevel } from '@/lib/mocoMapping';
import { DashboardUsersTab } from './DashboardUsersTab';

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { UserAvatar } from '@/components/UserAvatar';
import { DataTable } from '@/components/data-table';
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

const TEAM_LEVEL_LABELS: Record<number, string> = {
  0: '00. Prakti / Werki',
  1: '01. Analyst',
  2: '02. Berater',
  3: '03. Senior Berater',
  4: '04. Manager',
  5: '05. Senior Manager',
  6: '06. Assoc. Partner / Director',
  7: '07. Partner',
};

function fullName(u: TimelineUserRow): string {
  return `${u.firstname ?? ''} ${u.lastname ?? ''}`.trim() || 'Unbekannt';
}

export default function AdminUsersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: 'moco' | 'invite' | 'dashboard' =
    tabParam === 'invite' ? 'invite' : tabParam === 'dashboard' ? 'dashboard' : 'moco';

  const setTab = (next: 'moco' | 'invite' | 'dashboard') => {
    setSearchParams({ tab: next }, { replace: true });
  };

  const [search, setSearch] = useState('');
  const [confirmInvite, setConfirmInvite] = useState<MocoUserRow | null>(null);
  const [confirmResend, setConfirmResend] = useState<MocoUserRow | null>(null);

  const usersQuery = useAdminTimelineUsers();
  const mocoQuery = useAdminMocoUsers();
  const toggleField = useToggleAdminUserField();
  const toggleTimeline = useToggleTimelineUserActive();
  const invite = useInviteFromMoco();
  const resend = useResendInvitation();

  const handleToggleField = async (
    userId: string,
    field: 'active' | 'timelineActive' | 'superUser',
    value: boolean,
  ) => {
    try {
      await toggleField.mutateAsync({ userId, field, value });
      toast.success('Aktualisiert');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Aktualisieren fehlgeschlagen');
    }
  };

  const handleToggleTimeline = async (mocoUserId: number, value: boolean) => {
    try {
      await toggleTimeline.mutateAsync({ mocoUserId, timelineActive: value });
      toast.success(value ? 'In Timeline aktiviert' : 'In Timeline deaktiviert');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Aktualisieren fehlgeschlagen');
    }
  };

  const handleInvite = async () => {
    if (!confirmInvite) return;
    try {
      await invite.mutateAsync(confirmInvite.id);
      toast.success(`${confirmInvite.fullname} wurde eingeladen`);
      setConfirmInvite(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Einladung fehlgeschlagen');
      setConfirmInvite(null);
    }
  };

  const handleResend = async () => {
    if (!confirmResend) return;
    try {
      await resend.mutateAsync(confirmResend.id);
      toast.success(`Einladung an ${confirmResend.fullname} erneut gesendet`);
      setConfirmResend(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erneutes Senden fehlgeschlagen');
      setConfirmResend(null);
    }
  };

  const userColumns: ColumnDef<TimelineUserRow>[] = [
    {
      accessorKey: 'firstname',
      header: 'Mitarbeiter',
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="flex items-center gap-3">
            <div className="relative">
              <UserAvatar
                avatarUrl={u.avatar}
                displayName={fullName(u)}
                size="sm"
                className="size-8"
              />
              {u.isOnline && (
                <span
                  aria-label="Online"
                  className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-billable ring-2 ring-card"
                />
              )}
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-medium">{fullName(u)}</span>
              {u.title && <span className="text-xs text-muted-foreground">{u.title}</span>}
            </div>
          </div>
        );
      },
      filterFn: (row, _id, value) => {
        const text = `${fullName(row.original)} ${row.original.email ?? ''}`.toLowerCase();
        return text.includes(String(value).toLowerCase());
      },
    },
    {
      accessorKey: 'email',
      header: 'E-Mail',
      cell: ({ row }) => row.original.email ?? '—',
    },
    {
      accessorKey: 'unitName',
      header: 'Team-Level',
      cell: ({ row }) => {
        const level = mapMocoUnitToTeamLevel(row.original.unitName ?? '');
        return <Badge variant="outline">{TEAM_LEVEL_LABELS[level] ?? '—'}</Badge>;
      },
    },
    {
      accessorKey: 'dashboardUserActive',
      header: 'Dashboard',
      cell: ({ row }) => {
        const u = row.original;
        if (!u.dashboardUserId) {
          return <Badge variant="secondary">Nicht eingeladen</Badge>;
        }
        return u.dashboardUserActive ? (
          <Badge variant="default" className="bg-billable text-billable-foreground hover:bg-billable/90">
            Aktiv
          </Badge>
        ) : (
          <Badge variant="destructive">Inaktiv</Badge>
        );
      },
    },
    {
      accessorKey: 'timelineActive',
      header: 'Timeline',
      cell: ({ row }) => {
        const u = row.original;
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Switch
                checked={u.timelineActive}
                onCheckedChange={(v) => handleToggleTimeline(u.id, v)}
                aria-label="In Timeline anzeigen"
              />
            </TooltipTrigger>
            <TooltipContent>
              {u.timelineActive
                ? 'Wird aktuell in der Timeline angezeigt'
                : 'Aus der Timeline ausgeblendet'}
            </TooltipContent>
          </Tooltip>
        );
      },
    },
    {
      accessorKey: 'dashboardUserSuperUser',
      header: 'Super-User',
      cell: ({ row }) => {
        const u = row.original;
        if (!u.dashboardUserId || !u.dashboardUserActive) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() =>
                  handleToggleField(
                    u.dashboardUserId!,
                    'superUser',
                    !u.dashboardUserSuperUser,
                  )
                }
                aria-label="Super-User umschalten"
              >
                <Shield
                  className={
                    u.dashboardUserSuperUser
                      ? 'fill-internal/20 text-internal'
                      : 'text-muted-foreground'
                  }
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {u.dashboardUserSuperUser
                ? 'Super-User – kann alle Daten sehen'
                : 'Standard-Berechtigung'}
            </TooltipContent>
          </Tooltip>
        );
      },
    },
  ];

  const inviteColumns: ColumnDef<MocoUserRow>[] = [
    {
      accessorKey: 'fullname',
      header: 'Name',
      cell: ({ row }) => row.original.fullname,
      filterFn: (row, _id, value) => {
        const text = `${row.original.fullname} ${row.original.email ?? ''}`.toLowerCase();
        return text.includes(String(value).toLowerCase());
      },
    },
    {
      accessorKey: 'email',
      header: 'E-Mail',
      cell: ({ row }) => row.original.email ?? '—',
    },
    {
      accessorKey: 'teamLevel',
      header: 'Team-Level',
      cell: ({ row }) => (
        <Badge variant="outline">{TEAM_LEVEL_LABELS[row.original.teamLevel] ?? '—'}</Badge>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const u = row.original;
        if (u.hasPendingInvitation) {
          return <Badge variant="secondary">Eingeladen</Badge>;
        }
        return null;
      },
    },
    {
      id: 'action',
      header: '',
      cell: ({ row }) => {
        const u = row.original;
        if (u.hasPendingInvitation) {
          return (
            <Button size="sm" variant="outline" onClick={() => setConfirmResend(u)}>
              <RefreshCw data-icon="inline-start" />
              Erneut senden
            </Button>
          );
        }
        return (
          <Button size="sm" onClick={() => setConfirmInvite(u)}>
            <UserPlus data-icon="inline-start" />
            Einladen
          </Button>
        );
      },
    },
  ];

  return (
    <div className="h-full overflow-y-auto p-6">
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users />
          </div>
          <div>
            <CardTitle>Benutzerverwaltung</CardTitle>
            <CardDescription>
              MOCO-Stammdaten, Einladungen und Dashboard-Zugänge an einem Ort.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as 'moco' | 'invite' | 'dashboard')}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="flex h-auto w-full flex-wrap gap-1 sm:w-auto">
            <TabsTrigger value="moco">
              <Users data-icon="inline-start" />
              MOCO & Timeline
              <Badge variant="secondary" className="ml-2">
                {usersQuery.data?.length ?? 0}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="invite">
              <UserPlus data-icon="inline-start" />
              Einladen
              <Badge variant="secondary" className="ml-2">
                {(mocoQuery.data?.filter((u) => !u.hasAccount) ?? []).length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Name oder E-Mail…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <TabsContent value="moco" className="mt-4">
          <DataTable
            columns={userColumns}
            data={usersQuery.data ?? []}
            loading={usersQuery.isLoading}
            globalFilter={search}
            emptyTitle="Keine Benutzer"
            emptyDescription="Sobald MOCO-Nutzer eingeladen wurden, erscheinen sie hier."
          />
        </TabsContent>

        <TabsContent value="dashboard" className="mt-4">
          <DashboardUsersTab globalFilter={search} />
        </TabsContent>

        <TabsContent value="invite" className="mt-4">
          <DataTable
            columns={inviteColumns}
            data={(mocoQuery.data ?? []).filter((u) => !u.hasAccount)}
            loading={mocoQuery.isLoading}
            globalFilter={search}
            emptyTitle="Alle registriert"
            emptyDescription="Es gibt keine MOCO-Nutzer mehr, die noch kein Dashboard-Konto haben."
          />
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={!!confirmInvite}
        onOpenChange={(open) => !open && setConfirmInvite(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mitarbeiter einladen?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmInvite?.fullname} ({confirmInvite?.email}) erhält eine Einladung
              per E-Mail mit einem Link zum Setzen des Passworts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleInvite} disabled={invite.isPending}>
              {invite.isPending && <Spinner data-icon="inline-start" />}
              Einladung senden
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!confirmResend}
        onOpenChange={(open) => !open && setConfirmResend(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Einladung erneut senden?</AlertDialogTitle>
            <AlertDialogDescription>
              Die bisherige Einladung für {confirmResend?.fullname} ({confirmResend?.email}) wird
              ungültig. Eine neue Einladungs-E-Mail mit frischem Link (7 Tage gültig) wird gesendet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleResend} disabled={resend.isPending}>
              {resend.isPending && <Spinner data-icon="inline-start" />}
              Erneut senden
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
