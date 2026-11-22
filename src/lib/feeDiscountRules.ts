import { supabase } from '@/lib/supabase';
import { siblingSignalsFor, type SiblingGroup, type SiblingSignalSource } from '@/lib/feeAdjustments';

// One row per child number in a family. The first child gets no sibling discount, so
// the rules start at the second child.
export type SiblingDiscountRule = {
  id: string;
  sibling_order: number;
  discount_percentage: number;
  label: string | null;
  updated_at?: string;
};

export type SiblingContext = {
  groupSize: number;
  siblingOrder: number;
  discountPercentage: number;
  ruleLabel: string | null;
  matchedReason: string | null;
};

const RULE_COLUMNS = 'id, sibling_order, discount_percentage, label, updated_at';

export async function fetchSiblingDiscountRules(): Promise<{ rules: SiblingDiscountRule[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('school_fee_discount_rules')
      .select(RULE_COLUMNS)
      .order('sibling_order');
    if (error) return { rules: [], error: 'The sibling discount rules could not be loaded.' };
    return { rules: (data ?? []) as SiblingDiscountRule[], error: null };
  } catch {
    return { rules: [], error: 'The sibling discount rules could not be loaded. Check your connection and try again.' };
  }
}

export async function saveSiblingDiscountRule(input: { id: string; discountPercentage: number }): Promise<string | null> {
  if (!Number.isFinite(input.discountPercentage) || input.discountPercentage < 0 || input.discountPercentage > 100) {
    return 'Enter a sibling discount between 0 and 100.';
  }
  try {
    const { error } = await supabase
      .from('school_fee_discount_rules')
      .update({ discount_percentage: input.discountPercentage, updated_at: new Date().toISOString() })
      .eq('id', input.id);
    return error ? 'The sibling discount could not be saved. Please try again.' : null;
  } catch {
    return 'The sibling discount could not be saved. Check your connection and try again.';
  }
}

// The rule for a given child number is the highest one recorded at or below it, so a
// "fourth child onwards" rule also covers the fifth and sixth child.
export function discountForSiblingOrder(rules: SiblingDiscountRule[], order: number): SiblingDiscountRule | null {
  const applicable = rules
    .filter((rule) => Number(rule.sibling_order) <= order)
    .sort((a, b) => Number(b.sibling_order) - Number(a.sibling_order));
  return applicable[0] ?? null;
}

const admissionSequence = (value: string | null | undefined) => Number((value ?? '').match(/(\d+)$/)?.[1] ?? 0);

type FamilyMember = { id?: string; admission_number?: string; full_name?: string };

export type SiblingCandidate = SiblingSignalSource & FamilyMember;

export type SiblingContextInput = {
  candidate: SiblingCandidate;
  // The family groups to match against, which may be the roster with the student under
  // edit swapped back in for the edited version of their own record.
  groups: SiblingGroup[];
  rules: SiblingDiscountRule[];
};

// Works out which child of their family this student is, using the same family groups
// the Brother & Sister tab shows. Brothers and sisters are ordered by admission number,
// so the child who joined the school first counts as the first child.
export function siblingContextFor({ candidate, groups, rules }: SiblingContextInput): SiblingContext {
  const signals = siblingSignalsFor(candidate);
  const group = groups.find((entry) => entry.students.some((member) => {
    const other = siblingSignalsFor(member);
    return (signals.phone.length >= 10 && other.phone === signals.phone)
      || (signals.cnic.length >= 10 && other.cnic === signals.cnic)
      || (signals.name.length >= 5 && other.name === signals.name);
  }));

  if (!group) return { groupSize: 1, siblingOrder: 1, discountPercentage: 0, ruleLabel: null, matchedReason: null };

  // The stored record of the student being edited still carries its old details, so it
  // is replaced by the details currently on the form before the family is ordered.
  const family: FamilyMember[] = [
    ...group.students.map((member) => ({ id: member.id, admission_number: member.admission_number, full_name: member.full_name })),
    { id: candidate.id, admission_number: candidate.admission_number, full_name: candidate.full_name },
  ];

  const ordered = [...family].sort((a, b) =>
    admissionSequence(a.admission_number) - admissionSequence(b.admission_number)
    || (a.full_name ?? '').localeCompare(b.full_name ?? ''));

  const index = ordered.findIndex((member) =>
    (candidate.id ? member.id === candidate.id : false)
    || (candidate.admission_number ? member.admission_number === candidate.admission_number : false));
  const siblingOrder = index < 0 ? ordered.length : index + 1;

  const rule = discountForSiblingOrder(rules, siblingOrder);
  return {
    groupSize: Math.max(ordered.length, group.students.length),
    siblingOrder,
    discountPercentage: rule ? Number(rule.discount_percentage) : 0,
    ruleLabel: rule?.label ?? null,
    matchedReason: group.reason,
  };
}
