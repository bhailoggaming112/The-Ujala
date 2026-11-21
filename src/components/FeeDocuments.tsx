import { useEffect, useRef, useState } from 'react';
import { Printer, X } from 'lucide-react';
import { FeeBarcode } from '@/components/FeeBarcode';
import { SCHOOL_NAME } from '@/lib/noticeText';
import { usePrintSheet } from '@/lib/usePrintSheet';
import type { Student } from '@/lib/schoolTypes';
import {
  EMPTY_PAYMENT_SETTINGS, HEAD_LABELS, challanScanCode, formatDay, formatMoney, formatStamp, monthLabel,
  type ChallanDocument, type FeeHeads, type FeePayment, type FeeSummary, type PaymentSettings,
} from '@/lib/fees';

const headKeys: (keyof FeeHeads)[] = ['tuition_fee', 'admission_misc', 'exam_lab', 'transport', 'arrears', 'late_fine', 'concession'];

// Every printable sheet waits for the school logo before calling the printer, so a
// receipt never comes out with a missing header.
function useAutoPrint(ready: boolean) {
  const printedRef = useRef(false);
  useEffect(() => {
    if (!ready || printedRef.current) return;
    printedRef.current = true;
    window.print();
  }, [ready]);
}

function SchoolMark({ onSettled }: { onSettled?: () => void }) {
  return (
    <img
      src="/New_LOGO_Final.PNG"
      alt={`${SCHOOL_NAME} logo`}
      onLoad={onSettled}
      onError={onSettled}
    />
  );
}

function ReceiptSheet({ payment, student, summary, onLogo }: {
  payment: FeePayment;
  student: Student | null;
  summary: FeeSummary | null;
  onLogo: () => void;
}) {
  const details: { label: string; value: string }[] = [
    { label: 'Receipt no.', value: payment.receipt_number },
    { label: 'Payment date', value: formatDay(payment.payment_date) },
    { label: 'Student', value: student?.full_name ?? payment.student_name },
    { label: 'Admission no.', value: student?.admission_number ?? payment.admission_number ?? '—' },
    { label: 'Class', value: student ? `${student.class_name} · Section ${student.section_name}` : `${payment.class_name ?? '—'} · ${payment.section_name ?? '—'}` },
    { label: 'Father’s name', value: student?.fathers_name || '—' },
    { label: 'Payment method', value: payment.method.charAt(0).toUpperCase() + payment.method.slice(1) },
    { label: 'Received by', value: formatStamp(payment.created_at) },
  ];

  return (
    <section className="print-only print-fee-receipt">
      <div className="print-header">
        <SchoolMark onSettled={onLogo} />
        <div className="print-header-copy">
          <h1>{SCHOOL_NAME}</h1>
          <p>Fee Receipt</p>
        </div>
        <div className="print-header-admitted">
          <span>Receipt No.</span>
          <strong>{payment.receipt_number}</strong>
        </div>
      </div>
      <div className="print-columns">
        <div>
          <h2>Receipt Details</h2>
          {details.map((detail) => (
            <div className="print-row" key={detail.label}>
              <span className="print-row-label">{detail.label}</span>
              <span className="print-row-value">{detail.value}</span>
            </div>
          ))}
          {payment.remarks && (
            <div className="print-row">
              <span className="print-row-label">Remarks</span>
              <span className="print-row-value">{payment.remarks}</span>
            </div>
          )}
        </div>
        <div>
          <h2>Fee Account</h2>
          {summary && (
            <>
              <div className="print-row"><span className="print-row-label">Previous arrears</span><span className="print-row-value">{formatMoney(summary.previousArrears)}</span></div>
              <div className="print-row"><span className="print-row-label">Current monthly fee</span><span className="print-row-value">{formatMoney(summary.currentMonthlyFee)}</span></div>
              <div className="print-row"><span className="print-row-label">Concession</span><span className="print-row-value">−{formatMoney(summary.concession)}</span></div>
              {summary.fine > 0 && <div className="print-row"><span className="print-row-label">Late fine</span><span className="print-row-value">{formatMoney(summary.fine)}</span></div>}
              <div className="print-row"><span className="print-row-label">Total payable</span><span className="print-row-value">{formatMoney(summary.totalPayable)}</span></div>
            </>
          )}
          <div className="print-row"><span className="print-row-label">Amount received</span><span className="print-row-value">−{formatMoney(payment.amount)}</span></div>
          <div className="print-row"><span className="print-row-label">Balance after this receipt</span><span className="print-row-value">{formatMoney(payment.balance_after)}</span></div>
        </div>
      </div>
      <div className="print-signatures">
        <div className="print-signature"><span>Received By</span></div>
        <div className="print-signature"><span>Authorised Signature</span></div>
      </div>
    </section>
  );
}

export function FeeReceiptView({ payment, student, summary, onClose }: {
  payment: FeePayment;
  student: Student | null;
  summary: FeeSummary | null;
  onClose: () => void;
}) {
  const [logoSettled, setLogoSettled] = useState(false);
  useAutoPrint(logoSettled);
  const printSheet = usePrintSheet(true, (
    <ReceiptSheet payment={payment} student={student} summary={summary} onLogo={() => setLogoSettled(true)} />
  ));

  return (
    <div className="notice-overlay">
      <section className="notice-modal">
        <div className="notice-preview-top">
          <div className="flex items-center gap-4">
            <img src="/New_LOGO_Final.PNG" alt={`${SCHOOL_NAME} logo`} className="h-14 w-14 object-contain" />
            <div>
              <span className="eyebrow">Fee receipt</span>
              <h2 className="mt-1 text-xl font-bold text-slate-800">{SCHOOL_NAME}</h2>
            </div>
          </div>
          <button className="close-button no-print" onClick={onClose} aria-label="Close receipt"><X size={18} /></button>
        </div>

        <div className="fee-receipt-total">
          <span>Amount received</span>
          <strong>{formatMoney(payment.amount)}</strong>
          <small>Receipt {payment.receipt_number} · {formatDay(payment.payment_date)} · {payment.method}</small>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <div className="border-b border-slate-100 pb-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Student</dt>
            <dd className="mt-1 text-sm text-slate-800">{student?.full_name ?? payment.student_name}</dd>
          </div>
          <div className="border-b border-slate-100 pb-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admission no.</dt>
            <dd className="mt-1 text-sm text-slate-800">{student?.admission_number ?? payment.admission_number ?? '—'}</dd>
          </div>
          <div className="border-b border-slate-100 pb-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Class</dt>
            <dd className="mt-1 text-sm text-slate-800">
              {student ? `${student.class_name} · Section ${student.section_name}` : `${payment.class_name ?? '—'} · ${payment.section_name ?? '—'}`}
            </dd>
          </div>
          <div className="border-b border-slate-100 pb-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment method</dt>
            <dd className="mt-1 text-sm capitalize text-slate-800">{payment.method}</dd>
          </div>
          {payment.remarks && (
            <div className="border-b border-slate-100 pb-3 sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Remarks</dt>
              <dd className="mt-1 text-sm text-slate-800">{payment.remarks}</dd>
            </div>
          )}
        </dl>

        <div className="mt-6 rounded-xl bg-slate-50 px-5 py-4">
          {summary && (
            <>
              <div className="fee-receipt-line"><span>Previous arrears</span><strong>{formatMoney(summary.previousArrears)}</strong></div>
              <div className="fee-receipt-line"><span>Current monthly fee</span><strong>{formatMoney(summary.currentMonthlyFee)}</strong></div>
              <div className="fee-receipt-line"><span>Concession</span><strong>−{formatMoney(summary.concession)}</strong></div>
              {summary.fine > 0 && <div className="fee-receipt-line"><span>Late fine</span><strong>{formatMoney(summary.fine)}</strong></div>}
              <div className="fee-receipt-line"><span>Total payable</span><strong>{formatMoney(summary.totalPayable)}</strong></div>
            </>
          )}
          <div className="fee-receipt-line highlight">
            <span>Balance after this receipt</span>
            <strong>{formatMoney(payment.balance_after)}</strong>
          </div>
        </div>

        <div className="notice-preview-actions mt-6 no-print">
          <button className="secondary-button" onClick={onClose}>Close</button>
          <button className="primary-button" onClick={() => window.print()}><Printer size={16} /> Print receipt</button>
        </div>
      </section>
      {printSheet}
    </div>
  );
}

function ChallanSheet({ challan, settings }: { challan: ChallanDocument; settings: PaymentSettings }) {
  const copyLabel = 'Student Copy';
  const scanCode = challanScanCode(challan);
  const hasEasypaisa = Boolean(settings.easypaisa_account_no.trim());
  const hasBank = Boolean(settings.bank_account_no.trim() || settings.bank_name.trim());

  return (
    <section className="print-only print-challan">
      <div className="print-header">
        <SchoolMark />
        <div className="print-header-copy">
          <h1>{SCHOOL_NAME}</h1>
          <p>Fee Challan · {monthLabel(challan.month)}</p>
        </div>
        <div className="print-header-copy challan-copy-label">
          <span>{copyLabel}</span>
        </div>
        <div className="print-header-admitted">
          <span>Due date</span>
          <strong>{formatDay(challan.due_date)}</strong>
        </div>
      </div>

      <div className="print-columns">
        <div>
          <h2>Student Details</h2>
          <div className="print-row"><span className="print-row-label">Student</span><span className="print-row-value">{challan.student_name}</span></div>
          <div className="print-row"><span className="print-row-label">Admission no.</span><span className="print-row-value">{challan.admission_number || '—'}</span></div>
          <div className="print-row"><span className="print-row-label">Class</span><span className="print-row-value">{challan.class_name ?? '—'} · Section {challan.section_name ?? '—'}</span></div>
          <div className="print-row"><span className="print-row-label">Fee month</span><span className="print-row-value">{monthLabel(challan.month)}</span></div>
          <div className="print-row"><span className="print-row-label">Challan no.</span><span className="print-row-value">{challan.challan_number || 'Generated on save'}</span></div>
          <div className="print-row"><span className="print-row-label">Due date</span><span className="print-row-value">{formatDay(challan.due_date)}</span></div>
          <div className="print-row"><span className="print-row-label">Status</span><span className="print-row-value">{challan.status}</span></div>
        </div>
        <div className="challan-fee-heads">
          <h2>Fee Heads</h2>
          {headKeys.map((key) => (
            <div className="print-row" key={key}>
              <span className="print-row-label">{HEAD_LABELS[key]}</span>
              <span className="print-row-value">{key === 'concession' ? '−' : ''}{formatMoney(challan[key])}</span>
            </div>
          ))}
          <div className="print-row total"><span className="print-row-label">Total payable</span><span className="print-row-value">{formatMoney(challan.total)}</span></div>
        </div>
      </div>

      <div className="challan-pay-block">
        <div className="challan-pay-copy">
          <h2>How to Pay</h2>
          {hasEasypaisa || hasBank ? (
            <div className="challan-pay-groups">
              <div className="challan-pay-group">
                <span className="challan-pay-group-title">Easypaisa</span>
                {hasEasypaisa ? (
                  <>
                    <div className="print-row"><span className="print-row-label">Account no.</span><span className="print-row-value">{settings.easypaisa_account_no}</span></div>
                    {settings.easypaisa_account_name.trim() && (
                      <div className="print-row"><span className="print-row-label">Account title</span><span className="print-row-value">{settings.easypaisa_account_name}</span></div>
                    )}
                  </>
                ) : (
                  <p className="challan-pay-note">Not set. Ask the office for the Easypaisa account.</p>
                )}
              </div>
              <div className="challan-pay-group">
                <span className="challan-pay-group-title">Bank transfer</span>
                {hasBank ? (
                  <>
                    <div className="print-row"><span className="print-row-label">Bank name</span><span className="print-row-value">{settings.bank_name.trim() || '—'}</span></div>
                    <div className="print-row"><span className="print-row-label">Account / IBAN no.</span><span className="print-row-value">{settings.bank_account_no.trim() || '—'}</span></div>
                  </>
                ) : (
                  <p className="challan-pay-note">Not set. Ask the office for the bank account.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="challan-pay-note">Pay at the school office counter during working hours.</p>
          )}
          <p className="challan-pay-note">Keep this Student Copy and bring it, or the barcode below, when depositing the fee.</p>
        </div>
        <div className="challan-barcode-block">
          <FeeBarcode value={scanCode} caption={`Challan ${challan.challan_number || scanCode}`} />
        </div>
      </div>

      <div className="print-signatures">
        <div className="print-signature"><span>Depositor Signature</span></div>
        <div className="print-signature"><span>Authorised Signature</span></div>
      </div>
    </section>
  );
}

export function ChallanView({ challans, settings = EMPTY_PAYMENT_SETTINGS, onClose }: {
  challans: ChallanDocument[];
  settings?: PaymentSettings;
  onClose: () => void;
}) {
  const first = challans[0];
  const printSheet = usePrintSheet(challans.length > 0, (
    <>
      {challans.map((challan) => (
        <ChallanSheet key={challan.id} challan={challan} settings={settings} />
      ))}
    </>
  ));

  if (!first) return null;

  const firstCode = challanScanCode(first);

  return (
    <div className="notice-overlay">
      <section className="notice-modal notice-modal-wide">
        <div className="notice-preview-top">
          <div className="flex items-center gap-4">
            <img src="/New_LOGO_Final.PNG" alt={`${SCHOOL_NAME} logo`} className="h-14 w-14 object-contain" />
            <div>
              <span className="eyebrow">Fee challan · Student Copy</span>
              <h2 className="mt-1 text-xl font-bold text-slate-800">
                {challans.length === 1 ? first.student_name : `${challans.length} challans`}
              </h2>
            </div>
          </div>
          <button className="close-button no-print" onClick={onClose} aria-label="Close challan"><X size={18} /></button>
        </div>

        <div className="challan-preview-head">
          <span>Challan no. <strong>{first.challan_number || firstCode}</strong></span>
          <span>Admission no. <strong>{first.admission_number || '—'}</strong></span>
          <span>Fee month <strong>{monthLabel(first.month)}</strong></span>
          <span>Due date <strong>{formatDay(first.due_date)}</strong></span>
        </div>

        <div className="challan-pay-preview">
          <div>
            <span className="eyebrow">How to pay</span>
            {settings.easypaisa_account_no.trim() && (
              <p>Easypaisa account no. <strong>{settings.easypaisa_account_no}</strong>{settings.easypaisa_account_name.trim() ? ` · ${settings.easypaisa_account_name}` : ''}</p>
            )}
            {(settings.bank_account_no.trim() || settings.bank_name.trim()) && (
              <p>
                {settings.bank_name.trim() ? `${settings.bank_name.trim()} ` : 'Bank '}account / IBAN no. <strong>{settings.bank_account_no.trim() || '—'}</strong>
              </p>
            )}
            {!settings.easypaisa_account_no.trim() && !settings.bank_account_no.trim() && !settings.bank_name.trim() && (
              <p>No payment details are saved yet. An administrator can add them under Fee Structure.</p>
            )}
          </div>
          <FeeBarcode value={firstCode} caption={challans.length === 1 ? 'Scan to pay' : 'First challan shown'} height={54} module={2} />
        </div>

        <div className="table-wrap challan-preview-table">
          <table className="min-w-[820px]">
            <thead>
              <tr>
                <th>Challan no.</th>
                <th>Student</th>
                <th>Admission no.</th>
                <th>Class</th>
                {headKeys.map((key) => <th key={key} className="text-right">{HEAD_LABELS[key]}</th>)}
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {challans.map((challan) => (
                <tr key={challan.id}>
                  <td className="fee-mono">{challan.challan_number || challanScanCode(challan)}</td>
                  <td><strong>{challan.student_name}</strong></td>
                  <td>{challan.admission_number || '—'}</td>
                  <td>{challan.class_name ?? '—'} · {challan.section_name ?? '—'}</td>
                  {headKeys.map((key) => (
                    <td key={key} className="text-right tabular-nums">
                      {key === 'concession' ? '−' : ''}{Math.round(challan[key]).toLocaleString()}
                    </td>
                  ))}
                  <td className="text-right font-semibold tabular-nums">{formatMoney(challan.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="notice-preview-actions mt-6 no-print">
          <button className="secondary-button" onClick={onClose}>Close</button>
          <button className="primary-button" onClick={() => window.print()}><Printer size={16} /> Print {challans.length === 1 ? 'challan' : `${challans.length} challans`}</button>
        </div>
      </section>
      {printSheet}
    </div>
  );
}
