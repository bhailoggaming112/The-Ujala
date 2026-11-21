export type AttendanceStatus = 'present' | 'absent' | 'late' | 'leave';

export type AttendanceSummary = {
  total: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
  percentage: number;
};

export type AttendanceRecord = { student_id: string; attendance_date: string; status: string };

export type CalendarDayType = 'holiday' | 'vacation' | 'exam' | 'special_working';

export type CalendarDay = {
  id: string;
  day_date: string;
  day_type: CalendarDayType;
  title: string;
  notes: string | null;
};

export type CalendarPolicy = {
  working_days: number[];
  low_attendance_threshold: number;
  exclude_leave_from_denominator: boolean;
};

export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Days the school is closed. A special working day is the opposite: the school
// opens even though the working-week schedule would normally keep it shut.
export const CLOSED_DAY_TYPES: CalendarDayType[] = ['holiday', 'vacation', 'exam'];

export const CALENDAR_DAY_LABELS: Record<CalendarDayType, string> = {
  holiday: 'Holiday',
  vacation: 'Vacation',
  exam: 'Exam / off day',
  special_working: 'Special working day',
};

// Monday to Saturday, matching the register's long-standing Sunday off.
export const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5, 6];

export const DEFAULT_CALENDAR_POLICY: CalendarPolicy = {
  working_days: [...DEFAULT_WORKING_DAYS],
  low_attendance_threshold: 75,
  exclude_leave_from_denominator: false,
};

export const EMPTY_SUMMARY: AttendanceSummary = { total: 0, present: 0, absent: 0, late: 0, leave: 0, percentage: 0 };

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

// Inclusive first and last day of a calendar month.
export function monthRange(year: number, monthIndex: number) {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  return { start: toDateKey(start), end: toDateKey(end) };
}

export function attendancePercentage(present: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((present / total) * 1000) / 10;
}

export function formatPercentage(value: number) {
  return `${value.toFixed(1)}%`;
}

export function isLowAttendance(percentage: number, threshold: number) {
  return percentage < threshold;
}

export const isClosedDayType = (type: CalendarDayType) => CLOSED_DAY_TYPES.includes(type);

// The dates the school actually opened in a period: the working week, minus
// holidays, vacations and exam off days, plus any special working day.
export function effectiveSchoolDays(
  start: string,
  end: string,
  policy: CalendarPolicy = DEFAULT_CALENDAR_POLICY,
  calendarDays: CalendarDay[] = [],
): string[] {
  const from = parseDate(start);
  const to = parseDate(end);
  if (!from || !to || to < from) return [];

  const closed = new Set<string>();
  const special = new Set<string>();
  for (const day of calendarDays) {
    const key = day.day_date.slice(0, 10);
    if (isClosedDayType(day.day_type)) closed.add(key);
    else special.add(key);
  }

  const days: string[] = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    const key = toDateKey(cursor);
    if (!closed.has(key)) {
      if (special.has(key) || policy.working_days.includes(cursor.getDay())) days.push(key);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// A late arrival still counts as a day the student was in school, so `present`
// includes late days. An approved leave day is reported on its own and only
// leaves the denominator when the school's policy asks for it.
export function summariseAttendance(
  records: AttendanceRecord[],
  start: string,
  end: string,
  policy: CalendarPolicy = DEFAULT_CALENDAR_POLICY,
  calendarDays: CalendarDay[] = [],
): AttendanceSummary {
  const days = effectiveSchoolDays(start, end, policy, calendarDays);
  if (days.length === 0) return EMPTY_SUMMARY;

  const byDate = new Map<string, string>();
  for (const record of records) byDate.set(record.attendance_date.slice(0, 10), record.status);

  let present = 0;
  let absent = 0;
  let late = 0;
  let leave = 0;
  for (const day of days) {
    const status = byDate.get(day);
    if (status === 'present') present += 1;
    else if (status === 'late') late += 1;
    else if (status === 'leave') leave += 1;
    else absent += 1;
  }

  const presentTotal = present + late;
  const denominator = policy.exclude_leave_from_denominator ? days.length - leave : days.length;
  return {
    total: denominator,
    present: presentTotal,
    absent,
    late,
    leave,
    percentage: attendancePercentage(presentTotal, denominator),
  };
}

export type DayCounts = { present: number; absent: number; late: number; leave: number; marked: number };

export const EMPTY_DAY_COUNTS: DayCounts = { present: 0, absent: 0, late: 0, leave: 0, marked: 0 };

export function countByStatus(statuses: string[]): DayCounts {
  const counts: DayCounts = { ...EMPTY_DAY_COUNTS };
  for (const status of statuses) {
    if (status === 'present') { counts.present += 1; counts.marked += 1; }
    else if (status === 'absent') { counts.absent += 1; counts.marked += 1; }
    else if (status === 'late') { counts.late += 1; counts.marked += 1; }
    else if (status === 'leave') { counts.leave += 1; counts.marked += 1; }
  }
  return counts;
}
