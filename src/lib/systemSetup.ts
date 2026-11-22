import { supabase } from '@/lib/supabase';

// ============================================================================
// Types
// ============================================================================

export type AcademicSession = {
  id: string;
  session_name: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  created_at: string;
};

export type InstitutionProfile = {
  id: string;
  school_name: string;
  school_name_urdu: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  affiliation_no: string;
  registration_no: string;
  logo_url: string;
  principal_name: string;
  established_year: string;
  updated_at: string;
};

export type SystemSetting = {
  id: string;
  category: string;
  value: string;
  updated_at: string;
};

export type GradingScale = {
  id: string;
  grade: string;
  min_percent: number | string;
  max_percent: number | string;
  gpa: number | string;
  remarks: string;
  sort_order: number;
  created_at: string;
};

export type GradingDraft = Omit<GradingScale, 'id' | 'created_at' | 'sort_order'> & { sort_order: string | number };

// ============================================================================
// Helper
// ============================================================================

const genericError = (err: unknown, fallback: string) => {
  console.error(fallback, err);
  return fallback;
};

const numberOr = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// ============================================================================
// Academic Sessions
// ============================================================================

export async function fetchSessions(): Promise<{ sessions: AcademicSession[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('school_academic_sessions')
      .select('id, session_name, start_date, end_date, is_current, created_at')
      .order('start_date', { ascending: false });
    if (error) return { sessions: [], error: error.message };
    return { sessions: (data ?? []) as AcademicSession[], error: null };
  } catch (err) {
    return { sessions: [], error: genericError(err, 'Sessions could not be loaded.') };
  }
}

export async function saveSession(
  draft: { session_name: string; start_date: string | null; end_date: string | null; is_current: boolean },
): Promise<string | null> {
  try {
    const payload = {
      session_name: draft.session_name.trim(),
      start_date: draft.start_date || null,
      end_date: draft.end_date || null,
      is_current: draft.is_current,
    };
    if (!payload.session_name) return 'Enter a session name first.';
    const { error } = await supabase.from('school_academic_sessions').insert(payload);
    return error ? error.message : null;
  } catch (err) {
    return genericError(err, 'The session could not be saved.');
  }
}

export async function setCurrentSession(id: string, isCurrent: boolean): Promise<string | null> {
  try {
    const { error } = await supabase.from('school_academic_sessions').update({ is_current: isCurrent }).eq('id', id);
    return error ? error.message : null;
  } catch (err) {
    return genericError(err, 'The current session could not be updated.');
  }
}

export async function deleteSession(id: string): Promise<string | null> {
  try {
    const { error } = await supabase.from('school_academic_sessions').delete().eq('id', id);
    return error ? error.message : null;
  } catch (err) {
    return genericError(err, 'That session could not be removed.');
  }
}

// ============================================================================
// Institution Profile
// ============================================================================

export async function fetchInstitutionProfile(): Promise<{ profile: InstitutionProfile | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('school_institution_profile')
      .select('id, school_name, school_name_urdu, address, city, phone, email, website, affiliation_no, registration_no, logo_url, principal_name, established_year, updated_at')
      .eq('id', 'default')
      .maybeSingle();
    if (error) return { profile: null, error: error.message };
    return { profile: (data ?? null) as InstitutionProfile | null, error: null };
  } catch (err) {
    return { profile: null, error: genericError(err, 'The institution profile could not be loaded.') };
  }
}

export async function saveInstitutionProfile(draft: Omit<InstitutionProfile, 'id' | 'updated_at'>): Promise<string | null> {
  try {
    const { error } = await supabase
      .from('school_institution_profile')
      .upsert({ id: 'default', ...draft, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    return error ? error.message : null;
  } catch (err) {
    return genericError(err, 'The institution profile could not be saved.');
  }
}

// ============================================================================
// Default Values (system settings)
// ============================================================================

export async function fetchSystemSettings(): Promise<{ settings: SystemSetting[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('school_system_settings')
      .select('id, category, value, updated_at')
      .order('category', { ascending: true })
      .order('id', { ascending: true });
    if (error) return { settings: [], error: error.message };
    return { settings: (data ?? []) as SystemSetting[], error: null };
  } catch (err) {
    return { settings: [], error: genericError(err, 'Default values could not be loaded.') };
  }
}

export async function saveSystemSetting(id: string, value: string): Promise<string | null> {
  try {
    const { error } = await supabase
      .from('school_system_settings')
      .upsert({ id, value, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    return error ? error.message : null;
  } catch (err) {
    return genericError(err, 'That value could not be saved.');
  }
}

// ============================================================================
// Grading System
// ============================================================================

export async function fetchGradingScales(): Promise<{ scales: GradingScale[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('school_grading_scales')
      .select('id, grade, min_percent, max_percent, gpa, remarks, sort_order, created_at')
      .order('sort_order', { ascending: true });
    if (error) return { scales: [], error: error.message };
    return { scales: (data ?? []) as GradingScale[], error: null };
  } catch (err) {
    return { scales: [], error: genericError(err, 'The grading system could not be loaded.') };
  }
}

export async function saveGradingScale(draft: GradingDraft): Promise<string | null> {
  try {
    const payload = {
      grade: draft.grade.trim(),
      min_percent: numberOr(draft.min_percent),
      max_percent: numberOr(draft.max_percent),
      gpa: numberOr(draft.gpa),
      remarks: draft.remarks.trim(),
      sort_order: numberOr(draft.sort_order, 0),
    };
    if (!payload.grade) return 'Enter a grade letter first.';
    const { error } = await supabase.from('school_grading_scales').insert(payload);
    return error ? error.message : null;
  } catch (err) {
    return genericError(err, 'The grade could not be saved.');
  }
}

export async function deleteGradingScale(id: string): Promise<string | null> {
  try {
    const { error } = await supabase.from('school_grading_scales').delete().eq('id', id);
    return error ? error.message : null;
  } catch (err) {
    return genericError(err, 'That grade could not be removed.');
  }
}

// ============================================================================
// Backup metadata (single summary row)
// ============================================================================

export type BackupMeta = {
  tableName: string;
  count: number;
};

// Returns row counts for the system's main data tables so the Backup tab can
// show how much data would be captured.
export async function fetchBackupStats(): Promise<{ stats: BackupMeta[]; error: string | null }> {
  const tables = [
    { tableName: 'Students', ref: 'school_students' },
    { tableName: 'Fee Payments', ref: 'school_fee_payments' },
    { tableName: 'Fee Challans', ref: 'school_fee_challans' },
    { tableName: 'Attendance', ref: 'school_attendance' },
    { tableName: 'Examination Subjects', ref: 'school_exam_subjects' },
    { tableName: 'Exam Marks', ref: 'school_exam_marks' },
    { tableName: 'Staff Attendance', ref: 'school_staff_attendance' },
    { tableName: 'Finance Expenses', ref: 'school_expenses' },
    { tableName: 'Finance Other Income', ref: 'school_other_income' },
    { tableName: 'Portal Notifications', ref: 'school_portal_notifications' },
  ];
  try {
    const results = await Promise.all(
      tables.map(async (t) => {
        const { count, error } = await supabase.from(t.ref).select('id', { count: 'exact', head: true });
        return { tableName: t.tableName, count: error ? 0 : (count ?? 0) };
      }),
    );
    return { stats: results, error: null };
  } catch (err) {
    return { stats: [], error: genericError(err, 'Backup summary could not be loaded.') };
  }
}
