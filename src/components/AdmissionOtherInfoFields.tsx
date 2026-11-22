import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { AdmissionFormState } from '@/lib/schoolTypes';
import {
  applyClassTuitionFee, concessionAmountFor, concessionPercentageFor, netTuitionFor, tuitionFeeForClass,
  type FeeStructureRow,
} from '@/lib/admissionFees';
import { fetchFeeStructures } from '@/lib/fees';
import { DropdownWithAdd } from '@/components/DropdownWithAdd';

type TextField = 'current_address' | 'permanent_address' | 'father_contact_number' | 'messaging_number' | 'whatsapp_number' | 'guardian_relationship' | 'guardian_cnic';

const textareaClass = 'mt-2 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100';

const formatRupees = (value: number) => `Rs ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function AdmissionOtherInfoFields({ form, update, patch, dropdownOptions, onOptionsChanged, onToast }: {
  form: AdmissionFormState;
  update: (key: keyof AdmissionFormState, value: string) => void;
  patch: (changes: Partial<AdmissionFormState>) => void;
  dropdownOptions: Record<string, string[]>;
  onOptionsChanged: () => void;
  onToast: (message: string) => void;
}) {
  const text = (key: TextField, label: string) => (
    <label key={key}>{label}<input value={form[key]} onChange={(event) => update(key, event.target.value)} /></label>
  );

  const [structures, setStructures] = useState<FeeStructureRow[]>([]);
  const [structuresLoading, setStructuresLoading] = useState(true);
  const [structuresError, setStructuresError] = useState('');
  const lastClassRef = useRef(form.class_name);

  const loadStructures = async () => {
    setStructuresLoading(true);
    const result = await fetchFeeStructures();
    setStructuresLoading(false);
    setStructuresError(result.error ?? '');
    setStructures(result.structures);
  };

  useEffect(() => { void loadStructures(); }, []);

  // The class rate is applied when the class changes, and once when the structure
  // first arrives for a student who has no tuition fee saved yet. Manual edits after
  // that are kept as typed.
  useEffect(() => {
    const classChanged = lastClassRef.current !== form.class_name;
    lastClassRef.current = form.class_name;
    if (structures.length === 0) return;
    if (!classChanged && form.tuition_fee.trim() !== '') return;
    const patchValues = applyClassTuitionFee(form, structures);
    if (Object.keys(patchValues).length > 0) patch(patchValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.class_name, structures]);

  const classRate = tuitionFeeForClass(structures, form.class_name);
  const net = netTuitionFor(form.tuition_fee, form.fee_concession_amount);
  const overConcession = net !== null && Number(form.fee_concession_amount) > Number(form.tuition_fee);
  const concessionValue = Number(form.fee_concession_amount) || 0;
  const concessionPercentValue = Number(form.fee_concession_percentage) || 0;

  // Editing the tuition fee re-applies the recorded concession to it, keeping whichever
  // of the two concession fields the office typed in as the source of truth.
  const changeTuition = (value: string) => {
    const tuition = Number(value) || 0;
    const enteredAmount = Number(form.fee_concession_amount) || 0;
    const hasPercent = form.fee_concession_percentage.trim() !== '';
    const hasAmount = form.fee_concession_amount.trim() !== '';

    if (hasPercent) {
      const concession = concessionAmountFor(value, form.fee_concession_percentage);
      patch({ tuition_fee: value, fee_concession_amount: concession, net_tuition_fee: String(Math.max(0, tuition - (Number(concession) || 0))) });
      return;
    }
    if (hasAmount) {
      const clamped = Math.min(Math.max(enteredAmount, 0), Math.max(tuition, 0));
      patch({
        tuition_fee: value,
        fee_concession_amount: String(clamped),
        fee_concession_percentage: concessionPercentageFor(value, String(clamped)),
        net_tuition_fee: String(Math.max(0, tuition - clamped)),
      });
      return;
    }
    patch({ tuition_fee: value, net_tuition_fee: String(Math.max(0, tuition)) });
  };

  const changePercentage = (value: string) => {
    const concession = concessionAmountFor(form.tuition_fee, value);
    const net = netTuitionFor(form.tuition_fee, concession);
    patch({
      fee_concession_percentage: value,
      fee_concession_amount: concession,
      net_tuition_fee: net === null ? '' : String(net),
    });
  };

  const changeAmount = (value: string) => {
    const net = netTuitionFor(form.tuition_fee, value);
    patch({
      fee_concession_amount: value,
      fee_concession_percentage: concessionPercentageFor(form.tuition_fee, value),
      net_tuition_fee: net === null ? '' : String(net),
    });
  };

  return (
    <div className="form-grid admission-info-grid">
      <div className="form-section-title">Addresses</div>
      <label className="col-span-full">Current Address
        <textarea rows={3} value={form.current_address} onChange={(event) => update('current_address', event.target.value)} className={textareaClass} />
      </label>
      <label className="col-span-full">Permanent Address
        <textarea rows={3} value={form.permanent_address} onChange={(event) => update('permanent_address', event.target.value)} className={textareaClass} />
      </label>

      <div className="form-section-title">Parent and messaging contacts</div>
      {text('father_contact_number', 'Father Contact No.')}
      {text('messaging_number', 'Messaging Number')}
      {text('whatsapp_number', 'WhatsApp Number')}

      <div className="form-section-title">Parent profile</div>
      <DropdownWithAdd category="father_profession" label="Father’s Profession" value={form.father_profession} options={dropdownOptions.father_profession} onChange={(value) => update('father_profession', value)} onOptionsChanged={onOptionsChanged} onToast={onToast} />
      <DropdownWithAdd category="mother_tongue" label="Mother Tongue" value={form.mother_tongue} options={dropdownOptions.mother_tongue} onChange={(value) => update('mother_tongue', value)} onOptionsChanged={onOptionsChanged} onToast={onToast} />

      <div className="form-section-title">Guardian details</div>
      {text('guardian_relationship', 'Relationship to Student')}
      {text('guardian_cnic', 'Guardian CNIC')}

      <div className="form-section-title">Fees and concessions</div>
      <label>Monthly Tuition Fee (Rs)
        <input type="number" min="0" step="0.01" value={form.tuition_fee} onChange={(event) => changeTuition(event.target.value)} />
        <span className="mt-1 block text-xs font-normal text-slate-500">
          {structuresLoading
            ? 'Checking the fee structure for this class…'
            : classRate === null
              ? `No tuition fee is set for ${form.class_name || 'this class'} in the Fee Structure. You can type one in.`
              : `Filled from ${form.class_name} in the Fee Structure (${formatRupees(classRate)}). You can change it.`}
        </span>
        {structuresError && (
          <button type="button" className="secondary-button mt-2" onClick={() => void loadStructures()}>
            <RefreshCw size={14} /> Retry
          </button>
        )}
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label>Concession (%)
          <input type="number" min="0" max="100" step="0.01" value={form.fee_concession_percentage} onChange={(event) => changePercentage(event.target.value)} />
        </label>
        <label>Concession (Rs)
          <input type="number" min="0" step="0.01" value={form.fee_concession_amount} onChange={(event) => changeAmount(event.target.value)} />
        </label>
      </div>
      <p className="col-span-full -mt-2 text-xs text-slate-500">
        Type in either field — the other one is worked out for you. Concessions apply to the tuition fee only.
      </p>
      <div className="col-span-full grid grid-cols-1 gap-4 rounded-xl border border-sky-100 bg-sky-50/60 p-4 sm:grid-cols-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tuition fee</span>
          <strong className="mt-1 block text-base text-slate-800">{form.tuition_fee ? formatRupees(Number(form.tuition_fee)) : '—'}</strong>
        </div>
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Concession{concessionValue > 0 && concessionPercentValue > 0 ? ` (${concessionPercentValue}%)` : ''}
          </span>
          <strong className="mt-1 block text-base text-slate-800">{concessionValue > 0 ? formatRupees(concessionValue) : 'None'}</strong>
        </div>
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Actual / Net Tuition Fee</span>
          <strong className={`mt-1 block text-base ${overConcession ? 'text-rose-600' : 'text-sky-700'}`}>
            {net === null ? 'Enter a tuition fee' : formatRupees(net)}
          </strong>
        </div>
      </div>
      {overConcession && (
        <p className="col-span-full text-xs font-semibold text-rose-600">
          The concession is more than the tuition fee, so the net tuition fee is shown as Rs 0.
        </p>
      )}
      <div className="col-span-full flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
        <div>
          <strong className="block text-sm text-slate-800">Fine exemption</strong>
          <span className="text-xs text-slate-500">{form.fine_exempt ? 'Late fines are waived for this student' : 'Late fines apply to this student'}</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={form.fine_exempt}
          aria-label="Fine exemption"
          onClick={() => patch({ fine_exempt: !form.fine_exempt })}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${form.fine_exempt ? 'bg-sky-600' : 'bg-slate-300'}`}
        >
          <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.fine_exempt ? 'translate-x-5' : ''}`} />
        </button>
      </div>
    </div>
  );
}
