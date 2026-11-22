import { CalendarDays, Info, X } from 'lucide-react';
import type { UserProfile } from '@/lib/auth';
import { attendancePercentage, formatPercentage } from '@/lib/attendance';
import { STAFF_ATTENDANCE_LABELS, type StaffAttendanceStatus } from '@/lib/staffAttendance';

export type StaffAttendanceDay = { date: string; status: StaffAttendanceStatus; note: string | null };

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  teacher: 'Teacher',
  parent: 'Parent',
  office_assistant: 'Office Assistant',
  accountant: 'Accountant',
  student: 'Student',
};

const STATUS_TONE: Record<StaffAttendanceStatus, string> = {
  present: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  absent: 'border-rose-200 bg-rose-50 text-rose-700',
  late: 'border-amber-200 bg-amber-50 text-amber-700',
  leave: 'border-sky-200 bg-sky-50 text-sky-700',
};

const formatDay = (value: string) => {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' });
};

export function StaffAttendanceDetail({ member, monthLabel, days, onClose }: {
  member: UserProfile;
  monthLabel: string;
  days: StaffAttendanceDay[];
  onClose: () => void;
}) {
  const present = days.filter((day) => day.status === 'present').length;
  const late = days.filter((day) => day.status === 'late').length;
  const absent = days.filter((day) => day.status === 'absent').length;
  const leave = days.filter((day) => day.status === 'leave').length;
  const percentage = attendancePercentage(present + late, days.length);

  const summary = [
    { label: 'Days recorded', value: days.length, tone: 'text-slate-700' },
    { label: 'Present', value: present + late, tone: 'text-emerald-600' },
    { label: 'Absent', value: absent, tone: 'text-rose-600' },
    { label: 'Late', value: late, tone: 'text-amber-600' },
    { label: 'On leave', value: leave, tone: 'text-sky-700' },
    { label: 'Attendance', value: formatPercentage(percentage), tone: 'text-slate-700' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      onClick={onClose}
      role="presentation"
    >
      <section
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${member.full_name} attendance for ${monthLabel}`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-sky-50 text-sm font-bold text-sky-700">
              {member.full_name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Attendance history</span>
              <h2 className="text-lg font-bold leading-tight text-slate-800">{member.full_name}</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {ROLE_LABELS[member.role] ?? member.role} · {member.username} · {monthLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="grid grid-cols-3 gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3 sm:grid-cols-6">
          {summary.map((item) => (
            <div key={item.label} className="text-center">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">{item.label}</span>
              <strong className={`mt-1 block text-base font-extrabold ${item.tone}`}>{item.value}</strong>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {days.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No attendance was recorded for {member.full_name} in {monthLabel}.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {days.map((day) => (
                <li
                  key={day.date}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 px-3 py-2.5 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <span className="flex w-24 shrink-0 items-center gap-2 text-xs font-bold text-slate-600">
                    <CalendarDays size={14} className="text-slate-400" />
                    {formatDay(day.date)}
                  </span>
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_TONE[day.status]}`}>
                    {STAFF_ATTENDANCE_LABELS[day.status]}
                  </span>
                  <span className="flex-1 text-xs text-slate-500">
                    {day.note ? day.note : <span className="text-slate-300">No note</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
          <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Info size={13} /> Late days count as present. Only days actually recorded are listed.
          </p>
          <button type="button" className="secondary-button" onClick={onClose}>Close</button>
        </footer>
      </section>
    </div>
  );
}
