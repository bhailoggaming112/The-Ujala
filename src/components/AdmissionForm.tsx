import { useEffect, useState, type FormEvent } from 'react';
import { Check, ChevronLeft, ChevronRight, ClipboardCheck, Download, FileText, Plus, Printer, Sparkles, Trash2, UserPlus, Wallet, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AdmissionFormState, InformationRecord } from '@/lib/schoolTypes';
import { buildAdmissionCsv } from '@/lib/admissionFormState';
import { SCHOOL_NAME } from '@/lib/noticeText';
import { AdmissionOtherInfoFields } from '@/components/AdmissionOtherInfoFields';
import { AdmissionDocTabs } from '@/components/AdmissionDocTabs';
import { DropdownWithAdd } from '@/components/DropdownWithAdd';
import { InformationRecords, type InformationDraft } from '@/components/InformationRecords';
import { usePrintSheet } from '@/lib/usePrintSheet';

type AdmissionFormProps = {
  form: AdmissionFormState;
  setForm: (form: AdmissionFormState) => void;
  infoRecords: InformationRecord[];
  infoLoading?: boolean;
  infoLoadError?: boolean;
  onSaveInfo: (draft: InformationDraft) => Promise<boolean>;
  onDeleteInfo: (id: string) => Promise<boolean>;
  onSubmit: (event: FormEvent) => void;
  onAddToSession?: () => Promise<void>;
  onClear?: () => void;
  onCancel: () => void;
  onToast: (message: string) => void;
  onAutoGenerate?: () => void;
};

export function AdmissionForm({ form, setForm, infoRecords, infoLoading = false, infoLoadError = false, onSaveInfo, onDeleteInfo, onSubmit, onAddToSession, onClear, onCancel, onToast, onAutoGenerate }: AdmissionFormProps) {
  const update = (key: keyof AdmissionFormState, value: string) => setForm({ ...form, [key]: value });
  const patch = (changes: Partial<AdmissionFormState>) => setForm({ ...form, ...changes });
  const [activeTab, setActiveTab] = useState<'info' | 'other' | 'leaving' | 'submitted' | 'issued'>('info');
  const [dropdownOptions, setDropdownOptions] = useState<Record<string, string[]>>({ student_group: [], subject_group: [], house: [], religion: [], father_profession: [], mother_tongue: [], information_type: [] });
  const loadDropdownOptions = () => { void supabase.from('school_admission_options').select('category, label').order('label').then(({ data }) => { if (data) { const grouped: Record<string, string[]> = { student_group: [], subject_group: [], house: [], religion: [], father_profession: [], mother_tongue: [], information_type: [] }; for (const row of data as { category: string; label: string }[]) { if (grouped[row.category]) grouped[row.category].push(row.label); } setDropdownOptions(grouped); } }); };
  useEffect(loadDropdownOptions, []);
  const readPhoto = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { onToast('Please choose an image file for the student photo'); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') update('photo_url', reader.result); };
    reader.readAsDataURL(file);
  };
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([buildAdmissionCsv(form)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `admission-${form.admission_number.replace(/[^A-Za-z0-9-]+/g, '-') || 'form'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    onToast('Admission form exported as CSV');
  };
  const saveAsPdf = () => {
    onToast('In the print window, choose "Save as PDF" as the destination');
    window.print();
  };

  const printRows = (rows: [string, string | number | boolean | undefined][]) => rows.map(([label, value]) => (
    <div className="print-row" key={label}>
      <span className="print-row-label">{label}</span>
      <span className="print-row-value">{value === '' || value === undefined || value === null ? '—' : value === true ? 'Yes' : value === false ? 'No' : String(value)}</span>
    </div>
  ));

  const printName = (prefix: string, name: string) => `${prefix ? `${prefix} ` : ''}${name}`.trim();

  const printSheet = usePrintSheet(true, <section className="print-only print-admission-sheet" aria-hidden="true">
    <div className="print-sheet-page">
      <header className="print-header">
        <img src="/New_LOGO_Final.PNG" alt={`${SCHOOL_NAME} logo`} />
        <div className="print-header-copy">
          <h1>{SCHOOL_NAME}</h1>
          <p>Student Admission Form</p>
        </div>
        <div className="print-header-badge">
          <div>
            <span>Admitted Class</span>
            <strong>{form.admitted_in_class || form.class_name || '—'}</strong>
          </div>
          <div>
            <span>Admission No.</span>
            <strong>{form.admission_number || '—'}</strong>
          </div>
        </div>
      </header>

      <div className="print-layout">
        <div className="print-photo">
          {form.photo_url ? <img src={form.photo_url} alt="Student" /> : <div className="print-photo-empty">Photo</div>}
          <strong>{printName(form.student_name_prefix, form.full_name) || 'Student name'}</strong>
        </div>
        <div className="print-columns">
          <section className="print-card">
            <h2>Admission Info</h2>
            {printRows([
              ['Admission No.', form.admission_number],
              ['Admission Date', form.admission_date],
              ['Admitted in Class', form.admitted_in_class],
              ['Current Class', form.class_name],
              ['Section', form.section_name],
              ['Date of Birth', form.date_of_birth],
              ['Gender', form.gender],
              ['Student Name', printName(form.student_name_prefix, form.full_name)],
              ['Father Name', printName(form.father_name_prefix, form.fathers_name)],
              ['Mother Name', form.mother_name],
              ['Guardian Name', form.guardian_name],
              ['Guardian Phone', form.guardian_phone],
            ])}
          </section>
          <section className="print-card">
            <h2>Other Info</h2>
            {printRows([
              ['Father Contact No.', form.father_contact_number],
              ['Messaging Number', form.messaging_number],
              ['WhatsApp Number', form.whatsapp_number],
              ['Current Address', form.current_address],
              ['Permanent Address', form.permanent_address],
              ['Father’s Profession', form.father_profession],
              ['Mother Tongue', form.mother_tongue],
              ['Nationality', form.nationality],
              ['Religion', form.religion],
              ['Place of Birth', form.place_of_birth],
              ['Monthly Tuition Fee', form.tuition_fee ? `Rs ${Number(form.tuition_fee).toLocaleString()}` : ''],
            ])}
          </section>
        </div>
      </div>

      <div className="print-foot">
        <section className="print-declaration">
          <h2>Declaration</h2>
          <p>
            I hereby declare that the information provided in this form is true and correct to the best of my
            knowledge. I agree to abide by the rules, regulations and code of conduct of {SCHOOL_NAME}, and I
            undertake to pay the prescribed fees on time.
          </p>
        </section>
        <section className="print-office-use">
          <h2>Office Use Only</h2>
          <div className="print-office-grid">
            <div className="print-office-line"><span>Verified By</span></div>
            <div className="print-office-line"><span>Date</span></div>
            <div className="print-office-line"><span>Fee Received</span></div>
            <div className="print-office-line"><span>School Stamp</span></div>
          </div>
        </section>
      </div>

      <div className="print-signatures">
        <div className="print-signature"><span>Parent / Guardian Signature</span></div>
        <div className="print-signature"><span>Principal Signature</span></div>
      </div>
    </div>
  </section>);

  return <form className="panel admission-form" onSubmit={onSubmit}>
    <div className="form-heading"><div><span className="eyebrow">{onClear ? 'New admission' : 'Edit student'}</span><h2>Student Admission Form</h2></div><div className="form-heading-side"><div className="admission-photo">{form.photo_url ? <img src={form.photo_url} alt="Student preview" /> : <div className="photo-placeholder"><UserPlus size={24} /></div>}<div className="admission-photo-copy"><span>Student Photo</span><label className="secondary-button photo-upload">Upload photo<input type="file" accept="image/*" onChange={(event) => readPhoto(event.target.files?.[0])} /></label></div></div><button type="button" className="close-button" onClick={onCancel} aria-label="Close admission form"><X size={18} /></button></div></div>
    <div className="admission-tabs"><button type="button" className={activeTab === 'info' ? 'active' : ''} onClick={() => setActiveTab('info')}><ClipboardCheck size={16} /> Admission Info</button><button type="button" className={activeTab === 'other' ? 'active' : ''} onClick={() => setActiveTab('other')}><Wallet size={16} /> Other Info</button><button type="button" className={activeTab === 'submitted' ? 'active' : ''} onClick={() => setActiveTab('submitted')}><FileText size={16} /> Submitted Doc</button><button type="button" className={activeTab === 'issued' ? 'active' : ''} onClick={() => setActiveTab('issued')}><FileText size={16} /> Issued Doc</button><button type="button" className={activeTab === 'leaving' ? 'active' : ''} onClick={() => setActiveTab('leaving')}><FileText size={16} /> Leaving Info</button></div>
    {activeTab === 'info' && <div className="form-grid admission-info-grid">
      <div className="get-field"><label>Admission No.</label><div><input required value={form.admission_number} onChange={(event) => update('admission_number', event.target.value)} />{onAutoGenerate && <button type="button" className="secondary-button" onClick={onAutoGenerate}><Sparkles size={14} /> Auto Generate</button>}</div></div>
      <label>Admission Date<input required type="date" value={form.admission_date} onChange={(event) => update('admission_date', event.target.value)} /></label>
      <label>Admitted in Class<select value={form.admitted_in_class} onChange={(event) => update('admitted_in_class', event.target.value)}><option>Class 1</option><option>Class 2</option><option>Class 3</option><option>Class 4</option><option>Class 5</option><option>Class 6</option><option>Class 7</option><option>Class 8</option><option>Class 9</option><option>Class 10</option></select></label>
      <label>Current Class<select value={form.class_name} onChange={(event) => update('class_name', event.target.value)}><option>Class 1</option><option>Class 2</option><option>Class 3</option><option>Class 4</option><option>Class 5</option><option>Class 6</option><option>Class 7</option><option>Class 8</option><option>Class 9</option><option>Class 10</option></select></label>
      <label>Section<select value={form.section_name} onChange={(event) => update('section_name', event.target.value)}><option>A</option><option>B</option><option>C</option><option>D</option></select></label>
      <label>Date of Birth<input type="date" value={form.date_of_birth} onChange={(event) => update('date_of_birth', event.target.value)} /></label>
      <label>Gender<select value={form.gender} onChange={(event) => update('gender', event.target.value)}><option>Girl</option><option>Boy</option><option>Other</option></select></label>
      <label>Student Status<select value={form.status} onChange={(event) => update('status', event.target.value)}><option value="active">Active</option><option value="pending">Pending</option><option value="withdrawn">InActive</option><option value="promoted">Pass Out</option></select></label>
      <label>Last School<input value={form.last_school} onChange={(event) => update('last_school', event.target.value)} /></label>
      <label>Last Class<input value={form.last_class} onChange={(event) => update('last_class', event.target.value)} /></label>
      <DropdownWithAdd category="religion" label="Religion" value={form.religion} options={dropdownOptions.religion} onChange={(value) => update('religion', value)} onOptionsChanged={loadDropdownOptions} onToast={onToast} />
      <label>Nationality<select value={form.nationality} onChange={(event) => update('nationality', event.target.value)}><option>Indian</option><option>Pakistani</option><option>Bangladeshi</option><option>Nepali</option><option>Other</option></select></label>
      <DropdownWithAdd category="student_group" label="Student Group" value={form.student_group} options={dropdownOptions.student_group} onChange={(value) => update('student_group', value)} onOptionsChanged={loadDropdownOptions} onToast={onToast} />
      <DropdownWithAdd category="subject_group" label="Subject Group" value={form.subject_group} options={dropdownOptions.subject_group} onChange={(value) => update('subject_group', value)} onOptionsChanged={loadDropdownOptions} onToast={onToast} />
      <DropdownWithAdd category="house" label="House" value={form.house} options={dropdownOptions.house} onChange={(value) => update('house', value)} onOptionsChanged={loadDropdownOptions} onToast={onToast} />
      <label>Place of Birth<input value={form.place_of_birth} onChange={(event) => update('place_of_birth', event.target.value)} /></label>
      <div className="col-span-full"><InformationRecords records={infoRecords} loading={infoLoading} loadError={infoLoadError} options={dropdownOptions.information_type} onOptionsChanged={loadDropdownOptions} onToast={onToast} onSave={onSaveInfo} onDelete={onDeleteInfo} /></div>
      <div className="form-section-title">Student and family details</div>
      <div className="prefix-field"><label>Student Name</label><div><select value={form.student_name_prefix} onChange={(event) => update('student_name_prefix', event.target.value)}><option value="">Prefix</option><option>Master</option><option>Miss</option><option>Mr.</option><option>Ms.</option></select><input required value={form.full_name} onChange={(event) => update('full_name', event.target.value)} placeholder="Enter student name" /></div></div>
      <label>Urdu<input className="urdu-input" dir="rtl" lang="ur" value={form.full_name_urdu} onChange={(event) => update('full_name_urdu', event.target.value)} placeholder="طالب علم کا نام" /></label>
      <div className="prefix-field"><label>Father Name</label><div><select value={form.father_name_prefix} onChange={(event) => update('father_name_prefix', event.target.value)}><option value="">Prefix</option><option>Mr.</option><option>Dr.</option></select><input required value={form.fathers_name} onChange={(event) => update('fathers_name', event.target.value)} placeholder="Enter father name" /></div></div>
      <label>Urdu<input className="urdu-input" dir="rtl" lang="ur" value={form.fathers_name_urdu} onChange={(event) => update('fathers_name_urdu', event.target.value)} placeholder="والد کا نام" /></label>
      <label>Mother Name<input value={form.mother_name} onChange={(event) => update('mother_name', event.target.value)} /></label>
      <label>Urdu<input className="urdu-input" dir="rtl" lang="ur" value={form.mother_name_urdu} onChange={(event) => update('mother_name_urdu', event.target.value)} placeholder="والدہ کا نام" /></label>
      <label>Father’s CNIC<input value={form.fathers_cnic} onChange={(event) => update('fathers_cnic', event.target.value)} /></label>
      <div className="get-field"><label>Student Form-B</label><div><input value={form.student_form_b} onChange={(event) => update('student_form_b', event.target.value)} /><button type="button" className="secondary-button" onClick={() => onToast('Data retrieval is ready for this student form number')}>Get</button></div></div>
      <label>Guardian Name<input required value={form.guardian_name} onChange={(event) => update('guardian_name', event.target.value)} /></label>
      <label>Guardian Phone<input required value={form.guardian_phone} onChange={(event) => update('guardian_phone', event.target.value)} /></label>
    </div>}
    {activeTab === 'other' && <AdmissionOtherInfoFields form={form} update={update} patch={patch} dropdownOptions={dropdownOptions} onOptionsChanged={loadDropdownOptions} onToast={onToast} />}
    {(activeTab === 'leaving' || activeTab === 'submitted' || activeTab === 'issued') && <AdmissionDocTabs tab={activeTab} form={form} update={update} patch={patch} onToast={onToast} />}
    <div className="print-section no-print mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div><span className="eyebrow">Print and export</span><p className="text-sm text-slate-600">Share a copy of this admission form.</p></div>
      <div className="admission-action-buttons">
        <button type="button" className="secondary-button" onClick={() => window.print()}><Printer size={15} /> Print</button>
        <button type="button" className="secondary-button" onClick={saveAsPdf}><FileText size={15} /> Save as PDF</button>
        <button type="button" className="secondary-button" onClick={exportCsv}><Download size={15} /> Export as CSV</button>
      </div>
    </div>
    <div className="form-footer admission-actions no-print"><div className="record-navigation"><button type="button" onClick={() => onToast('Already at the first record')} aria-label="First record"><ChevronLeft size={14} /><ChevronLeft size={14} /></button><button type="button" onClick={() => onToast('Previous record requested')} aria-label="Previous record"><ChevronLeft size={14} /></button><button type="button" onClick={() => onToast('Next record requested')} aria-label="Next record"><ChevronRight size={14} /></button><button type="button" onClick={() => onToast('Already at the last record')} aria-label="Last record"><ChevronRight size={14} /><ChevronRight size={14} /></button></div><div className="admission-action-buttons">{onClear && <><button type="button" className="secondary-button" onClick={onClear}><Trash2 size={15} /> Delete</button><button type="button" className="secondary-button" onClick={onClear}><Plus size={15} /> New</button></>}{onAddToSession && <><button type="button" className="secondary-button" onClick={() => void onAddToSession()}>Add to Session</button><button type="button" className="secondary-button" onClick={() => onToast('SMS is ready to send after saving this student')}>Send SMS</button></>}<button type="button" className="secondary-button" onClick={onCancel}>Close</button><button type="submit" className="primary-button"><Check size={16} /> Save</button></div></div>
    {printSheet}
  </form>;
}
