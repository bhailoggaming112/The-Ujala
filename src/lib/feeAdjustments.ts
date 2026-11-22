import { supabase } from '@/lib/supabase';
import type { Student } from '@/lib/schoolTypes';

// The kinds of adjustment the office can post against a student's fee account. A
// positive amount increases what the family owes; a negative amount reduces it.
export const ADJUSTMENT_TYPES = [
  { value: 'concession', label: 'Concession', hint: 'A standing reduction, e.g. staff or need-based', direction: 'reduce' },
  { value: 'discount', label: 'Discount', hint: 'A one-off reduction on a bill', direction: 'reduce' },
  { value: 'scholarship', label: 'Scholarship', hint: 'Awarded amount taken off the dues', direction: 'reduce' },
  { value: 'write_off', label: 'Write-off', hint: 'Dues the school has decided not to collect', direction: 'reduce' },
  { value: 'correction', label: 'Correction', hint: 'Fix a figure posted in error, up or down', direction: 'either' },
] as const;

export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number]['value'];

export type FeeAdjustment = {
  id: string;
  student_id: string;
  adjustment_type: AdjustmentType;
  amount: number;
  reason: string | null;
  effective_date: string;
  created_at: string;
  created_by: string | null;
  student_name?: string;
  class_name?: string | null;
  section_name?: string | null;
  admission_number?: string | null;
};

const ADJUSTMENT_COLUMNS = 'id, student_id, adjustment_type, amount, reason, effective_date, created_at, created_by';

export const adjustmentLabel = (type: string) =>
  ADJUSTMENT_TYPES.find((entry) => entry.value === type)?.label ?? type;

// Every adjustment posted against one student, newest first, for their ledger.
export async function fetchAdjustmentsForStudent(studentId: string): Promise<{ adjustments: FeeAdjustment[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('school_fee_adjustments')
      .select(ADJUSTMENT_COLUMNS)
      .eq('student_id', studentId)
      .order('effective_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) return { adjustments: [], error: 'The fee adjustments could not be loaded.' };
    return { adjustments: (data ?? []) as FeeAdjustment[], error: null };
  } catch {
    return { adjustments: [], error: 'The fee adjustments could not be loaded. Check your connection and try again.' };
  }
}

// All adjustments posted on a date range, joined to the roster so each row carries a
// student name. Used by the Fee Adjustment tab's activity list.
export async function fetchRecentAdjustments(limit = 200): Promise<{ adjustments: FeeAdjustment[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('school_fee_adjustments')
      .select(ADJUSTMENT_COLUMNS)
      .order('effective_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return { adjustments: [], error: 'The fee adjustments could not be loaded.' };
    return { adjustments: (data ?? []) as FeeAdjustment[], error: null };
  } catch {
    return { adjustments: [], error: 'The fee adjustments could not be loaded. Check your connection and try again.' };
  }
}

// Posts an adjustment and returns the student's recomputed balance. The database
// checks the caller is fee staff and does the write inside one transaction.
export async function createFeeAdjustment(input: {
  studentId: string;
  adjustmentType: AdjustmentType;
  amount: number;
  reason: string;
  effectiveDate: string;
}): Promise<{ id: string | null; error: string | null }> {
  if (!input.studentId) return { id: null, error: 'Choose a student first.' };
  if (!Number.isFinite(input.amount) || input.amount === 0) return { id: null, error: 'Enter an adjustment amount other than zero.' };
  if (Math.abs(input.amount) > 10000000) return { id: null, error: 'That adjustment amount is too large.' };
  try {
    const { data, error } = await supabase.rpc('create_fee_adjustment', {
      p_student_id: input.studentId,
      p_adjustment_type: input.adjustmentType,
      p_amount: input.amount,
      p_reason: input.reason.trim() || null,
      p_effective_date: input.effectiveDate || null,
    });
    if (error) {
      if (error.code === 'P0001' && error.message) return { id: null, error: error.message };
      return { id: null, error: 'The adjustment could not be saved. Please try again.' };
    }
    return { id: (data as string | null) ?? null, error: null };
  } catch {
    return { id: null, error: 'The adjustment could not be saved. Check your connection and try again.' };
  }
}

export async function deleteFeeAdjustment(id: string): Promise<string | null> {
  try {
    const { error } = await supabase.rpc('delete_fee_adjustment', { p_id: id });
    return error ? 'The adjustment could not be removed.' : null;
  } catch {
    return 'The adjustment could not be removed. Check your connection and try again.';
  }
}

// Sets a student's carried-forward opening balance and returns nothing; the caller
// reloads the roster to pick up the recomputed fee_balance.
export async function setFeeOpeningBalance(input: {
  studentId: string;
  amount: number;
  asOf: string;
}): Promise<string | null> {
  if (!input.studentId) return 'Choose a student first.';
  if (!Number.isFinite(input.amount) || input.amount < 0 || input.amount > 10000000) {
    return 'Enter a valid opening balance.';
  }
  try {
    const { error } = await supabase.rpc('set_fee_opening_balance', {
      p_student_id: input.studentId,
      p_amount: input.amount,
      p_as_of: input.asOf || null,
    });
    if (error) {
      if (error.code === 'P0001' && error.message) return error.message;
      return 'The opening balance could not be saved. Please try again.';
    }
    return null;
  } catch {
    return 'The opening balance could not be saved. Check your connection and try again.';
  }
}

// Groups the roster into family clusters by shared guardian phone, shared guardian
// CNIC, or an identical father/guardian name — the three signals the school records
// that reliably identify brothers and sisters. Students in more than one cluster are
// merged, so a family with several matching signals still appears once.
export type SiblingSignals = { phone: string; cnic: string; name: string };

export type SiblingSignalSource = {
  guardian_phone?: string | null;
  father_contact_number?: string | null;
  messaging_number?: string | null;
  guardian_cnic?: string | null;
  fathers_cnic?: string | null;
  guardian_name?: string | null;
  fathers_name?: string | null;
};

// The three family signals, normalised the same way everywhere they are compared: a
// phone without its leading zero, a CNIC without punctuation, a lower-cased name.
export function siblingSignalsFor(source: SiblingSignalSource): SiblingSignals {
  return {
    phone: (source.guardian_phone ?? source.father_contact_number ?? source.messaging_number ?? '')
      .replace(/\D/g, '').replace(/^0+/, ''),
    cnic: (source.guardian_cnic ?? source.fathers_cnic ?? '').replace(/\D/g, ''),
    name: (source.guardian_name || source.fathers_name || '').trim().toLowerCase(),
  };
}

export type SiblingGroup = {
  key: string;
  reason: string;
  students: Student[];
  combinedBalance: number;
};

export function findSiblingGroups(students: Student[]): SiblingGroup[] {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const seen = parent.get(id);
    if (!seen || seen === id) { parent.set(id, id); return id; }
    const root = find(seen);
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  };

  for (const student of students) parent.set(student.id, student.id);

  // Signal -> the student ids that share it.
  const byPhone = new Map<string, string[]>();
  const byCnic = new Map<string, string[]>();
  const byName = new Map<string, string[]>();
  const push = (map: Map<string, string[]>, key: string, id: string) => {
    if (!key) return;
    map.set(key, [...(map.get(key) ?? []), id]);
  };

  for (const student of students) {
    const signals = siblingSignalsFor(student);
    push(byPhone, signals.phone.length >= 10 ? signals.phone : '', student.id);
    push(byCnic, signals.cnic.length >= 10 ? signals.cnic : '', student.id);
    push(byName, signals.name.length >= 5 ? signals.name : '', student.id);
  }

  const link = (map: Map<string, string[]>) => {
    for (const ids of map.values()) {
      for (let i = 1; i < ids.length; i += 1) union(ids[0], ids[i]);
    }
  };
  link(byPhone);
  link(byCnic);
  link(byName);

  const groups = new Map<string, Student[]>();
  for (const student of students) {
    const root = find(student.id);
    groups.set(root, [...(groups.get(root) ?? []), student]);
  }

  const reasonsFor = (members: Student[]): string => {
    const reasons: string[] = [];
    const ids = new Set(members.map((m) => m.id));
    const shares = (values: (s: Student) => string) => {
      const counts = new Map<string, number>();
      for (const m of members) {
        const key = values(m);
        if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return Array.from(counts.values()).some((count) => count > 1 && count === ids.size);
    };
    if (shares((s) => (s.guardian_phone ?? '').replace(/\D/g, ''))) reasons.push('same guardian phone');
    if (shares((s) => (s.guardian_cnic ?? s.fathers_cnic ?? '').replace(/\D/g, ''))) reasons.push('same guardian CNIC');
    if (shares((s) => (s.guardian_name || s.fathers_name || '').trim().toLowerCase())) reasons.push('same father / guardian name');
    return reasons.length > 0 ? reasons.join(', ') : 'linked record';
  };

  return Array.from(groups.entries())
    .filter(([, members]) => members.length > 1)
    .map(([key, members]) => {
      const sorted = [...members].sort((a, b) => a.full_name.localeCompare(b.full_name));
      return {
        key,
        reason: reasonsFor(sorted),
        students: sorted,
        combinedBalance: sorted.reduce((total, student) => total + Math.max(0, Number(student.fee_balance ?? 0)), 0),
      };
    })
    .sort((a, b) => b.students.length - a.students.length || b.combinedBalance - a.combinedBalance);
}
