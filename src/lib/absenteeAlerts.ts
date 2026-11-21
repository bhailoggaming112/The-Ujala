import { supabase } from '@/lib/supabase';
import type { AbsenteeQueueEntry, AbsenteeTemplate, PortalNotification } from '@/lib/schoolTypes';

const QUEUE_COLUMNS =
  'id, student_id, student_name, class_name, section_name, parent_phone, attendance_date, language, message_body, status, sent_at, created_at';

export type NewAbsenteeEntry = {
  student_id: string;
  student_name: string;
  class_name: string | null;
  section_name: string | null;
  parent_phone: string | null;
  attendance_date: string;
  language: AbsenteeTemplate['language'];
  message_body: string;
};

export async function fetchAbsenteeQueue(forDate: string): Promise<{ entries: AbsenteeQueueEntry[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('school_absentee_queue')
      .select(QUEUE_COLUMNS)
      .eq('attendance_date', forDate)
      .order('student_name');
    if (error) return { entries: [], error: error.message };
    return { entries: (data ?? []) as AbsenteeQueueEntry[], error: null };
  } catch {
    return { entries: [], error: 'The absentee list could not be loaded.' };
  }
}

// Keeps the alert list in step with the register: new absentees are added, students
// who are no longer absent are dropped, and the wording of anything still waiting is
// refreshed. Already-sent rows are left untouched so the sent history stays accurate.
export async function syncAbsentees(
  entries: NewAbsenteeEntry[],
  absentStudentIds: string[],
  forDate: string,
): Promise<{ entries: AbsenteeQueueEntry[]; added: number; removed: number; error: string | null }> {
  const existing = await fetchAbsenteeQueue(forDate);
  if (existing.error) return { entries: [], added: 0, removed: 0, error: existing.error };

  const byStudent = new Map(existing.entries.map((entry) => [entry.student_id, entry]));
  const toInsert = entries.filter((entry) => !byStudent.has(entry.student_id));
  // Only rows still waiting are dropped: a sent row is history and stays put.
  const toDelete = existing.entries
    .filter((entry) => entry.status === 'queued' && !absentStudentIds.includes(entry.student_id))
    .map((entry) => entry.id);
  const toReword = entries.filter((entry) => {
    const saved = byStudent.get(entry.student_id);
    return saved?.status === 'queued'
      && (saved.message_body !== entry.message_body || saved.language !== entry.language);
  });

  try {
    if (toInsert.length > 0) {
      const { error } = await supabase.from('school_absentee_queue').insert(toInsert);
      if (error) return { entries: existing.entries, added: 0, removed: 0, error: error.message };
    }
    if (toDelete.length > 0) {
      const { error } = await supabase.from('school_absentee_queue').delete().in('id', toDelete);
      if (error) return { entries: existing.entries, added: toInsert.length, removed: 0, error: error.message };
    }
    if (toReword.length > 0) {
      const results = await Promise.all(toReword.map((entry) => {
        const saved = byStudent.get(entry.student_id);
        return supabase
          .from('school_absentee_queue')
          .update({ language: entry.language, message_body: entry.message_body })
          .eq('id', saved?.id ?? '');
      }));
      const failed = results.find((result) => result.error);
      if (failed?.error) return { entries: existing.entries, added: toInsert.length, removed: toDelete.length, error: failed.error.message };
    }
  } catch {
    return { entries: existing.entries, added: 0, removed: 0, error: 'The absentee list could not be updated.' };
  }

  const reloaded = await fetchAbsenteeQueue(forDate);
  if (reloaded.error) return { entries: existing.entries, added: toInsert.length, removed: toDelete.length, error: reloaded.error };
  return { entries: reloaded.entries, added: toInsert.length, removed: toDelete.length, error: null };
}

export async function markAbsenteesSent(ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null;
  try {
    const { error } = await supabase
      .from('school_absentee_queue')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .in('id', ids);
    return error ? error.message : null;
  } catch {
    return 'The sent status could not be recorded.';
  }
}

export async function removeAbsentees(ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null;
  try {
    const { error } = await supabase.from('school_absentee_queue').delete().in('id', ids);
    return error ? error.message : null;
  } catch {
    return 'Those rows could not be removed.';
  }
}

export async function fetchAbsenteeTemplates(): Promise<{ templates: AbsenteeTemplate[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('school_notice_templates')
      .select('id, notice_type, language, template_text, updated_at')
      .eq('notice_type', 'absentee_alert');
    if (error) return { templates: [], error: error.message };
    return { templates: (data ?? []) as AbsenteeTemplate[], error: null };
  } catch {
    return { templates: [], error: 'The saved absentee wording could not be loaded.' };
  }
}

export async function saveAbsenteeTemplate(
  language: AbsenteeTemplate['language'],
  templateText: string,
): Promise<string | null> {
  try {
    const { error } = await supabase
      .from('school_notice_templates')
      .upsert(
        { notice_type: 'absentee_alert', language, template_text: templateText, updated_at: new Date().toISOString() },
        { onConflict: 'notice_type,language' },
      );
    return error ? error.message : null;
  } catch {
    return 'The absentee wording could not be saved.';
  }
}

// The chosen language is one setting shared by the whole school, so it is stored
// server-side rather than in the browser.
export async function fetchAbsenteeLanguage(): Promise<AbsenteeTemplate['language']> {
  try {
    const { data } = await supabase
      .from('school_absentee_settings')
      .select('language')
      .eq('id', 'default')
      .maybeSingle();
    const stored = (data as { language: string | null } | null)?.language;
    return stored === 'Urdu' ? 'Urdu' : 'English';
  } catch {
    return 'English';
  }
}

export async function saveAbsenteeLanguage(language: AbsenteeTemplate['language']): Promise<string | null> {
  try {
    const { error } = await supabase
      .from('school_absentee_settings')
      .upsert({ id: 'default', language, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    return error ? error.message : null;
  } catch {
    return 'The chosen language could not be saved.';
  }
}

export async function fetchPortalNotifications(studentIds: string[]): Promise<{ notifications: PortalNotification[]; error: string | null }> {
  if (studentIds.length === 0) return { notifications: [], error: null };
  try {
    const { data, error } = await supabase
      .from('school_portal_notifications')
      .select('id, student_id, notification_type, title, body, attendance_date, created_at')
      .in('student_id', studentIds)
      .order('created_at', { ascending: false })
      .limit(40);
    if (error) return { notifications: [], error: error.message };
    return { notifications: (data ?? []) as PortalNotification[], error: null };
  } catch {
    return { notifications: [], error: 'Your notices could not be loaded.' };
  }
}
