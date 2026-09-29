import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
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
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { fetchUserWeekOverview } from '@/lib/api';
import { cn } from '@/lib/utils';

interface UserWeekModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: number;
  userDisplayName: string;
}

interface WeekData {
  week: string;
  actualHours: number;
  plannedHours: number;
  variance: number;
}

export default function UserWeekModal({
  isOpen,
  onClose,
  userId,
  userDisplayName,
}: UserWeekModalProps) {
  const [weeks, setWeeks] = useState<WeekData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !userId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchUserWeekOverview(userId)
      .then((data) => {
        if (!cancelled) setWeeks(data.weeks ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Fehler');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, userId]);

  const getVarianceClass = (v: number) => {
    if (v > 2) return 'text-billable';
    if (v < -2) return 'text-destructive';
    return 'text-muted-foreground';
  };

  const getVarianceIcon = (v: number) => {
    if (v > 2) return <TrendingUp className="size-4" />;
    if (v < -2) return <TrendingDown className="size-4" />;
    return <Minus className="size-4" />;
  };

  const maxHours = Math.max(
    ...weeks.map((w) => Math.max(w.actualHours, w.plannedHours)),
    40,
  );

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>KW-Übersicht</DialogTitle>
          <DialogDescription>
            {userDisplayName}
            <Badge variant="secondary" className="ml-2">IST vs. PLAN · 3 KW</Badge>
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner className="size-6" />
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh] pr-3">
            {weeks.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                Keine Daten vorhanden.
              </p>
            ) : (
              <div className="space-y-3">
                {weeks.map((week) => (
                  <Card key={week.week}>
                    <CardContent className="space-y-3 pt-4">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{week.week}</span>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-muted-foreground">
                            IST:{' '}
                            <strong className="text-internal">
                              {week.actualHours.toFixed(1)}h
                            </strong>
                          </span>
                          <span className="text-muted-foreground">
                            PLAN:{' '}
                            <strong className="text-billable">
                              {week.plannedHours.toFixed(1)}h
                            </strong>
                          </span>
                          <div
                            className={cn(
                              'flex items-center gap-1 font-semibold',
                              getVarianceClass(week.variance),
                            )}
                          >
                            {getVarianceIcon(week.variance)}
                            {week.variance > 0 ? '+' : ''}
                            {week.variance.toFixed(1)}h
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-10 text-right text-xs text-muted-foreground">
                            IST
                          </span>
                          <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-muted">
                            <div
                              className="flex h-full items-center justify-end bg-internal px-2 transition-all"
                              style={{
                                width: `${Math.min((week.actualHours / maxHours) * 100, 100)}%`,
                              }}
                            >
                              {week.actualHours > 0 && (
                                <span className="text-xs font-semibold text-internal-foreground">
                                  {week.actualHours.toFixed(1)}h
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="w-10 text-right text-xs text-muted-foreground">
                            PLAN
                          </span>
                          <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-muted">
                            <div
                              className="flex h-full items-center justify-end bg-billable px-2 transition-all"
                              style={{
                                width: `${Math.min((week.plannedHours / maxHours) * 100, 100)}%`,
                              }}
                            >
                              {week.plannedHours > 0 && (
                                <span className="text-xs font-semibold text-billable-foreground">
                                  {week.plannedHours.toFixed(1)}h
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
