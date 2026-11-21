import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Download, FileSpreadsheet, Printer, Save } from 'lucide-react';
import { ChallanView } from '@/components/FeeDocuments';
import {
  CLASS_OPTIONS, HEAD_LABELS, collectedInMonth, dailyTotals, downloadCsv,
  formatDay, formatMoney, headsTotal, methodTotals, monthKey, monthLabel, monthOptions, monthlyChargeFor,
  saveChallans, saveFeeStructure, savePaymentSettings, toCsv,
  type ChallanDocument, type FeeChallan, type FeeHeads, type FeePayment, type FeeStructure, type PaymentSettings,
} from '@/lib/fees';
import type { Student } from '@/lib/schoolTypes';

// A challan can carry arrears; the standard structure cannot, so the two editors
// keep separate column lists.
const CHALLAN_HEADS: (keyof FeeHeads)[] = ['tuition_fee', 'admission_misc', 'exam_lab', 'transport', 'arrears', 'late_fine'];
type StructureHead = Exclude<keyof FeeStructure, 'class_name' | 'updated_at'>;
const STRUCTURE_HEADS: StructureHead[] = ['tuition_fee', 'admission_misc', 'exam_lab', 'transport', 'late_fine'];

const emptyStructure = (className: string): FeeStructure => ({
  class_name: className, tuition_fee: 0, admission_misc: 0, exam_lab: 0, transport: 0, late_fine: 0,
});

type ChallanDraft = FeeHeads & { student: Student };

function draftFor(student: Student, structure: FeeStructure | undefined, arrears: number): ChallanDraft {
  const { tuition, concession } = monthlyChargeFor(student, structure);
  return {
    student,
    tuition_fee: tuition,
    admission_misc: Number(structure?.admission_misc ?? 0),
    exam_lab: Number(structure?.exam_lab ?? 0),
    transport: Number(structure?.transport ?? 0),
    arrears: Math.max(0, arrears),
    concession,
    late_fine: 0,
  };
}

export function ChallanTab({ students, structures, classList, sectionsFor, month, setMonth, savedChallans, paymentSettings, onToast, onSaved }: {
  students: Student[];
  structures: FeeStructure[];
  classList: string[];
  sectionsFor: (className: string) => string[];
  month: string;
  setMonth: (month: string) => void;
  savedChallans: FeeChallan[];
  paymentSettings: PaymentSettings;
  onToast: (message: string) => void;
  onSaved: () => void;
}) {
  const [classFilter, setClassFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [mode, setMode] = useState<'group' | 'single'>('group');
  const [singleId, setSingleId] = useState('');
  const [dueDate, setDueDate] = useState(() => {
    const date = new Date();
    date.setDate(10);
    if (date < new Date()) date.setMonth(date.getMonth() + 1);
    return date.toISOString().slice(0, 10);
  });
  const [edits, setEdits] = useState<Record<string, Partial<FeeHeads>>>({});
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<ChallanDocument[]>([]);
  const [reprint, setReprint] = useState<ChallanDocument[]>([]);

  const structureFor = (student: Student) => structures.find((row) => row.class_name === student.class_name);

  const targets = useMemo(() => {
    if (mode === 'single') return students.filter((student) => student.id === singleId);
    return students
      .filter((student) => !classFilter || student.class_name === classFilter)
      .filter((student) => !sectionFilter || student.section_name === sectionFilter);
  }, [mode, singleId, students, classFilter, sectionFilter]);

  const drafts: ChallanDraft[] = useMemo(() => targets.map((student) => {
    const base = draftFor(student, structureFor(student), Number(student.fee_balance ?? 0));
    return { ...base, ...(edits[student.id] ?? {}) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [targets, structures, edits]);

  const grandTotal = drafts.reduce((total, draft) => total + headsTotal(draft), 0);

  const setHead = (studentId: string, key: keyof FeeHeads, value: string) => {
    const parsed = Number(value);
    setEdits((current) => ({
      ...current,
      [studentId]: { ...(current[studentId] ?? {}), [key]: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0 },
    }));
  };

  const admissionFor = (studentId: string) => students.find((student) => student.id === studentId)?.admission_number ?? null;

  const toChallan = (draft: ChallanDraft): ChallanDocument => ({
    id: `preview-${draft.student.id}`,
    student_id: draft.student.id,
    student_name: draft.student.full_name,
    admission_number: draft.student.admission_number,
    class_name: draft.student.class_name,
    section_name: draft.student.section_name,
    challan_number: null,
    month,
    due_date: dueDate,
    tuition_fee: draft.tuition_fee,
    admission_misc: draft.admission_misc,
    exam_lab: draft.exam_lab,
    transport: draft.transport,
    arrears: draft.arrears,
    concession: draft.concession,
    late_fine: draft.late_fine,
    total: headsTotal(draft),
    status: 'unpaid',
    created_at: new Date().toISOString(),
  });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (drafts.length === 0) { onToast('Choose at least one student for the challan.'); return; }
    setSaving(true);
    const error = await saveChallans(drafts.map((draft) => ({
      student_id: draft.student.id,
      student_name: draft.student.full_name,
      class_name: draft.student.class_name,
      section_name: draft.student.section_name,
      month,
      due_date: dueDate,
      tuition_fee: draft.tuition_fee,
      admission_misc: draft.admission_misc,
      exam_lab: draft.exam_lab,
      transport: draft.transport,
      arrears: draft.arrears,
      concession: draft.concession,
      late_fine: draft.late_fine,
      total: headsTotal(draft),
    })));
    setSaving(false);
    if (error) { onToast(error); return; }
    onToast(`${drafts.length} challan${drafts.length === 1 ? '' : 's'} generated for ${monthLabel(month)}.`);
    setEdits({});
    onSaved();
  };

  return (
    <div className="fee-section">
      <section className="fee-card">
        <div className="fee-card-head">
          <div><span className="eyebrow">Challan setup</span><h2>Choose who the challan is for</h2></div>
          <span className="fee-hint">{drafts.length} students · {formatMoney(grandTotal)} total</span>
        </div>

        <div className="segmented-control fee-segmented">
          {([['group', 'Whole class or section'], ['single', 'One student']] as const).map(([value, label]) => (
            <button key={value} type="button" className={mode === value ? 'selected' : ''} onClick={() => setMode(value)}>{label}</button>
          ))}
        </div>

        <form className="fee-form" onSubmit={save}>
          <div className="fee-filters">
            <label className="control-field"><span>Fee month</span>
              <select value={month} onChange={(event) => setMonth(event.target.value)}>
                {monthOptions().map((key) => <option key={key} value={key}>{monthLabel(key)}</option>)}
              </select>
            </label>
            <label className="control-field"><span>Due date</span>
              <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required />
            </label>
            {mode === 'group' ? (
              <>
                <label className="control-field"><span>Class</span>
                  <select value={classFilter} onChange={(event) => { setClassFilter(event.target.value); setSectionFilter(''); }}>
                    <option value="">All classes</option>
                    {classList.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
                <label className="control-field"><span>Section</span>
                  <select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)}>
                    <option value="">All sections</option>
                    {(classFilter ? sectionsFor(classFilter) : Array.from(new Set(students.map((student) => student.section_name))).sort()).map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
              </>
            ) : (
              <label className="control-field"><span>Student</span>
                <select value={singleId} onChange={(event) => setSingleId(event.target.value)}>
                  <option value="">Select a student</option>
                  {students.map((student) => <option key={student.id} value={student.id}>{student.full_name} — {student.class_name} · {student.section_name}</option>)}
                </select>
              </label>
            )}
          </div>

          {drafts.length === 0 ? (
            <p className="fee-empty">No students selected yet. Choose a class, a section, or one student to build the challan.</p>
          ) : (
            <div className="table-wrap fee-heads-table">
              <table className="min-w-[900px]">
                <thead>
                  <tr>
                    <th>Student</th>
                    {CHALLAN_HEADS.map((key) => <th key={key} className="text-right">{HEAD_LABELS[key]}</th>)}
                    <th className="text-right">Concession</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((draft) => (
                    <tr key={draft.student.id}>
                      <td>
                        <strong>{draft.student.full_name}</strong>
                        <small className="fee-sub">{draft.student.class_name} · {draft.student.section_name}</small>
                      </td>
                      {CHALLAN_HEADS.map((key) => (
                        <td key={key} className="text-right">
                          <input
                            className="fee-head-input"
                            type="number"
                            min="0"
                            step="1"
                            value={draft[key]}
                            onChange={(event) => setHead(draft.student.id, key, event.target.value)}
                          />
                        </td>
                      ))}
                      <td className="text-right">
                        <input
                          className="fee-head-input"
                          type="number"
                          min="0"
                          step="1"
                          value={draft.concession}
                          onChange={(event) => setHead(draft.student.id, 'concession', event.target.value)}
                        />
                      </td>
                      <td className="text-right font-semibold tabular-nums">{formatMoney(headsTotal(draft))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="fee-form-actions">
            <button type="button" className="secondary-button" onClick={() => setPreview(drafts.map(toChallan))} disabled={drafts.length === 0}>
              <Printer size={16} /> Preview
            </button>
            <button type="submit" className="primary-button" disabled={saving || drafts.length === 0}>
              <FileSpreadsheet size={16} /> {saving ? 'Saving…' : `Generate ${drafts.length} challan${drafts.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </form>
      </section>

      {savedChallans.length > 0 && (
        <section className="fee-card">
          <div className="fee-card-head">
            <div><span className="eyebrow">Saved</span><h2>Challans issued for {monthLabel(month)}</h2></div>
            <div className="fee-quick">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setReprint(savedChallans.map((challan) => ({ ...challan, admission_number: admissionFor(challan.student_id) })))}
              >
                <Printer size={16} /> Print all Student Copies
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Challan no.</th><th>Student</th><th>Admission no.</th><th>Due date</th><th className="text-right">Total</th><th>Status</th><th className="no-print" /></tr></thead>
              <tbody>
                {savedChallans.map((challan) => (
                  <tr key={challan.id}>
                    <td className="fee-mono">{challan.challan_number || '—'}</td>
                    <td><strong>{challan.student_name}</strong></td>
                    <td>{admissionFor(challan.student_id) || '—'}</td>
                    <td>{formatDay(challan.due_date)}</td>
                    <td className="text-right font-semibold tabular-nums">{formatMoney(challan.total)}</td>
                    <td><span className={`fee-status ${challan.status}`}>{challan.status}</span></td>
                    <td className="text-right no-print">
                      <button
                        type="button"
                        className="fee-link"
                        onClick={() => setReprint([{ ...challan, admission_number: admissionFor(challan.student_id) }])}
                      >
                        <Printer size={14} /> Print Student Copy
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {preview.length > 0 && <ChallanView challans={preview} settings={paymentSettings} onClose={() => setPreview([])} />}
      {reprint.length > 0 && <ChallanView challans={reprint} settings={paymentSettings} onClose={() => setReprint([])} />}
    </div>
  );
}

export function StructureTab({ structures, isAdmin, paymentSettings, onToast, onSaved }: {
  structures: FeeStructure[];
  isAdmin: boolean;
  paymentSettings: PaymentSettings;
  onToast: (message: string) => void;
  onSaved: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, FeeStructure>>({});
  const [savingClass, setSavingClass] = useState('');

  const rows = CLASS_OPTIONS.map((className) =>
    drafts[className] ?? structures.find((row) => row.class_name === className) ?? emptyStructure(className));

  const update = (className: string, key: keyof FeeStructure, value: string) => {
    const base = drafts[className] ?? structures.find((row) => row.class_name === className) ?? emptyStructure(className);
    const parsed = Number(value);
    setDrafts((current) => ({ ...current, [className]: { ...base, [key]: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0 } }));
  };

  const save = async (row: FeeStructure) => {
    setSavingClass(row.class_name);
    const error = await saveFeeStructure({
      class_name: row.class_name,
      tuition_fee: row.tuition_fee,
      admission_misc: row.admission_misc,
      exam_lab: row.exam_lab,
      transport: row.transport,
      late_fine: row.late_fine,
    });
    setSavingClass('');
    if (error) { onToast(error); return; }
    onToast(`${row.class_name} fee structure saved.`);
    onSaved();
  };

  if (!isAdmin) {
    return (
      <div className="fee-section">
        <PaymentDetailsCard settings={paymentSettings} isAdmin={false} onToast={onToast} onSaved={onSaved} />
        <section className="fee-card">
          <div className="fee-card-head"><div><span className="eyebrow">Fee structure</span><h2>Standard monthly charges</h2></div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Class</th>{STRUCTURE_HEADS.map((key) => <th key={key} className="text-right">{HEAD_LABELS[key]}</th>)}<th className="text-right">Total</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.class_name}>
                    <td><strong>{row.class_name}</strong></td>
                    {STRUCTURE_HEADS.map((key) => <td key={key} className="text-right tabular-nums">{formatMoney(row[key])}</td>)}
                    <td className="text-right font-semibold tabular-nums">
                      {formatMoney(row.tuition_fee + row.admission_misc + row.exam_lab + row.transport)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fee-note">Only an administrator can change these amounts.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="fee-section">
      <PaymentDetailsCard settings={paymentSettings} isAdmin onToast={onToast} onSaved={onSaved} />
      <section className="fee-card">
        <div className="table-wrap">
          <table className="min-w-[820px]">
            <thead>
              <tr>
                <th>Class</th>
                {STRUCTURE_HEADS.map((key) => <th key={key} className="text-right">{HEAD_LABELS[key]}</th>)}
                <th className="text-right">Monthly total</th>
                <th className="no-print" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.class_name}>
                  <td><strong>{row.class_name}</strong></td>
                  {STRUCTURE_HEADS.map((key) => (
                    <td key={key} className="text-right">
                      <input className="fee-head-input" type="number" min="0" step="1" value={row[key]} onChange={(event) => update(row.class_name, key, event.target.value)} />
                    </td>
                  ))}
                  <td className="text-right font-semibold tabular-nums">
                    {formatMoney(row.tuition_fee + row.admission_misc + row.exam_lab + row.transport)}
                  </td>
                  <td className="text-right no-print">
                    <button type="button" className="fee-link" onClick={() => void save(row)} disabled={savingClass === row.class_name}>
                      <Save size={14} /> {savingClass === row.class_name ? 'Saving…' : 'Save'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fee-note">Late fine is added automatically when a fee stays unpaid past the challan due date.</p>
      </section>
    </div>
  );
}

// The Easypaisa and bank details printed on every challan. Read-only for staff who are
// not administrators, because they change what families are told to pay into.
function PaymentDetailsCard({ settings, isAdmin, onToast, onSaved }: {
  settings: PaymentSettings;
  isAdmin: boolean;
  onToast: (message: string) => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<PaymentSettings>(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(settings); }, [settings]);

  const update = (key: keyof PaymentSettings, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const error = await savePaymentSettings(draft);
    setSaving(false);
    if (error) { onToast(error); return; }
    onToast('Payment details saved. They will appear on new challans.');
    onSaved();
  };

  return (
    <section className="fee-card">
      <div className="fee-card-head">
        <div><span className="eyebrow">Payment details</span><h2>Easypaisa and bank account</h2></div>
        <span className="fee-hint">Printed on every challan</span>
      </div>
      <form className="fee-form" onSubmit={save}>
        <div className="fee-form-row">
          <label className="control-field"><span>Easypaisa account no.</span>
            <input value={draft.easypaisa_account_no} onChange={(event) => update('easypaisa_account_no', event.target.value)} placeholder="e.g. 0300 1234567" disabled={!isAdmin} />
          </label>
          <label className="control-field"><span>Easypaisa account title</span>
            <input value={draft.easypaisa_account_name} onChange={(event) => update('easypaisa_account_name', event.target.value)} placeholder="Name on the account" disabled={!isAdmin} />
          </label>
        </div>
        <div className="fee-form-row">
          <label className="control-field"><span>Bank name</span>
            <input value={draft.bank_name} onChange={(event) => update('bank_name', event.target.value)} placeholder="Optional" disabled={!isAdmin} />
          </label>
          <label className="control-field"><span>Bank account no.</span>
            <input value={draft.bank_account_no} onChange={(event) => update('bank_account_no', event.target.value)} placeholder="Optional" disabled={!isAdmin} />
          </label>
        </div>
        {isAdmin ? (
          <div className="fee-form-actions">
            <button type="submit" className="primary-button" disabled={saving}><Save size={16} /> {saving ? 'Saving…' : 'Save payment details'}</button>
          </div>
        ) : (
          <p className="fee-note">Only an administrator can change these details.</p>
        )}
      </form>
    </section>
  );
}

export function ReportsTab({ payments, challans, students, pendingDues, onToast }: {
  payments: FeePayment[];
  challans: FeeChallan[];
  students: Student[];
  pendingDues: number;
  onToast: (message: string) => void;
}) {
  const [month, setMonth] = useState(monthKey());
  const [classFilter, setClassFilter] = useState('');

  const scoped = useMemo(() => payments.filter((payment) => !classFilter || payment.class_name === classFilter), [payments, classFilter]);
  const rows = useMemo(() => dailyTotals(scoped, month), [scoped, month]);
  const methods = methodTotals(scoped, month);
  const total = collectedInMonth(scoped, month);
  const monthChallans = challans.filter((challan) => challan.month === month);
  const billed = monthChallans.reduce((sum, challan) => sum + Number(challan.total), 0);
  const collectedFromChallans = monthChallans.filter((challan) => challan.status === 'paid').reduce((sum, challan) => sum + Number(challan.total), 0);
  const classList = Array.from(new Set(students.map((student) => student.class_name))).sort();

  const exportRows = () => {
    const csv = toCsv([
      ['Ujala Public School — Fee collection report', monthLabel(month), classFilter || 'All classes'],
      [],
      ['Date', 'Receipts', 'Amount (Rs)'],
      ...rows.map((row) => [row.day, row.count, row.amount]),
      [],
      ['Method', 'Amount (Rs)'],
      ...methods.map((entry) => [entry.label, entry.amount]),
      [],
      ['Total collected (Rs)', total],
      ['Pending dues (Rs)', pendingDues],
    ]);
    downloadCsv(`fee-report-${month}.csv`, csv);
    onToast('Fee report exported.');
  };

  return (
    <div className="fee-section">
      <section className="fee-card">
        <div className="fee-card-head">
          <div><span className="eyebrow">Fee reports</span><h2>Collection summary</h2></div>
          <span className="fee-hint">{monthLabel(month)}</span>
        </div>
        <div className="fee-filters">
          <label className="control-field"><span>Fee month</span>
            <select value={month} onChange={(event) => setMonth(event.target.value)}>
              {monthOptions().map((key) => <option key={key} value={key}>{monthLabel(key)}</option>)}
            </select>
          </label>
          <label className="control-field"><span>Class</span>
            <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
              <option value="">All classes</option>
              {classList.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        </div>

        <div className="fee-kpi-grid compact">
          <div className="fee-kpi mint"><div><span>Collected this month</span><strong>{formatMoney(total)}</strong><small>{rows.reduce((sum, row) => sum + row.count, 0)} receipts</small></div></div>
          <div className="fee-kpi sky"><div><span>Billed on challans</span><strong>{formatMoney(billed)}</strong><small>{monthChallans.length} challans issued</small></div></div>
          <div className="fee-kpi sun"><div><span>Paid challans</span><strong>{formatMoney(collectedFromChallans)}</strong><small>{monthChallans.filter((challan) => challan.status === 'paid').length} marked paid</small></div></div>
          <div className="fee-kpi coral"><div><span>Pending dues</span><strong>{formatMoney(pendingDues)}</strong><small>All active students</small></div></div>
        </div>

        <div className="fee-form-actions">
          <button type="button" className="secondary-button" onClick={exportRows}><Download size={16} /> Export CSV</button>
          <button type="button" className="secondary-button" onClick={() => window.print()}><Printer size={16} /> Print</button>
        </div>
      </section>

      <div className="fee-collect-grid">
        <section className="fee-card">
          <div className="fee-card-head"><div><span className="eyebrow">Day by day</span><h2>Daily collection</h2></div></div>
          {rows.length === 0 ? <p className="fee-empty">No fee was collected in this month.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th className="text-right">Receipts</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.day}>
                      <td>{formatDay(row.day)}</td>
                      <td className="text-right tabular-nums">{row.count}</td>
                      <td className="text-right font-semibold tabular-nums">{formatMoney(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td><strong>Total</strong></td><td className="text-right tabular-nums">{rows.reduce((sum, row) => sum + row.count, 0)}</td><td className="text-right font-semibold tabular-nums">{formatMoney(total)}</td></tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        <section className="fee-card">
          <div className="fee-card-head"><div><span className="eyebrow">By method</span><h2>How families paid</h2></div></div>
          <div className="fee-method-list">
            {methods.map((entry) => (
              <div className="fee-method" key={entry.value}>
                <span>{entry.label}</span>
                <i><em style={{ width: `${total > 0 ? (entry.amount / total) * 100 : 0}%` }} /></i>
                <strong>{formatMoney(entry.amount)}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
