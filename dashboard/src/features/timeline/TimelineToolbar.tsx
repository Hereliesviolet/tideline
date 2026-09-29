import type { Dispatch, SetStateAction } from 'react';
import { Search, Filter, Check, ChevronDown, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { SimplePopover } from '@/components/ui/simple-popover';
import { Z } from '@/lib/timelineTokens';
import { cn } from '@/lib/utils';

const TEAM_LEVELS = [
  { value: '00', label: '00. Prakti / Werki', level: 0 },
  { value: '01', label: '01. Analyst', level: 1 },
  { value: '02', label: '02. Berater', level: 2 },
  { value: '03', label: '03. Senior Berater', level: 3 },
  { value: '04', label: '04. Manager', level: 4 },
  { value: '05', label: '05. Senior Manager', level: 5 },
  { value: '06', label: '06. Assoc. Partner / Director', level: 6 },
  { value: '07', label: '07. Partner', level: 7 },
];

function Legend() {
  return (
    <SimplePopover
      align="end"
      className="w-64"
      trigger={
        <Button variant="outline" className="gap-1.5">
          <span className="size-2 rounded-full bg-billable" />
          <span className="size-2 rounded-full bg-internal" />
          <span className="size-2 rounded-full bg-nonbillable" />
          Legende
        </Button>
      }
    >
      <p className="mb-3 text-sm font-semibold">Farbcode</p>
      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded bg-billable" />
          <span>Verrechenbar (extern)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="size-3 rounded bg-internal" />
          <span>Intern</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="size-3 rounded bg-nonbillable" />
          <span>Nicht verrechenbar (extern)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="size-3 rounded bg-neutral-booking" />
          <span>Unbewertet (ohne Verrechenbarkeit)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="size-3 rounded bg-absence/70" />
          <span>Abwesenheit (Urlaub/Krank/Feiertag)</span>
        </div>
      </div>
      <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
        SOLL-Balken: Farbe je Projekt. Die violette Trennlinie markiert „heute" zwischen IST (links) und SOLL (rechts).
      </p>
    </SimplePopover>
  );
}

interface TimelineToolbarProps {
  selectedTeams: string[];
  setSelectedTeams: Dispatch<SetStateAction<string[]>>;
  defaultTeams: string[];
  onResetTeams: () => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  onTodayClick: () => void;
  todayDisabled: boolean;
  userCount: number;
}

export default function TimelineToolbar({
  selectedTeams,
  setSelectedTeams,
  defaultTeams,
  onResetTeams,
  searchQuery,
  setSearchQuery,
  onTodayClick,
  todayDisabled,
  userCount,
}: TimelineToolbarProps) {
  return (
    <div
      className="relative flex-shrink-0 border-b bg-card/95 px-4 py-3 backdrop-blur sm:px-6 supports-[backdrop-filter]:bg-card/80"
      style={{ zIndex: Z.toolbar }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SimplePopover
          align="start"
          className="w-64 p-2"
          trigger={
            <Button variant="outline" className="gap-2">
              <Filter className="size-3.5" />
              Teams
              {selectedTeams.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {selectedTeams.length}
                </Badge>
              )}
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </Button>
          }
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="text-xs font-medium text-muted-foreground">Teams filtern</p>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onResetTeams}>
              Reset
            </Button>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {TEAM_LEVELS.filter((team) => defaultTeams.includes(team.value)).map((team) => {
              const checked = selectedTeams.includes(team.value);
              const toggle = () =>
                setSelectedTeams((prev) =>
                  checked ? prev.filter((v) => v !== team.value) : [...prev, team.value],
                );
              return (
                <label
                  key={team.value}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
                    checked && 'bg-accent/50',
                  )}
                >
                  <Checkbox checked={checked} onCheckedChange={toggle} aria-label={team.label} />
                  <span className="flex-1">{team.label}</span>
                  {checked && <Check className="size-3.5 text-primary" />}
                </label>
              );
            })}
          </div>
        </SimplePopover>

        <div className="relative min-w-32 max-w-60 flex-1">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Kollegen suchen…"
            className="h-8 pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={onTodayClick}
            disabled={todayDisabled}
            title="Zum heutigen Tag scrollen"
          >
            <CalendarClock className="size-3.5" />
            <span className="hidden md:inline">Heute</span>
          </Button>

          <Legend />
          <span className="hidden h-8 items-center text-xs tabular-nums text-muted-foreground sm:inline-flex">
            {userCount} Mitarbeiter
          </span>
        </div>
      </div>
    </div>
  );
}
