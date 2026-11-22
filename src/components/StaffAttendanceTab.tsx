import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Save, UserX } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { UserProfile } from '@/lib/auth';
import { todayKey } from '@/lib/attendance';
import {
  STAFF_ATTENDANCE_LABELS,
  STAFF_ATTENDANCE_STATUSES,
  fetchStaffAttendance,
  saveStaffAttendance,
  type StaffAttendanceStatus,
} from '@/lib/staffAttendance';

type Draft = { status: StaffAttendanceStatus; note: string };

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  teacher: 'Teacher',
  parent: 'Parent',
  office_assistant: 'Office Assistant',
  accountant: 'Accountant',
  student: 'Student',
};

export function StaffAttendanceTab({ onToast, staff }: {
  onToast: (message: string) => void;
  staff: UserProfile[];
}) {
  const [date, setDate] = useState(() => todayKey());
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const activeStaff = useMemo(() => staff.filter((member) => member.status === 'active'), [staff]);

  const load = useCallback(async (day: string) => {
    setLoading(true);
    const records = await fetchStaffAttendance(day);
    const byStaff: Record<string, Draft> = {};
    for (const record of records) byStaff[record.staff_user_id] = { status: record.status, note: record.note ?? '' };
    setDrafts(byStaff);
    setLoading(false);
  }, []);

  useEffect(() => { void load(date); }, [date, load]);

  const setStatus = (staffId: string, status: StaffAttendanceStatus) =>
    setDrafts((current) => ({ ...current, [staffId]: { status, note: current[staffId]?.note ?? '' } }));

  const setNote = (staffId: string, note: string) =>
    setDrafts((current) => ({ ...current, [staffId]: { status: current[staffId]?.status ?? 'present', note } }));

  // An ordinary day is one tap: mark the whole staff present, then change the few who are away.
  const markAllPresent = () => {
    const next: Record<string, Draft> = { ...drafts };
    for (const member of activeStaff) next[member.id] = { status: 'present', note: drafts[member.id]?.note ?? '' };
    setDrafts(next);
  };

  const counts = useMemo(() => {
    const summary: Record<StaffAttendanceStatus | 'unmarked', number> = { present: 0, absent: 0, late: 0, leave: 0, unmarked: 0 };
    for (const member of activeStaff) {
      const status = drafts[member.id]?.status;
      if (status) summary[status] += 1;
      else summary.unmarked += 1;
    }
    return summary;
  }, [activeStaff, drafts]);

  const markedCount = activeStaff.length - counts.unmarked;

  const save = async () => {
    if (markedCount === 0) { onToast('Mark at least one staff member before saving.'); return; }
    setSaving(true);
    const entries = activeStaff
      .filter((member) => drafts[member.id]?.status)
      .map((member) => ({
        staff_user_id: member.id,
        status: drafts[member.id].status,
        note: drafts[member.id].note,
      }));
    const { data: session } = await supabase.auth.getUser();
    const { error } = await saveStaffAttendance(date, entries, session.user?.id ?? null);
    setSaving(false);
    if (error) { onToast(error); return; }
    onToast(`Staff attendance saved for ${markedCount} ${markedCount === 1 ? 'person' : 'people'}.`);
  };

  return (
    <div className="attendance-manager">
      <div className="panel attendance-filters-panel">
        <div className="att-filters">
          <label className="control-field">Attendance date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>

        <div className="att-quick-row">
          <div className="att-quick-actions">
            <button type="button" className="att-quick present" onClick={markAllPresent} disabled={activeStaff.length === 0}>
              <Check size={15} /> Mark everyone present
            </button>
            <button type="button" className="att-quick" onClick={() => setDrafts({})} disabled={markedCount === 0}>
              <UserX size={15} /> Clear this day
            </button>
          </div>
          <p className="att-quick-hint">Mark everyone present in one tap, then set Absent, Late or On leave for anyone who is away.</p>
        </div>

        <div className="att-summary">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-500">
            <span>Present <b className="text-base font-extrabold text-emerald-600">{counts.present}</b></span>
            <span>Absent <b className="text-base font-extrabold text-rose-600">{counts.absent}</b></span>
            <span>Late <b className="text-base font-extrabold text-amber-600">{counts.late}</b></span>
            <span>On leave <b className="text-base font-extrabold text-sky-700">{counts.leave}</b></span>
            <span>Unmarked <b className="text-base font-extrabold text-slate-700">{counts.unmarked}</b></span>
          </div>
          <button type="button" className="primary-button" onClick={() => void save()} disabled={saving || markedCount === 0}>
            {saving ? <Loader2 size={16} className="auth-spinner" /> : <Save size={16} />} Save attendance
          </button>
        </div>
      </div>

      <div className="panel roster-panel">
        <div className="attendance-toolbar">
          <div>
            <strong>{new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</strong>
            <span>{markedCount} of {activeStaff.length} staff marked</span>
          </div>
          {loading && <span className="register-status"><Loader2 size={14} className="auth-spinner" /> Loading…</span>}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Staff member</th><th>Role</th><th>Attendance</th><th>Note</th></tr>
            </thead>
            <tbody>
              {activeStaff.map((member) => {
                const draft = drafts[member.id];
                return (
                  <tr key={member.id}>
                    <td>
                      <div className="table-student">
                        <div className="student-avatar">{member.full_name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</div>
                        <strong>{member.full_name}</strong>
                      </div>
                    </td>
                    <td><span className={`role-badge role-${member.role}`}>{ROLE_LABELS[member.role] ?? member.role}</span></td>
                    <td>
                      <div className="attendance-actions">
                        {STAFF_ATTENDANCE_STATUSES.map((status) => (
                          <button
                            key={status}
                            type="button"
                            className={draft?.status === status ? `chosen ${status}` : ''}
                            onClick={() => setStatus(member.id, status)}
                          >
                            {STAFF_ATTENDANCE_LABELS[status]}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td>
                      <input
                        className="w-full min-w-[10rem] rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 outline-none focus:border-sky-400"
                        value={draft?.note ?? ''}
                        onChange={(e) => setNote(member.id, e.target.value)}
                        placeholder="Optional reason"
                        maxLength={300}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {activeStaff.length === 0 && (
            <div className="empty-state large">No active staff members to mark. Add a staff member first.</div>
          )}
        </div>
      </div>
    </div>
  );
}
