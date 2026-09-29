/**
 * Projekt-Farbklassifizierung für Timeline-Zellen
 *
 * - `BookingType` / `getBookingTypeColorVar` für die Typfarben
 *   (intern / verrechenbar / nicht verrechenbar / unbewertet); die
 *   Klassifikation selbst liegt in `cellColors.classifyBooking`.
 * - `getProjectUniqueColor` / `getProjectUniqueColorPair` liefern eine
 *   entsättigte 8-Hue-Palette (OKLCH) – identisch für SOLL-Segmente und
 *   Gantt-Balken, mit Light-/Dark-Mode über CSS-Variablen
 *   (siehe `--proj-N-{bg,text,border}` in `index.css`).
 */

export type BookingType = 'internal' | 'billable' | 'unbillable' | 'neutral';

/** CSS-Variable der Typfarbe, z. B. für Farbpunkte im Modal. */
export function getBookingTypeColorVar(type: BookingType | undefined): string {
  switch (type) {
    case 'internal':
      return 'var(--internal)';
    case 'billable':
      return 'var(--billable)';
    case 'unbillable':
      return 'var(--nonbillable)';
    default:
      return 'var(--neutral-booking)';
  }
}

const PROJECT_PALETTE_SIZE = 8;

/**
 * Stabiler Hash für einen Projektnamen → 1..8.
 */
function hashToPaletteIndex(projectName: string): number {
  let hash = 0;
  for (let i = 0; i < projectName.length; i++) {
    hash = projectName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return (Math.abs(hash) % PROJECT_PALETTE_SIZE) + 1;
}

export interface ProjectColorPair {
  /** Hintergrund (Variable, automatisch Light/Dark) */
  bg: string;
  /** Textfarbe (Variable, automatisch Light/Dark) */
  text: string;
  /** Rahmenfarbe (Variable, automatisch Light/Dark) */
  border: string;
  /** Numerischer Index 1..8 für ARIA/Debug */
  index: number;
}

/**
 * Eindeutige Projektfarbe als CSS-Custom-Property-Referenz.
 * Wird für `style.backgroundColor` und CSS-Variablen-Slots genutzt.
 */
export function getProjectUniqueColor(projectName: string): string {
  const i = hashToPaletteIndex(projectName);
  return `var(--proj-${i}-bg)`;
}

/**
 * Vollständiges Farbpaar (bg/text/border) für einen Projektnamen.
 */
export function getProjectUniqueColorPair(projectName: string): ProjectColorPair {
  const i = hashToPaletteIndex(projectName);
  return {
    bg: `var(--proj-${i}-bg)`,
    text: `var(--proj-${i}-text)`,
    border: `var(--proj-${i}-border)`,
    index: i,
  };
}
