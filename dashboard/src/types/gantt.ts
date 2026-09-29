export type GanttStatus = {
  id: string;
  name: string;
  color: string;
};

export type GanttFeature = {
  id: string;
  name: string;
  startAt: Date;
  endAt: Date;
  status: GanttStatus;
  hoursPerDay?: number;
  totalHours?: number;
  projectColor?: string;
  actualDays?: number;
};
