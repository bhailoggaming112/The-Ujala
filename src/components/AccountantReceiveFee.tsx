import { useMemo, useState, type FormEvent } from 'react';
import { Coins, Printer, RotateCcw, Wallet } from 'lucide-react';
import { FeeReceiptView } from '@/components/FeeDocuments';
import { FeeScanPanel } from '@/components/FeeScanPanel';
import { VoidPaymentModal } from '@/components/VoidPaymentModal';
import {
  PAYMENT_METHODS, buildFeeSummary, formatDay, formatMoney, monthKey,
  recordFeePayment, type FeePayment, type FeeStructure, type PaymentMethod,
} from '@/lib/fees';
import type { Student } from '@/lib/schoolTypes';

// The accountant's day-to-day screen: find a student, take a full or partial payment,
// print or reprint the receipt, and reverse a receipt that was recorded in error.
export function AccountantReceiveFee({ students, structures, payments, loading, today, onToast, onSaved, preselect }: {
  students: Student[];
  structures: FeeStructure[];
  payments: FeePayment[];
  loading: boolean;
  today: string;
  onToast: (message: string) => void;
  onSaved: () => Promise<void>;
  preselect: string | null;
}) {
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [studentId, setStudentId] = useState(preselect ?? '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paymentDate, setPaymentDate] = useState(today);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<FeePayment | null>(null);
  const [receiptSummary, setReceiptSummary] = useState<ReturnType<typeof buildFeeSummary> | null>(null);
  const [reprinting, setReprinting] = useState<FeePayment | null>(null);
  const [voiding, setVoiding] = useState<FeePayment | null>(null);

  const classList = useMemo(() => Array.from(new Set(students.map((student) => student.class_name))).sort(), [students]);
  const sectionList = useMemo(() => Array.from(new Set(
    students.filter((student) => !classFilter || student.class_name === classFilter).map((student) => student.section_name),
  )).sort(), [students, classFilter]);

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return students.filter((student) => {
      if (classFilter && student.class_name !== classFilter) return false;
      if (sectionFilter && student.section_name !== sectionFilter) return false;
      if (!needle) return true;
      return [student.full_name, student.admission_number, student.roll_number, student.guardian_name, student.guardian_phone]
        .some((value) => (value ?? '').toLowerCase().includes(needle));
    });
  }, [students, search, classFilter, sectionFilter]);

  const student = students.find((row) => row.id === studentId) ?? null;
  const month = monthKey();
  const paidThisMonth = student
    ? payments.filter((payment) => payment.student_id === student.id && !payment.voided && (payment.payment_date ?? '').slice(0, 7) === month)
      .reduce((total, payment) => total + Number(payment.amount), 0)
    : 0;
  const summary = student
    ? buildFeeSummary(student, structures.find((row) => row.class_name === student.class_name), undefined, paidThisMonth, today)
    : null;
  const remaining = student ? Math.max(0, Number(student.fee_balance ?? 0)) : 0;

  const history = (student ? payments.filter((payment) => payment.student_id === student.id) : payments).slice(0, 15);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!student) { setError('Choose a student first.'); return; }
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) { setError('Enter an amount greater than zero.'); return; }
    if (parsed > 1000000) { setError('That amount is larger than this form accepts.'); return; }
    if (paymentDate > today) { setError('The payment date cannot be in the future.'); return; }
    setSaving(true);
    setError('');
    const result = await recordFeePayment({
      studentId: student.id,
      amount: parsed,
      method,
      paymentDate,
      remarks: remarks.trim(),
      receiptNumber: receiptNumber.trim(),
    });
    setSaving(false);
    if (result.error) { setError(result.error); return; }
    setReceiptSummary(summary);
    setReceipt({
      id: `local-${result.receiptNumber}`,
      student_id: student.id,
      receipt_number: result.receiptNumber,
      amount: parsed,
      method,
      payment_date: paymentDate,
      remarks: remarks.trim() || null,
      balance_after: result.balanceAfter,
      created_at: new Date().toISOString(),
      challan_id: null,
      challan_number: null,
      source: 'manual',
      voided: false,
      voided_at: null,
      void_reason: null,
      student_name: student.full_name,
      class_name: student.class_name,
      section_name: student.section_name,
      admission_number: student.admission_number,
    });
    setAmount('');
    setReceiptNumber('');
    setRemarks('');
    onToast(`Receipt ${result.receiptNumber} saved for ${student.full_name}.`);
    await onSaved();
  };

  return (
    <div className="fee-section">
      <FeeScanPanel today={today} onToast={onToast} onPaid={onSaved} />

      <section className="fee-card">
        <div className="fee-card-head">
          <div><span className="eyebrow">Step 1</span><h2>Find the student</h2></div>
          <span className="fee-hint">{matches.length} students match</span>
        </div>
        <div className="fee-filters">
          <label className="control-field"><span>Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, admission no., roll no. or phone" />
          </label>
          <label className="control-field"><span>Class</span>
            <select value={classFilter} onChange={(event) => { setClassFilter(event.target.value); setSectionFilter(''); }}>
              <option value="">All classes</option>
              {classList.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="control-field"><span>Section</span>
            <select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)}>
              <option value="">All sections</option>
              {sectionList.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        </div>
        <div className="fee-picker">
          {loading && <p className="fee-empty">Loading students…</p>}
          {!loading && matches.length === 0 && <p className="fee-empty">No student matches these filters.</p>}
          {!loading && matches.slice(0, 40).map((row) => (
            <button key={row.id} type="button" className={`fee-pick ${studentId === row.id ? 'on' : ''}`} onClick={() => { setStudentId(row.id); setError(''); }}>
              <strong>{row.full_name}</strong>
              <span>{row.class_name} · Section {row.section_name} · {row.admission_number}</span>
              <em className={Number(row.fee_balance ?? 0) > 0 ? 'due' : 'clear'}>
                {Number(row.fee_balance ?? 0) > 0 ? formatMoney(Number(row.fee_balance ?? 0)) : 'Cleared'}
              </em>
            </button>
          ))}
        </div>
      </section>

      {student && summary && (
        <div className="fee-collect-grid">
          <section className="fee-card">
            <div className="fee-card-head">
              <div><span className="eyebrow">Step 2</span><h2>{student.full_name}</h2><p className="fee-sub">{student.class_name} · Section {student.section_name} · {student.admission_number}</p></div>
            </div>
            <dl className="fee-summary">
              <div><dt>Previous arrears</dt><dd>{formatMoney(summary.previousArrears)}</dd></div>
              <div><dt>Current monthly fee</dt><dd>{formatMoney(summary.currentMonthlyFee)}</dd></div>
              <div><dt>Concession</dt><dd className="credit">−{formatMoney(summary.concession)}</dd></div>
              <div><dt>Fine</dt><dd>{formatMoney(summary.fine)}</dd></div>
              <div className="strong"><dt>Total payable</dt><dd>{formatMoney(summary.totalPayable)}</dd></div>
              <div><dt>Paid this month</dt><dd className="credit">{formatMoney(summary.paid)}</dd></div>
              <div className="strong"><dt>Remaining balance</dt><dd>{formatMoney(remaining)}</dd></div>
            </dl>
          </section>

          <section className="fee-card">
            <div className="fee-card-head">
              <div><span className="eyebrow">Step 3</span><h2>Record the payment</h2></div>
            </div>
            <form className="fee-form" onSubmit={submit}>
              <label className="control-field"><span>Amount received (Rs)</span>
                <input type="number" min="1" step="1" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={remaining > 0 ? String(Math.round(remaining)) : 'e.g. 2500'} required />
              </label>
              <div className="fee-filters">
                <label className="control-field"><span>Payment date</span>
                  <input type="date" max={today} value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required />
                </label>
                <label className="control-field"><span>Payment method</span>
                  <select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
                    {PAYMENT_METHODS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
                  </select>
                </label>
                <label className="control-field"><span>Receipt no. (blank generates one)</span>
                  <input value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value)} placeholder="Auto" maxLength={40} />
                </label>
                <label className="control-field full"><span>Payment note</span>
                  <input value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Optional note stored with the receipt" maxLength={200} />
                </label>
              </div>
              <div className="fee-form-actions">
                {remaining > 0 && <button type="button" className="secondary-button" onClick={() => setAmount(String(Math.round(remaining)))}>Full payment</button>}
                <button type="button" className="secondary-button" onClick={() => setAmount(String(Math.round(remaining / 2)))} disabled={remaining <= 0}>Half</button>
                <button type="submit" className="primary-button" disabled={saving}><Coins size={16} /> {saving ? 'Saving…' : 'Save payment'}</button>
              </div>
              {error && <p className="fee-error">{error}</p>}
            </form>
          </section>
        </div>
      )}

      <section className="fee-card">
        <div className="fee-card-head">
          <div><span className="eyebrow">History</span><h2>{student ? `Payment history · ${student.full_name}` : 'Recent payment transactions'}</h2></div>
        </div>
        {history.length === 0 ? (
          <p className="fee-empty">No payments recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Receipt</th><th>Student</th><th>Date</th><th>Method</th><th className="text-right">Amount</th><th>Status</th><th className="no-print" /></tr></thead>
              <tbody>
                {history.map((payment) => (
                  <tr key={payment.id} className={payment.voided ? 'acct-void-row' : ''}>
                    <td className="fee-mono">{payment.receipt_number}</td>
                    <td><strong>{payment.student_name}</strong></td>
                    <td>{formatDay(payment.payment_date)}</td>
                    <td className="capitalize">{payment.method}</td>
                    <td className="text-right font-semibold tabular-nums">{formatMoney(payment.amount)}</td>
                    <td>{payment.voided ? <span className="fee-status unpaid">Reversed</span> : <span className="fee-status paid">Recorded</span>}</td>
                    <td className="text-right no-print">
                      <div className="fee-row-actions">
                        <button type="button" className="fee-link" onClick={() => setReprinting(payment)}><Printer size={14} /> Reprint</button>
                        {!payment.voided && <button type="button" className="fee-link danger" onClick={() => setVoiding(payment)}><RotateCcw size={14} /> Reverse</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {receipt && <FeeReceiptView payment={receipt} student={student} summary={receiptSummary} onClose={() => setReceipt(null)} />}
      {reprinting && (
        <FeeReceiptView
          payment={reprinting}
          student={students.find((row) => row.id === reprinting.student_id) ?? null}
          summary={null}
          onClose={() => setReprinting(null)}
        />
      )}
      {voiding && (
        <VoidPaymentModal
          payment={voiding}
          onClose={() => setVoiding(null)}
          onDone={async (message) => { onToast(message); await onSaved(); }}
        />
      )}

      {!student && !loading && (
        <p className="fee-hint"><Wallet size={14} /> Pick a student above to see their balance and record a payment.</p>
      )}
    </div>
  );
}
