import { useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { ScrollText, Search } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTable } from '@/components/data-table';
import { fetchWithAuth } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

interface SessionData {
  userId: string;
  email: string;
  name: string;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  lastSessionDuration: number | null;
  totalSessionTime: number | null;
  active: boolean;
  isOnline: boolean;
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds === 0) return '0m 0s';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  return `${minutes}m ${secs}s`;
}

function formatDate(date: string | null | undefined): string {
  if (!date) return 'Nie';
  try {
    return new Date(date).toLocaleString('de-DE', {
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

export default function AdminSessionsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [sortBy, setSortBy] = useState<'lastLogin' | 'sessionDuration' | 'totalTime'>(
    'lastLogin',
  );

  const { data, isLoading } = useQuery<SessionData[], Error>({
    queryKey: ['admin', 'sessions'],
    queryFn: () => fetchWithAuth<SessionData[]>('/api/admin/sessions'),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const filtered = useMemo(() => {
    const items = data ?? [];
    return items
      .filter((s) => {
        if (statusFilter === 'active' && !s.active) return false;
        if (statusFilter === 'inactive' && s.active) return false;
        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'lastLogin': {
            if (!a.lastLoginAt && !b.lastLoginAt) return 0;
            if (!a.lastLoginAt) return 1;
            if (!b.lastLoginAt) return -1;
            return new Date(b.lastLoginAt).getTime() - new Date(a.lastLoginAt).getTime();
          }
          case 'sessionDuration':
            return (b.lastSessionDuration ?? 0) - (a.lastSessionDuration ?? 0);
          case 'totalTime':
            return (b.totalSessionTime ?? 0) - (a.totalSessionTime ?? 0);
          default:
            return 0;
        }
      });
  }, [data, statusFilter, sortBy]);

  const columns: ColumnDef<SessionData>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {row.original.isOnline && (
            <span className="relative inline-flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-billable opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-billable" />
            </span>
          )}
          <span>{row.original.name}</span>
        </div>
      ),
      filterFn: (row, _id, value) => {
        const text = `${row.original.name} ${row.original.email}`.toLowerCase();
        return text.includes(String(value).toLowerCase());
      },
    },
    {
      accessorKey: 'email',
      header: 'E-Mail',
      cell: ({ row }) => row.original.email,
    },
    {
      accessorKey: 'isOnline',
      header: 'Status',
      cell: ({ row }) =>
        row.original.isOnline ? (
          <Badge className="bg-billable text-billable-foreground hover:bg-billable/90">
            <span className="size-1.5 rounded-full bg-billable-foreground" />
            Online
          </Badge>
        ) : (
          <Badge variant="secondary">Offline</Badge>
        ),
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
    {
      accessorKey: 'active',
      header: 'Account',
      cell: ({ row }) =>
        row.original.active ? (
          <Badge className="bg-billable text-billable-foreground hover:bg-billable/90">Aktiv</Badge>
        ) : (
          <Badge variant="destructive">Inaktiv</Badge>
        ),
    },
  ];

  return (
    <div className="h-full overflow-y-auto p-6">
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ScrollText />
          </div>
          <div>
            <CardTitle>Sessions & Logging</CardTitle>
            <CardDescription>
              Aktivität, Login-Zeiten und Session-Dauer aller Dashboard-Nutzer.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Name oder E-Mail…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as 'all' | 'active' | 'inactive')}
            >
              <SelectTrigger className="w-auto min-w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="active">Aktive Accounts</SelectItem>
                  <SelectItem value="inactive">Inaktive Accounts</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>

            <Select
              value={sortBy}
              onValueChange={(v) =>
                setSortBy(v as 'lastLogin' | 'sessionDuration' | 'totalTime')
              }
            >
              <SelectTrigger className="w-auto min-w-[160px]">
                <SelectValue placeholder="Sortieren" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="lastLogin">Letzter Login</SelectItem>
                  <SelectItem value="sessionDuration">Letzte Session</SelectItem>
                  <SelectItem value="totalTime">Gesamtzeit</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <DataTable
            columns={columns}
            data={filtered}
            loading={isLoading}
            globalFilter={search}
            emptyTitle="Keine Sessions"
            emptyDescription="Sobald sich Nutzer anmelden, erscheinen Sessions hier."
          />
        </CardContent>
      </Card>
    </div>
  );
}
