import React from 'react';
import type { GanttFeature } from '@/types/gantt';
import { cn } from '@/lib/utils';
import { getProjectUniqueColorPair } from '@/lib/projectColors';
import {
  GANTT_BADGE_RESERVE,
  GANTT_BAR_HEIGHT,
  GANTT_LABEL_RESERVE,
  GANTT_LAYER_GAP,
  GANTT_MAX_LAYERS,
  GANTT_VERTICAL_PADDING,
  GANTT_WIDTH_HOURS_ONLY,
  GANTT_WIDTH_NAME,
  GANTT_WIDTH_NAME_AND_HOURS,
  TYPE,
  Z,
} from '@/lib/timelineTokens';

interface GanttFeaturesRendererProps {
  userGanttData: { features: GanttFeature[] };
  userId: number;
  ganttVisibility: Map<number, boolean>;
  cellWidth: number;
  cellGap: number;
  rowHeight: number;
  /** Start-Datum der 30-Tage-Timeline (allDays[0].iso). */
  timelineStartISO: string;
  /** Index des ersten SOLL-Tages (direkt rechts vom Trennstrich). */
  firstSollIndex: number;
  onFeatureClick?: (feature: GanttFeature, userId: number) => void;
}

const SOLL_DAYS = 15;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000);
}

function lastInclusiveDay(feature: GanttFeature): Date {
  return feature.endAt
    ? new Date(startOfDay(feature.endAt).getTime() - 86_400_000)
    : startOfDay(feature.startAt);
}

/**
 * Verteilt die Features im SOLL-Fenster auf Layer, sodass sich Balken
 * innerhalb eines Layers nicht überlappen. Layer 0 liegt unten.
 */
export function layoutGanttLayers(
  features: GanttFeature[],
  timelineStartISO: string,
  firstSollIndex: number,
): GanttFeature[][] {
  if (features.length === 0) return [];

  const timelineStart = startOfDay(new Date(`${timelineStartISO}T00:00:00`));
  const sollStart = new Date(timelineStart);
  sollStart.setDate(sollStart.getDate() + firstSollIndex);
  const sollEnd = new Date(timelineStart);
  sollEnd.setDate(sollEnd.getDate() + firstSollIndex + SOLL_DAYS - 1);

  const inWindow = features.filter((feature) => {
    const start = startOfDay(feature.startAt);
    return (
      start.getTime() <= sollEnd.getTime() &&
      lastInclusiveDay(feature).getTime() >= sollStart.getTime()
    );
  });

  const sorted = [...inWindow].sort((a, b) => {
    const dateDiff = a.startAt.getTime() - b.startAt.getTime();
    if (dateDiff !== 0) return dateDiff;
    return (b.hoursPerDay || 0) - (a.hoursPerDay || 0);
  });

  const layers: GanttFeature[][] = [];
  for (const feature of sorted) {
    const fStart = startOfDay(feature.startAt).getTime();
    const fEnd = lastInclusiveDay(feature).getTime();

    const target = layers.find(
      (layer) =>
        !layer.some((existing) => {
          const eStart = startOfDay(existing.startAt).getTime();
          const eEnd = lastInclusiveDay(existing).getTime();
          return fStart <= eEnd && fEnd >= eStart;
        }),
    );
    if (target) target.push(feature);
    else layers.push([feature]);
  }

  return layers;
}

export function computeGanttRequiredHeight(visibleLayers: number, hasHiddenLayers: boolean): number {
  if (visibleLayers <= 0) return 0;
  return (
    visibleLayers * GANTT_BAR_HEIGHT +
    (visibleLayers - 1) * GANTT_LAYER_GAP +
    GANTT_VERTICAL_PADDING * 2 +
    GANTT_LABEL_RESERVE +
    (hasHiddenLayers ? GANTT_BADGE_RESERVE : 0)
  );
}

const GanttFeaturesRenderer = React.memo(function GanttFeaturesRenderer({
  userGanttData,
  userId,
  ganttVisibility,
  cellWidth,
  cellGap,
  rowHeight,
  timelineStartISO,
  firstSollIndex,
  onFeatureClick,
}: GanttFeaturesRendererProps) {
  const showCellView = ganttVisibility.get(userId) === true;
  if (showCellView) return null;
  if (!userGanttData || userGanttData.features.length === 0) return null;

  const timelineStart = startOfDay(new Date(`${timelineStartISO}T00:00:00`));
  const featureLayers = layoutGanttLayers(userGanttData.features, timelineStartISO, firstSollIndex);
  if (featureLayers.length === 0) return null;

  const visibleLayers = featureLayers.slice(0, GANTT_MAX_LAYERS);
  const hiddenLayerCount = Math.max(0, featureLayers.length - GANTT_MAX_LAYERS);
  const layerCount = visibleLayers.length;

  const bottomReserve = hiddenLayerCount > 0 ? GANTT_BADGE_RESERVE : 0;
  const usableHeight = rowHeight - GANTT_LABEL_RESERVE - GANTT_VERTICAL_PADDING * 2 - bottomReserve;
  const totalStackHeight = layerCount * GANTT_BAR_HEIGHT + (layerCount - 1) * GANTT_LAYER_GAP;
  // Stack vertikal in der Fläche unterhalb der Stundenlabels zentrieren
  const stackBottom =
    GANTT_VERTICAL_PADDING + bottomReserve + Math.max(0, (usableHeight - totalStackHeight) / 2);

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-visible"
      style={{ zIndex: Z.gantt }}
    >
      {visibleLayers.flatMap((layer, layerIdx) =>
        layer.map((feature) => {
          const dayOffset = diffDays(feature.startAt, timelineStart);
          const lastInclusive = lastInclusiveDay(feature);

          // Bars nur im SOLL-Bereich rendern: an firstSollIndex links clippen.
          const clippedDayOffset = Math.max(dayOffset, firstSollIndex);
          const lastInclusiveIdx = dayOffset + Math.max(0, diffDays(lastInclusive, feature.startAt));
          const clippedDaysSpan = Math.max(1, lastInclusiveIdx - clippedDayOffset + 1);

          const left = clippedDayOffset * (cellWidth + cellGap);
          const width = clippedDaysSpan * cellWidth + (clippedDaysSpan - 1) * cellGap;
          const renderedWidth = Math.max(20, Math.round(width));

          const bottom = stackBottom + layerIdx * (GANTT_BAR_HEIGHT + GANTT_LAYER_GAP);

          const clickable = Boolean(onFeatureClick);
          const hasHours = Boolean(feature.hoursPerDay);
          const showName = renderedWidth >= GANTT_WIDTH_NAME;
          const showNameAndHours = renderedWidth >= GANTT_WIDTH_NAME_AND_HOURS && hasHours;
          const showHoursOnly = !showName && renderedWidth >= GANTT_WIDTH_HOURS_ONLY && hasHours;

          const pair = getProjectUniqueColorPair(feature.name);

          const days = feature.actualDays ?? clippedDaysSpan;
          const perDay = (feature.hoursPerDay ?? 0).toFixed(1);
          const total = feature.totalHours ? ` · Gesamt ${feature.totalHours.toFixed(1)}h` : '';
          const titleText = `${feature.name} – ${days} Tag(e), ${perDay}h/Tag${total}`;

          const activate = (e: React.SyntheticEvent) => {
            e.stopPropagation();
            onFeatureClick?.(feature, userId);
          };

          return (
            <div
              key={feature.id}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              aria-label={titleText}
              className={cn(
                'pointer-events-auto absolute flex items-center overflow-hidden rounded-md border font-medium leading-none',
                showName ? 'gap-1.5 px-2' : 'justify-center px-1',
                clickable
                  ? 'cursor-pointer transition-[filter,box-shadow,transform] duration-150 hover:z-[var(--tl-z-hover)] hover:-translate-y-px hover:brightness-110 hover:shadow-md focus-visible:z-[var(--tl-z-hover)] focus-visible:outline-2 focus-visible:outline-ring'
                  : 'cursor-default',
              )}
              style={{
                left: `${Math.round(left)}px`,
                width: `${renderedWidth}px`,
                bottom: `${Math.round(bottom)}px`,
                height: `${GANTT_BAR_HEIGHT}px`,
                fontSize: TYPE.ganttBar,
                background: pair.bg,
                color: pair.text,
                borderColor: pair.border,
              }}
              title={titleText}
              onClick={clickable ? activate : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        activate(e);
                      }
                    }
                  : undefined
              }
            >
              {showName ? (
                <span className="truncate">{feature.name}</span>
              ) : showHoursOnly ? (
                <span className="tabular-nums font-semibold">
                  {feature.hoursPerDay!.toFixed(1)}h
                </span>
              ) : (
                <span className="size-1.5 rounded-full bg-current opacity-70" />
              )}
              {showNameAndHours && (
                <span className="ml-auto shrink-0 tabular-nums opacity-80">
                  {feature.hoursPerDay!.toFixed(1)}h
                </span>
              )}
            </div>
          );
        }),
      )}

      {hiddenLayerCount > 0 && (
        <span
          className="pointer-events-auto absolute right-1 bottom-1 inline-flex items-center justify-center rounded-full border border-border bg-background/90 px-1.5 py-0.5 font-semibold leading-none text-muted-foreground shadow-sm"
          style={{ zIndex: Z.ganttBadge, fontSize: TYPE.badge }}
          title={`${hiddenLayerCount} weitere Projekt-Layer parallel geplant`}
        >
          +{hiddenLayerCount}
        </span>
      )}
    </div>
  );
});

export default GanttFeaturesRenderer;
