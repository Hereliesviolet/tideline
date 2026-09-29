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
import { getBookingTypeColorVar, getProjectUniqueColor, type BookingType } from '@/lib/projectColors';

interface CellProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  targetHours: number;
  bookedHours: number;
  fillPercent: number | null;
  projects: Array<{
    name: string;
    hours: number;
    billable?: boolean;
    customerName?: string | null;
    type?: BookingType;
  }>;
  isPast: boolean;
}

function formatDateLabel(date: string): string {
  try {
    return new Date(date).toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return date;
  }
}

function KpiCard({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-xl font-semibold tabular-nums leading-tight">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export default function CellProjectModal({
  isOpen,
  onClose,
  date,
  targetHours,
  bookedHours,
  fillPercent,
  projects,
  isPast,
}: CellProjectModalProps) {
  const totalProjectHours = projects.reduce((sum, p) => sum + p.hours, 0);

  // Für IST-Tage: echte Aktivitätsstunden verwenden (robuster gegen Holiday-Fehlklassifikation)
  const displayedBookedHours = isPast && totalProjectHours > 0 ? totalProjectHours : bookedHours;

  // Auslastung: falls fillPercent null (z.B. durch falsch erkannten Feiertag), selbst berechnen
  const displayedFillPercent =
    fillPercent !== null
      ? fillPercent
      : isPast && totalProjectHours > 0 && targetHours > 0
        ? (totalProjectHours / targetHours) * 100
        : null;

  // Anteil: relativ zur Summe der tatsächlichen Buchungen (summiert zu ~100%)
  const anteilBase = totalProjectHours;

  const hoursByType = (type: BookingType) =>
    projects.filter((p) => p.type === type).reduce((s, p) => s + p.hours, 0);
  const distribution: Array<{ type: BookingType; label: string; swatch: string }> = [
    { type: 'internal', label: 'Intern', swatch: 'bg-internal' },
    { type: 'billable', label: 'Verrechenbar', swatch: 'bg-billable' },
    { type: 'unbillable', label: 'Nicht verrechenbar', swatch: 'bg-nonbillable' },
    { type: 'neutral', label: 'Unbewertet', swatch: 'bg-neutral-booking' },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Buchungspunkte</DialogTitle>
          <DialogDescription>{formatDateLabel(date)}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <KpiCard label={isPast ? 'IST' : 'Planung'} value={`${displayedBookedHours.toFixed(1)}h`} />
          <KpiCard
            label="Auslastung"
            value={
              displayedFillPercent === null
                ? '—'
                : `${Math.round(displayedFillPercent)}%`
            }
          />
          {isPast && (
            <Card className="overflow-hidden">
              <CardContent className="px-4 py-3 space-y-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Verteilung
                </p>
                <div className="space-y-1 text-xs">
                  {distribution.map((d) => (
                    <div key={d.type} className="flex items-center justify-between gap-2">
                      <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                        <span className={`size-2 shrink-0 rounded-full ${d.swatch}`} />
                        <span className="truncate">{d.label}</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {hoursByType(d.type).toFixed(1)}h
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border">
          <ScrollArea className="max-h-[45vh]">
            <div className="overflow-x-auto">
              <Table className="w-full min-w-[480px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Kunde</TableHead>
                    <TableHead>Projekt</TableHead>
                    {isPast && <TableHead className="w-[120px]">Typ</TableHead>}
                    <TableHead className="w-[72px] text-right">Std.</TableHead>
                    <TableHead className="w-[56px] text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={isPast ? 5 : 4}
                        className="py-6 text-center text-muted-foreground"
                      >
                        Keine Buchungen für diesen Tag.
                      </TableCell>
                    </TableRow>
                  ) : (
                    projects.map((project, idx) => {
                      const percent =
                        anteilBase > 0 ? (project.hours / anteilBase) * 100 : 0;

                      let typeBadge: React.ReactNode = null;
                      if (isPast) {
                        switch (project.type) {
                          case 'internal':
                            typeBadge = (
                              <Badge className="whitespace-nowrap bg-internal text-internal-foreground hover:bg-internal/90">
                                Intern
                              </Badge>
                            );
                            break;
                          case 'billable':
                            typeBadge = (
                              <Badge className="whitespace-nowrap bg-billable text-billable-foreground hover:bg-billable/90">
                                Verrechenbar
                              </Badge>
                            );
                            break;
                          case 'unbillable':
                            typeBadge = (
                              <Badge className="whitespace-nowrap bg-nonbillable text-nonbillable-foreground hover:bg-nonbillable/90">
                                Nicht verr.
                              </Badge>
                            );
                            break;
                          case 'neutral':
                            typeBadge = (
                              <Badge className="whitespace-nowrap bg-neutral-booking text-neutral-booking-foreground hover:bg-neutral-booking/90">
                                Unbewertet
                              </Badge>
                            );
                            break;
                          default:
                            typeBadge = (
                              <span className="text-xs text-muted-foreground">—</span>
                            );
                        }
                      }

                      // IST: Typfarbe wie in der Zelle; SOLL: Projektfarbe wie im Gantt
                      const swatchColor = isPast
                        ? getBookingTypeColorVar(project.type)
                        : getProjectUniqueColor(project.name);

                      return (
                        <TableRow key={idx}>
                          <TableCell className="max-w-[140px] truncate text-sm text-muted-foreground" title={project.customerName || undefined}>
                            {project.customerName || '—'}
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                className="size-3 shrink-0 rounded border border-border bg-[var(--swatch)]"
                                style={{ ['--swatch' as string]: swatchColor }}
                                aria-hidden
                              />
                              <span className="truncate" title={project.name}>
                                {project.name}
                              </span>
                            </div>
                          </TableCell>
                          {isPast && (
                            <TableCell className="w-[120px]">{typeBadge}</TableCell>
                          )}
                          <TableCell className="w-[72px] text-right tabular-nums">
                            {project.hours.toFixed(1)}h
                          </TableCell>
                          <TableCell className="w-[56px] text-right tabular-nums text-muted-foreground">
                            {Math.round(percent)}%
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
