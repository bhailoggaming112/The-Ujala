import type { AdmissionFormState } from '@/lib/schoolTypes';

const parseAmount = (value: string) => {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const dateOrNull = (value: string) => (value.trim() === '' ? null : value.trim());

const formatInputAmount = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));

// Class names come from the admission form's fixed list; the fee structure uses the
// same wording, so a trimmed, case-insensitive comparison lines them up.
const normalizeClassName = (value: string) => value.trim().toLowerCase();

export type FeeStructureRow = { class_name: string; tuition_fee: number | string | null };

// The class tuition fee is the only figure the admission form cares about. Lab,
// transport, admission/misc and exam fees stay out of it — those are charged on the
// challan, not agreed with the parent at admission.
export function tuitionFeeForClass(classList: FeeStructureRow[], className: string): number | null {
  const wanted = normalizeClassName(className);
  if (!wanted) return null;
  const row = classList.find((entry) => normalizeClassName(entry.class_name) === wanted);
  if (!row) return null;
  const value = Number(row.tuition_fee ?? 0);
  return Number.isFinite(value) ? value : null;
}

// A concession can never take more than the tuition fee, and never goes below zero.
const clampConcession = (tuition: number, amount: number) => Math.min(Math.max(amount, 0), Math.max(tuition, 0));

// Both concession fields describe the same money, so each recalculates the other from
// the tuition fee: typing a percentage fills the amount, typing an amount fills the percentage.
export function concessionAmountFor(tuitionFee: string, percentage: string) {
  const tuition = parseAmount(tuitionFee);
  const percent = parseAmount(percentage);
  if (tuition === null || percent === null) return '';
  return clampConcession(tuition, (tuition * percent) / 100).toFixed(2);
}

export function concessionPercentageFor(tuitionFee: string, amount: string) {
  const tuition = parseAmount(tuitionFee);
  const value = parseAmount(amount);
  if (tuition === null || value === null || tuition <= 0) return '';
  return ((clampConcession(tuition, value) / tuition) * 100).toFixed(2);
}

// What the family actually pays for tuition each month.
export function netTuitionFor(tuitionFee: string, amount: string) {
  const tuition = parseAmount(tuitionFee);
  if (tuition === null) return null;
  return Math.max(0, tuition - (parseAmount(amount) ?? 0));
}

const netValue = (tuition: string, concession: string) => {
  const net = netTuitionFor(tuition, concession);
  return net === null ? '' : String(net);
};

// Called when the class changes. The class rate replaces the tuition fee and whatever
// concession is already recorded is re-applied, so the net figure stays consistent.
export function applyClassTuitionFee(form: AdmissionFormState, classList: FeeStructureRow[]): Partial<AdmissionFormState> {
  const classTuition = tuitionFeeForClass(classList, form.class_name);
  if (classTuition === null) return {};

  const tuition = formatInputAmount(classTuition);
  const percent = parseAmount(form.fee_concession_percentage);
  const amount = parseAmount(form.fee_concession_amount);

  let concession = '';
  let percentage = '';
  if (percent !== null) {
    concession = concessionAmountFor(tuition, form.fee_concession_percentage);
    percentage = form.fee_concession_percentage;
  } else if (amount !== null) {
    concession = formatInputAmount(clampConcession(classTuition, amount));
    percentage = concessionPercentageFor(tuition, concession);
  }

  return {
    tuition_fee: tuition,
    fee_concession_amount: concession,
    fee_concession_percentage: percentage,
    net_tuition_fee: netValue(tuition, concession),
  };
}

export function validateFeeFields(form: AdmissionFormState) {
  const tuition = parseAmount(form.tuition_fee);
  const percentage = parseAmount(form.fee_concession_percentage);
  const amount = parseAmount(form.fee_concession_amount);
  if ([tuition, percentage, amount].some((value) => value !== null && value < 0)) return 'Fee amounts cannot be negative';
  if (percentage !== null && percentage > 100) return 'Fee concession percentage cannot be more than 100';
  if (tuition !== null && amount !== null && amount > tuition) return 'Fee concession cannot be more than the tuition fee';
  return null;
}

export function toStudentFeePayload(form: AdmissionFormState) {
  const tuition = parseAmount(form.tuition_fee);
  const concession = parseAmount(form.fee_concession_amount);
  return {
    ...form,
    date_of_birth: dateOrNull(form.date_of_birth),
    admission_date: dateOrNull(form.admission_date),
    leaving_date: dateOrNull(form.leaving_date),
    issued_tc_date: dateOrNull(form.issued_tc_date),
    leaving_certificate_date: dateOrNull(form.leaving_certificate_date),
    tuition_fee: tuition,
    fee_concession_percentage: parseAmount(form.fee_concession_percentage),
    fee_concession_amount: concession,
    net_tuition_fee: tuition === null ? null : Math.max(0, tuition - (concession ?? 0)),
  };
}
