import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/lib/auth';

export type PortalCredentials = {
  username: string;
  password: string;
  fullName: string;
  role: UserRole;
};

// Unambiguous alphabet: no 0/O/1/l/I, so passwords survive being read aloud or written down.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generatePassword(length = 8): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let password = '';
  for (let i = 0; i < length; i += 1) {
    password += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  }
  return password;
}

// Mobile numbers arrive with spaces, dashes and country codes; usernames keep only digits.
export function usernameFromMobile(mobile: string): string {
  return mobile.replace(/\D/g, '');
}

export function usernameFromAdmissionNumber(admissionNumber: string): string {
  return admissionNumber.trim().toLowerCase();
}

const FRIENDLY_ERRORS: Record<string, string> = {
  'Username already taken': 'That username is already in use. Please choose another.',
  'This student already has a portal login': 'This student already has a portal login.',
  'That student record no longer exists': 'That student record no longer exists.',
  'A student account must be linked to a student record': 'This student could not be linked to a portal login.',
  'Password must be at least 6 characters': 'The password must be at least 6 characters.',
  'Username must be at least 3 characters': 'The username must be at least 3 characters.',
  'A full name is required': 'A full name is required.',
  'That account type is not allowed': 'That account type is not allowed.',
  'That account no longer exists': 'That account no longer exists.',
  'An administrator password can only be changed by that administrator': 'An administrator password can only be changed by that administrator.',
};

function friendly(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  return FRIENDLY_ERRORS[message] ?? message;
}

export async function provisionPortalAccount(params: {
  username: string;
  password: string;
  fullName: string;
  role: UserRole;
  studentId?: string | null;
  mobile?: string | null;
}): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('admin_provision_account', {
      p_username: params.username,
      p_password: params.password,
      p_full_name: params.fullName,
      p_role: params.role,
      p_student_id: params.studentId ?? null,
      p_mobile: params.mobile ?? null,
    });
    if (error) return { error: friendly(error.message, 'The account could not be created.') };
    return { error: null };
  } catch {
    return { error: 'Could not reach the school server. Check your connection and try again.' };
  }
}

export async function setAccountPassword(userId: string, password: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('admin_set_password', { p_user_id: userId, p_password: password });
    if (error) return { error: friendly(error.message, 'The password could not be changed.') };
    return { error: null };
  } catch {
    return { error: 'Could not reach the school server. Check your connection and try again.' };
  }
}

export async function setAccountUsername(userId: string, username: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('admin_reset_username', {
      p_user_id: userId,
      p_username: username.trim().toLowerCase(),
    });
    if (error) return { error: friendly(error.message, 'The username could not be changed.') };
    return { error: null };
  } catch {
    return { error: 'Could not reach the school server. Check your connection and try again.' };
  }
}

export async function changeOwnPassword(password: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: error.message };
    return { error: null };
  } catch {
    return { error: 'Could not reach the school server. Check your connection and try again.' };
  }
}

export async function requestPasswordReset(username: string, note: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('school_password_requests')
      .insert({ username: username.trim().toLowerCase(), note: note.trim() || null });
    if (error) return { error: 'Your request could not be sent. Please contact the school office.' };
    return { error: null };
  } catch {
    return { error: 'Could not reach the school server. Check your connection and try again.' };
  }
}

export type PasswordRequest = {
  id: string;
  username: string;
  note: string | null;
  status: 'pending' | 'resolved';
  created_at: string;
  resolved_at: string | null;
};

export async function fetchPasswordRequests(): Promise<PasswordRequest[]> {
  try {
    const { data } = await supabase
      .from('school_password_requests')
      .select('id, username, note, status, created_at, resolved_at')
      .order('created_at', { ascending: false })
      .limit(50);
    return (data ?? []) as PasswordRequest[];
  } catch {
    return [];
  }
}

export async function resolvePasswordRequest(id: string, userId: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('school_password_requests')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: userId })
      .eq('id', id);
    if (error) return { error: 'The request could not be updated.' };
    return { error: null };
  } catch {
    return { error: 'Could not reach the school server. Check your connection and try again.' };
  }
}
