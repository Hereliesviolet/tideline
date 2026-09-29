import { useMemo, useState } from 'react';
import {
  Users,
  Briefcase,
  Activity,
  PieChart as PieChartIcon,
  ArrowUpRight,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import { KpiCardsSkeleton } from '@/components/skeletons/KpiCardsSkeleton';
import { useTimelineRange, useUsers } from '@/hooks/queries';
import { isInternalProject } from '@/lib/cellColors';

type RangeKey = '7d' | '14d' | '30d';

const RANGE_DAYS: Record<RangeKey, number> = {
  '7d': 7,
  '14d': 14,
  '30d': 30,
};

function formatDateLabel(iso: string): string {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
    });
  } catch {
    return iso;
  }
}

function todayIso() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t.toISOString().slice(0, 10);
}

function isoMinusDays(days: number) {
  const t = new Date();
  t.setDate(t.getDate() - days);
  t.setHours(0, 0, 0, 0);
  return t.toISOString().slice(0, 10);
}

export default function OverviewPage() {
  const [range, setRange] = useState<RangeKey>('30d');

  const dateRange = useMemo(() => {
    const today = todayIso();
    const start = new Date(today);
    start.setDate(start.getDate() - 14);
    const end = new Date(today);
    end.setDate(end.getDate() + 15);
    return {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    };
  }, []);

  const { data: timeline, isLoading: timelineLoading } = useTimelineRange(
    dateRange.from,
    dateRange.to,
  );
  const { data: users = [] } = useUsers(true);

  // ─── KPIs ────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const today = todayIso();
    const rangeStart = isoMinusDays(RANGE_DAYS[range] - 1);

    const capacities = timeline?.capacities ?? [];
    const items = timeline?.items ?? [];

    const recentCapacities = capacities.filter(
      (c) => c.date >= rangeStart && c.date <= today,
    );

    const avgUtilization =
      recentCapacities.length > 0
        ? recentCapacities.reduce(
            (sum, c) => sum + (typeof c.fillPercent === 'number' ? c.fillPercent : 0),
            0,
          ) / recentCapacities.length
        : 0;

    const recentItems = items.filter(
      (it) => it.date >= rangeStart && it.date <= today && (it.type === 'work' || it.type === 'activity'),
    );
    const totalHours = recentItems.reduce(
      (sum, it) => sum + (it.hours ?? (it.seconds ? it.seconds / 3600 : 0)),
      0,
    );
    const billableHours = recentItems
      .filter((it) => it.billable === true)
      .reduce(
        (sum, it) => sum + (it.hours ?? (it.seconds ? it.seconds / 3600 : 0)),
        0,
      );
    const billableShare = totalHours > 0 ? (billableHours / totalHours) * 100 : 0;

    const activeUsers = users.length;

    const activeProjects = new Set(
      recentItems.map((it) => (it as { projectName?: string }).projectName).filter(Boolean),
    ).size;

    return {
      activeUsers,
      activeProjects,
      avgUtilization,
      billableShare,
      totalHours,
    };
  }, [timeline, users, range]);

  // ─── Auslastung-Trend (Line) ─────────────────────────────────────────────
  const utilizationData = useMemo(() => {
    const capacities = timeline?.capacities ?? [];
    const today = todayIso();
    const days = RANGE_DAYS[range];
    const start = isoMinusDays(days - 1);

    const byDate = new Map<string, { sum: number; count: number }>();
    for (const c of capacities) {
      if (c.date < start || c.date > today) continue;
      if (typeof c.fillPercent !== 'number') continue;
      const entry = byDate.get(c.date) ?? { sum: 0, count: 0 };
      entry.sum += c.fillPercent;
      entry.count += 1;
      byDate.set(c.date, entry);
    }

    return Array.from(byDate.entries())
      .map(([date, v]) => ({
        date,
        label: formatDateLabel(date),
        utilization: v.count > 0 ? Math.round(v.sum / v.count) : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [timeline, range]);

  // ─── Top-10 Projekte nach Stunden ────────────────────────────────────────
  const topProjects = useMemo(() => {
    const items = timeline?.items ?? [];
    const today = todayIso();
    const start = isoMinusDays(RANGE_DAYS[range] - 1);

    const byProject = new Map<string, { hours: number; billable: boolean | null; customer: string }>();
    for (const it of items) {
      if (it.date < start || it.date > today) continue;
      if (it.type !== 'work' && it.type !== 'activity') continue;
      const h = it.hours ?? ((it as { seconds?: number }).seconds ? (it as { seconds: number }).seconds / 3600 : 0);
      if (!Number.isFinite(h) || h <= 0) continue;
      const name = (it as { projectName?: string }).projectName || 'Ohne Projekt';
      const customer = ((it as { customerName?: string }).customerName || '').trim();
      const existing = byProject.get(name) ?? { hours: 0, billable: it.billable ?? null, customer };
      existing.hours += h;
      byProject.set(name, existing);
    }

    return Array.from(byProject.entries())
      .map(([name, v]) => ({
        name,
        hours: Math.round(v.hours * 10) / 10,
        billable: v.billable,
        customer: v.customer,
        fill:
          isInternalProject(v.customer)
            ? 'var(--internal)'
            : v.billable === true
              ? 'var(--billable)'
              : 'var(--nonbillable)',
      }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10);
  }, [timeline, range]);

  // ─── Verrechenbarkeits-Mix (Donut) ───────────────────────────────────────
  const billabilityMix = useMemo(() => {
    const items = timeline?.items ?? [];
    const today = todayIso();
    const days = RANGE_DAYS[range];
    const start = isoMinusDays(days - 1);

    let internalH = 0;
    let billableH = 0;
    let nonbillableH = 0;

    for (const it of items) {
      if (it.date < start || it.date > today) continue;
      if (it.type !== 'work' && it.type !== 'activity') continue;
      const h = it.hours ?? (it.seconds ? it.seconds / 3600 : 0);
      if (!Number.isFinite(h) || h <= 0) continue;
      if (isInternalProject(it.customerName)) internalH += h;
      else if (it.billable === true) billableH += h;
      else nonbillableH += h;
    }

    return [
      {
        type: 'Verrechenbar',
        hours: Math.round(billableH),
        fill: 'var(--billable)',
        swatchClass: 'bg-billable',
      },
      {
        type: 'Intern',
        hours: Math.round(internalH),
        fill: 'var(--internal)',
        swatchClass: 'bg-internal',
      },
      {
        type: 'Nicht verrechenbar',
        hours: Math.round(nonbillableH),
        fill: 'var(--nonbillable)',
        swatchClass: 'bg-nonbillable',
      },
    ];
  }, [timeline, range]);

  // ─── Top-10 Auslastung (Horizontal Bar) ─────────────────────────────────
  const topUsers = useMemo(() => {
    const capacities = timeline?.capacities ?? [];
    const today = todayIso();
    const days = RANGE_DAYS[range];
    const start = isoMinusDays(days - 1);

    const byUser = new Map<number, { sum: number; count: number }>();
    for (const c of capacities) {
      if (c.date < start || c.date > today) continue;
      if (typeof c.fillPercent !== 'number') continue;
      const entry = byUser.get(c.userId) ?? { sum: 0, count: 0 };
      entry.sum += c.fillPercent;
      entry.count += 1;
      byUser.set(c.userId, entry);
    }

    return Array.from(byUser.entries())
      .map(([userId, v]) => {
        const u = users.find((x) => x.id === userId);
        return {
          userId,
          name:
            u?.displayName ??
            (u ? `${u.firstname} ${u.lastname}`.trim() : `User ${userId}`),
          utilization: v.count > 0 ? Math.round(v.sum / v.count) : 0,
        };
      })
      .filter((x) => x.utilization > 0)
      .sort((a, b) => b.utilization - a.utilization)
      .slice(0, 10);
  }, [timeline, users, range]);

  const utilizationConfig = {
    utilization: { label: 'Auslastung', color: 'var(--internal)' },
  } satisfies ChartConfig;

  const topProjectsConfig = {
    hours: { label: 'Stunden', color: 'var(--billable)' },
  } satisfies ChartConfig;

  const mixConfig = {
    Verrechenbar: { label: 'Verrechenbar', color: 'var(--billable)' },
    Intern: { label: 'Intern', color: 'var(--internal)' },
    'Nicht verrechenbar': {
      label: 'Nicht verrechenbar',
      color: 'var(--nonbillable)',
    },
  } satisfies ChartConfig;

  const topConfig = {
    utilization: { label: 'Auslastung', color: 'var(--billable)' },
  } satisfies ChartConfig;

  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live-Kennzahlen aus Kapazitäten, Buchungen und MOCO-Sync.
          </p>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <TabsList>
            <TabsTrigger value="7d">7 Tage</TabsTrigger>
            <TabsTrigger value="14d">14 Tage</TabsTrigger>
            <TabsTrigger value="30d">30 Tage</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      {timelineLoading && <KpiCardsSkeleton />}

      {!timelineLoading && (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Users className="size-4" />}
          label="Aktive Mitarbeiter"
          value={timelineLoading ? null : kpis.activeUsers}
          hint="aus MOCO synchronisiert"
        />
        <KpiCard
          icon={<Briefcase className="size-4" />}
          label={`Aktive Projekte (${range})`}
          value={timelineLoading ? null : kpis.activeProjects}
          hint="mit Buchungen im Zeitraum"
        />
        <KpiCard
          icon={<Activity className="size-4" />}
          label={`Ø Auslastung (${range})`}
          value={timelineLoading ? null : `${kpis.avgUtilization.toFixed(0)}%`}
          tone={
            kpis.avgUtilization >= 90
              ? 'warning'
              : kpis.avgUtilization >= 70
                ? 'positive'
                : 'neutral'
          }
          hint="über alle Mitarbeiter"
        />
        <KpiCard
          icon={<PieChartIcon className="size-4" />}
          label={`Verrechenbarkeit (${range})`}
          value={timelineLoading ? null : `${kpis.billableShare.toFixed(0)}%`}
          tone={kpis.billableShare >= 60 ? 'positive' : 'neutral'}
          hint={`bei ${kpis.totalHours.toFixed(0)} Buchungs-Std.`}
        />
      </div>
      )}

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Auslastungs-Trend</CardTitle>
            <CardDescription>
              Durchschnittliche Tagesauslastung über alle Mitarbeiter.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {timelineLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : utilizationData.length === 0 ? (
              <EmptyChart text="Keine Auslastungsdaten" />
            ) : (
              <ChartContainer config={utilizationConfig} className="h-56 w-full">
                <LineChart data={utilizationData} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={20}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={4}
                    width={32}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <ChartTooltip
                    cursor={{ stroke: 'var(--border)' }}
                    content={<ChartTooltipContent indicator="line" />}
                  />
                  <Line
                    dataKey="utilization"
                    type="monotone"
                    stroke="var(--color-utilization)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Top 10 Projekte</CardTitle>
              <CardDescription>
                Buchungs-Stunden nach Projekt im gewählten Zeitraum.
              </CardDescription>
            </div>
            {topProjects.length > 0 && (
              <Badge variant="outline" className="gap-1">
                <ArrowUpRight className="size-3" /> {topProjects[0].hours}h
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {timelineLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : topProjects.length === 0 ? (
              <EmptyChart text="Keine Projektdaten" />
            ) : (
              <ChartContainer config={topProjectsConfig} className="h-56 w-full">
                <BarChart
                  data={topProjects}
                  layout="vertical"
                  margin={{ left: 8, right: 40 }}
                >
                  <CartesianGrid horizontal={false} stroke="var(--border)" />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}h`}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tickLine={false}
                    axisLine={false}
                    width={130}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: string) => v.length > 22 ? `${v.slice(0, 20)}…` : v}
                  />
                  <ChartTooltip
                    cursor={{ fill: 'var(--muted)' }}
                    content={<ChartTooltipContent formatter={(v) => [`${v}h`, 'Stunden']} />}
                  />
                  <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                    {topProjects.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Verrechenbarkeits-Mix</CardTitle>
            <CardDescription>
              Verteilung der Buchungs-Stunden im gewählten Zeitraum.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            {timelineLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : billabilityMix.every((b) => b.hours === 0) ? (
              <EmptyChart text="Keine Buchungen" />
            ) : (
              <ChartContainer config={mixConfig} className="aspect-square h-56">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Pie
                    data={billabilityMix}
                    dataKey="hours"
                    nameKey="type"
                    innerRadius="55%"
                    strokeWidth={2}
                  >
                    {billabilityMix.map((entry) => (
                      <Cell key={entry.type} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            )}
            {!timelineLoading && (
              <div className="mt-4 grid w-full grid-cols-3 gap-2 text-center text-xs">
                {billabilityMix.map((entry) => (
                  <div key={entry.type}>
                    <div className="flex items-center justify-center gap-1.5">
                      <span className={`size-2 rounded-full ${entry.swatchClass}`} />
                      <span className="text-muted-foreground">{entry.type}</span>
                    </div>
                    <p className="mt-1 font-semibold">{entry.hours}h</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Top-10 Auslastung</CardTitle>
              <CardDescription>Ø Tagesauslastung im Zeitraum.</CardDescription>
            </div>
            {topUsers.length > 0 && (
              <Badge variant="outline" className="gap-1">
                <ArrowUpRight className="size-3" /> {topUsers[0].utilization}%
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {timelineLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : topUsers.length === 0 ? (
              <EmptyChart text="Keine Daten" />
            ) : (
              <ChartContainer config={topConfig} className="h-56 w-full">
                <BarChart
                  data={topUsers}
                  layout="vertical"
                  margin={{ left: 8, right: 16 }}
                >
                  <CartesianGrid horizontal={false} stroke="var(--border)" />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tickLine={false}
                    axisLine={false}
                    width={120}
                    tick={{ fontSize: 11 }}
                  />
                  <ChartTooltip
                    cursor={{ fill: 'var(--muted)' }}
                    content={<ChartTooltipContent />}
                  />
                  <Bar
                    dataKey="utilization"
                    fill="var(--color-utilization)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string | null;
  hint?: string;
  tone?: 'positive' | 'warning' | 'neutral';
}

function KpiCard({ icon, label, value, hint, tone = 'neutral' }: KpiCardProps) {
  const toneClass =
    tone === 'positive'
      ? 'text-billable'
      : tone === 'warning'
        ? 'text-bottleneck'
        : 'text-foreground';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        {value === null ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <p className={`text-3xl font-semibold ${toneClass}`}>{value}</p>
        )}
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <Empty className="h-48">
      <EmptyContent>
        <EmptyTitle>{text}</EmptyTitle>
        <EmptyDescription>
          Daten erscheinen hier, sobald Buchungen vorliegen.
        </EmptyDescription>
      </EmptyContent>
    </Empty>
  );
}
