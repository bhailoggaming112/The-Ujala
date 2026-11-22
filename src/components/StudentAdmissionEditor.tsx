import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { toStudentFeePayload, validateFeeFields } from '@/lib/admissionFees';
import { admissionFormFromStudent } from '@/lib/admissionFormState';
import type { AdmissionFormState, InformationRecord, Student } from '@/lib/schoolTypes';
import { AdmissionForm } from '@/components/AdmissionForm';
import type { InformationDraft } from '@/components/InformationRecords';
import { findSiblingGroups } from '@/lib/feeAdjustments';
import { fetchSiblingDiscountRules, siblingContextFor, type SiblingDiscountRule } from '@/lib/feeDiscountRules';
import { buildFamilyLedger } from '@/lib/familyLedger';
import type { FamilyStatementInfo } from '@/lib/familyStatement';
import { fetchFeeStructures, type FeeStructure } from '@/lib/fees';

export function StudentAdmissionEditor({ student, students, onClose, onSaved, onToast }: { student: Student; students: Student[]; onClose: () => void; onSaved: () => Promise<void>; onToast: (message: string) => void }) {
  const [form, setForm] = useState<AdmissionFormState>(() => admissionFormFromStudent(student));
  const [records, setRecords] = useState<InformationRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState(false);
  const [siblingRules, setSiblingRules] = useState<SiblingDiscountRule[]>([]);
  const [structures, setStructures] = useState<FeeStructure[]>([]);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    const { data, error } = await supabase.from('school_other_information').select('id, information_type, notes, updated_at').eq('student_id', student.id).order('updated_at', { ascending: false });
    setRecordsError(Boolean(error));
    setRecords(error ? [] : (data as InformationRecord[]));
    setRecordsLoading(false);
  }, [student.id]);

  useEffect(() => { void loadRecords(); }, [loadRecords]);

  useEffect(() => {
    void fetchSiblingDiscountRules().then((result) => setSiblingRules(result.rules));
    void fetchFeeStructures().then((result) => setStructures(result.structures));
  }, []);

  // The family groups are built from the roster with this student's saved details, then
  // this student's own entry is replaced by the version on the form. That way a change to
  // their guardian phone or father name is reflected before the discount is worked out.
  const siblingGroups = useMemo(() => {
    const roster = students.some((row) => row.id === student.id)
      ? students.map((row) => (row.id === student.id ? { ...row, ...form } as unknown as Student : row))
      : [...students, { ...student, ...form } as unknown as Student];
    return findSiblingGroups(roster);
  }, [students, student, form]);

  const siblingContext = useMemo(() => siblingContextFor({
    candidate: { ...student, ...form } as unknown as Student,
    groups: siblingGroups,
    rules: siblingRules,
  }), [student, form, siblingGroups, siblingRules]);

  const familyLedger = useMemo(
    () => buildFamilyLedger(siblingContext.students, siblingContext.candidateIndex, siblingRules, structures),
    [siblingContext, siblingRules, structures],
  );

  // Who the printed statement is addressed to. It follows what is typed on the form, so a
  // corrected guardian name or phone appears on the statement straight away.
  const familyStatementInfo = useMemo<FamilyStatementInfo>(() => ({
    guardianName: form.guardian_name.trim() || form.fathers_name.trim(),
    guardianPhone: form.guardian_phone.trim() || form.father_contact_number.trim() || form.messaging_number.trim(),
    guardianCnic: form.guardian_cnic.trim() || form.fathers_cnic.trim(),
    preparedFor: form.full_name.trim(),
    matchedReason: siblingContext.matchedReason,
  }), [form, siblingContext.matchedReason]);

  const saveInfo = async (draft: InformationDraft) => {
    const payload = { information_type: draft.information_type, notes: draft.notes, updated_at: new Date().toISOString() };
    const { error } = draft.id
      ? await supabase.from('school_other_information').update(payload).eq('id', draft.id)
      : await supabase.from('school_other_information').insert({ ...payload, student_id: student.id });
    if (error) { onToast('The note could not be saved. Please try again.'); return false; }
    onToast('Other information saved');
    await loadRecords();
    return true;
  };

  const deleteInfo = async (id: string) => {
    const { error } = await supabase.from('school_other_information').delete().eq('id', id);
    if (error) { onToast('The note could not be deleted. Please try again.'); return false; }
    onToast('Other information deleted');
    await loadRecords();
    return true;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const feeError = validateFeeFields(form);
    if (feeError) { onToast(feeError); return; }
    const { error } = await supabase.from('school_students').update(toStudentFeePayload(form)).eq('id', student.id);
    if (error) { onToast('The changes could not be saved. Please check the admission number.'); return; }
    onToast(`${form.full_name} was updated`);
    await onSaved();
    onClose();
  };

  return (
    <div className="notice-overlay">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto">
        <AdmissionForm
          form={form}
          setForm={setForm}
          infoRecords={records}
          infoLoading={recordsLoading}
          infoLoadError={recordsError}
          onSaveInfo={saveInfo}
          onDeleteInfo={deleteInfo}
          onSubmit={submit}
          onCancel={onClose}
          onToast={onToast}
          siblingContext={siblingContext}
          familyLedger={familyLedger}
          familyStatementInfo={familyStatementInfo}
        />
      </div>
    </div>
  );
}
