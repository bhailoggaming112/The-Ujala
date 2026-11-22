import { supabase } from '@/lib/supabase';

export type StaffAttendanceStatus = 'present' | 'absent' | 'late' | 'leave';

export type StaffAttendanceRecord = {
  staff_user_id: string;
  attendance_date: string;
  status: StaffAttendanceStatus;
  note: string | null;
};

export const STAFF_ATTENDANCE_STATUSES: StaffAttendanceStatus[] = ['present', 'absent', 'late', 'leave'];

export const STAFF_ATTENDANCE_LABELS: Record<StaffAttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  leave: 'On leave',
};

export async function fetchStaffAttendance(date: string): Promise<StaffAttendanceRecord[]> {
  try {
    const { data, error } = await supabase
      .from('school_staff_attendance')
      .select('staff_user_id, attendance_date, status, note')
      .eq('attendance_date', date);
    if (error) return [];
    return (data ?? []) as StaffAttendanceRecord[];
  } catch {
    return [];
  }
}

// The unique key on (staff_user_id, attendance_date) makes this a true "save the day"
// write: a staff member marked twice on the same date updates their one row instead of
// adding a duplicate.
export async function saveStaffAttendance(
  date: string,
  entries: { staff_user_id: string; status: StaffAttendanceStatus; note: string }[],
  markedBy: string | null,
): Promise<{ error: string | null }> {
  try {
    const rows = entries.map((entry) => ({
      staff_user_id: entry.staff_user_id,
      attendance_date: date,
      status: entry.status,
      note: entry.note.trim() ? entry.note.trim() : null,
      marked_by: markedBy,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from('school_staff_attendance')
      .upsert(rows, { onConflict: 'staff_user_id,attendance_date' });
    if (error) return { error: 'Staff attendance could not be saved. Please try again.' };
    return { error: null };
  } catch {
    return { error: 'Could not reach the school server. Check your connection and try again.' };
  }
}
