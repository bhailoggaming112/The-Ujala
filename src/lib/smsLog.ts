import { supabase } from '@/lib/supabase';
import type { SmsLogEntry, SmsLogStatus } from '@/lib/schoolTypes';

// The caller supplies what the alert is about; the status is always recorded as
// pending first so a send that fails is still visible in the report.
export type NewSmsLogEntry = {
  student_id: string;
  student_name: string;
  class_name: string | null;
  section_name: string | null;
  parent_phone: string | null;
  message_type: string;
  message_body: string;
  attendance_date: string;
};

const SMS_LOG_COLUMNS =
  'id, student_id, student_name, class_name, section_name, parent_phone, message_type, message_body, status, provider_response, attendance_date, sent_at, created_at';

export type SmsLogFilters = { date: string; status: SmsLogStatus | '' };

export async function fetchSmsLog(filters: SmsLogFilters): Promise<{ entries: SmsLogEntry[]; error: string | null }> {
  try {
    let query = supabase.from('school_sms_log').select(SMS_LOG_COLUMNS).order('created_at', { ascending: false }).limit(500);
    if (filters.date) query = query.eq('attendance_date', filters.date);
    if (filters.status) query = query.eq('status', filters.status);
    const { data, error } = await query;
    if (error) return { entries: [], error: error.message };
    return { entries: (data ?? []) as SmsLogEntry[], error: null };
  } catch {
    return { entries: [], error: 'The SMS report could not be loaded. Check your connection and try again.' };
  }
}

// Alerts are written to the log the moment they are queued, so a send that is
// interrupted still leaves a visible record rather than disappearing silently.
export async function queueSmsMessages(entries: NewSmsLogEntry[]): Promise<{ ids: string[]; error: string | null }> {
  if (entries.length === 0) return { ids: [], error: null };
  try {
    const { data, error } = await supabase
      .from('school_sms_log')
      .insert(entries.map((entry) => ({ ...entry, status: 'pending', sent_at: null })))
      .select('id');
    if (error) return { ids: [], error: error.message };
    return { ids: ((data ?? []) as { id: string }[]).map((row) => row.id), error: null };
  } catch {
    return { ids: [], error: 'The alerts could not be logged. Check your connection and try again.' };
  }
}

export async function updateSmsStatus(ids: string[], status: SmsLogStatus, providerResponse: string | null = null): Promise<string | null> {
  if (ids.length === 0) return null;
  try {
    const { error } = await supabase
      .from('school_sms_log')
      .update({ status, provider_response: providerResponse, sent_at: status === 'pending' ? null : new Date().toISOString() })
      .in('id', ids);
    return error ? error.message : null;
  } catch {
    return 'The alert status could not be updated.';
  }
}
