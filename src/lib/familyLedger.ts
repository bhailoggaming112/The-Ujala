import { monthlyChargeFor, type FeeStructure } from '@/lib/fees';
import { discountForSiblingOrder, type SiblingDiscountRule } from '@/lib/feeDiscountRules';
import type { Student } from '@/lib/schoolTypes';

// One line of the family ledger: what one child is charged each month and what they still
// owe. The figures come from the same helpers the fee screens use, so the admission form
// and the fee office never disagree.
export type FamilyLedgerRow = {
  key: string;
  name: string;
  admissionNumber: string;
  className: string;
  siblingOrder: number;
  discountPercentage: number;
  rulePercentage: number;
  ruleNotApplied: boolean;
  tuition: number;
  concession: number;
  siblingDiscount: number;
  netTuition: number;
  monthlyCharge: number;
  outstanding: number;
  isCandidate: boolean;
};

export type FamilyLedger = {
  rows: FamilyLedgerRow[];
  totalTuition: number;
  totalConcession: number;
  totalSiblingDiscount: number;
  totalMonthly: number;
  totalOutstanding: number;
  pendingRuleCount: number;
};

// The whole family as one ledger. Returns null when the student is not part of a detected
// family, because a single child has nothing to consolidate.
export function buildFamilyLedger(
  students: Student[],
  candidateIndex: number,
  rules: SiblingDiscountRule[],
  structures: FeeStructure[],
): FamilyLedger | null {
  if (students.length < 2) return null;

  const rows: FamilyLedgerRow[] = students.map((student, index) => {
    const structure = structures.find((entry) => entry.class_name === student.class_name);
    const charge = monthlyChargeFor(student, structure);
    const siblingOrder = index + 1;
    const rule = discountForSiblingOrder(rules, siblingOrder);
    const discountPercentage = Math.max(0, Number(student.sibling_discount_percentage ?? 0) || 0);
    const rulePercentage = rule ? Math.max(0, Number(rule.discount_percentage) || 0) : 0;

    return {
      key: student.id || student.admission_number || 'new-student',
      name: (student.full_name ?? '').trim(),
      admissionNumber: (student.admission_number ?? '').trim(),
      className: (student.class_name ?? '').trim(),
      siblingOrder,
      discountPercentage,
      rulePercentage,
      ruleNotApplied: rulePercentage > discountPercentage,
      tuition: charge.tuition,
      concession: charge.concession,
      siblingDiscount: charge.siblingDiscount,
      netTuition: Math.max(0, charge.tuition - charge.concession - charge.siblingDiscount),
      monthlyCharge: charge.currentMonthlyFee,
      outstanding: Math.max(0, Number(student.fee_balance ?? 0) || 0),
      isCandidate: index === candidateIndex,
    };
  });

  const sum = (pick: (row: FamilyLedgerRow) => number) => rows.reduce((total, row) => total + pick(row), 0);

  return {
    rows,
    totalTuition: sum((row) => row.tuition),
    totalConcession: sum((row) => row.concession),
    totalSiblingDiscount: sum((row) => row.siblingDiscount),
    totalMonthly: sum((row) => row.monthlyCharge),
    totalOutstanding: sum((row) => row.outstanding),
    pendingRuleCount: rows.filter((row) => row.ruleNotApplied).length,
  };
}
