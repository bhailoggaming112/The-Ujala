import { supabase } from '@/lib/supabase';
import type { Student } from '@/lib/schoolTypes';

export type ExamType = {
  id: string;
  name: string;
  period_start: string | null;
  period_end: string | null;
  sort_order: number;
  is_active: boolean;
};

export type ExamSubject = {
  id: string;
  exam_type_id: string;
  class_name: string;
  subject_name: string;
  max_marks: number;
  pass_marks: number;
};

export type ExamMark = {
  id: string;
  exam_type_id: string;
  student_id: string;
  subject_id: string;
  class_name: string;
  obtained_marks: number | null;
  is_absent: boolean;
};

export type ExamTypeDraft = {
  name: string;
  period_start: string;
  period_end: string;
  is_active: boolean;
};

export type ExamSubjectDraft = {
  exam_type_id: string;
  class_name: string;
  subject_name: string;
  max_marks: string;
  pass_marks: string;
};

export type MarkEntry = {
  subject_id: string;
  obtained: string;
  absent: boolean;
};

const numberOr = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// numeric columns can arrive as text, so every figure is normalised on the way in.
const normaliseMark = (row: Record<string, unknown>): ExamMark => ({
  id: String(row.id),
  exam_type_id: String(row.exam_type_id),
  student_id: String(row.student_id),
  subject_id: String(row.subject_id),
  class_name: String(row.class_name ?? ''),
  obtained_marks: row.obtained_marks === null || row.obtained_marks === undefined ? null : numberOr(row.obtained_marks),
  is_absent: Boolean(row.is_absent),
});

const normaliseSubject = (row: Record<string, unknown>): ExamSubject => ({
  id: String(row.id),
  exam_type_id: String(row.exam_type_id),
  class_name: String(row.class_name ?? ''),
  subject_name: String(row.subject_name ?? ''),
  max_marks: numberOr(row.max_marks, 100),
  pass_marks: numberOr(row.pass_marks, 40),
});

export async function fetchExamTypes(): Promise<{ exams: ExamType[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('school_exam_types')
      .select('id, name, period_start, period_end, sort_order, is_active')
      .order('sort_order')
      .order('name');
    if (error) return { exams: [], error: 'The exam list could not be loaded.' };
    return {
      exams: (data ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        period_start: row.period_start ?? null,
        period_end: row.period_end ?? null,
        sort_order: numberOr(row.sort_order),
        is_active: row.is_active !== false,
      })),
      error: null,
    };
  } catch {
    return { exams: [], error: 'Could not reach the school server. Check your connection and try again.' };
  }
}

export async function saveExamType(id: string | null, draft: ExamTypeDraft): Promise<{ error: string | null }> {
  const name = draft.name.trim();
  if (name.length < 2) return { error: 'Please give the exam a name of at least 2 characters.' };
  if (draft.period_start && draft.period_end && draft.period_end < draft.period_start) {
    return { error: 'The exam end date cannot be before its start date.' };
  }
  try {
    const payload = {
      name,
      period_start: draft.period_start || null,
      period_end: draft.period_end || null,
      is_active: draft.is_active,
      updated_at: new Date().toISOString(),
    };
    const { error } = id
      ? await supabase.from('school_exam_types').update(payload).eq('id', id)
      : await supabase.from('school_exam_types').insert(payload);
    if (error) {
      return {
        error: error.code === '23505'
          ? 'An exam with this name already exists.'
          : 'The exam could not be saved. Please try again.',
      };
    }
    return { error: null };
  } catch {
    return { error: 'Could not reach the school server. Check your connection and try again.' };
  }
}

export async function deleteExamType(id: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.from('school_exam_types').delete().eq('id', id);
    if (error) return { error: 'The exam could not be removed. Please try again.' };
    return { error: null };
  } catch {
    return { error: 'Could not reach the school server. Check your connection and try again.' };
  }
}

export async function fetchExamSubjects(examTypeId: string): Promise<{ subjects: ExamSubject[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('school_exam_subjects')
      .select('id, exam_type_id, class_name, subject_name, max_marks, pass_marks')
      .eq('exam_type_id', examTypeId)
      .order('class_name')
      .order('subject_name');
    if (error) return { subjects: [], error: 'The subject list for this exam could not be loaded.' };
    return { subjects: (data ?? []).map((row) => normaliseSubject(row as Record<string, unknown>)), error: null };
  } catch {
    return { subjects: [], error: 'Could not reach the school server. Check your connection and try again.' };
  }
}

export async function saveExamSubject(id: string | null, draft: ExamSubjectDraft): Promise<{ error: string | null }> {
  const subject = draft.subject_name.trim();
  const className = draft.class_name.trim();
  if (!className) return { error: 'Please choose the class this subject belongs to.' };
  if (!subject) return { error: 'Please enter the subject name.' };

  const max = Number(draft.max_marks);
  const pass = Number(draft.pass_marks);
  if (!Number.isFinite(max) || max <= 0) return { error: 'Total marks must be a number greater than zero.' };
  if (!Number.isFinite(pass) || pass < 0) return { error: 'Pass marks must be zero or more.' };
  if (pass > max) return { error: 'Pass marks cannot be more than the total marks.' };

  try {
    const payload = {
      exam_type_id: draft.exam_type_id,
      class_name: className,
      subject_name: subject,
      max_marks: max,
      pass_marks: pass,
      updated_at: new Date().toISOString(),
    };
    const { error } = id
      ? await supabase.from('school_exam_subjects').update(payload).eq('id', id)
      : await supabase.from('school_exam_subjects').insert(payload);
    if (error) {
      return {
        error: error.code === '23505'
          ? 'That subject is already listed for this class and exam.'
          : 'The subject could not be saved. Please try again.',
      };
    }
    return { error: null };
  } catch {
    return { error: 'Could not reach the school server. Check your connection and try again.' };
  }
}

export async function deleteExamSubject(id: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.from('school_exam_subjects').delete().eq('id', id);
    if (error) return { error: 'The subject could not be removed. Please try again.' };
    return { error: null };
  } catch {
    return { error: 'Could not reach the school server. Check your connection and try again.' };
  }
}

export async function fetchExamMarks(examTypeId: string): Promise<{ marks: ExamMark[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('school_exam_marks')
      .select('id, exam_type_id, student_id, subject_id, class_name, obtained_marks, is_absent')
      .eq('exam_type_id', examTypeId);
    if (error) return { marks: [], error: 'The marks for this exam could not be loaded.' };
    return { marks: (data ?? []).map((row) => normaliseMark(row as Record<string, unknown>)), error: null };
  } catch {
    return { marks: [], error: 'Could not reach the school server. Check your connection and try again.' };
  }
}

// Only the papers that were actually filled in are written. A blank cell is left
// alone so an untouched subject stays unmarked instead of being stored as a zero,
// which would then be read as a failed paper on the report card.
export async function saveStudentMarks(params: {
  examTypeId: string;
  studentId: string;
  className: string;
  entries: MarkEntry[];
  enteredBy: string | null;
}): Promise<{ error: string | null }> {
  const rows = params.entries
    .filter((entry) => entry.absent || entry.obtained.trim() !== '')
    .map((entry) => ({
      exam_type_id: params.examTypeId,
      student_id: params.studentId,
      subject_id: entry.subject_id,
      class_name: params.className,
      obtained_marks: entry.absent ? null : Number(entry.obtained),
      is_absent: entry.absent,
      entered_by: params.enteredBy,
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return { error: 'Enter at least one mark before saving.' };

  const invalid = rows.find((row) => !row.is_absent && (!Number.isFinite(row.obtained_marks) || row.obtained_marks === null || row.obtained_marks < 0));
  if (invalid) return { error: 'Marks must be a number of zero or more.' };

  try {
    const { error } = await supabase
      .from('school_exam_marks')
      .upsert(rows, { onConflict: 'student_id,subject_id' });
    if (error) {
      return {
        error: error.code === '23514'
          ? 'One of the marks is higher than that subject’s total. Please check the figures.'
          : 'The marks could not be saved. Please try again.',
      };
    }
    return { error: null };
  } catch {
    return { error: 'Could not reach the school server. Check your connection and try again.' };
  }
}

export async function clearStudentMarks(studentId: string, subjectIds: string[]): Promise<{ error: string | null }> {
  if (subjectIds.length === 0) return { error: null };
  try {
    const { error } = await supabase
      .from('school_exam_marks')
      .delete()
      .eq('student_id', studentId)
      .in('subject_id', subjectIds);
    if (error) return { error: 'The marks could not be cleared. Please try again.' };
    return { error: null };
  } catch {
    return { error: 'Could not reach the school server. Check your connection and try again.' };
  }
}

// Clears every student's mark for one paper, used when a whole column was entered
// against the wrong subject and needs to be redone.
export async function clearSubjectMarks(examTypeId: string, subjectId: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('school_exam_marks')
      .delete()
      .eq('exam_type_id', examTypeId)
      .eq('subject_id', subjectId);
    if (error) return { error: 'The marks could not be cleared. Please try again.' };
    return { error: null };
  } catch {
    return { error: 'Could not reach the school server. Check your connection and try again.' };
  }
}

// ---------------------------------------------------------------------------
// Results — worked out from the marks, never stored, so a corrected mark shows
// up everywhere at once.
// ---------------------------------------------------------------------------

export type GradeBand = { grade: string; tone: string };

const GRADE_BANDS: { min: number; grade: string; tone: string }[] = [
  { min: 80, grade: 'A+', tone: 'distinction' },
  { min: 70, grade: 'A', tone: 'excellent' },
  { min: 60, grade: 'B', tone: 'good' },
  { min: 50, grade: 'C', tone: 'fair' },
  { min: 40, grade: 'D', tone: 'pass' },
  { min: 0, grade: 'F', tone: 'fail' },
];

export function gradeFor(percentage: number): GradeBand {
  const band = GRADE_BANDS.find((item) => percentage >= item.min) ?? GRADE_BANDS[GRADE_BANDS.length - 1];
  return { grade: band.grade, tone: band.tone };
}

export type SubjectResult = {
  subject: ExamSubject;
  obtained: number | null;
  isAbsent: boolean;
  percentage: number;
  grade: string;
  failed: boolean;
  entered: boolean;
};

export type StudentResult = {
  student: Student;
  subjects: SubjectResult[];
  totalMax: number;
  totalObtained: number;
  percentage: number;
  grade: string;
  gradeTone: string;
  failedSubjects: number;
  absentSubjects: number;
  enteredCount: number;
  complete: boolean;
  status: 'pass' | 'fail' | 'incomplete';
  position: number | null;
};

function subjectResults(subjects: ExamSubject[], marks: Map<string, ExamMark>): SubjectResult[] {
  return subjects.map((subject) => {
    const mark = marks.get(subject.id);
    const entered = Boolean(mark);
    const isAbsent = mark?.is_absent ?? false;
    const obtained = mark && !mark.is_absent ? mark.obtained_marks : null;
    // An absent paper counts as zero towards the total, so the result still adds up.
    const scored = isAbsent ? 0 : obtained;
    const percentage = scored === null || subject.max_marks <= 0 ? 0 : Math.round((scored / subject.max_marks) * 1000) / 10;
    return {
      subject,
      obtained,
      isAbsent,
      percentage,
      grade: gradeFor(percentage).grade,
      failed: entered && scored !== null && scored < subject.pass_marks,
      entered,
    };
  });
}

// One result per student for a class, with the class position worked out from the
// same figures that are printed. Only students who sat every paper are ranked, so
// a half-finished sheet never takes a position away from a finished one.
export function buildClassResults(students: Student[], subjects: ExamSubject[], marks: ExamMark[]): StudentResult[] {
  const byStudent = new Map<string, Map<string, ExamMark>>();
  for (const mark of marks) {
    const forStudent = byStudent.get(mark.student_id);
    if (forStudent) forStudent.set(mark.subject_id, mark);
    else byStudent.set(mark.student_id, new Map([[mark.subject_id, mark]]));
  }

  const built = students.map((student) => {
    const rows = subjectResults(subjects, byStudent.get(student.id) ?? new Map());
    const totalMax = rows.reduce((sum, row) => sum + row.subject.max_marks, 0);
    const totalObtained = rows.reduce((sum, row) => {
      if (!row.entered) return sum;
      return sum + (row.isAbsent ? 0 : row.obtained ?? 0);
    }, 0);
    const enteredCount = rows.filter((row) => row.entered).length;
    const failedSubjects = rows.filter((row) => row.failed).length;
    const absentSubjects = rows.filter((row) => row.isAbsent).length;
    const percentage = totalMax > 0 ? Math.round((totalObtained / totalMax) * 1000) / 10 : 0;
    const complete = subjects.length > 0 && enteredCount === subjects.length;
    const band = gradeFor(percentage);
    return {
      student,
      subjects: rows,
      totalMax,
      totalObtained,
      percentage,
      grade: band.grade,
      gradeTone: band.tone,
      failedSubjects,
      absentSubjects,
      enteredCount,
      complete,
      status: (complete ? (failedSubjects > 0 ? 'fail' : 'pass') : 'incomplete') as StudentResult['status'],
      position: null as number | null,
    };
  });

  const ranked = built
    .filter((row) => row.complete)
    .sort((a, b) => b.percentage - a.percentage);
  let lastPercentage: number | null = null;
  let lastPosition = 0;
  ranked.forEach((row, index) => {
    const position = lastPercentage !== null && row.percentage === lastPercentage ? lastPosition : index + 1;
    row.position = position;
    lastPercentage = row.percentage;
    lastPosition = position;
  });

  return built;
}

export const resultStatusLabel = (status: StudentResult['status']) =>
  status === 'pass' ? 'Passed' : status === 'fail' ? 'Needs improvement' : 'Marks pending';
