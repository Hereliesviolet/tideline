/**
 * MOCO-Mapping-Funktionen für Frontend
 * WICHTIG: Diese Mappings müssen mit dem Backend (worker/src/lib/mocoMapping.ts) synchron sein!
 */

export type TeamLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Maps a MOCO unit name to a team level (0-7).
 *
 * Expected unit naming is "<NN>. <role>", where the role keywords below follow a
 * German consulting hierarchy:
 *   00 intern / working student   04 manager
 *   01 analyst                    05 senior manager
 *   02 consultant (Berater)       06 associate partner / director
 *   03 senior consultant          07 partner
 * Units containing "freelancer", "admin" or "p&c" map to level 0.
 * Adapt this mapping to your own MOCO units.
 */
export function mapMocoUnitToTeamLevel(unitName: string | null | undefined): TeamLevel {
  if (!unitName) return 0; // Fallback: Level 0

  const normalized = unitName.trim().toLowerCase();

  // Spezielle Kategorien, die als Level 0 behandelt werden (gefiltert)
  if (normalized.includes("freelancer") || normalized.includes("08. freelancer")) {
    return 0;
  }
  if (normalized.includes("admin") || normalized.includes("09. admin")) {
    return 0;
  }
  if (normalized.includes("p&c") || normalized.includes("10. p&c")) {
    return 0;
  }

  // Exakte Mappings basierend auf aktueller MOCO-Struktur
  // Level 0: Prakti / Werki
  if (normalized.includes("00.") && (normalized.includes("prakti") || normalized.includes("werki"))) {
    return 0;
  }

  // Level 1: Analyst
  if (normalized.includes("01.") && normalized.includes("analyst")) {
    return 1;
  }

  // Level 2: Berater
  if (normalized.includes("02.") && normalized.includes("berater") && !normalized.includes("senior")) {
    return 2;
  }

  // Level 3: Senior Berater
  if (normalized.includes("03.") && normalized.includes("senior") && normalized.includes("berater")) {
    return 3;
  }

  // Level 4: Manager
  if (normalized.includes("04.") && normalized.includes("manager") && !normalized.includes("senior")) {
    return 4;
  }

  // Level 5: Senior Manager
  if (normalized.includes("05.") && normalized.includes("senior") && normalized.includes("manager")) {
    return 5;
  }

  // Level 6: Assoc. Partner / Director
  if (normalized.includes("06.") && (normalized.includes("assoc") || normalized.includes("director"))) {
    return 6;
  }

  // Level 7: Partner
  if (normalized.includes("07.") && normalized.includes("partner") && !normalized.includes("assoc")) {
    return 7;
  }

  // Rollenname ohne MOCO-Nummer (alte Prefixes nach Hierarchie-Shift, z.B. "04. Senior Manager")
  if (normalized.includes("prakti") || normalized.includes("werki")) {
    return 0;
  }
  if (normalized.includes("analyst")) {
    return 1;
  }
  if (normalized.includes("senior") && normalized.includes("berater")) {
    return 3;
  }
  if (normalized.includes("berater")) {
    return 2;
  }
  if (normalized.includes("senior") && normalized.includes("manager")) {
    return 5;
  }
  if (normalized.includes("manager")) {
    return 4;
  }
  if (normalized.includes("assoc") || normalized.includes("director")) {
    return 6;
  }
  if (normalized.includes("partner")) {
    return 7;
  }

  // Fallback: Versuche numerisches Pattern-Matching
  const patternMatch = normalized.match(/^0?([0-9])[.\s]/);
  if (patternMatch) {
    const level = parseInt(patternMatch[1]);
    if (level >= 0 && level <= 7) {
      return level as TeamLevel;
    }
  }

  // Default: Level 0
  if (import.meta.env.DEV) {
    console.warn(`[mocoMapping] Unknown unit name: "${unitName}", defaulting to level 0`);
  }
  return 0;
}

/**
 * Gibt alle sichtbaren Team-Levels für einen User zurück
 * Regel: User sieht nur Stufen strikt unterhalb des eigenen Rangs (nicht die eigene Ebene)
 * Super User: Sieht ALLES (alle Levels 0-7)
 */
export function getVisibleTeamLevelsForUser(teamLevel: TeamLevel, superUser?: boolean): TeamLevel[] {
  // Super User sieht ALLES (alle Levels 0-7)
  if (superUser === true) {
    return [0, 1, 2, 3, 4, 5, 6, 7];
  }

  const levels: TeamLevel[] = [];
  for (let i = 0; i < teamLevel; i++) {
    levels.push(i as TeamLevel);
  }
  return levels;
}

/**
 * Konvertiert Team-Levels zu Team-Werten (Strings wie "00", "01", etc.)
 */
export function teamLevelsToTeamValues(teamLevels: TeamLevel[]): string[] {
  return teamLevels.map(level => String(level).padStart(2, '0'));
}

