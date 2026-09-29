import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface KpiCardsSkeletonProps {
  count?: number;
}

/** Vier KPI-Karten als Lade-Platzhalter (oder so viele wie übergeben). */
export function KpiCardsSkeleton({ count = 4 }: KpiCardsSkeletonProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="size-5" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
