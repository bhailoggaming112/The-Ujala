import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Eraser, Info, Loader2, Save, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Student } from '@/lib/schoolTypes';
import {
  clearSubjectMarks,
  fetchExamMarks,
  fetchExamSubjects,
  fetchExamTypes,
  gradeFor,
  saveStudentMarks,
  type ExamMark,
  type ExamSubject,
  type ExamType,
} from '@/lib/exams';

type Draft = { obtained: string; absent: boolean };

export function MarksEntryTab({ students, onToast }: { students: Student[]; onToast: (message: string) => void }) {
  const [exams, setExams] = useState<ExamType[]>([]);
  const [examId, setExamId] = useState('');
  const [className, setClassName] = useState('');
  const [subjects, setSubjects] = useState<ExamSubject[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [marks, setMarks] = useState<ExamMark[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only exams that are open for entry are offered, so a closed exam cannot be
  // edited by accident.
  useEffect(() => {
    void (async () => {
      const { exams: rows, error: loadError } = await fetchExamTypes();
      if (loadError) { setError(loadError); return; }
      const open = rows.filter((exam) => exam.is_active);
      setExams(open);
      setExamId((current) => current || open[0]?.id || '');
    })();
  }, []);

  const classes = useMemo(
    () => Array.from(new Set(students.filter((student) => student.status === 'active').map((student) => student.class_name))).sort(),
    [students],
  );

  useEffect(() => {
    setClassName((current) => (current && classes.includes(current) ? current : classes[0] ?? ''));
  }, [classes]);

  // Read inside the exam-change effect below so switching exams keeps the class the
  // user is already working in. Reading it through a ref avoids refetching the
  // subjects every time the class dropdown changes.
  const classNameRef = useRef(className);
  classNameRef.current = className;

  const loadSubjects = useCallback(async (id: string): Promise<ExamSubject[]> => {
    if (!id) { setSubjects([]); return []; }
    const { subjects: rows, error: loadError } = await fetchExamSubjects(id);
    setSubjects(rows);
    setError(loadError);
    return rows;
  }, []);

  useEffect(() => {
    void (async () => {
      const rows = await loadSubjects(examId);
      setSubjectId('');
      setMarks([]);
      setDrafts({});
      if (rows.length) {
        const first = rows.find((subject) => subject.class_name === classNameRef.current) ?? rows[0];
        setClassName(first.class_name);
        setSubjectId(first.id);
      }
    })();
  }, [examId, loadSubjects]);

  const subjectsForClass = useMemo(
    () => subjects.filter((subject) => subject.class_name === className),
    [subjects, className],
  );

  useEffect(() => {
    setSubjectId((current) => (current && subjectsForClass.some((subject) => subject.id === current) ? current : subjectsForClass[0]?.id ?? ''));
  }, [subjectsForClass]);

  const selectedSubject = subjects.find((subject) => subject.id === subjectId) ?? null;

  const loadMarks = useCallback(async (id: string) => {
    if (!id) { setMarks([]); setDrafts({}); return; }
    const { marks: rows, error: loadError } = await fetchExamMarks(id);
    setMarks(rows);
    setDrafts({});
    setError(loadError);
  }, []);

  useEffect(() => { void loadMarks(examId); }, [examId, loadMarks]);

  const roster = useMemo(
    () => students
      .filter((student) => student.status === 'active' && student.class_name === className)
      .sort((a, b) => (a.roll_number || a.full_name).localeCompare(b.roll_number || b.full_name, undefined, { numeric: true })),
    [students, className],
  );

  const markByStudent = useMemo(() => {
    const map = new Map<string, ExamMark>();
    for (const mark of marks) if (mark.subject_id === subjectId) map.set(mark.student_id, mark);
    return map;
  }, [marks, subjectId]);

  const draftFor = (student: Student): Draft => {
    const saved = markByStudent.get(student.id);
    return drafts[student.id] ?? {
      obtained: saved && !saved.is_absent && saved.obtained_marks !== null ? String(saved.obtained_marks) : '',
      absent: saved?.is_absent ?? false,
    };
  };

  const setDraft = (studentId: string, next: Draft) => setDrafts((current) => ({ ...current, [studentId]: next }));

  const visibleRoster = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return roster;
    return roster.filter((student) => `${student.full_name} ${student.roll_number ?? ''} ${student.admission_number}`.toLowerCase().includes(term));
  }, [roster, query]);

  const enteredCount = roster.filter((student) => {
    const draft = draftFor(student);
    return draft.absent || draft.obtained.trim() !== '';
  }).length;

  const dirtyStudents = roster.filter((student) => {
    if (!drafts[student.id]) return false;
    const draft = draftFor(student);
    const saved = markByStudent.get(student.id);
    const savedValue = saved && !saved.is_absent && saved.obtained_marks !== null ? String(saved.obtained_marks) : '';
    const savedAbsent = saved?.is_absent ?? false;
    return draft.absent !== savedAbsent || draft.obtained.trim() !== savedValue;
  });

  const saveAll = async () => {
    if (!selectedSubject) { onToast('Choose an exam, class and subject first.'); return; }
    if (dirtyStudents.length === 0) { onToast('There are no new marks to save.'); return; }

    // Every figure is checked against the paper total before anything is written,
    // so a typo is caught here rather than rejected halfway through the save.
    const outOfRange = dirtyStudents.find((student) => {
      const draft = draftFor(student);
      if (draft.absent || draft.obtained.trim() === '') return false;
      const value = Number(draft.obtained);
      return !Number.isFinite(value) || value < 0 || value > selectedSubject.max_marks;
    });
    if (outOfRange) {
      setError(`Marks for ${outOfRange.full_name} must be between 0 and ${selectedSubject.max_marks}.`);
      return;
    }

    setSaving(true);
    setError(null);
    const { data } = await supabase.auth.getUser();
    const enteredBy = data.user?.id ?? null;

    for (const student of dirtyStudents) {
      const draft = draftFor(student);
      const { error: saveError } = await saveStudentMarks({
        examTypeId: examId,
        studentId: student.id,
        className,
        entries: [{ subject_id: selectedSubject.id, obtained: draft.obtained, absent: draft.absent }],
        enteredBy,
      });
      if (saveError) { setError(saveError); setSaving(false); return; }
    }

    await loadMarks(examId);
    setSaving(false);
    onToast(`Marks saved for ${dirtyStudents.length} ${dirtyStudents.length === 1 ? 'student' : 'students'}.`);
  };

  const clearThisSubject = async () => {
    if (!selectedSubject || !examId) return;
    const confirmed = window.confirm(`Clear every mark recorded for ${selectedSubject.subject_name} in ${className}?`);
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    const { error: clearError } = await clearSubjectMarks(examId, selectedSubject.id);
    if (clearError) { setError(clearError); setSaving(false); return; }
    await loadMarks(examId);
    setSaving(false);
    onToast(`Marks cleared for ${selectedSubject.subject_name}.`);
  };

  return (
    <div className="exam-marks">
      <div className="panel attendance-filters-panel">
        <div className="att-filters">
          <label className="control-field">Exam
            <select value={examId} onChange={(event) => setExamId(event.target.value)}>
              <option value="">Select an exam</option>
              {exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.name}</option>)}
            </select>
          </label>
          <label className="control-field">Class
            <select value={className} onChange={(event) => setClassName(event.target.value)}>
              <option value="">Select a class</option>
              {classes.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="control-field">Subject
            <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
              <option value="">Select a subject</option>
              {subjectsForClass.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.subject_name} ({subject.max_marks} marks)
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!selectedSubject ? (
        <div className="panel roster-panel">
          <div className="empty-state large">
            {exams.length === 0
              ? 'No exam is open for marks entry. Open one in Exams Setup, or set up a new exam.'
              : subjectsForClass.length === 0
                ? 'This exam has no subjects for the selected class yet. Add them in Exams Setup.'
                : 'Choose an exam, class and subject to start entering marks.'}
          </div>
        </div>
      ) : (
        <>
          <div className="panel exam-marks-head">
            <div className="exam-marks-copy">
              <span className="eyebrow">{exams.find((exam) => exam.id === examId)?.name}</span>
              <h2>{selectedSubject.subject_name} — {className}</h2>
              <p>
                Paper total {selectedSubject.max_marks} · pass mark {selectedSubject.pass_marks} · {enteredCount} of {roster.length} entered
              </p>
            </div>
            <div className="exam-marks-actions">
              <button type="button" className="secondary-button" onClick={() => void clearThisSubject()} disabled={saving}>
                <Eraser size={15} /> Clear this subject
              </button>
              <button type="button" className="primary-button" onClick={() => void saveAll()} disabled={saving || dirtyStudents.length === 0}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Save {dirtyStudents.length > 0 ? `${dirtyStudents.length} ` : ''}marks
              </button>
            </div>
          </div>

          <div className="panel roster-panel">
            <div className="table-toolbar">
              <div className="search-field">
                <Search size={18} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, roll number or admission number" />
              </div>
              <span className="result-count">{visibleRoster.length} students</span>
            </div>

            {error && <p className="dmc-warning"><AlertCircle size={13} /> {error}</p>}

            <div className="table-wrap">
              <table className="exam-marks-table">
                <thead>
                  <tr>
                    <th>Roll no.</th>
                    <th>Student</th>
                    <th>Marks obtained</th>
                    <th>Absent</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRoster.map((student) => {
                    const draft = draftFor(student);
                    const saved = markByStudent.get(student.id);
                    const numeric = draft.absent ? null : Number(draft.obtained);
                    const hasValue = draft.absent || draft.obtained.trim() !== '';
                    const inRange = !hasValue || draft.absent || (Number.isFinite(numeric) && (numeric as number) >= 0 && (numeric as number) <= selectedSubject.max_marks);
                    const percentage = !hasValue || numeric === null || Number.isNaN(numeric)
                      ? 0
                      : Math.round((numeric / selectedSubject.max_marks) * 1000) / 10;
                    const band = gradeFor(draft.absent ? 0 : percentage);
                    const failed = hasValue && (draft.absent || (numeric !== null && numeric < selectedSubject.pass_marks));
                    const changed = drafts[student.id] !== undefined;
                    return (
                      <tr key={student.id} className={changed ? 'exam-row-changed' : ''}>
                        <td className="muted-cell">{student.roll_number || '—'}</td>
                        <td>
                          <div className="table-student">
                            <div className="student-avatar">{student.full_name.split(' ').map((word) => word[0]).join('').slice(0, 2)}</div>
                            <span>
                              <strong>{student.full_name}</strong>
                              <small>{student.admission_number}</small>
                            </span>
                          </div>
                        </td>
                        <td>
                          <input
                            className={`exam-mark-input ${inRange ? '' : 'invalid'}`}
                            type="number"
                            min="0"
                            max={selectedSubject.max_marks}
                            step="0.5"
                            value={draft.absent ? '' : draft.obtained}
                            disabled={draft.absent}
                            placeholder={draft.absent ? 'Absent' : '—'}
                            onChange={(event) => setDraft(student.id, { obtained: event.target.value, absent: false })}
                          />
                        </td>
                        <td>
                          <label className="att-filter-check exam-absent-check">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-rose-500"
                              checked={draft.absent}
                              onChange={(event) => setDraft(student.id, { obtained: '', absent: event.target.checked })}
                            />
                            <span>Absent</span>
                          </label>
                        </td>
                        <td>
                          {!hasValue ? (
                            <span className="exam-result muted">{saved ? 'Saved' : 'Not entered'}</span>
                          ) : (
                            <span className={`exam-result ${failed ? 'fail' : 'pass'}`}>
                              {draft.absent ? 'Absent' : `${band.grade} · ${percentage}%`}
                              {changed && <small>unsaved</small>}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {visibleRoster.length === 0 && (
                <div className="empty-state large">
                  {roster.length === 0 ? `No active students are enrolled in ${className}.` : 'No student matches your search.'}
                </div>
              )}
            </div>
          </div>

          <p className="cal-hint">
            <Info size={14} />
            A paper left blank stays unmarked and is never counted as a zero, so a half-finished sheet cannot affect a result. Tick
            Absent only when the student did not sit the paper — that counts as zero and is shown on the report card.
          </p>
        </>
      )}
    </div>
  );
}
