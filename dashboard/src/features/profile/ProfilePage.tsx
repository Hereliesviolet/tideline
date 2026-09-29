import {
  Mail,
  Building2,
  ShieldCheck,
  Clock,
  Activity,
  Calendar,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import { UserAvatar } from '@/components/UserAvatar';
import { useAuth } from '@/contexts/AuthContext';
import { useUserWeekOverview } from '@/hooks/queries';
import { cn } from '@/lib/utils';

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

export default function ProfilePage() {
  const { user } = useAuth();

  const { data: weekOverview, isLoading: weekLoading } = useUserWeekOverview(
    user?.mocoUserId ?? null,
  );

  if (!user) {
    return (
      <div className="container mx-auto p-6">
        <Empty>
          <EmptyContent>
            <EmptyTitle>Nicht angemeldet</EmptyTitle>
            <EmptyDescription>Bitte melde dich an, um dein Profil zu sehen.</EmptyDescription>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  const avatarUrl =
    (user as { avatarUrl?: string | null }).avatarUrl ??
    (user as { avatar_url?: string | null }).avatar_url ??
    null;

  const weeks = (weekOverview?.weeks ?? []) as Array<{
    week: string;
    actualHours: number;
    plannedHours: number;
    variance: number;
  }>;

  const totalActualHours = weeks.reduce((s, w) => s + w.actualHours, 0);
  const avgUtilization =
    weeks.length > 0
      ? weeks.reduce(
          (s, w) =>
            s + (w.plannedHours > 0 ? (w.actualHours / w.plannedHours) * 100 : 0),
          0,
        ) / weeks.length
      : 0;

  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6">
      <Card>
        <CardContent className="flex flex-col gap-6 pt-6 sm:flex-row">
          <UserAvatar
            avatarUrl={avatarUrl}
            displayName={user.name}
            size="xl"
            className="size-24 rounded-xl border-2"
          />

          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{user.name}</h1>
              {Boolean(user.superUser) === true && (
                <Badge className="bg-internal text-internal-foreground hover:bg-internal/90">
                  <ShieldCheck className="size-3" data-icon="inline-start" /> Super-User
                </Badge>
              )}
            </div>

            <div className="grid gap-2 text-sm sm:grid-cols-2 max-w-xl">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="size-4" />
                <span className="text-foreground">{user.email}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="size-4" />
                <span className="text-foreground">
                  {user.mocoUnitName ?? '—'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <ShieldCheck className="size-4" />
                <span className="text-foreground">
                  {TEAM_LEVEL_LABELS[user.teamLevel] ?? `Level ${user.teamLevel}`}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Activity className="size-4" />
                <span className="text-foreground">MOCO-ID: {user.mocoUserId}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Letzte 3 KW</CardDescription>
            <CardTitle className="text-3xl">{totalActualHours.toFixed(1)}h</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Tatsächlich gebuchte Stunden in den letzten drei Kalenderwochen.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ø Auslastung 3 KW</CardDescription>
            <CardTitle className="text-3xl">{avgUtilization.toFixed(0)}%</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              IST gegenüber geplanten Stunden.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Status</CardDescription>
            <CardTitle className="text-base">
              <Badge className="bg-billable text-billable-foreground hover:bg-billable/90">
                Aktiv
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Dein Account ist aktiviert und du erscheinst in der Timeline.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Wochen-Statistik</CardTitle>
          <CardDescription>IST gegenüber Planung der letzten 3 KW.</CardDescription>
        </CardHeader>
        <CardContent>
          {weekLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center justify-between gap-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-44" />
                </div>
              ))}
            </div>
          ) : weeks.length === 0 ? (
            <Empty>
              <EmptyContent>
                <EmptyTitle>Noch keine Wochen-Daten</EmptyTitle>
                <EmptyDescription>
                  Sobald Buchungen synchronisiert sind, werden sie hier sichtbar.
                </EmptyDescription>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="space-y-3">
              {weeks.map((w, idx) => (
                <div key={w.week}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-2 font-medium">
                      <Calendar className="size-3.5 text-muted-foreground" />
                      {w.week}
                    </span>
                    <span className="inline-flex flex-wrap gap-3 text-muted-foreground">
                      <span>
                        IST{' '}
                        <strong className="text-internal">
                          {w.actualHours.toFixed(1)}h
                        </strong>
                      </span>
                      <span>
                        PLAN{' '}
                        <strong className="text-billable">
                          {w.plannedHours.toFixed(1)}h
                        </strong>
                      </span>
                      <span
                        className={cn(
                          'font-semibold',
                          w.variance > 2
                            ? 'text-billable'
                            : w.variance < -2
                              ? 'text-destructive'
                              : 'text-muted-foreground',
                        )}
                      >
                        {w.variance > 0 ? '+' : ''}
                        {w.variance.toFixed(1)}h
                      </span>
                    </span>
                  </div>
                  {idx < weeks.length - 1 && <Separator className="mt-3" />}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-4" /> Passwort & Sicherheit
          </CardTitle>
          <CardDescription>
            Passwort-Änderung erfolgt aktuell über die Einladungs-Mail (kein
            Self-Service-Endpoint im Backend).
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
