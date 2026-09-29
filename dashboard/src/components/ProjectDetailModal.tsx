import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { addDays, format, isWeekend, isSameDay } from 'date-fns';
import { de } from 'date-fns/locale';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { GanttFeature } from '@/types/gantt';
import { cn } from '@/lib/utils';

interface ProjectDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature: GanttFeature | null;
  userId: number;
  userName: string;
}

export default function ProjectDetailModal({
  isOpen,
  onClose,
  feature,
  userName,
}: ProjectDetailModalProps) {
  const projectDays = useMemo(() => {
    if (!feature) return [];
    const days: Array<{ date: Date; hours: number; isWeekend: boolean }> = [];
    const startDate = feature.startAt;
    const endDate = feature.endAt || new Date();

    const currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    const lastDay = endDate ? addDays(end, -1) : new Date();

    let cursor = new Date(currentDate);
    while (cursor <= lastDay) {
      days.push({
        date: new Date(cursor),
        hours: feature.hoursPerDay || 0,
        isWeekend: isWeekend(cursor),
      });
      cursor = addDays(cursor, 1);
    }
    return days;
  }, [feature]);

  const stats = useMemo(() => {
    const totalDays = projectDays.length;
    const workDays = projectDays.filter((d) => !d.isWeekend).length;
    const totalHours =
      feature?.totalHours ?? (feature?.hoursPerDay ?? 0) * totalDays;
    const avgHoursPerDay = workDays > 0 ? totalHours / workDays : 0;
    return { totalDays, workDays, totalHours, avgHoursPerDay };
  }, [projectDays, feature]);

  return (
    <Dialog open={isOpen && !!feature} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span
              className="size-4 rounded border border-border bg-[var(--swatch)]"
              style={{ ['--swatch' as string]: feature?.projectColor || 'var(--muted)' }}
              aria-hidden
            />
            <div>
              <DialogTitle>{feature?.name ?? 'Projekt'}</DialogTitle>
              <DialogDescription>{userName}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card className="overflow-hidden">
            <CardContent className="px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Gesamtstunden
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums leading-tight">
                {stats.totalHours.toFixed(1)}h
              </p>
            </CardContent>
          </Card>
          <Card className="overflow-hidden">
            <CardContent className="px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Stunden / Tag
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums leading-tight">
                {feature?.hoursPerDay?.toFixed(1) ?? '0.0'}h
              </p>
            </CardContent>
          </Card>
          <Card className="overflow-hidden">
            <CardContent className="px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Arbeitstage
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums leading-tight">
                {stats.workDays}
              </p>
            </CardContent>
          </Card>
          <Card className="overflow-hidden">
            <CardContent className="px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Ø h / Tag
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums leading-tight">
                {stats.avgHoursPerDay.toFixed(1)}h
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Clock className="size-4" /> Tagesweise Planung ({projectDays.length} Tage)
            </div>
            <ScrollArea className="max-h-64 rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Wochentag</TableHead>
                    <TableHead className="text-right">Stunden</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projectDays.map((day, idx) => {
                    const isToday = isSameDay(day.date, new Date());
                    return (
                      <TableRow
                        key={idx}
                        className={cn(
                          isToday && 'bg-primary/10 font-medium',
                          day.isWeekend && 'opacity-60',
                        )}
                      >
                        <TableCell>
                          {format(day.date, 'dd.MM.yyyy', { locale: de })}
                          {isToday && (
                            <Badge variant="secondary" className="ml-2 text-xs">
                              Heute
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell
                          className={day.isWeekend ? 'text-muted-foreground' : undefined}
                        >
                          {format(day.date, 'EEEE', { locale: de })}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {day.hours.toFixed(1)}h
                        </TableCell>
                        <TableCell>
                          {day.isWeekend && (
                            <Badge variant="outline" className="text-xs">
                              WE
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
