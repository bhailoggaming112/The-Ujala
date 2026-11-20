export type AttendanceStatus = 'present' | 'absent' | 'late';

export type AttendanceSummary = {
  total: number;
  present: number;
  absent: number;
  late: number;
  percentage: number;
};

export type AttendanceRecord = { student_id: string; attendance_date: string; status: string };

// Monday to Saturday. Sunday is the weekly holiday, so it is never counted as a
// school day when the DMC works out how many days a student could attend.
export const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5, 6];

export const EMPTY_SUMMARY: AttendanceSummary = { total: 0, present: 0, absent: 0, late: 0, percentage: 0 };

const pad = (value: number) => String(value).padStart(2, '0');

export const toDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const parseDate = (value: string) => {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function monthStart(value: string) {
  const date = parseDate(value) ?? new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-01`;
}

export function todayKey() {
  return toDateKey(new Date());
}

// A late arrival still counts as a day the student was in school, so `present`
// includes late days. The DMC only ever reports one attendance percentage.
export const countsAsPresent = (status: string) => status === 'present' || status === 'late';

export function attendancePercentage(present: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((present / total) * 1000) / 10;
}

export function schoolDaysBetween(start: string, end: string, workingDays: number[] = DEFAULT_WORKING_DAYS) {
  const from = parseDate(start);
  const to = parseDate(end);
  if (!from || !to || to < from) return [];
  const days: string[] = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    if (workingDays.includes(cursor.getDay())) days.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// Every school day in the range that has no record at all is treated as absent,
// so the percentage always reflects the full period rather than only the days
// the register happened to be filled in.
export function summariseAttendance(
  records: AttendanceRecord[],
  start: string,
  end: string,
  workingDays: number[] = DEFAULT_WORKING_DAYS,
): AttendanceSummary {
  const days = schoolDaysBetween(start, end, workingDays);
  if (days.length === 0) return EMPTY_SUMMARY;

  const byDate = new Map<string, string>();
  for (const record of records) byDate.set(record.attendance_date.slice(0, 10), record.status);

  let present = 0;
  let absent = 0;
  let late = 0;
  for (const day of days) {
    const status = byDate.get(day);
    if (status === 'present') present += 1;
    else if (status === 'late') late += 1;
    else absent += 1;
  }

  const presentTotal = present + late;
  return {
    total: days.length,
    present: presentTotal,
    absent,
    late,
    percentage: attendancePercentage(presentTotal, days.length),
  };
}

export function formatPercentage(value: number) {
  return `${value.toFixed(1)}%`;
}
