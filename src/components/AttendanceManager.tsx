import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck2, Check, CheckCheck, FileBadge2, Filter, MessageCircle, Printer, RotateCcw, Save, Trash2, UserX, Users, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Student } from '@/lib/schoolTypes';
import { StudentPhoto } from '@/components/StudentPhoto';
import { SmsReport } from '@/components/SmsReport';
import { DmcSheet } from '@/components/DmcSheet';
import { createDmcDraft, createMarksRows, type DmcDraft, type DmcMarksRow } from '@/lib/dmc';
import { SCHOOL_NAME, SCHOOL_NAME_UR, renderNoticeText } from '@/lib/noticeText';
import { queueSmsMessages, updateSmsStatus } from '@/lib/smsLog';
import {
  attendancePercentage, formatPercentage, monthStart, summariseAttendance, todayKey,
  type AttendanceRecord, type AttendanceSummary, type AttendanceStatus,
} from '@/lib/attendance';

type SectionKey = { class_name: string; section_name: string };
type Tab = 'register' | 'dmc' | 'sms';
type Language = 'English' | 'Urdu';

const classOptions = ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'];

const statusMeta: { value: AttendanceStatus; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'late', label: 'Late' },
];

// Used when the school has not saved its own absentee wording yet.
const DEFAULT_ABSENTEE_TEMPLATE: Record<Language, string> = {
  English: `Dear Parent or Guardian, {{student_name}} was marked absent at {{school_name}}. Please inform the school office if this was not expected.`,
  Urdu: `محترم والدین، {{student_name}} آج {{school_name}} میں غیر حاضر رہے۔ اگر یہ غیر متوقع تھا تو براہِ کرم اسکول دفتر کو اطلاع دیں۔`,
};

const absenteeHeading = (language: Language) => language === 'Urdu' ? SCHOOL_NAME_UR : SCHOOL_NAME;

const tabs: { value: Tab; label: string; icon: typeof CalendarCheck2 }[] = [
  { value: 'register', label: 'Daily Register', icon: CalendarCheck2 },
  { value: 'dmc', label: 'DMC', icon: FileBadge2 },
  { value: 'sms', label: 'SMS Report', icon: MessageCircle },
];

const parseCount = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
};

export function AttendanceManager({ students, onToast }: { students: Student[]; onToast: (message: string) => void }) {
  const [tab, setTab] = useState<Tab>('register');
  const today = todayKey();
  const [date, setDate] = useState(today);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [filterNotTaken, setFilterNotTaken] = useState(false);
  const [absenteesOnly, setAbsenteesOnly] = useState(false);
  const [storedMarks, setStoredMarks] = useState<Map<string, string>>(new Map());
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<'save' | 'delete' | null>(null);

  const [smsLanguage, setSmsLanguage] = useState<Language>('English');
  const [sendingSms, setSendingSms] = useState(false);
  const [alertedIds, setAlertedIds] = useState<string[]>([]);

  const distinctSections = useMemo(() => {
    const map = new Map<string, SectionKey>();
    for (const student of students) {
      const key = `${student.class_name}|||${student.section_name}`;
      if (!map.has(key)) map.set(key, { class_name: student.class_name, section_name: student.section_name });
    }
    return Array.from(map.values()).sort((a, b) => a.class_name.localeCompare(b.class_name) || a.section_name.localeCompare(b.section_name));
  }, [students]);

  const distinctClasses = useMemo(
    () => classOptions.filter((option) => distinctSections.some((section) => section.class_name === option)),
    [distinctSections],
  );

  const loadAttendance = useCallback(async (forDate: string) => {
    try {
      const { data } = await supabase.from('school_attendance').select('student_id, status').eq('attendance_date', forDate);
      setStoredMarks(new Map(((data ?? []) as { student_id: string; status: string }[]).map((row) => [row.student_id, row.status])));
    } catch {
      setStoredMarks(new Map());
    }
  }, []);

  useEffect(() => { setDraft({}); setAlertedIds([]); void loadAttendance(date); }, [date, loadAttendance]);

  const isComplete = (key: SectionKey) => {
    const list = students.filter((s) => s.class_name === key.class_name && s.section_name === key.section_name);
    return list.length > 0 && list.every((s) => storedMarks.has(s.id));
  };

  const visibleClasses = filterNotTaken
    ? distinctClasses.filter((c) => distinctSections.some((s) => s.class_name === c && !isComplete(s)))
    : distinctClasses;

  const activeClass = visibleClasses.includes(selectedClass) ? selectedClass : (visibleClasses[0] ?? '');
  const sectionsInClass = distinctSections.filter((s) => s.class_name === activeClass);

  const visibleSections = filterNotTaken ? sectionsInClass.filter((s) => !isComplete(s)) : sectionsInClass;
  const shownSection = visibleSections.some((s) => s.section_name === selectedSection) ? selectedSection : (visibleSections[0]?.section_name ?? '');

  const sectionStudents = useMemo(
    () => students
      .filter((s) => s.class_name === activeClass && s.section_name === shownSection)
      .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [students, activeClass, shownSection],
  );

  const statusOf = useCallback(
    (id: string): AttendanceStatus | undefined => draft[id] ?? (storedMarks.get(id) as AttendanceStatus | undefined),
    [draft, storedMarks],
  );

  const absentees = useMemo(
    () => sectionStudents.filter((student) => statusOf(student.id) === 'absent'),
    [sectionStudents, statusOf],
  );

  const counts = useMemo(() => {
    let marked = 0;
    let present = 0;
    let absent = 0;
    for (const student of sectionStudents) {
      const status = statusOf(student.id);
      if (!status) continue;
      marked += 1;
      if (status === 'absent') absent += 1;
      else present += 1;
    }
    return { total: sectionStudents.length, marked, present, absent, remaining: sectionStudents.length - marked };
  }, [sectionStudents, statusOf]);

  const shownStudents = absenteesOnly ? absentees : sectionStudents;

  const setMark = (id: string, status: AttendanceStatus) => setDraft((current) => ({ ...current, [id]: status }));

  const markAllPresent = () => {
    if (shownStudents.length === 0) { onToast('There are no students to mark in this view.'); return; }
    setDraft((current) => {
      const next = { ...current };
      for (const student of shownStudents) next[student.id] = 'present';
      return next;
    });
    onToast(`${shownStudents.length} students marked present. Tap Absent or Late on anyone who is away, then save.`);
  };

  const resetDraft = () => {
    if (shownStudents.length === 0) return;
    setDraft((current) => {
      const next = { ...current };
      for (const student of shownStudents) delete next[student.id];
      return next;
    });
    onToast('Unsaved marks cleared for this view.');
  };

  const saveAttendance = async () => {
    const entries = Object.entries(draft)
      .filter(([id]) => sectionStudents.some((s) => s.id === id))
      .map(([student_id, status]) => ({ student_id, attendance_date: date, status }));
    setSaving(true);
    const { error } = await supabase.from('school_attendance').upsert(entries, { onConflict: 'student_id,attendance_date' });
    setSaving(false);
    setConfirm(null);
    if (error) { onToast('Attendance could not be saved. Please try again.'); return; }
    onToast(`Attendance saved for ${activeClass} · Section ${shownSection}`);
    setDraft({});
    await loadAttendance(date);
  };

  const deleteAttendance = async () => {
    const ids = sectionStudents.map((s) => s.id);
    setSaving(true);
    const { error } = await supabase.from('school_attendance').delete().eq('attendance_date', date).in('student_id', ids);
    setSaving(false);
    setConfirm(null);
    if (error) { onToast('Attendance could not be cleared. Please try again.'); return; }
    onToast(`Attendance cleared for ${activeClass} · Section ${shownSection}`);
    setDraft({});
    await loadAttendance(date);
  };

  const loadTemplate = async (language: Language) => {
    try {
      const { data } = await supabase
        .from('school_notice_templates')
        .select('template_text')
        .eq('notice_type', 'absentee_alert')
        .eq('language', language)
        .maybeSingle();
      const text = (data as { template_text: string } | null)?.template_text;
      return text?.trim() ? text : DEFAULT_ABSENTEE_TEMPLATE[language];
    } catch {
      return DEFAULT_ABSENTEE_TEMPLATE[language];
    }
  };

  const sendAbsenteeAlerts = async () => {
    if (absentees.length === 0) { onToast('No absentees to message for this date.'); return; }
    setSendingSms(true);
    const template = await loadTemplate(smsLanguage);
    const messages = absentees.map((student) => ({
      student_id: student.id,
      student_name: student.full_name,
      class_name: student.class_name,
      section_name: student.section_name,
      parent_phone: student.guardian_phone || student.messaging_number || student.father_contact_number || student.whatsapp_number || null,
      message_type: 'absentee_alert',
      message_body: renderNoticeText(template, smsLanguage, student.full_name),
      attendance_date: date,
    }));
    const { ids, error } = await queueSmsMessages(messages);
    if (error || ids.length === 0) {
      setSendingSms(false);
      onToast('The absentee alerts could not be logged. Please try again.');
      return;
    }
    const statusError = await updateSmsStatus(ids, 'sent', `Logged from the Daily Attendance register for ${date}`);
    setSendingSms(false);
    setAlertedIds(absentees.map((student) => student.id));
    onToast(statusError
      ? `${ids.length} alerts logged, but their status could not be updated. Open the SMS Report to review.`
      : `${ids.length} absentee alerts sent and recorded in the SMS Report.`);
  };

  return (
    <div className="attendance-manager">
      <div className="att-tabs" role="tablist">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={tab === item.value}
              className={`att-tab ${tab === item.value ? 'active' : ''}`}
              onClick={() => setTab(item.value)}
            >
              <Icon size={16} /> {item.label}
              {item.value === 'register' && counts.absent > 0 && <span className="att-tab-count">{counts.absent}</span>}
            </button>
          );
        })}
      </div>

      {tab === 'register' && (
        <>
          <div className="panel attendance-filters-panel">
            <div className="att-filters">
              <label className="control-field">Attendance Date
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="control-field">Class
                <select value={activeClass} onChange={(e) => { setSelectedClass(e.target.value); setSelectedSection(''); }} disabled={visibleClasses.length === 0}>
                  {visibleClasses.length === 0 && <option value="">All marked</option>}
                  {visibleClasses.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="control-field">Section
                <select value={shownSection} onChange={(e) => setSelectedSection(e.target.value)} disabled={visibleSections.length === 0}>
                  {visibleSections.length === 0 && <option value="">No section</option>}
                  {visibleSections.map((section) => <option key={section.section_name} value={section.section_name}>Section {section.section_name}</option>)}
                </select>
              </label>
              <label className="att-filter-check">
                <input type="checkbox" className="h-4 w-4 accent-sky-600" checked={filterNotTaken} onChange={(e) => setFilterNotTaken(e.target.checked)} />
                <Filter size={15} />
                <span>Filter Not Taken</span>
              </label>
              <button
                type="button"
                className={`att-filter-toggle ${absenteesOnly ? 'on' : ''}`}
                onClick={() => setAbsenteesOnly((current) => !current)}
                aria-pressed={absenteesOnly}
              >
                <UserX size={15} />
                <span>Absentees Only</span>
                <b className="att-absent-badge">{absentees.length}</b>
              </button>
            </div>

            <div className="att-quick-row">
              <div className="att-quick-actions">
                <button type="button" className="att-quick present" onClick={markAllPresent} disabled={shownStudents.length === 0}>
                  <CheckCheck size={16} /> Mark All Present
                </button>
                <button type="button" className="att-quick" onClick={resetDraft} disabled={shownStudents.length === 0}>
                  <RotateCcw size={15} /> Reset marks
                </button>
              </div>
              <p className="att-quick-hint">Mark everyone present in one tap, then click Absent or Late on the students who are away before saving.</p>
            </div>

            <div className="att-summary">
              <div className="search-field">
                <Users size={18} />
                <span className="result-count">
                  Total <b>{counts.total}</b> · Marked <b>{counts.marked}</b> · Present <b>{counts.present}</b> · Absent <b>{counts.absent}</b> · Remaining <b>{counts.remaining}</b>
                </span>
              </div>
              <div className="att-actions">
                <button className="primary-button" onClick={() => setConfirm('save')} disabled={saving || counts.marked === 0}><Save size={16} /> Save</button>
                <button className="secondary-button" onClick={() => window.print()}><Printer size={16} /> Print</button>
                <button className="secondary-button danger" onClick={() => setConfirm('delete')} disabled={sectionStudents.length === 0}><Trash2 size={16} /> Delete</button>
              </div>
            </div>
          </div>

          <div className="panel attendance-sms-bar">
            <div className="attendance-sms-copy">
              <MessageCircle size={18} />
              <div>
                <strong>{absenteeHeading(smsLanguage)} · {absentees.length} absentee{absentees.length === 1 ? '' : 's'} on {new Date(`${date}T00:00:00`).toLocaleDateString()}</strong>
                <small>
                  {absentees.length === 0
                    ? 'Nobody is marked absent in this section yet.'
                    : `Alert the guardians of ${absentees.map((student) => student.full_name).slice(0, 3).join(', ')}${absentees.length > 3 ? ` and ${absentees.length - 3} more` : ''}.`}
                </small>
              </div>
            </div>
            <div className="attendance-sms-actions">
              <div className="segmented-control compact lang-toggle">
                {(['English', 'Urdu'] as const).map((lang) => (
                  <button key={lang} type="button" className={smsLanguage === lang ? 'selected' : ''} onClick={() => setSmsLanguage(lang)}>{lang}</button>
                ))}
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={() => void sendAbsenteeAlerts()}
                disabled={sendingSms || absentees.length === 0}
              >
                <MessageCircle size={16} /> {sendingSms ? 'Sending…' : 'Send Absentee SMS'}
              </button>
            </div>
          </div>

          <div className="panel roster-panel section-students-panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Photo</th>
                    <th>Admission No.</th>
                    <th>Student Name</th>
                    <th>Parent Details</th>
                    <th>Area</th>
                    <th>Contact Number</th>
                    <th>Mark Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {shownStudents.map((student) => (
                    <tr key={student.id} className={statusOf(student.id) === 'absent' ? 'absent-row' : undefined}>
                      <td><StudentPhoto src={student.photo_url} name={student.full_name} className="h-9 w-9 rounded-lg" /></td>
                      <td className="muted-cell">{student.admission_number}</td>
                      <td>
                        <strong>{student.full_name}</strong>
                        {alertedIds.includes(student.id) && <span className="sms-sent-tag"><Check size={11} /> SMS sent</span>}
                      </td>
                      <td><span>{student.fathers_name || student.guardian_name}</span><small>{student.fathers_name ? student.guardian_name : ''}</small></td>
                      <td>{student.area || '—'}</td>
                      <td><span>{student.guardian_phone}</span><small>{student.messaging_number || student.father_contact_number || ''}</small></td>
                      <td>
                        <div className="attendance-actions">
                          {statusMeta.map((meta) => (
                            <button
                              key={meta.value}
                              type="button"
                              className={`att-mark ${meta.value} ${statusOf(student.id) === meta.value ? 'on' : ''}`}
                              onClick={() => setMark(student.id, meta.value)}
                            >
                              {meta.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shownStudents.length === 0 && (
                <div className="empty-state large">
                  {absenteesOnly
                    ? 'No absentees in this section for this date. Everyone is present.'
                    : visibleSections.length === 0
                      ? 'All sections have been marked for this date.'
                      : 'No students in this section yet.'}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'dmc' && (
        <DmcPanel students={students} onToast={onToast} />
      )}

      {tab === 'sms' && <SmsReport onToast={onToast} />}

      {confirm && (
        <div className="notice-overlay" onClick={() => setConfirm(null)}>
          <form className="notice-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (confirm === 'save') void saveAttendance(); else void deleteAttendance(); }}>
            <div className="notice-preview-top">
              <div>
                <span className="eyebrow">{confirm === 'save' ? 'Save attendance' : 'Clear attendance'}</span>
                <h2 className="mt-1 text-xl font-bold text-slate-800">{activeClass} · Section {shownSection}</h2>
              </div>
              <button type="button" className="close-button" onClick={() => setConfirm(null)} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="mt-4 rounded-xl bg-sky-50 px-5 py-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attendance date</span>
              <p className="mt-1 text-2xl font-bold text-slate-800">{new Date(`${date}T00:00:00`).toLocaleDateString()}</p>
            </div>
            <p className="mt-3 text-sm text-slate-500">
              {confirm === 'save'
                ? `Save ${counts.marked} marked students out of ${counts.total}. Any previously saved record for this date will be updated.`
                : `Remove attendance records for all ${counts.total} students on this date. This cannot be undone.`}
            </p>
            <div className="notice-preview-actions">
              <button type="button" className="secondary-button" onClick={() => setConfirm(null)}>Cancel</button>
              <button type="submit" className={confirm === 'delete' ? 'danger-button' : 'primary-button'} disabled={saving}>
                {confirm === 'delete' ? <Trash2 size={16} /> : <Check size={16} />} {saving ? 'Working…' : confirm === 'save' ? 'Confirm save' : 'Confirm delete'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function DmcPanel({ students, onToast }: { students: Student[]; onToast: (message: string) => void }) {
  const today = todayKey();
  const [studentId, setStudentId] = useState('');
  const [range, setRange] = useState({ start: monthStart(today), end: today });
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [override, setOverride] = useState(false);
  const [manual, setManual] = useState({ total: '', present: '', absent: '' });
  const [draft, setDraft] = useState<DmcDraft>(() => createDmcDraft(monthStart(today), today));
  const [marks, setMarks] = useState<DmcMarksRow[]>(() => createMarksRows());
  const [savingDmc, setSavingDmc] = useState(false);

  const roster = useMemo(
    () => students.filter((student) => student.status === 'active').sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [students],
  );
  const selectedStudent = roster.find((student) => student.id === studentId) ?? null;

  useEffect(() => {
    if (!studentId || !range.start || !range.end) { setRecords([]); setLoadError(null); return; }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('school_attendance')
          .select('student_id, attendance_date, status')
          .eq('student_id', studentId)
          .gte('attendance_date', range.start)
          .lte('attendance_date', range.end);
        if (cancelled) return;
        setRecords(error ? [] : ((data ?? []) as AttendanceRecord[]));
        setLoadError(error ? 'Attendance for this period could not be loaded.' : null);
      } catch {
        if (!cancelled) { setRecords([]); setLoadError('Attendance for this period could not be loaded.'); }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [studentId, range.start, range.end]);

  const autoSummary = useMemo(
    () => summariseAttendance(records, range.start, range.end),
    [records, range.start, range.end],
  );

  // Manual figures are optional: they only take over when a staff member turns
  // the override on, otherwise the register drives every number on the sheet.
  const summary: AttendanceSummary = override
    ? {
      total: parseCount(manual.total),
      present: parseCount(manual.present),
      absent: parseCount(manual.absent),
      late: autoSummary.late,
      percentage: attendancePercentage(parseCount(manual.present), parseCount(manual.total)),
    }
    : autoSummary;

  const enableOverride = () => {
    setManual({ total: String(autoSummary.total), present: String(autoSummary.present), absent: String(autoSummary.absent) });
    setOverride(true);
  };

  const saveDmc = async () => {
    if (!selectedStudent) { onToast('Choose a student first.'); return; }
    setSavingDmc(true);
    const { error } = await supabase.from('school_dmc_records').upsert({
      student_id: selectedStudent.id,
      term: draft.term,
      session: draft.session,
      period_start: range.start,
      period_end: range.end,
      attendance_total: summary.total,
      attendance_present: summary.present,
      attendance_absent: summary.absent,
      attendance_percentage: summary.percentage,
      attendance_manual: override,
      remarks: draft.remarks,
      issued_date: today,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'student_id,period_start,period_end' });
    setSavingDmc(false);
    if (error) { onToast('The DMC could not be saved. Please try again.'); return; }
    onToast(`DMC saved for ${selectedStudent.full_name}`);
  };

  return (
    <div className="dmc-panel">
      <div className="panel attendance-filters-panel">
        <div className="att-filters">
          <label className="control-field">Student
            <select value={studentId} onChange={(event) => setStudentId(event.target.value)}>
              <option value="">Select a student</option>
              {roster.map((student) => <option key={student.id} value={student.id}>{student.full_name} — {student.class_name} · {student.section_name}</option>)}
            </select>
          </label>
          <label className="control-field">Period from
            <input type="date" value={range.start} onChange={(event) => setRange((current) => ({ ...current, start: event.target.value }))} />
          </label>
          <label className="control-field">Period to
            <input type="date" value={range.end} onChange={(event) => setRange((current) => ({ ...current, end: event.target.value }))} />
          </label>
          <label className="control-field">Term
            <input value={draft.term} onChange={(event) => setDraft((current) => ({ ...current, term: event.target.value }))} placeholder="Annual, First term…" />
          </label>
          <label className="control-field">Session
            <input value={draft.session} onChange={(event) => setDraft((current) => ({ ...current, session: event.target.value }))} placeholder="2026-2027" />
          </label>
        </div>
      </div>

      {!selectedStudent ? (
        <div className="panel roster-panel">
          <div className="empty-state large"><FileBadge2 size={20} /> Choose a student to build their Detailed Marks Certificate.</div>
        </div>
      ) : (
        <>
          <div className="panel dmc-summary-panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">Calculated from the register</span>
                <h2>Attendance summary</h2>
              </div>
              <span className="dmc-period-note">{range.start} → {range.end} · Sundays excluded</span>
            </div>

            <div className="dmc-stat-row">
              <div className="dmc-stat"><span>Total days</span><strong>{loading ? '—' : summary.total}</strong></div>
              <div className="dmc-stat present"><span>Present days</span><strong>{loading ? '—' : summary.present}</strong></div>
              <div className="dmc-stat absent"><span>Absent days</span><strong>{loading ? '—' : summary.absent}</strong></div>
              <div className="dmc-stat"><span>Late arrivals</span><strong>{loading ? '—' : summary.late}</strong></div>
              <div className="dmc-stat percentage"><span>Attendance</span><strong>{loading ? '—' : formatPercentage(summary.percentage)}</strong></div>
            </div>

            {loadError && <p className="dmc-warning">{loadError}</p>}

            <div className="dmc-override">
              <label className="att-filter-check">
                <input type="checkbox" className="h-4 w-4 accent-sky-600" checked={override} onChange={(event) => event.target.checked ? enableOverride() : setOverride(false)} />
                <span>Adjust attendance manually</span>
              </label>
              {override ? (
                <div className="dmc-override-fields">
                  <label className="control-field">Total days
                    <input type="number" min="0" value={manual.total} onChange={(event) => setManual((current) => ({ ...current, total: event.target.value }))} />
                  </label>
                  <label className="control-field">Present days
                    <input type="number" min="0" value={manual.present} onChange={(event) => setManual((current) => ({ ...current, present: event.target.value }))} />
                  </label>
                  <label className="control-field">Absent days
                    <input type="number" min="0" value={manual.absent} onChange={(event) => setManual((current) => ({ ...current, absent: event.target.value }))} />
                  </label>
                  <span className="dmc-override-note">Attendance works out to <b>{formatPercentage(summary.percentage)}</b> from these figures.</span>
                </div>
              ) : (
                <p className="dmc-override-note">Figures come straight from the daily register. Tick the box only if you need to correct them.</p>
              )}
            </div>
          </div>

          <div className="panel dmc-marks-panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">Printed on the certificate</span>
                <h2>Marks obtained</h2>
              </div>
              <button type="button" className="secondary-button" onClick={() => setMarks((current) => [...current, ...createMarksRows().slice(0, 1)])}><Check size={15} /> Add subject row</button>
            </div>
            <div className="dmc-marks-grid">
              <span className="dmc-marks-head">Subject</span>
              <span className="dmc-marks-head">Total marks</span>
              <span className="dmc-marks-head">Obtained</span>
              <span />
              {marks.map((row, index) => (
                <div className="dmc-marks-row" key={index}>
                  <input value={row.subject} placeholder="e.g. Mathematics" onChange={(event) => setMarks((current) => current.map((item, i) => i === index ? { ...item, subject: event.target.value } : item))} />
                  <input type="number" min="0" value={row.total_marks} onChange={(event) => setMarks((current) => current.map((item, i) => i === index ? { ...item, total_marks: event.target.value } : item))} />
                  <input type="number" min="0" value={row.obtained_marks} onChange={(event) => setMarks((current) => current.map((item, i) => i === index ? { ...item, obtained_marks: event.target.value } : item))} />
                  <button type="button" className="dmc-marks-remove" aria-label="Remove subject" onClick={() => setMarks((current) => current.length <= 1 ? current : current.filter((_, i) => i !== index))}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <label className="control-field dmc-remarks">Remarks
              <textarea rows={3} value={draft.remarks} onChange={(event) => setDraft((current) => ({ ...current, remarks: event.target.value }))} placeholder="Result, conduct or any note to print on the certificate" />
            </label>
          </div>

          <div className="panel dmc-actions-panel">
            <div className="dmc-actions-copy">
              <strong>{selectedStudent.full_name}</strong>
              <small>{selectedStudent.admission_number} · {selectedStudent.class_name} · Section {selectedStudent.section_name}</small>
            </div>
            <div className="dmc-actions-buttons">
              <button type="button" className="secondary-button" onClick={() => void saveDmc()} disabled={savingDmc}>{savingDmc ? 'Saving…' : 'Save DMC'}</button>
              <DmcSheet
                student={selectedStudent}
                draft={{ ...draft, period_start: range.start, period_end: range.end }}
                summary={summary}
                marks={marks}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
