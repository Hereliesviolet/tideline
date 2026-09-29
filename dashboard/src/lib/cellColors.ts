import type { TimelineItem } from './api';
import type { BookingType } from './projectColors';

/**
 * Name of the MOCO customer that represents the own organisation. Bookings on
 * this customer count as internal time. Set at build time via
 * `VITE_INTERNAL_CUSTOMER_NAME`; compared case-insensitively.
 */
export const INTERNAL_CUSTOMER_NAME: string = (
  (import.meta.env.VITE_INTERNAL_CUSTOMER_NAME as string | undefined) || 'Internal'
)
  .trim()
  .toLowerCase();

/** Whether the customer is the internal one (see INTERNAL_CUSTOMER_NAME). */
export function isInternalProject(customerName: string | null | undefined): boolean {
  if (!customerName) return false;
  return customerName.trim().toLowerCase() === INTERNAL_CUSTOMER_NAME;
}

export interface ISTSegment {
  type: BookingType;
  hours: number;
  percent: number;
  color: string;
  textColor: string;
}

const SEGMENT_ORDER: Record<BookingType, number> = { internal: 0, billable: 1, unbillable: 2, neutral: 3 };
const SEGMENT_CLASSES: Record<BookingType, { color: string; textColor: string }> = {
  internal: { color: 'bg-internal', textColor: 'text-internal-foreground' },
  billable: { color: 'bg-billable', textColor: 'text-billable-foreground' },
  unbillable: { color: 'bg-nonbillable', textColor: 'text-nonbillable-foreground' },
  neutral: { color: 'bg-neutral-booking', textColor: 'text-neutral-booking-foreground' },
};

/** Klassifiziert eine Buchung: interner Kunde → intern, sonst nach billable (true/false/null). */
export function classifyBooking(
  customerName: string | null | undefined,
  billable: boolean | null | undefined,
): BookingType {
  if (isInternalProject(customerName)) return 'internal';
  if (billable === true) return 'billable';
  if (billable === false) return 'unbillable';
  return 'neutral';
}

/**
 * Erstellt IST-Segmente basierend auf Activities (intern, verrechenbar,
 * nicht verrechenbar, unbewertet)
 * @param activities Timeline Items (nur IST, type === 'work' oder 'activity')
 * @param date Datum (YYYY-MM-DD)
 * @param targetHours Referenzstunden für den Prozentwert
 */
export function getISTSegments(
  activities: TimelineItem[],
  date: string,
  targetHours: number,
): ISTSegment[] {
  const dayActivities = activities.filter(
    (a) => a.date === date && (a.type === 'work' || a.type === 'activity'),
  );

  if (dayActivities.length === 0 || targetHours <= 0) {
    return [];
  }

  const hoursByType: Record<BookingType, number> = { internal: 0, billable: 0, unbillable: 0, neutral: 0 };

  for (const a of dayActivities) {
    const hours = a.hours ?? (a.seconds ? a.seconds / 3600 : 0);
    if (!Number.isFinite(hours) || hours <= 0) continue;
    hoursByType[classifyBooking(a.customerName, a.billable)] += hours;
  }

  return (Object.keys(hoursByType) as BookingType[])
    .filter((type) => hoursByType[type] > 0)
    .sort((a, b) => SEGMENT_ORDER[a] - SEGMENT_ORDER[b])
    .map((type) => ({
      type,
      hours: hoursByType[type],
      percent: (hoursByType[type] / targetHours) * 100,
      ...SEGMENT_CLASSES[type],
    }));
}
