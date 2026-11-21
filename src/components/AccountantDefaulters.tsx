import { useMemo, useState } from 'react';
import { BellRing, Download, Send } from 'lucide-react';
import { feeReminderMessage, sendFeeReminders } from '@/lib/feeReminders';
import { downloadCsv, formatDay, formatMoney, toCsv, type FeePayment } from '@/lib/fees';
import { whatsappNumberWarning } from '@/lib/whatsapp';
import type { Student } from '@/lib/schoolTypes';

// Fee defaulters: every student with a balance still owing, sorted by the amount, with
// a reminder they can be sent through the school's existing WhatsApp route. The message
// is logged before it is sent, so a failed send is still visible in the SMS report.
export function AccountantDefaulters({ students, payments, month, today, onToast, onCollect }: {
  students: Student[];
  payments: FeePayment[];
  month: string;
  today: string;
  onToast: (message: string) => void;
  onCollect: (studentId: string) => void;
}) {
  const [classFilter, setClassFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [search, setSearch] = useState('');
  const [minDue, setMinDue] = useState('');
  const [sendingId, setSendingId] = useState('');
  const [preview, setPreview] = useState<Student | null>(null);

  const classList = useMemo(() => Array.from(new Set(students.map((student) => student.class_name))).sort(), [students]);
  const sectionList = useMemo(() => Array.from(new Set(
    students.filter((student) => !classFilter || student.class_name === classFilter).map((student) => student.section_name),
  )).sort(), [students, classFilter]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const floor = Number(minDue || 0);
    const lastPaymentFor = (studentId: string) => payments
      .filter((payment) => payment.student_id === studentId && !payment.voided)
      .reduce<string | null>((latest, payment) => (!latest || payment.payment_date > latest ? payment.payment_date : latest), null);
    return students
      .filter((student) => Number(student.fee_balance ?? 0) > 0)
      .filter((student) => !classFilter || student.class_name === classFilter)
      .filter((student) => !sectionFilter || student.section_name === sectionFilter)
      .filter((student) => Number(student.fee_balance ?? 0) >= floor)
      .filter((student) => !needle || `${student.full_name} ${student.admission_number} ${student.guardian_phone}`.toLowerCase().includes(needle))
      .map((student) => ({ student, due: Math.max(0, Number(student.fee_balance ?? 0)), lastPayment: lastPaymentFor(student.id) }))
      .sort((a, b) => b.due - a.due);
  }, [students, classFilter, sectionFilter, search, minDue, payments]);

  const totalDue = rows.reduce((total, row) => total + row.due, 0);

  const run = async (targets: Student[]) => {
    if (targets.length === 0) return;
    const result = await sendFeeReminders(targets, month, today);
    if (result.error) { onToast(result.error); return; }
    const note = result.skipped > 0 ? ` ${result.skipped} skipped — check the saved contact numbers.` : '';
    onToast(`${result.sent} fee reminder${result.sent === 1 ? '' : 's'} sent to WhatsApp.${note}`);
  };

  const exportList = () => {
    const rowsCsv: (string | number | null)[][] = [
      ['Student', 'Admission no.', 'Class', 'Section', 'Guardian', 'Contact', 'Due amount', 'Last payment'],
      ...rows.map((row) => [row.student.full_name, row.student.admission_number, row.student.class_name, row.student.section_name, row.student.guardian_name, row.student.guardian_phone, row.due, row.lastPayment]),
    ];
    downloadCsv('fee-defaulters.csv', toCsv(rowsCsv));
    onToast(`${rows.length} defaulters exported`);
  };

  return (
    <div className="fee-section">
      <section className="fee-card">
        <div className="fee-card-head">
          <div><span className="eyebrow">Follow-up</span><h2>{rows.length} students · {formatMoney(totalDue)} pending</h2></div>
          <div className="fee-quick">
            <button className="secondary-button" onClick={exportList}><Download size={15} /> Export list</button>
            <button className="primary-button" onClick={() => void run(rows.map((row) => row.student))} disabled={sendingId !== '' || rows.length === 0}>
              <Send size={15} /> {sendingId === 'batch' ? 'Sending…' : `Send reminders to ${rows.length}`}
            </button>
          </div>
        </div>
        <div className="fee-filters">
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
          <label className="control-field"><span>Minimum due (Rs)</span>
            <input type="number" min="0" step="1" value={minDue} onChange={(event) => setMinDue(event.target.value)} placeholder="Any amount" />
          </label>
          <label className="control-field"><span>Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, admission no. or phone" />
          </label>
        </div>
      </section>

      <section className="fee-card">
        {rows.length === 0 ? (
          <p className="fee-empty">Every student in this filter has cleared their dues. Nothing to follow up.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Student</th><th>Class</th><th className="text-right">Due amount</th><th>Last payment</th><th>Contact</th><th className="no-print" /></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.student.id}>
                    <td><strong>{row.student.full_name}</strong><small className="fee-sub">{row.student.admission_number} · Guardian {row.student.guardian_name || '—'}</small></td>
                    <td>{row.student.class_name} · {row.student.section_name}</td>
                    <td className="text-right font-semibold tabular-nums text-rose-600">{formatMoney(row.due)}</td>
                    <td>{row.lastPayment ? formatDay(row.lastPayment) : 'No payment yet'}</td>
                    <td>{row.student.guardian_phone || '—'}{whatsappNumberWarning(row.student) && <small className="fee-warn">{whatsappNumberWarning(row.student)}</small>}</td>
                    <td className="text-right no-print">
                      <div className="fee-row-actions">
                        <button type="button" className="fee-link" onClick={() => setPreview(row.student)}><BellRing size={14} /> Preview</button>
                        <button type="button" className="fee-link" onClick={() => onCollect(row.student.id)}>Collect</button>
                        <button type="button" className="fee-link" onClick={async () => { setSendingId(row.student.id); await run([row.student]); setSendingId(''); }} disabled={sendingId !== ''}>
                          <Send size={14} /> {sendingId === row.student.id ? 'Sending…' : 'Remind'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {preview && (
        <div className="notice-overlay" onClick={() => setPreview(null)}>
          <section className="notice-modal" onClick={(event) => event.stopPropagation()}>
            <div className="notice-preview-top">
              <span className="eyebrow">Fee reminder preview</span>
              <button className="close-button" onClick={() => setPreview(null)} aria-label="Close">×</button>
            </div>
            <h2 className="mt-3 text-lg font-bold text-slate-800">{preview.full_name}</h2>
            <p className="mt-1 text-sm text-slate-500">{preview.class_name} · Section {preview.section_name} · {formatMoney(Math.max(0, Number(preview.fee_balance ?? 0)))} due</p>
            <pre className="acct-reminder-preview">{feeReminderMessage(preview, Math.max(0, Number(preview.fee_balance ?? 0)), month)}</pre>
            <div className="notice-preview-actions">
              <button className="secondary-button" onClick={() => setPreview(null)}>Close</button>
              <button className="primary-button" onClick={async () => { setSendingId(preview.id); await run([preview]); setSendingId(''); setPreview(null); }} disabled={sendingId !== ''}>
                <Send size={15} /> Send reminder
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
