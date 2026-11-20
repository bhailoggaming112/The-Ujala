import { useEffect } from 'react';
import { Check, RotateCcw, Trash2, Upload } from 'lucide-react';
import type { AdmissionFormState } from '@/lib/schoolTypes';

type TabKey = 'leaving' | 'submitted' | 'issued';

const classOptions = ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'];
const leavingStatusOptions = ['Transferred', 'Withdrawn', 'Pass Out', 'Expelled', 'Other'];
const ratingOptions = ['Excellent', 'Good', 'Satisfactory', 'Fair', 'Needs Improvement'];

type FieldDef = { key: keyof AdmissionFormState; label: string; type: 'text' | 'date'; placeholder?: string };

const issuedFields: FieldDef[] = [
  { key: 'issued_tc_number', label: 'TC Number', type: 'text', placeholder: 'Transfer certificate number' },
  { key: 'issued_tc_date', label: 'TC Issue Date', type: 'date' },
  { key: 'issued_other_docs', label: 'Other Documents Issued', type: 'text', placeholder: 'List any other documents issued' },
];

type DocDef = { label: string; statusKey: keyof AdmissionFormState; fileKey: keyof AdmissionFormState; multiline?: boolean };

const issuedDocDefs: DocDef[] = [
  { label: 'Character Certificate', statusKey: 'issued_character_certificate', fileKey: 'issued_character_certificate_file' },
  { label: 'Migration Certificate', statusKey: 'issued_migration_certificate', fileKey: 'issued_migration_certificate_file' },
  { label: 'Birth Certificate', statusKey: 'issued_birth_certificate', fileKey: 'issued_birth_certificate_file' },
  { label: 'DMC', statusKey: 'issued_dmc', fileKey: 'issued_dmc_file' },
  { label: 'Provisional Certificate', statusKey: 'issued_provisional_certificate', fileKey: 'issued_provisional_certificate_file' },
  { label: 'Original Certificate', statusKey: 'issued_original_certificate', fileKey: 'issued_original_certificate_file' },
];

const submittedDocs: DocDef[] = [
  { label: 'B-Form', statusKey: 'submitted_b_form', fileKey: 'submitted_b_form_file' },
  { label: 'Previous School TC', statusKey: 'submitted_previous_tc', fileKey: 'submitted_previous_tc_file' },
  { label: 'Birth Certificate', statusKey: 'submitted_birth_certificate', fileKey: 'submitted_birth_certificate_file' },
  { label: 'Photos', statusKey: 'submitted_photos', fileKey: 'submitted_photos_file' },
  { label: 'Other Documents', statusKey: 'submitted_other_docs', fileKey: 'submitted_other_docs_file', multiline: true },
];

const labelClass = 'block text-xs font-bold text-slate-600';
const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100';
const textareaClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100';
const readOnlyClass = 'mt-1 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500';

export function AdmissionDocTabs({ tab, form, update, patch, onToast }: {
  tab: TabKey;
  form: AdmissionFormState;
  update: (key: keyof AdmissionFormState, value: string) => void;
  patch: (changes: Partial<AdmissionFormState>) => void;
  onToast: (message: string) => void;
}) {
  useEffect(() => {
    const number = form.admission_number ? `LTC-${form.admission_number}` : '';
    if (number && !form.leaving_certificate_number) {
      patch({ leaving_certificate_number: number, leaving_certificate_date: form.leaving_date || '' });
    }
  }, [form.admission_number, form.leaving_date, form.leaving_certificate_number]);

  const readDocumentFile = (key: keyof AdmissionFormState, file: File | undefined) => {
    if (!file) return;
    if (file.type !== 'image/jpeg' && file.type !== 'image/png') { onToast('Please choose a JPG or PNG file'); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') update(key, reader.result); };
    reader.readAsDataURL(file);
  };

  if (tab === 'submitted') {
    return (
      <div className="admission-tab-panel">
        <div className="form-section-title">Submitted Doc</div>
        <div className="mt-4 space-y-4">
          {submittedDocs.map((doc) => (
            <div key={doc.statusKey} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="flex-1">
                  <span className={labelClass}>{doc.label}</span>
                  {doc.multiline ? (
                    <textarea rows={2} value={String(form[doc.statusKey] ?? '')} onChange={(e) => update(doc.statusKey, e.target.value)} placeholder="Notes or status" className={textareaClass} />
                  ) : (
                    <input value={String(form[doc.statusKey] ?? '')} onChange={(e) => update(doc.statusKey, e.target.value)} placeholder="Submitted / Pending / N/A" className={inputClass} />
                  )}
                </div>
                <label className="secondary-button mt-1 cursor-pointer whitespace-nowrap">
                  <Upload size={15} /> Upload JPG/PNG
                  <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => readDocumentFile(doc.fileKey, e.target.files?.[0])} />
                </label>
              </div>
              {String(form[doc.fileKey] ?? '') ? (
                <div className="mt-3 flex items-center gap-3">
                  <img src={String(form[doc.fileKey])} alt={`${doc.label} preview`} className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
                  <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-red-500 hover:underline" onClick={() => update(doc.fileKey, '')}><Trash2 size={13} /> Remove</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-end">
          <button type="submit" className="primary-button"><Check size={16} /> Save</button>
        </div>
      </div>
    );
  }

  if (tab === 'issued') {
    return (
      <div className="admission-tab-panel">
        <div className="form-section-title">Issued Doc</div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {issuedFields.map((field) => (
            <label key={field.key} className={labelClass}>
              {field.label}
              <input type={field.type} value={String(form[field.key] ?? '')} onChange={(e) => update(field.key, e.target.value)} placeholder={field.placeholder} className={inputClass} />
            </label>
          ))}
        </div>
        <div className="form-section-title mt-6">Certificates and result documents</div>
        <div className="mt-4 space-y-4">
          {issuedDocDefs.map((doc) => (
            <div key={doc.statusKey} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="flex-1">
                  <span className={labelClass}>{doc.label}</span>
                  <input value={String(form[doc.statusKey] ?? '')} onChange={(e) => update(doc.statusKey, e.target.value)} placeholder="Issued / Pending / N/A" className={inputClass} />
                </div>
                <label className="secondary-button mt-1 cursor-pointer whitespace-nowrap">
                  <Upload size={15} /> Upload JPG/PNG
                  <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => readDocumentFile(doc.fileKey, e.target.files?.[0])} />
                </label>
              </div>
              {String(form[doc.fileKey] ?? '') ? (
                <div className="mt-3 flex items-center gap-3">
                  <img src={String(form[doc.fileKey])} alt={`${doc.label} preview`} className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
                  <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-red-500 hover:underline" onClick={() => update(doc.fileKey, '')}><Trash2 size={13} /> Remove</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const clearLeaving = () => patch({
    leaving_status: '',
    leaving_class: '',
    leaving_date: '',
    leaving_reason: '',
    leaving_remarks: '',
    progress: '',
    conduct: '',
    fee_paid_upto: '',
    leaving_certificate_number: '',
    leaving_certificate_date: '',
  });

  return (
    <div className="admission-tab-panel">
      <div className="form-section-title">Leaving Info</div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>Leaving Status
          <select value={form.leaving_status} onChange={(e) => update('leaving_status', e.target.value)} className={inputClass}>
            <option value="">Select status</option>
            {leavingStatusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className={labelClass}>Leaving Class
          <select value={form.leaving_class} onChange={(e) => update('leaving_class', e.target.value)} className={inputClass}>
            <option value="">Select class</option>
            {classOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className={labelClass}>Leaving Date
          <input type="date" value={form.leaving_date} onChange={(e) => update('leaving_date', e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>Reason for Leaving
          <input value={form.leaving_reason} onChange={(e) => update('leaving_reason', e.target.value)} placeholder="Transfer, withdrawal, graduation, etc." className={inputClass} />
        </label>
        <label className="col-span-full text-xs font-bold text-slate-600">Remarks
          <textarea rows={3} value={form.leaving_remarks} onChange={(e) => update('leaving_remarks', e.target.value)} placeholder="Additional notes about the departure" className={textareaClass} />
        </label>
        <label className={labelClass}>Progress
          <select value={form.progress} onChange={(e) => update('progress', e.target.value)} className={inputClass}>
            <option value="">Select progress</option>
            {ratingOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className={labelClass}>Conduct
          <select value={form.conduct} onChange={(e) => update('conduct', e.target.value)} className={inputClass}>
            <option value="">Select conduct</option>
            {ratingOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className={labelClass}>Fee Paid Upto
          <input value={form.fee_paid_upto} onChange={(e) => update('fee_paid_upto', e.target.value)} placeholder="e.g. March 2026" className={inputClass} />
        </label>
        <div className="col-span-full">
          <div className="form-section-title">Certificate details</div>
          <div className="mt-1 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={labelClass}>Certificate Number
              <input readOnly value={form.leaving_certificate_number} placeholder="Auto-generated when leaving info is saved" className={readOnlyClass} />
            </label>
            <label className={labelClass}>Certificate Date
              <input type="date" readOnly value={form.leaving_certificate_date} className={readOnlyClass} />
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500">Certificate details are generated automatically from the admission number and leaving date.</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        <button type="button" className="secondary-button" onClick={clearLeaving}><RotateCcw size={15} /> Clear</button>
        <button type="submit" className="primary-button"><Check size={16} /> Save</button>
      </div>
    </div>
  );
}
