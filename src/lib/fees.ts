import { supabase } from '@/lib/supabase';
import type { Student } from '@/lib/schoolTypes';

export const CLASS_OPTIONS = [
  'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
  'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
];

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'online', label: 'Online / Easypaisa' },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value'];

export type FeeStructure = {
  class_name: string;
  tuition_fee: number;
  admission_misc: number;
  exam_lab: number;
  transport: number;
  late_fine: number;
  updated_at?: string;
};

export type FeeHeads = {
  tuition_fee: number;
  admission_misc: number;
  exam_lab: number;
  transport: number;
  arrears: number;
  concession: number;
  late_fine: number;
};

export type FeeChallanStatus = 'unpaid' | 'partial' | 'paid';

export type FeeChallan = FeeHeads & {
  id: string;
  student_id: string;
  student_name: string;
  class_name: string | null;
  section_name: string | null;
  challan_number: string | null;
  month: string;
  due_date: string;
  total: number;
  status: FeeChallanStatus;
  created_at: string;
};

// A challan together with the student's admission number, which is what the barcode
// and the printed student section need.
export type ChallanDocument = FeeChallan & { admission_number: string | null };

// The value a challan barcode carries: the challan number once it has been saved, or
// an admission-number-plus-month code for a challan that is still only a preview.
export const challanScanCode = (challan: { challan_number?: string | null; admission_number?: string | null; month: string }) =>
  (challan.challan_number ?? '').trim() || `${challan.admission_number ?? ''}+${challan.month}`;

// The readable challan number shown and printed everywhere: CH-<admission digits>-<YYYYMM>,
// for example CH-2401-202611. A challan that is still only a preview has no stored number
// yet, so the same code the database will assign is derived here.
export const challanDisplayNumber = (challan: { challan_number?: string | null; admission_number?: string | null; month: string }) => {
  const stored = (challan.challan_number ?? '').trim();
  if (stored) return stored;

  const digits = (challan.admission_number ?? '').replace(/\D/g, '');
  const month = (challan.month ?? '').trim();
  if (!digits || !/^\d{4}-\d{2}$/.test(month)) return '';

  return `CH-${digits}-${month.replace('-', '')}`;
};

// Asks the database for the challan number this student and month will be given, so a
// preview shows the real number rather than a placeholder. Returns an empty string when
// the lookup is unavailable; the caller then falls back to the locally derived code.
export async function nextChallanNumber(studentId: string, month: string): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('next_fee_challan_number', { p_student_id: studentId, p_month: month });
    if (error || typeof data !== 'string' || !data.trim()) return '';
    return data.trim();
  } catch {
    return '';
  }
}

export type FeePayment = {
  id: string;
  student_id: string;
  receipt_number: string;
  amount: number;
  method: PaymentMethod;
  payment_date: string;
  remarks: string | null;
  balance_after: number;
  created_at: string;
  challan_id: string | null;
  challan_number: string | null;
  source: string;
  voided: boolean;
  voided_at: string | null;
  void_reason: string | null;
  student_name: string;
  class_name: string | null;
  section_name: string | null;
  admission_number: string | null;
};

// Where families may send the fee from home. One shared row for the whole school.
export type PaymentSettings = {
  easypaisa_account_no: string;
  easypaisa_account_name: string;
  bank_name: string;
  bank_account_name: string;
  bank_account_no: string;
};

export const EMPTY_PAYMENT_SETTINGS: PaymentSettings = {
  easypaisa_account_no: '', easypaisa_account_name: '',
  bank_name: '', bank_account_name: '', bank_account_no: '',
};

// What the scan box learns from a scanned challan.
export type ScannedChallan = {
  found: boolean;
  reason?: string;
  challan_id: string;
  challan_number: string | null;
  month: string;
  due_date: string;
  total: number;
  status: FeeChallanStatus;
  paid: number;
  remaining: number;
  student_id: string;
  student_name: string;
  admission_number: string | null;
  class_name: string | null;
  section_name: string | null;
  fee_balance: number;
};

export type FeeSummary = {
  previousArrears: number;
  currentMonthlyFee: number;
  concession: number;
  fine: number;
  totalPayable: number;
  paid: number;
  remaining: number;
};

export const EMPTY_HEADS: FeeHeads = {
  tuition_fee: 0, admission_misc: 0, exam_lab: 0,
  transport: 0, arrears: 0, concession: 0, late_fine: 0,
};

export const HEAD_LABELS: Record<keyof FeeHeads, string> = {
  tuition_fee: 'Tuition fee',
  admission_misc: 'Admission / misc',
  exam_lab: 'Exam / lab',
  transport: 'Transport',
  arrears: 'Previous arrears',
  concession: 'Concession',
  late_fine: 'Late fine',
};

export const formatMoney = (value: number) => `Rs ${Math.round(Number(value) || 0).toLocaleString()}`;

export const formatDay = (value: string | null) => {
  if (!value) return '—';
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatStamp = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const pad = (value: number) => String(value).padStart(2, '0');

// Fee months are stored as YYYY-MM so they sort and group without a date column.
export const monthKey = (date: Date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;

export const monthLabel = (key: string) => {
  const parsed = new Date(`${key.slice(0, 7)}-01T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? key : parsed.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};

export const monthOptions = (count = 15) => {
  const today = new Date();
  return Array.from({ length: count }, (_, index) => monthKey(new Date(today.getFullYear(), today.getMonth() - index, 1)));
};

// Heads add up, then the concession comes off; the total is never negative.
export const headsTotal = (heads: FeeHeads) => Math.max(
  0,
  heads.tuition_fee + heads.admission_misc + heads.exam_lab + heads.transport + heads.arrears + heads.late_fine - heads.concession,
);

// A student's own agreed tuition wins over the class structure, so an existing
// concession arrangement is never overwritten by the standard rate.
export function tuitionFor(student: Student, structure: FeeStructure | undefined): number {
  const own = Number(student.tuition_fee ?? 0);
  if (own > 0) return own;
  return Number(structure?.tuition_fee ?? 0);
}

export function concessionFor(student: Student, tuition: number): number {
  const amount = Number(student.fee_concession_amount ?? 0);
  if (amount > 0) return Math.min(amount, tuition);
  const percent = Number(student.fee_concession_percentage ?? 0);
  if (percent > 0) return Math.min((tuition * percent) / 100, tuition);
  return 0;
}

// What the student is expected to pay for one month before arrears and fines.
export function monthlyChargeFor(student: Student, structure: FeeStructure | undefined) {
  const tuition = tuitionFor(student, structure);
  const concession = concessionFor(student, tuition);
  const extra = Number(structure?.admission_misc ?? 0) + Number(structure?.exam_lab ?? 0) + Number(structure?.transport ?? 0);
  return { tuition, concession, currentMonthlyFee: Math.max(0, tuition - concession) + extra };
}

// The fee summary shown in the collection tab. The school's own balance is treated as
// the truth for what is still owed; the arrears line is that balance with the current
// month's unpaid part set aside, so the two never disagree.
export function buildFeeSummary(
  student: Student,
  structure: FeeStructure | undefined,
  challan: FeeChallan | undefined,
  paidThisMonth: number,
  today: string,
): FeeSummary {
  const { concession, currentMonthlyFee } = monthlyChargeFor(student, structure);
  const monthCharge = challan ? Number(challan.total) : currentMonthlyFee;
  const outstanding = Math.max(0, Number(student.fee_balance ?? 0));
  const overdue = challan ? today > challan.due_date : false;
  const fine = overdue && outstanding > 0 ? Number(structure?.late_fine ?? 0) : 0;
  const previousArrears = Math.max(0, outstanding - Math.max(0, monthCharge - paidThisMonth));
  const totalPayable = previousArrears + currentMonthlyFee + fine;
  return {
    previousArrears,
    currentMonthlyFee,
    concession,
    fine,
    totalPayable,
    paid: paidThisMonth,
    remaining: outstanding,
  };
}

export async function fetchFeeStructures(): Promise<{ structures: FeeStructure[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('school_fee_structures')
      .select('class_name, tuition_fee, admission_misc, exam_lab, transport, late_fine, updated_at')
      .order('class_name');
    if (error) return { structures: [], error: 'The fee structure could not be loaded.' };
    return { structures: (data ?? []) as FeeStructure[], error: null };
  } catch {
    return { structures: [], error: 'The fee structure could not be loaded. Check your connection and try again.' };
  }
}

export async function saveFeeStructure(values: FeeStructure): Promise<string | null> {
  try {
    const { error } = await supabase
      .from('school_fee_structures')
      .upsert({ ...values, updated_at: new Date().toISOString() }, { onConflict: 'class_name' });
    return error ? 'The fee structure could not be saved. Please try again.' : null;
  } catch {
    return 'The fee structure could not be saved. Check your connection and try again.';
  }
}

const PAYMENT_COLUMNS =
  'id, student_id, receipt_number, amount, method, payment_date, remarks, balance_after, created_at, challan_id, challan_number, source, voided, voided_at, void_reason, student:school_students(full_name, class_name, section_name, admission_number)';

type PaymentRow = Omit<FeePayment, 'student_name' | 'class_name' | 'section_name' | 'admission_number'> & {
  student: { full_name: string; class_name: string | null; section_name: string | null; admission_number: string | null } | null;
};

const toPayment = (row: PaymentRow): FeePayment => ({
  ...row,
  voided: row.voided ?? false,
  voided_at: row.voided_at ?? null,
  void_reason: row.void_reason ?? null,
  student_name: row.student?.full_name ?? 'Unknown student',
  class_name: row.student?.class_name ?? null,
  section_name: row.student?.section_name ?? null,
  admission_number: row.student?.admission_number ?? null,
});

export async function fetchFeePayments(limit = 200): Promise<{ payments: FeePayment[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('school_fee_payments')
      .select(PAYMENT_COLUMNS)
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return { payments: [], error: 'The fee transactions could not be loaded.' };
    return { payments: ((data ?? []) as unknown as PaymentRow[]).map(toPayment), error: null };
  } catch {
    return { payments: [], error: 'The fee transactions could not be loaded. Check your connection and try again.' };
  }
}

// A payment is recorded by the database so the receipt, the fee history and the
// student's balance are written together and cannot drift apart.
export async function recordFeePayment(input: {
  studentId: string;
  amount: number | null;
  method: PaymentMethod;
  paymentDate: string;
  remarks: string;
  receiptNumber: string;
  challanNumber?: string;
  source?: 'manual' | 'scan';
}): Promise<{ receiptNumber: string; balanceAfter: number; challanStatus: string | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('record_fee_payment', {
      p_student_id: input.studentId,
      p_amount: input.amount,
      p_method: input.method,
      p_payment_date: input.paymentDate,
      p_remarks: input.remarks,
      p_receipt_number: input.receiptNumber,
      p_challan_number: input.challanNumber ?? null,
      p_source: input.source ?? 'manual',
    });
    if (error) {
      // The database raises plain, readable reasons (a duplicate receipt number, for
      // example). Anything else is reported generically.
      if (error.code === 'P0001' && error.message) {
        return { receiptNumber: '', balanceAfter: 0, challanStatus: null, error: error.message };
      }
      return { receiptNumber: '', balanceAfter: 0, challanStatus: null, error: 'The payment could not be recorded. Please try again.' };
    }
    const row = data as { receipt_number?: string; balance_after?: number; challan_status?: string | null } | null;
    return {
      receiptNumber: row?.receipt_number ?? input.receiptNumber,
      balanceAfter: Number(row?.balance_after ?? 0),
      challanStatus: row?.challan_status ?? null,
      error: null,
    };
  } catch {
    return { receiptNumber: '', balanceAfter: 0, challanStatus: null, error: 'The payment could not be recorded. Check your connection and try again.' };
  }
}

// A payment is never deleted: the accountant reverses it with a reason, and the
// database marks the row void, restores the balance the receipt had removed and
// writes a ledger entry so the audit trail stays complete. A receipt taken against
// an already cleared account removed nothing, so reversing it restores nothing.
export async function voidFeePayment(paymentId: string, reason: string): Promise<{ restored: number; notRestored: number; balanceAfter: number; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('void_fee_payment', { p_payment_id: paymentId, p_reason: reason });
    if (error) {
      if (error.code === 'P0001' && error.message) return { restored: 0, notRestored: 0, balanceAfter: 0, error: error.message };
      return { restored: 0, notRestored: 0, balanceAfter: 0, error: 'The payment could not be reversed. Please try again.' };
    }
    const row = data as { restored?: number; not_restored?: number; balance_after?: number } | null;
    return {
      restored: Number(row?.restored ?? 0),
      notRestored: Number(row?.not_restored ?? 0),
      balanceAfter: Number(row?.balance_after ?? 0),
      error: null,
    };
  } catch {
    return { restored: 0, notRestored: 0, balanceAfter: 0, error: 'The payment could not be reversed. Check your connection and try again.' };
  }
}

export async function fetchPaymentSettings(): Promise<{ settings: PaymentSettings; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('school_payment_settings')
      .select('easypaisa_account_no, easypaisa_account_name, bank_name, bank_account_name, bank_account_no')
      .eq('id', 1)
      .maybeSingle();
    if (error) return { settings: EMPTY_PAYMENT_SETTINGS, error: 'The payment details could not be loaded.' };
    return {
      settings: {
        easypaisa_account_no: data?.easypaisa_account_no ?? '',
        easypaisa_account_name: data?.easypaisa_account_name ?? '',
        bank_name: data?.bank_name ?? '',
        bank_account_name: data?.bank_account_name ?? '',
        bank_account_no: data?.bank_account_no ?? '',
      },
      error: null,
    };
  } catch {
    return { settings: EMPTY_PAYMENT_SETTINGS, error: 'The payment details could not be loaded. Check your connection and try again.' };
  }
}

export async function savePaymentSettings(settings: PaymentSettings): Promise<string | null> {
  try {
    const { error } = await supabase
      .from('school_payment_settings')
      .update({ ...settings, updated_at: new Date().toISOString() })
      .eq('id', 1);
    return error ? 'The payment details could not be saved. Please try again.' : null;
  } catch {
    return 'The payment details could not be saved. Check your connection and try again.';
  }
}

// Reads a scanned challan code. The database decides what the code means, so the same
// box accepts a challan number, an admission number, or an admission number plus month.
export async function lookupFeeChallan(code: string): Promise<{ challan: ScannedChallan | null; error: string | null }> {
  const trimmed = (code ?? '').trim();
  if (!trimmed) return { challan: null, error: 'Scan or type a challan code first.' };
  try {
    const { data, error } = await supabase.rpc('lookup_fee_challan', { p_code: trimmed });
    if (error) {
      if (error.code === 'P0001' && error.message) return { challan: null, error: error.message };
      return { challan: null, error: 'That challan could not be looked up. Please try again.' };
    }
    const row = data as ScannedChallan | null;
    if (!row || row.found !== true) {
      return { challan: null, error: row?.reason ?? 'No fee challan matches that code.' };
    }
    return { challan: row, error: null };
  } catch {
    return { challan: null, error: 'That challan could not be looked up. Check your connection and try again.' };
  }
}

export const CHALLAN_COLUMNS =
  'id, student_id, student_name, class_name, section_name, challan_number, month, due_date, tuition_fee, admission_misc, exam_lab, transport, arrears, concession, late_fine, total, status, created_at';

export async function fetchChallans(month: string): Promise<{ challans: FeeChallan[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('school_fee_challans')
      .select(CHALLAN_COLUMNS)
      .eq('month', month)
      .order('student_name');
    if (error) return { challans: [], error: 'The challans could not be loaded.' };
    return { challans: (data ?? []) as FeeChallan[], error: null };
  } catch {
    return { challans: [], error: 'The challans could not be loaded. Check your connection and try again.' };
  }
}

export async function saveChallans(rows: (FeeHeads & {
  student_id: string;
  student_name: string;
  class_name: string | null;
  section_name: string | null;
  month: string;
  due_date: string;
  total: number;
})[]): Promise<string | null> {
  if (rows.length === 0) return null;
  try {
    const { error } = await supabase
      .from('school_fee_challans')
      .upsert(rows, { onConflict: 'student_id,month' });
    return error ? 'The challans could not be saved. Please try again.' : null;
  } catch {
    return 'The challans could not be saved. Check your connection and try again.';
  }
}

export async function updateChallanStatus(ids: string[], status: FeeChallanStatus): Promise<string | null> {
  if (ids.length === 0) return null;
  try {
    const { error } = await supabase.from('school_fee_challans').update({ status }).in('id', ids);
    return error ? 'The challan status could not be updated.' : null;
  } catch {
    return 'The challan status could not be updated.';
  }
}

// The challans a family can see in their own portal: a student sees their own, a parent
// sees every child linked to their account. The database decides what is visible.
export async function fetchChallansForStudent(studentId: string): Promise<{ challans: FeeChallan[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('school_fee_challans')
      .select(CHALLAN_COLUMNS)
      .eq('student_id', studentId)
      .order('month', { ascending: false });
    if (error) return { challans: [], error: 'The fee challans could not be loaded.' };
    return { challans: (data ?? []) as FeeChallan[], error: null };
  } catch {
    return { challans: [], error: 'The fee challans could not be loaded. Check your connection and try again.' };
  }
}

// Money received on one day, across every class. A reversed payment is money the
// school no longer holds, so it is left out of every collection figure.
export function collectedOn(payments: FeePayment[], day: string): number {
  return payments
    .filter((payment) => payment.payment_date === day && !payment.voided)
    .reduce((total, payment) => total + Number(payment.amount), 0);
}

export function collectedInMonth(payments: FeePayment[], month: string): number {
  return payments
    .filter((payment) => (payment.payment_date ?? '').slice(0, 7) === month && !payment.voided)
    .reduce((total, payment) => total + Number(payment.amount), 0);
}

// Payments for one day, newest first, split by how the money was received. Voided
// rows are excluded so a reversed receipt never counts towards the day's takings.
export function paymentsOn(payments: FeePayment[], day: string): FeePayment[] {
  return payments
    .filter((payment) => payment.payment_date === day && !payment.voided)
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
}

// Daily totals for the month, oldest first, for the reports table.
export function dailyTotals(payments: FeePayment[], month: string) {
  const totals = new Map<string, { amount: number; count: number }>();
  for (const payment of payments) {
    if (payment.voided) continue;
    const day = (payment.payment_date ?? '').slice(0, 10);
    if (day.slice(0, 7) !== month) continue;
    const current = totals.get(day) ?? { amount: 0, count: 0 };
    totals.set(day, { amount: current.amount + Number(payment.amount), count: current.count + 1 });
  }
  return Array.from(totals.entries())
    .map(([day, value]) => ({ day, ...value }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

export function methodTotals(payments: FeePayment[], month: string) {
  const totals = new Map<string, number>();
  for (const payment of payments) {
    if (payment.voided) continue;
    if ((payment.payment_date ?? '').slice(0, 7) !== month) continue;
    totals.set(payment.method, (totals.get(payment.method) ?? 0) + Number(payment.amount));
  }
  return PAYMENT_METHODS.map((method) => ({ ...method, amount: totals.get(method.value) ?? 0 }));
}

export function toCsv(rows: (string | number | null)[][]): string {
  return rows
    .map((row) => row.map((cell) => {
      const text = cell === null || cell === undefined ? '' : String(cell);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(','))
    .join('\n');
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
