import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  BellRing, Coins, FileSpreadsheet, Printer, RefreshCw, Send, Wallet,
} from 'lucide-react';
import { FeeReceiptView } from '@/components/FeeDocuments';
import { FeeScanPanel } from '@/components/FeeScanPanel';
import { ChallanTab, ReportsTab, StructureTab } from '@/components/FeeSetupTabs';
import { fetchAbsenteeSendMode } from '@/lib/absenteeAlerts';
import { todayKey } from '@/lib/attendance';
import { SCHOOL_NAME } from '@/lib/noticeText';
import { queueSmsMessages, updateSmsStatus } from '@/lib/smsLog';
import type { Student } from '@/lib/schoolTypes';
import { useAuth } from '@/lib/auth';
import {
  EMPTY_PAYMENT_SETTINGS, PAYMENT_METHODS, buildFeeSummary, collectedInMonth, collectedOn, fetchChallans,
  fetchFeePayments, fetchFeeStructures, fetchPaymentSettings, formatDay, formatMoney, monthKey, monthLabel,
  monthOptions, recordFeePayment,
  type FeeChallan, type FeePayment, type FeeStructure, type PaymentMethod, type PaymentSettings,
} from '@/lib/fees';
import { pickWhatsAppContact, whatsappNumberWarning } from '@/lib/whatsapp';
import { closeWhatsAppWindow, openWhatsAppChat, primeWhatsAppWindow } from '@/lib/whatsappQueue';

export type FeeTab = 'overview' | 'collection' | 'challan' | 'defaulters' | 'structure' | 'reports';

const TABS: { id: FeeTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'collection', label: 'Fee Collection' },
  { id: 'challan', label: 'Generate Challan' },
  { id: 'defaulters', label: 'Defaulters' },
  { id: 'structure', label: 'Fee Structure' },
  { id: 'reports', label: 'Fee Reports' },
];

function reminderMessage(student: Student, due: number, month: string) {
  return [
    SCHOOL_NAME,
    `Fee reminder — ${monthLabel(month)}`,
    `Dear Parent, the fee account for ${student.full_name} (${student.class_name} · Section ${student.section_name}) has an outstanding balance of ${formatMoney(due)}.`,
    'Kindly clear the dues at the school office at your earliest convenience. Thank you.',
  ].join('\n');
}

function KpiCard({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: string; icon: React.ReactNode }) {
  return (
    <div className={`fee-kpi ${tone}`}>
      <div className="fee-kpi-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

export function FeeManagementPanel({ students, onToast, onRefresh, initialTab = 'overview' }: {
  students: Student[];
  onToast: (message: string) => void;
  onRefresh: () => Promise<void>;
  initialTab?: FeeTab;
}) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [tab, setTab] = useState<FeeTab>(initialTab);
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [challans, setChallans] = useState<FeeChallan[]>([]);
  const [challanMonth, setChallanMonth] = useState(monthKey());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [sendMode, setSendMode] = useState<'web' | 'desktop'>('web');
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(EMPTY_PAYMENT_SETTINGS);

  const today = todayKey();
  const currentMonth = monthKey();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const [structureResult, paymentResult, settingsResult] = await Promise.all([
        fetchFeeStructures(), fetchFeePayments(400), fetchPaymentSettings(),
      ]);
      if (cancelled) return;
      setStructures(structureResult.structures);
      setPayments(paymentResult.payments);
      setPaymentSettings(settingsResult.settings);
      setLoadError(structureResult.error ?? paymentResult.error ?? settingsResult.error ?? '');
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [reloadToken]);

  useEffect(() => {
    let cancelled = false;
    void fetchChallans(challanMonth).then(({ challans: rows, error }) => {
      if (cancelled) return;
      if (error) setLoadError(error);
      else setChallans(rows);
    });
    return () => { cancelled = true; };
  }, [challanMonth, reloadToken]);

  useEffect(() => {
    void fetchAbsenteeSendMode().then((mode) => { if (mode) setSendMode(mode); });
  }, []);

  const reload = () => setReloadToken((token) => token + 1);
  const refreshEverything = async () => { reload(); await onRefresh(); };

  const activeStudents = useMemo(() => students.filter((student) => student.status === 'active'), [students]);
  const classList = useMemo(() => Array.from(new Set(activeStudents.map((student) => student.class_name))).sort(), [activeStudents]);
  const sectionList = useMemo(() => Array.from(new Set(activeStudents.map((student) => student.section_name))).sort(), [activeStudents]);
  const sectionsFor = (className: string) => Array.from(new Set(
    activeStudents.filter((student) => !className || student.class_name === className).map((student) => student.section_name),
  )).sort();
  const structureFor = (student: Student) => structures.find((row) => row.class_name === student.class_name);

  const pendingDues = activeStudents.reduce((total, student) => total + Math.max(0, Number(student.fee_balance ?? 0)), 0);
  const defaulterCount = activeStudents.filter((student) => Number(student.fee_balance ?? 0) > 0).length;
  const collectedToday = collectedOn(payments, today);
  const monthlyCollection = collectedInMonth(payments, currentMonth);

  const lastPaymentFor = (studentId: string) => payments
    .filter((payment) => payment.student_id === studentId)
    .reduce<string | null>((latest, payment) => (!latest || payment.payment_date > latest ? payment.payment_date : latest), null);

  // One reminder can be sent from a row; the batch button sends to everyone on screen.
  const sendReminders = async (targets: Student[]) => {
    if (targets.length === 0) return;
    const senderWindow = primeWhatsAppWindow(sendMode);
    let sent = 0;
    let skipped = 0;
    for (const student of targets) {
      const contact = pickWhatsAppContact(student);
      if (!contact.number) { skipped += 1; continue; }
      const body = reminderMessage(student, Math.max(0, Number(student.fee_balance ?? 0)), currentMonth);
      const { ids, error } = await queueSmsMessages([{
        student_id: student.id,
        student_name: student.full_name,
        class_name: student.class_name,
        section_name: student.section_name,
        parent_phone: contact.number,
        message_type: 'fee_reminder',
        message_body: body,
        attendance_date: today,
      }]);
      if (error) { closeWhatsAppWindow(senderWindow); onToast(error); return; }
      const result = openWhatsAppChat(contact.number, body, sendMode);
      await updateSmsStatus(ids, result.ok ? 'sent' : 'failed', result.ok ? `WhatsApp opened (${sendMode})` : 'WhatsApp window was blocked');
      if (result.ok) sent += 1; else skipped += 1;
    }
    if (sent === 0) closeWhatsAppWindow(senderWindow);
    const note = skipped > 0 ? ` ${skipped} skipped — check the saved contact numbers.` : '';
    onToast(`${sent} fee reminder${sent === 1 ? '' : 's'} sent to WhatsApp.${note}`);
  };

  return (
    <div className="fee-panel">
      <div className="fee-tabs" role="tablist">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            role="tab"
            aria-selected={tab === entry.id}
            className={`fee-tab ${tab === entry.id ? 'on' : ''}`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {loadError && (
        <div className="fee-alert">
          <span>{loadError}</span>
          <button className="secondary-button" onClick={reload}><RefreshCw size={15} /> Try again</button>
        </div>
      )}

      {tab === 'overview' && (
        <OverviewTab
          loading={loading}
          collectedToday={collectedToday}
          monthlyCollection={monthlyCollection}
          pendingDues={pendingDues}
          defaulterCount={defaulterCount}
          currentMonth={currentMonth}
          payments={payments}
          onCollect={() => setTab('collection')}
          onChallan={() => setTab('challan')}
          onDefaulters={() => setTab('defaulters')}
        />
      )}

      {tab === 'collection' && (
        <CollectionTab
          students={activeStudents}
          classList={classList}
          sectionList={sectionList}
          sectionsFor={sectionsFor}
          structureFor={structureFor}
          challans={challans}
          payments={payments}
          loading={loading}
          today={today}
          onToast={onToast}
          onSaved={refreshEverything}
        />
      )}
      {tab === 'defaulters' && (
        <DefaultersTab
          students={activeStudents}
          classList={classList}
          sectionsFor={sectionsFor}
          challans={challans}
          challanMonth={challanMonth}
          setChallanMonth={setChallanMonth}
          lastPaymentFor={lastPaymentFor}
          onSend={sendReminders}
        />
      )}

      {tab === 'challan' && (
        <ChallanTab
          students={activeStudents}
          structures={structures}
          classList={classList}
          sectionsFor={sectionsFor}
          month={challanMonth}
          setMonth={setChallanMonth}
          savedChallans={challans}
          paymentSettings={paymentSettings}
          onToast={onToast}
          onSaved={reload}
        />
      )}

      {tab === 'structure' && (
        <StructureTab structures={structures} isAdmin={isAdmin} paymentSettings={paymentSettings} onToast={onToast} onSaved={reload} />
      )}

      {tab === 'reports' && (
        <ReportsTab
          payments={payments}
          challans={challans}
          students={activeStudents}
          pendingDues={pendingDues}
          onToast={onToast}
        />
      )}
    </div>
  );
}

function OverviewTab({ loading, collectedToday, monthlyCollection, pendingDues, defaulterCount, currentMonth, payments, onCollect, onChallan, onDefaulters }: {
  loading: boolean;
  collectedToday: number;
  monthlyCollection: number;
  pendingDues: number;
  defaulterCount: number;
  currentMonth: string;
  payments: FeePayment[];
  onCollect: () => void;
  onChallan: () => void;
  onDefaulters: () => void;
}) {
  const recent = payments.slice(0, 6);
  return (
    <div className="fee-section">
      <div className="fee-kpi-grid">
        <KpiCard label="Collected today" value={loading ? '—' : formatMoney(collectedToday)} detail="Receipts issued today" tone="mint" icon={<Coins size={20} />} />
        <KpiCard label="Monthly collection" value={loading ? '—' : formatMoney(monthlyCollection)} detail={monthLabel(currentMonth)} tone="sky" icon={<Wallet size={20} />} />
        <KpiCard label="Pending dues" value={loading ? '—' : formatMoney(pendingDues)} detail="Across all active students" tone="sun" icon={<FileSpreadsheet size={20} />} />
        <KpiCard label="Defaulter students" value={loading ? '—' : String(defaulterCount)} detail="With a balance above zero" tone="coral" icon={<BellRing size={20} />} />
      </div>

      <div className="fee-quick">
        <button className="primary-button" onClick={onCollect}><Coins size={16} /> Collect Fee</button>
        <button className="secondary-button" onClick={onChallan}><FileSpreadsheet size={16} /> Generate Challan</button>
        <button className="secondary-button" onClick={onDefaulters}><BellRing size={16} /> View defaulters</button>
      </div>

      <section className="fee-card">
        <div className="fee-card-head">
          <div><span className="eyebrow">Latest activity</span><h2>Recent fee transactions</h2></div>
        </div>
        {loading ? <p className="fee-empty">Loading transactions…</p> : recent.length === 0 ? (
          <p className="fee-empty">No fee payments have been recorded yet. Use Collect Fee to issue the first receipt.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Receipt</th><th>Student</th><th>Class</th><th>Method</th><th className="text-right">Amount</th><th className="text-right">Balance after</th><th>Date</th></tr></thead>
              <tbody>
                {recent.map((payment) => (
                  <tr key={payment.id}>
                    <td className="fee-mono">{payment.receipt_number}</td>
                    <td><strong>{payment.student_name}</strong></td>
                    <td>{payment.class_name ?? '—'} · {payment.section_name ?? '—'}</td>
                    <td className="capitalize">{payment.method}</td>
                    <td className="text-right font-semibold tabular-nums">{formatMoney(payment.amount)}</td>
                    <td className="text-right tabular-nums">{formatMoney(payment.balance_after)}</td>
                    <td>{formatDay(payment.payment_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function CollectionTab({ students, classList, sectionList, sectionsFor, structureFor, challans, payments, loading, today, onToast, onSaved }: {
  students: Student[];
  classList: string[];
  sectionList: string[];
  sectionsFor: (className: string) => string[];
  structureFor: (student: Student) => FeeStructure | undefined;
  challans: FeeChallan[];
  payments: FeePayment[];
  loading: boolean;
  today: string;
  onToast: (message: string) => void;
  onSaved: () => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [studentId, setStudentId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paymentDate, setPaymentDate] = useState(today);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<FeePayment | null>(null);
  const [receiptSummary, setReceiptSummary] = useState<ReturnType<typeof buildFeeSummary> | null>(null);
  const [historyFor, setHistoryFor] = useState<FeePayment | null>(null);

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return students.filter((student) => {
      if (classFilter && student.class_name !== classFilter) return false;
      if (sectionFilter && student.section_name !== sectionFilter) return false;
      if (!needle) return true;
      return [student.full_name, student.admission_number, student.roll_number, student.guardian_name]
        .some((value) => (value ?? '').toLowerCase().includes(needle));
    });
  }, [students, search, classFilter, sectionFilter]);

  const student = students.find((row) => row.id === studentId) ?? null;
  const month = monthKey();
  const paidThisMonth = student
    ? payments.filter((payment) => payment.student_id === student.id && (payment.payment_date ?? '').slice(0, 7) === month)
      .reduce((total, payment) => total + Number(payment.amount), 0)
    : 0;
  const summary = student
    ? buildFeeSummary(student, structureFor(student), challans.find((row) => row.student_id === student.id), paidThisMonth, today)
    : null;
  const remaining = student ? Math.max(0, Number(student.fee_balance ?? 0)) : 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!student) { setError('Choose a student first.'); return; }
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) { setError('Enter an amount greater than zero.'); return; }
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
    const saved: FeePayment = {
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
      student_name: student.full_name,
      class_name: student.class_name,
      section_name: student.section_name,
      admission_number: student.admission_number,
    };
    setReceiptSummary(summary);
    setReceipt(saved);
    setAmount('');
    setReceiptNumber('');
    setRemarks('');
    onToast(`Receipt ${result.receiptNumber} saved for ${student.full_name}.`);
    await onSaved();
  };

  const studentHistory = student
    ? payments.filter((payment) => payment.student_id === student.id).slice(0, 12)
    : payments.slice(0, 12);

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
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, admission or GR no., roll no." />
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
              {(classFilter ? sectionsFor(classFilter) : sectionList).map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        </div>
        <div className="fee-picker">
          {loading && <p className="fee-empty">Loading students…</p>}
          {!loading && matches.length === 0 && <p className="fee-empty">No student matches these filters.</p>}
          {!loading && matches.slice(0, 40).map((row) => (
            <button
              key={row.id}
              type="button"
              className={`fee-pick ${studentId === row.id ? 'on' : ''}`}
              onClick={() => { setStudentId(row.id); setError(''); }}
            >
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
                <label className="control-field"><span>Receipt no. (leave blank to generate)</span>
                  <input value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value)} placeholder="Auto" maxLength={40} />
                </label>
                <label className="control-field full"><span>Remarks</span>
                  <input value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Optional note for the receipt" />
                </label>
              </div>
              <div className="fee-form-actions">
                {remaining > 0 && (
                  <button type="button" className="secondary-button" onClick={() => setAmount(String(Math.round(remaining)))}>Full payment</button>
                )}
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
          <div><span className="eyebrow">History</span><h2>{student ? `Fee transactions · ${student.full_name}` : 'Recent fee transactions'}</h2></div>
        </div>
        {studentHistory.length === 0 ? (
          <p className="fee-empty">No payments recorded for this student yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Receipt</th><th>Student</th><th>Date</th><th>Method</th><th className="text-right">Amount</th><th className="text-right">Balance after</th><th className="no-print" /></tr></thead>
              <tbody>
                {studentHistory.map((payment) => (
                  <tr key={payment.id}>
                    <td className="fee-mono">{payment.receipt_number}</td>
                    <td><strong>{payment.student_name}</strong></td>
                    <td>{formatDay(payment.payment_date)}</td>
                    <td className="capitalize">{payment.method}</td>
                    <td className="text-right font-semibold tabular-nums">{formatMoney(payment.amount)}</td>
                    <td className="text-right tabular-nums">{formatMoney(payment.balance_after)}</td>
                    <td className="text-right no-print">
                      <button type="button" className="fee-link" onClick={() => setHistoryFor(payment)}><Printer size={14} /> {payment.challan_number ? 'Receipt · challan' : 'Receipt'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {receipt && (
        <FeeReceiptView
          payment={receipt}
          student={student}
          summary={receiptSummary}
          onClose={() => setReceipt(null)}
        />
      )}
      {historyFor && (
        <FeeReceiptView
          payment={historyFor}
          student={students.find((row) => row.id === historyFor.student_id) ?? null}
          summary={null}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  );
}

function DefaultersTab({ students, classList, sectionsFor, challans, challanMonth, setChallanMonth, lastPaymentFor, onSend }: {
  students: Student[];
  classList: string[];
  sectionsFor: (className: string) => string[];
  challans: FeeChallan[];
  challanMonth: string;
  setChallanMonth: (month: string) => void;
  lastPaymentFor: (studentId: string) => string | null;
  onSend: (targets: Student[]) => Promise<void>;
}) {
  const [classFilter, setClassFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sendingId, setSendingId] = useState('');

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return students
      .filter((student) => Number(student.fee_balance ?? 0) > 0)
      .filter((student) => !classFilter || student.class_name === classFilter)
      .filter((student) => !sectionFilter || student.section_name === sectionFilter)
      .filter((student) => !needle || `${student.full_name} ${student.admission_number}`.toLowerCase().includes(needle))
      .map((student) => {
        const challan = challans.find((row) => row.student_id === student.id);
        return {
          student,
          due: Math.max(0, Number(student.fee_balance ?? 0)),
          lastPayment: lastPaymentFor(student.id),
          challan,
        };
      })
      .sort((a, b) => b.due - a.due);
  }, [students, classFilter, sectionFilter, search, challans, lastPaymentFor]);

  const totalDue = rows.reduce((total, row) => total + row.due, 0);

  const runBatch = async () => {
    setSendingId('batch');
    await onSend(rows.map((row) => row.student));
    setSendingId('');
  };

  const sendOne = async (student: Student) => {
    setSendingId(student.id);
    await onSend([student]);
    setSendingId('');
  };

  return (
    <div className="fee-section">
      <section className="fee-card">
        <div className="fee-card-head">
          <div><span className="eyebrow">Follow-up</span><h2>Outstanding balances</h2></div>
          <span className="fee-hint">{rows.length} students · {formatMoney(totalDue)} pending</span>
        </div>
        <div className="fee-filters">
          <label className="control-field"><span>Fee month</span>
            <select value={challanMonth} onChange={(event) => setChallanMonth(event.target.value)}>
              {monthOptions().map((key) => <option key={key} value={key}>{monthLabel(key)}</option>)}
            </select>
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
              {(classFilter ? sectionsFor(classFilter) : Array.from(new Set(students.map((student) => student.section_name))).sort()).map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="control-field"><span>Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or admission no." />
          </label>
        </div>
        <div className="fee-quick">
          <button className="primary-button" onClick={() => void runBatch()} disabled={sendingId !== '' || rows.length === 0}>
            <Send size={16} /> {sendingId === 'batch' ? 'Sending…' : `Send reminders to ${rows.length}`}
          </button>
        </div>
      </section>

      <section className="fee-card">
        {rows.length === 0 ? (
          <p className="fee-empty">Every student in this filter has cleared their dues. Nothing to follow up.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Student</th><th>Class</th><th className="text-right">Due amount</th><th>Last payment</th><th>Challan status</th><th className="no-print" /></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.student.id}>
                    <td>
                      <strong>{row.student.full_name}</strong>
                      <small className="fee-sub">{row.student.admission_number} · Guardian {row.student.guardian_phone}</small>
                    </td>
                    <td>{row.student.class_name} · {row.student.section_name}</td>
                    <td className="text-right font-semibold tabular-nums">{formatMoney(row.due)}</td>
                    <td>{row.lastPayment ? formatDay(row.lastPayment) : 'No payment yet'}</td>
                    <td>
                      <span className={`fee-status ${row.challan ? row.challan.status : 'none'}`}>
                        {row.challan ? row.challan.status : 'No challan'}
                      </span>
                    </td>
                    <td className="text-right no-print">
                      <button type="button" className="fee-link" onClick={() => void sendOne(row.student)} disabled={sendingId !== ''}>
                        <BellRing size={14} /> {sendingId === row.student.id ? 'Sending…' : 'Send reminder'}
                      </button>
                      {whatsappNumberWarning(row.student) && (
                        <small className="fee-warn" title={whatsappNumberWarning(row.student)}>Check contact no.</small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
