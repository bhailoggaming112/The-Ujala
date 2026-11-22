import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Coins, Minus, Pencil, RefreshCw, Save, Search, Send, Trash2, X,
} from 'lucide-react';
import {
  formatDay, formatMoney, monthKey, monthlyChargeFor,
  type FeePayment, type FeeStructure,
} from '@/lib/fees';
import {
  ADJUSTMENT_TYPES, adjustmentLabel, createFeeAdjustment, deleteFeeAdjustment,
  fetchAdjustmentsForStudent, fetchRecentAdjustments, findSiblingGroups, setFeeOpeningBalance,
  type AdjustmentType, type FeeAdjustment,
} from '@/lib/feeAdjustments';
import { whatsappNumberWarning, type AlertSendMode } from '@/lib/whatsapp';
import { todayKey } from '@/lib/attendance';
import type { Student } from '@/lib/schoolTypes';

const SEND_MODE_OPTIONS: { value: AlertSendMode; label: string }[] = [
  { value: 'app', label: 'Desktop App' },
  { value: 'web', label: 'WhatsApp Web' },
  { value: 'wa.me', label: 'WhatsApp Link' },
];

const adjustmentSign = (type: AdjustmentType, amount: number) => {
  const direction = ADJUSTMENT_TYPES.find((entry) => entry.value === type)?.direction ?? 'reduce';
  if (direction === 'either') return amount;
  return -Math.abs(amount);
};

// A searchable student picker shared by the adjustment and opening-balance screens.
function useStudentPicker(students: Student[]) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const selected = students.find((student) => student.id === selectedId) ?? null;
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const digits = needle.replace(/\D/g, '');
    return students
      .filter((student) =>
        student.full_name.toLowerCase().includes(needle)
        || (student.admission_number ?? '').toLowerCase().includes(needle)
        || (digits && (student.admission_number ?? '').replace(/\D/g, '').includes(digits))
        || (student.guardian_phone ?? '').replace(/\D/g, '').includes(digits || needle.replace(/\D/g, '')))
      .slice(0, 8);
  }, [students, query]);
  return { query, setQuery, selectedId, setSelectedId, selected, matches };
}

// The roster is passed in; every new tab reloads it through onSaved so a balance the
// database recomputed is reflected everywhere.
export function AdjustmentTab({ students, onToast, onSaved }: {
  students: Student[];
  onToast: (message: string) => void;
  onSaved: () => Promise<void>;
}) {
  const picker = useStudentPicker(students);
  const [type, setType] = useState<AdjustmentType>('concession');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(todayKey());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState<FeeAdjustment[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [deletingId, setDeletingId] = useState('');

  const studentById = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);

  const loadRecent = async () => {
    setLoadingRecent(true);
    const result = await fetchRecentAdjustments();
    setLoadingRecent(false);
    if (result.error) { onToast(result.error); return; }
    setRecent(result.adjustments);
  };

  useEffect(() => {
    void loadRecent();
    // The recent list is fetched once on mount; loadRecent is stable enough for this purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!picker.selected) { setError('Choose a student first.'); return; }
    const parsed = Math.abs(Number(amount));
    if (!Number.isFinite(parsed) || parsed <= 0) { setError('Enter an amount greater than zero.'); return; }
    setSaving(true);
    setError('');
    const result = await createFeeAdjustment({
      studentId: picker.selected.id,
      adjustmentType: type,
      amount: adjustmentSign(type, parsed),
      reason,
      effectiveDate,
    });
    setSaving(false);
    if (result.error) { setError(result.error); return; }
    onToast(`${adjustmentLabel(type)} of ${formatMoney(parsed)} posted for ${picker.selected.full_name}.`);
    setAmount('');
    setReason('');
    picker.setSelectedId('');
    picker.setQuery('');
    await loadRecent();
    await onSaved();
  };

  const removeAdjustment = async (row: FeeAdjustment) => {
    setDeletingId(row.id);
    const err = await deleteFeeAdjustment(row.id);
    setDeletingId('');
    if (err) { onToast(err); return; }
    onToast('Adjustment removed and the balance recalculated.');
    await loadRecent();
    await onSaved();
  };

  const totalReduced = recent.filter((row) => row.amount < 0).reduce((sum, row) => sum + Math.abs(row.amount), 0);
  const totalAdded = recent.filter((row) => row.amount > 0).reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="fee-section">
      <div className="fee-kpi-grid compact">
        <div className="fee-kpi mint"><div><span>Concessions & discounts</span><strong>{formatMoney(totalReduced)}</strong><small>Across the latest adjustments</small></div></div>
        <div className="fee-kpi coral"><div><span>Corrections added</span><strong>{formatMoney(totalAdded)}</strong><small>Amounts put back on accounts</small></div></div>
        <div className="fee-kpi sky"><div><span>Adjustments posted</span><strong>{recent.length}</strong><small>Most recent first</small></div></div>
      </div>

      <section className="fee-card">
        <div className="fee-card-head">
          <div><span className="eyebrow">New adjustment</span><h2>Reduce or correct a student's dues</h2></div>
          <span className="fee-hint">Updates the balance immediately</span>
        </div>
        <form className="fee-form" onSubmit={submit}>
          <div className="fee-form-group">
            <p className="fee-form-group-label">Student</p>
            <div className="fee-filters">
              <label className="control-field"><span>Find a student</span>
                <input value={picker.query} onChange={(event) => picker.setQuery(event.target.value)} placeholder="Name, admission no. or phone" autoComplete="off" />
              </label>
              <label className="control-field"><span>Selected</span>
                <input readOnly value={picker.selected ? `${picker.selected.full_name} · ${picker.selected.class_name}` : 'No student selected'} className="fee-readonly" />
              </label>
            </div>
            {picker.query.trim() && (
              <div className="fee-quick-pick">
                {picker.matches.length === 0 ? <p className="fee-empty">No students match "{picker.query}".</p> : picker.matches.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    className={`fee-quick-pick-row ${picker.selectedId === student.id ? 'selected' : ''}`}
                    onClick={() => { picker.setSelectedId(student.id); picker.setQuery(''); }}
                  >
                    <span className="fee-quick-pick-name">{student.full_name}</span>
                    <span className="fee-quick-pick-meta">{student.class_name} · {student.section_name} · {student.admission_number}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="fee-form-group">
            <p className="fee-form-group-label">Adjustment</p>
            <div className="fee-segmented-wrap">
              <div className="segmented-control fee-segmented">
                {ADJUSTMENT_TYPES.map((entry) => (
                  <button key={entry.value} type="button" className={type === entry.value ? 'selected' : ''} onClick={() => setType(entry.value)}>{entry.label}</button>
                ))}
              </div>
              <small className="fee-hint">{ADJUSTMENT_TYPES.find((entry) => entry.value === type)?.hint}</small>
            </div>
            <div className="fee-form-row">
              <label className="control-field"><span>Amount (Rs)</span>
                <input type="number" min="0" step="1" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" required />
              </label>
              <label className="control-field"><span>Effective date</span>
                <input type="date" value={effectiveDate} max={todayKey()} onChange={(event) => setEffectiveDate(event.target.value)} required />
              </label>
            </div>
            <label className="control-field full"><span>Reason</span>
              <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why this adjustment is being made" maxLength={200} />
            </label>
          </div>

          {error && <p className="fee-error">{error}</p>}

          <div className="fee-form-actions">
            <button type="submit" className="primary-button" disabled={saving}>
              <Save size={16} /> {saving ? 'Posting…' : 'Post adjustment'}
            </button>
            {picker.selected && (
              <span className="fee-tally-inline">
                Current balance <strong>{formatMoney(Math.max(0, Number(picker.selected.fee_balance ?? 0)))}</strong>
              </span>
            )}
          </div>
        </form>
      </section>

      <section className="fee-card">
        <div className="fee-card-head">
          <div><span className="eyebrow">History</span><h2>Recent adjustments</h2></div>
          <button type="button" className="secondary-button" onClick={() => void loadRecent()} disabled={loadingRecent}><RefreshCw size={15} /> Refresh</button>
        </div>
        {loadingRecent ? <p className="fee-empty">Loading adjustments…</p> : recent.length === 0 ? (
          <p className="fee-empty">No adjustments have been posted yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Student</th><th>Type</th><th>Reason</th><th className="text-right">Amount</th><th>Effective</th><th className="no-print" /></tr></thead>
              <tbody>
                {recent.map((row) => {
                  const student = studentById.get(row.student_id);
                  return (
                    <tr key={row.id}>
                      <td><strong>{student?.full_name ?? 'Student'}</strong><small className="fee-sub">{student ? `${student.class_name} · ${student.section_name}` : ''}</small></td>
                      <td><span className="fee-status neutral">{adjustmentLabel(row.adjustment_type)}</span></td>
                      <td>{row.reason || '—'}</td>
                      <td className={`text-right font-semibold tabular-nums ${row.amount < 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {row.amount < 0 ? '−' : '+'}{formatMoney(Math.abs(row.amount))}
                      </td>
                      <td>{formatDay(row.effective_date)}</td>
                      <td className="text-right no-print">
                        <button type="button" className="fee-link danger" onClick={() => void removeAdjustment(row)} disabled={deletingId === row.id}>
                          <Trash2 size={14} /> {deletingId === row.id ? 'Removing…' : 'Remove'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function SiblingsTab({ students, onSend, sendMode, onSendModeChange }: {
  students: Student[];
  onSend: (targets: Student[]) => Promise<void>;
  sendMode: AlertSendMode;
  onSendModeChange: (mode: AlertSendMode) => void;
}) {
  const [search, setSearch] = useState('');
  const [sendingKey, setSendingKey] = useState('');
  const groups = useMemo(() => findSiblingGroups(students), [students]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return groups;
    return groups.filter((group) => group.students.some((student) =>
      student.full_name.toLowerCase().includes(needle)
      || (student.admission_number ?? '').toLowerCase().includes(needle)
      || (student.guardian_name || student.fathers_name || '').toLowerCase().includes(needle)));
  }, [groups, search]);

  const totalFamilies = groups.length;
  const totalStudents = groups.reduce((sum, group) => sum + group.students.length, 0);
  const totalBalance = groups.reduce((sum, group) => sum + group.combinedBalance, 0);

  const remindFamily = async (group: typeof groups[number]) => {
    setSendingKey(group.key);
    await onSend(group.students);
    setSendingKey('');
  };

  return (
    <div className="fee-section">
      <div className="fee-kpi-grid compact">
        <div className="fee-kpi mint"><div><span>Families with siblings</span><strong>{totalFamilies}</strong><small>Grouped by shared parent details</small></div></div>
        <div className="fee-kpi sky"><div><span>Students in a family group</span><strong>{totalStudents}</strong><small>Brothers and sisters on the roll</small></div></div>
        <div className="fee-kpi coral"><div><span>Combined family dues</span><strong>{formatMoney(totalBalance)}</strong><small>Across all sibling groups</small></div></div>
      </div>

      <section className="fee-card">
        <div className="fee-card-head">
          <div><span className="eyebrow">Brother & sister</span><h2>Families on the roll</h2></div>
          <span className="fee-hint">Matched on guardian phone, CNIC or name</span>
        </div>
        <div className="fee-filters">
          <label className="control-field"><span>Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Student, admission no. or guardian" />
          </label>
          <div className="segmented-control compact fee-sendmode">
            {SEND_MODE_OPTIONS.map((option) => (
              <button key={option.value} type="button" className={sendMode === option.value ? 'selected' : ''} onClick={() => onSendModeChange(option.value)}>{option.label}</button>
            ))}
          </div>
        </div>
      </section>

      {filtered.length === 0 ? (
        <section className="fee-card"><p className="fee-empty">No sibling groups found. Add a guardian phone, CNIC or shared father name to the student records to link brothers and sisters.</p></section>
      ) : filtered.map((group) => (
        <section className="fee-card" key={group.key}>
          <div className="fee-card-head">
            <div>
              <span className="eyebrow">{group.students.length} students · {group.reason}</span>
              <h2>{group.students[0].guardian_name || group.students[0].fathers_name || 'Family account'}</h2>
            </div>
            <div className="fee-quick">
              <span className="fee-hint">Combined dues <strong>{formatMoney(group.combinedBalance)}</strong></span>
              <button type="button" className="primary-button" onClick={() => void remindFamily(group)} disabled={sendingKey !== ''}>
                <Send size={15} /> {sendingKey === group.key ? 'Sending…' : 'Remind family'}
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Student</th><th>Class</th><th>Admission no.</th><th className="text-right">Balance</th><th>Contact</th></tr></thead>
              <tbody>
                {group.students.map((student) => (
                  <tr key={student.id}>
                    <td><strong>{student.full_name}</strong><small className="fee-sub">{student.guardian_name || student.fathers_name || '—'}</small></td>
                    <td>{student.class_name} · {student.section_name}</td>
                    <td className="fee-mono">{student.admission_number}</td>
                    <td className={`text-right font-semibold tabular-nums ${Number(student.fee_balance ?? 0) > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{formatMoney(Math.max(0, Number(student.fee_balance ?? 0)))}</td>
                    <td>{student.guardian_phone || student.father_contact_number || '—'}{whatsappNumberWarning(student) && <small className="fee-warn">{whatsappNumberWarning(student)}</small>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

type LedgerStatus = 'all' | 'paid' | 'partial' | 'unpaid';

export function LedgerTab({ students, structures, payments, loading, onToast, onCollect }: {
  students: Student[];
  structures: FeeStructure[];
  payments: FeePayment[];
  loading: boolean;
  onToast: (message: string) => void;
  onCollect: (studentId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<LedgerStatus>('all');
  const [openStudent, setOpenStudent] = useState<Student | null>(null);
  const month = monthKey();

  const classList = useMemo(() => Array.from(new Set(students.map((student) => student.class_name))).sort(), [students]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return students
      .map((student) => {
        const structure = structures.find((row) => row.class_name === student.class_name);
        const { currentMonthlyFee } = monthlyChargeFor(student, structure);
        const own = payments.filter((payment) => payment.student_id === student.id && !payment.voided);
        const paidThisMonth = own.filter((payment) => (payment.payment_date ?? '').slice(0, 7) === month).reduce((sum, payment) => sum + Number(payment.amount), 0);
        const paidTotal = own.reduce((sum, payment) => sum + Number(payment.amount), 0);
        const balance = Math.max(0, Number(student.fee_balance ?? 0));
        const opening = Math.max(0, Number(student.fee_opening_balance ?? 0));
        const lastPayment = own.reduce<string | null>((latest, payment) => (!latest || payment.payment_date > latest ? payment.payment_date : latest), null);
        return {
          student, monthlyFee: currentMonthlyFee, paidThisMonth, paidTotal, balance, opening, lastPayment,
          status: (balance <= 0 ? 'paid' : paidThisMonth > 0 ? 'partial' : 'unpaid') as Exclude<LedgerStatus, 'all'>,
        };
      })
      .filter((row) => {
        if (classFilter && row.student.class_name !== classFilter) return false;
        if (statusFilter !== 'all' && row.status !== statusFilter) return false;
        if (!needle) return true;
        return [row.student.full_name, row.student.admission_number, row.student.guardian_name, row.student.guardian_phone]
          .some((value) => (value ?? '').toLowerCase().includes(needle));
      })
      .sort((a, b) => b.balance - a.balance);
  }, [students, structures, payments, month, search, classFilter, statusFilter]);

  const totals = rows.reduce((acc, row) => ({
    fee: acc.fee + row.monthlyFee,
    paid: acc.paid + row.paidThisMonth,
    balance: acc.balance + row.balance,
  }), { fee: 0, paid: 0, balance: 0 });

  return (
    <div className="fee-section">
      <section className="fee-card">
        <div className="fee-card-head">
          <div><span className="eyebrow">Students fee ledger</span><h2>{rows.length} students · {formatMoney(totals.balance)} outstanding</h2></div>
        </div>
        <div className="fee-filters">
          <label className="control-field"><span>Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, admission no., guardian or phone" />
          </label>
          <label className="control-field"><span>Class</span>
            <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
              <option value="">All classes</option>
              {classList.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="control-field"><span>Payment status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as LedgerStatus)}>
              <option value="all">All students</option>
              <option value="paid">Fully paid</option>
              <option value="partial">Partial payment</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </label>
        </div>
        <div className="acct-mini-stats">
          <div><span>Monthly fee</span><strong>{formatMoney(totals.fee)}</strong></div>
          <div><span>Collected this month</span><strong className="text-emerald-700">{formatMoney(totals.paid)}</strong></div>
          <div><span>Outstanding</span><strong className="text-rose-600">{formatMoney(totals.balance)}</strong></div>
        </div>
      </section>

      <section className="fee-card">
        {loading ? <p className="fee-empty">Loading the ledger…</p> : rows.length === 0 ? (
          <p className="fee-empty">No students match these filters. Try clearing the search or choosing another class.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th><th>Class</th><th className="text-right">Monthly fee</th>
                  <th className="text-right">Opening</th><th className="text-right">Paid this month</th>
                  <th className="text-right">Balance</th><th>Status</th><th>Last payment</th><th className="no-print" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.student.id}>
                    <td><strong>{row.student.full_name}</strong><small className="fee-sub">{row.student.admission_number}</small></td>
                    <td>{row.student.class_name} · {row.student.section_name}</td>
                    <td className="text-right tabular-nums">{formatMoney(row.monthlyFee)}</td>
                    <td className="text-right tabular-nums">{row.opening > 0 ? formatMoney(row.opening) : '—'}</td>
                    <td className="text-right tabular-nums">{formatMoney(row.paidThisMonth)}</td>
                    <td className={`text-right font-semibold tabular-nums ${row.balance > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{formatMoney(row.balance)}</td>
                    <td><span className={`fee-status ${row.status}`}>{row.status === 'paid' ? 'Paid' : row.status === 'partial' ? 'Partial' : 'Unpaid'}</span></td>
                    <td>{row.lastPayment ? formatDay(row.lastPayment) : 'No payment yet'}</td>
                    <td className="text-right no-print">
                      <div className="fee-row-actions">
                        <button type="button" className="fee-link" onClick={() => setOpenStudent(row.student)}><Search size={14} /> History</button>
                        <button type="button" className="fee-link" onClick={() => onCollect(row.student.id)}><Coins size={14} /> Collect</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {openStudent && (
        <StudentFeeHistoryModal
          student={openStudent}
          payments={payments.filter((payment) => payment.student_id === openStudent.id)}
          onClose={() => setOpenStudent(null)}
          onToast={onToast}
        />
      )}
    </div>
  );
}

// One student's full fee picture: opening balance, challan-linked receipts and every
// adjustment, so the office can explain exactly how the balance was reached.
function StudentFeeHistoryModal({ student, payments, onClose, onToast }: {
  student: Student;
  payments: FeePayment[];
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const [adjustments, setAdjustments] = useState<FeeAdjustment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchAdjustmentsForStudent(student.id).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.error) { onToast(result.error); return; }
      setAdjustments(result.adjustments);
    });
    return () => { cancelled = true; };
  }, [student.id, onToast]);

  const sorted = [...payments].sort((a, b) => (b.payment_date + (b.created_at ?? '')).localeCompare(a.payment_date + (a.created_at ?? '')));
  const paidTotal = sorted.filter((payment) => !payment.voided).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const reversedTotal = sorted.filter((payment) => payment.voided).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const reducedTotal = adjustments.filter((row) => row.amount < 0).reduce((sum, row) => sum + Math.abs(row.amount), 0);

  return (
    <div className="notice-overlay" onClick={onClose}>
      <section className="notice-modal acct-ledger-modal" onClick={(event) => event.stopPropagation()}>
        <div className="notice-preview-top">
          <div>
            <span className="eyebrow">Fee ledger</span>
            <h2 className="mt-1 text-xl font-bold text-slate-800">{student.full_name}</h2>
            <p className="mt-1 text-sm text-slate-500">{student.admission_number} · {student.class_name} · Section {student.section_name}</p>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <dl className="fee-summary mt-4">
          <div className="strong"><dt>Current balance</dt><dd>{formatMoney(Math.max(0, Number(student.fee_balance ?? 0)))}</dd></div>
          <div><dt>Opening balance</dt><dd>{formatMoney(Math.max(0, Number(student.fee_opening_balance ?? 0)))}</dd></div>
          <div><dt>Total paid</dt><dd className="credit">{formatMoney(paidTotal)}</dd></div>
          <div><dt>Adjustments</dt><dd className="credit">−{formatMoney(reducedTotal)}</dd></div>
          <div><dt>Reversed</dt><dd>{formatMoney(reversedTotal)}</dd></div>
        </dl>

        {loading ? <p className="fee-empty">Loading adjustments…</p> : adjustments.length > 0 && (
          <>
            <h3 className="fee-history-heading">Adjustments</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Type</th><th>Reason</th><th className="text-right">Amount</th><th>Effective</th></tr></thead>
                <tbody>
                  {adjustments.map((row) => (
                    <tr key={row.id}>
                      <td>{adjustmentLabel(row.adjustment_type)}</td>
                      <td>{row.reason || '—'}</td>
                      <td className={`text-right font-semibold tabular-nums ${row.amount < 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{row.amount < 0 ? '−' : '+'}{formatMoney(Math.abs(row.amount))}</td>
                      <td>{formatDay(row.effective_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <h3 className="fee-history-heading">Payments</h3>
        {sorted.length === 0 ? (
          <p className="fee-empty">No payments have been recorded for this student yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
              <tbody>
                {sorted.map((payment) => (
                  <tr key={payment.id} className={payment.voided ? 'acct-void-row' : ''}>
                    <td className="fee-mono">{payment.receipt_number}</td>
                    <td>{formatDay(payment.payment_date)}</td>
                    <td className="capitalize">{payment.method}</td>
                    <td className="text-right font-semibold tabular-nums">{formatMoney(payment.amount)}</td>
                    <td>{payment.voided ? <span className="fee-status unpaid">Reversed</span> : <span className="fee-status paid">Recorded</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="notice-preview-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  );
}

export function OpeningBalanceTab({ students, onToast, onSaved }: {
  students: Student[];
  onToast: (message: string) => void;
  onSaved: () => Promise<void>;
}) {
  const picker = useStudentPicker(students);
  const [amount, setAmount] = useState('');
  const [asOf, setAsOf] = useState(todayKey());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const withOpening = useMemo(() => students
    .filter((student) => Number(student.fee_opening_balance ?? 0) > 0)
    .sort((a, b) => Number(b.fee_opening_balance ?? 0) - Number(a.fee_opening_balance ?? 0)), [students]);

  const totalOpening = withOpening.reduce((sum, student) => sum + Number(student.fee_opening_balance ?? 0), 0);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return withOpening;
    return withOpening.filter((student) =>
      student.full_name.toLowerCase().includes(needle)
      || (student.admission_number ?? '').toLowerCase().includes(needle));
  }, [withOpening, search]);

  const pickForEdit = (student: Student) => {
    picker.setSelectedId(student.id);
    picker.setQuery('');
    setAmount(String(Math.max(0, Number(student.fee_opening_balance ?? 0))));
    setAsOf(student.fee_opening_balance_date ?? todayKey());
    setError('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!picker.selected) { setError('Choose a student first.'); return; }
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed < 0) { setError('Enter a valid opening balance.'); return; }
    setSaving(true);
    setError('');
    const err = await setFeeOpeningBalance({ studentId: picker.selected.id, amount: parsed, asOf });
    setSaving(false);
    if (err) { setError(err); return; }
    onToast(parsed > 0
      ? `Opening balance of ${formatMoney(parsed)} saved for ${picker.selected.full_name}.`
      : `Opening balance cleared for ${picker.selected.full_name}.`);
    picker.setSelectedId('');
    picker.setQuery('');
    setAmount('');
    await onSaved();
  };

  return (
    <div className="fee-section">
      <div className="fee-kpi-grid compact">
        <div className="fee-kpi sun"><div><span>Students with an opening balance</span><strong>{withOpening.length}</strong><small>Dues carried forward</small></div></div>
        <div className="fee-kpi coral"><div><span>Total carried forward</span><strong>{formatMoney(totalOpening)}</strong><small>Added to their running balance</small></div></div>
      </div>

      <section className="fee-card">
        <div className="fee-card-head">
          <div><span className="eyebrow">Fee opening balance</span><h2>Dues brought forward</h2></div>
          <span className="fee-hint">Shown on top of challan dues</span>
        </div>
        <p className="fee-note">
          Use this to record what a student already owed before their fee challans started in this system.
          It is added to their running balance and can be edited or cleared at any time.
        </p>
        <form className="fee-form" onSubmit={submit}>
          <div className="fee-filters">
            <label className="control-field"><span>Find a student</span>
              <input value={picker.query} onChange={(event) => picker.setQuery(event.target.value)} placeholder="Name or admission no." autoComplete="off" />
            </label>
            <label className="control-field"><span>Selected</span>
              <input readOnly value={picker.selected ? `${picker.selected.full_name} · ${picker.selected.class_name}` : 'No student selected'} className="fee-readonly" />
            </label>
            <label className="control-field"><span>Opening balance (Rs)</span>
              <input type="number" min="0" step="1" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" required />
            </label>
            <label className="control-field"><span>As of</span>
              <input type="date" value={asOf} max={todayKey()} onChange={(event) => setAsOf(event.target.value)} />
            </label>
          </div>

          {picker.query.trim() && (
            <div className="fee-quick-pick">
              {picker.matches.length === 0 ? <p className="fee-empty">No students match "{picker.query}".</p> : picker.matches.map((student) => (
                <button
                  key={student.id}
                  type="button"
                  className={`fee-quick-pick-row ${picker.selectedId === student.id ? 'selected' : ''}`}
                  onClick={() => pickForEdit(student)}
                >
                  <span className="fee-quick-pick-name">{student.full_name}</span>
                  <span className="fee-quick-pick-meta">{student.class_name} · {student.section_name} · Opening {formatMoney(Math.max(0, Number(student.fee_opening_balance ?? 0)))}</span>
                </button>
              ))}
            </div>
          )}

          {error && <p className="fee-error">{error}</p>}

          <div className="fee-form-actions">
            <button type="submit" className="primary-button" disabled={saving}><Save size={16} /> {saving ? 'Saving…' : 'Save opening balance'}</button>
            {picker.selected && Number(picker.selected.fee_opening_balance ?? 0) > 0 && (
              <button type="button" className="secondary-button" onClick={() => setAmount('0')}><Minus size={15} /> Clear to zero</button>
            )}
          </div>
        </form>
      </section>

      <section className="fee-card">
        <div className="fee-card-head">
          <div><span className="eyebrow">Carried forward</span><h2>Students with an opening balance</h2></div>
          <label className="control-field compact"><span>Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or admission no." />
          </label>
        </div>
        {filtered.length === 0 ? (
          <p className="fee-empty">No opening balances have been recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Student</th><th>Class</th><th className="text-right">Opening balance</th><th>As of</th><th className="text-right">Current balance</th><th className="no-print" /></tr></thead>
              <tbody>
                {filtered.map((student) => (
                  <tr key={student.id}>
                    <td><strong>{student.full_name}</strong><small className="fee-sub">{student.admission_number}</small></td>
                    <td>{student.class_name} · {student.section_name}</td>
                    <td className="text-right font-semibold tabular-nums">{formatMoney(Math.max(0, Number(student.fee_opening_balance ?? 0)))}</td>
                    <td>{student.fee_opening_balance_date ? formatDay(student.fee_opening_balance_date) : '—'}</td>
                    <td className={`text-right tabular-nums ${Number(student.fee_balance ?? 0) > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{formatMoney(Math.max(0, Number(student.fee_balance ?? 0)))}</td>
                    <td className="text-right no-print">
                      <button type="button" className="fee-link" onClick={() => pickForEdit(student)}><Pencil size={14} /> Edit</button>
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

