import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, Check, Filter, Printer, Save, Trash2, Users, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Student } from '@/lib/schoolTypes';
import { StudentPhoto } from '@/components/StudentPhoto';

type Status = 'present' | 'absent' | 'late';
type SectionKey = { class_name: string; section_name: string };

const classOptions = ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'];

const statusMeta: { value: Status; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'late', label: 'Late' },
];

export function AttendanceManager({ students, onToast }: { students: Student[]; onToast: (message: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [filterNotTaken, setFilterNotTaken] = useState(false);
  const [storedMarks, setStoredMarks] = useState<Map<string, string>>(new Map());
  const [draft, setDraft] = useState<Record<string, Status>>({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<'save' | 'delete' | null>(null);

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

  const loadAttendance = async (forDate: string) => {
    const { data } = await supabase.from('school_attendance').select('student_id, status').eq('attendance_date', forDate);
    setStoredMarks(new Map(((data ?? []) as { student_id: string; status: string }[]).map((row) => [row.student_id, row.status])));
  };

  useEffect(() => { setDraft({}); void loadAttendance(date); }, [date]);

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

  const sectionStudents = students
    .filter((s) => s.class_name === activeClass && s.section_name === shownSection)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const statusOf = (id: string): Status | undefined => draft[id] ?? (storedMarks.get(id) as Status | undefined);
  const markedCount = sectionStudents.filter((s) => statusOf(s.id)).length;
  const setMark = (id: string, status: Status) => setDraft((current) => ({ ...current, [id]: status }));

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

  return (
    <div className="attendance-manager">
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
        </div>

        <div className="att-summary">
          <div className="search-field">
            <Users size={18} />
            <span className="result-count">
              {sectionStudents.length} students · <b>{markedCount}</b> marked · <b>{sectionStudents.length - markedCount}</b> remaining
            </span>
          </div>
          <div className="att-actions">
            <button className="primary-button" onClick={() => setConfirm('save')} disabled={saving || markedCount === 0}><Save size={16} /> Save</button>
            <button className="secondary-button" onClick={() => window.print()}><Printer size={16} /> Print</button>
            <button className="secondary-button danger" onClick={() => setConfirm('delete')} disabled={sectionStudents.length === 0}><Trash2 size={16} /> Delete</button>
          </div>
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
              {sectionStudents.map((student) => (
                <tr key={student.id}>
                  <td><StudentPhoto src={student.photo_url} name={student.full_name} className="h-9 w-9 rounded-lg" /></td>
                  <td className="muted-cell">{student.admission_number}</td>
                  <td><strong>{student.full_name}</strong></td>
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
          {sectionStudents.length === 0 && (
            <div className="empty-state large">
              {visibleSections.length === 0 ? 'All sections have been marked for this date.' : 'No students in this section yet.'}
            </div>
          )}
        </div>
      </div>

      {confirm && (
        <div className="notice-overlay" onClick={() => setConfirm(null)}>
          <form className="notice-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); confirm === 'save' ? void saveAttendance() : void deleteAttendance(); }}>
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
                ? `Save ${markedCount} marked students out of ${sectionStudents.length}. Any previously saved record for this date will be updated.`
                : `Remove attendance records for all ${sectionStudents.length} students on this date. This cannot be undone.`}
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
