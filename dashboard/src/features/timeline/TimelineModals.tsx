import type { User } from '@/lib/api';
import { calculateDailyCapacity } from '@/lib/capacity';
import type { BookingType } from '@/lib/projectColors';
import CellProjectModal from '@/components/CellProjectModal';
import UserWeekModal from '@/components/UserWeekModal';
import type { CellProject, UserCellData } from './useTimelineData';

export type CellProjectWithType = CellProject & { type?: BookingType };

interface TimelineModalsProps {
  selectedCell: { date: string; userId: number } | null;
  onCloseCell: () => void;
  userDataMap: Map<number, UserCellData>;
  getCellProjects: (date: string, userId: number, isPast: boolean) => CellProjectWithType[];
  selectedUser: User | null;
  onCloseUser: () => void;
}

export default function TimelineModals({
  selectedCell,
  onCloseCell,
  userDataMap,
  getCellProjects,
  selectedUser,
  onCloseUser,
}: TimelineModalsProps) {
  const cellModal = (() => {
    if (!selectedCell) return null;
    const userData = userDataMap.get(selectedCell.userId);
    if (!userData) return null;
    const isPast = new Date(selectedCell.date + 'T00:00:00') < new Date();
    const capacity = calculateDailyCapacity(
      { id: selectedCell.userId },
      selectedCell.date,
      userData.employments,
      userData.activities,
      userData.planning,
      userData.schedules,
    );
    const projects = getCellProjects(selectedCell.date, selectedCell.userId, isPast);
    return (
      <CellProjectModal
        isOpen
        onClose={onCloseCell}
        date={selectedCell.date}
        targetHours={capacity.targetHours}
        bookedHours={capacity.bookedHours}
        fillPercent={capacity.fillPercent}
        projects={projects}
        isPast={isPast}
      />
    );
  })();

  return (
    <>
      {cellModal}
      {selectedUser && (
        <UserWeekModal
          isOpen
          onClose={onCloseUser}
          userId={selectedUser.id}
          userDisplayName={selectedUser.displayName || `User ${selectedUser.id}`}
        />
      )}
    </>
  );
}
