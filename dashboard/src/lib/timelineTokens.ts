export const DAY_COUNT = 30;

export const CELL_GAP = 4;
export const CELL_MIN_WIDTH = 30;
export const GRID_MIN_WIDTH = DAY_COUNT * CELL_MIN_WIDTH + (DAY_COUNT - 1) * CELL_GAP;

export const ROW_BASE_HEIGHT = 64;
export const ROW_MIN_HEIGHT = 64;
export const DATE_HEADER_HEIGHT = 44;

export const GANTT_BAR_HEIGHT = 18;
export const GANTT_LAYER_GAP = 2;
export const GANTT_MAX_LAYERS = 5;
export const GANTT_LABEL_RESERVE = 14;
export const GANTT_VERTICAL_PADDING = 8;
export const GANTT_BADGE_RESERVE = 12;
export const GANTT_WIDTH_NAME_AND_HOURS = 84;
export const GANTT_WIDTH_NAME = 50;
export const GANTT_WIDTH_HOURS_ONLY = 26;

export const IST_MAX_UTILIZATION = 1.4;
export const IST_OVERTIME_HEADROOM = Math.ceil(ROW_BASE_HEIGHT * (IST_MAX_UTILIZATION - 1));

/** Unterhalb dieser Segmenthöhe / Zellbreite wird kein Stundenlabel gezeigt. */
export const CELL_LABEL_MIN_HEIGHT = 12;
export const CELL_LABEL_MIN_WIDTH = 26;

export const AVATAR_SIZE = 45;

export const TYPE = {
  cellLabel: 10,
  dateNumber: 12,
  weekday: 9,
  userName: 13,
  userSurname: 11,
  teamHeader: 11,
  ganttBar: 11,
  badge: 10,
} as const;

export const Z = {
  cell: 10,
  todayTint: 12,
  hover: 15,
  sollLabel: 20,
  gantt: 30,
  ganttBadge: 40,
  userColumn: 45,
  rowFlash: 48,
  teamHeader: 50,
  dateHeader: 55,
  divider: 60,
  toolbar: 70,
  popover: 9999,
} as const;
