import { useEffect, useState } from 'react';
import { Building2, Save } from 'lucide-react';
import { fetchInstitutionProfile, saveInstitutionProfile, type InstitutionProfile } from '@/lib/systemSetup';
import { useAuth } from '@/lib/auth';

export function SystemInstitutionProfileTab({ onToast }: { onToast: (message: string) => void }) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [draft, setDraft] = useState<Omit<InstitutionProfile, 'id' | 'updated_at'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    const result = await fetchInstitutionProfile();
    if (result.profile) {
      const { id: _id, updated_at: _updated, ...rest } = result.profile;
      void _id; void _updated;
      setDraft(rest);
    }
    setError(result.error ?? '');
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const patch = (key: keyof NonNullable<typeof draft>, value: string) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const submit = async () => {
    if (!draft || !draft.school_name.trim()) { onToast('Enter the school name first.'); return; }
    setSaving(true);
    const error = await saveInstitutionProfile(draft);
    setSaving(false);
    if (error) { onToast(error); return; }
    onToast('Institution profile saved.');
  };

  if (loading) return <p className="fee-empty">Loading institution profile…</p>;
  if (!draft && error) return <div className="fee-alert"><span>{error}</span></div>;

  return (
    <div className="fee-card">
      <div className="fee-card-head">
        <div>
          <span className="eyebrow">Institution Profile</span>
          <h2>School Details</h2>
        </div>
        {isAdmin && draft && (
          <button className="primary-button" onClick={submit} disabled={saving}>
            <Save size={15} /> {saving ? 'Saving…' : 'Save Profile'}
          </button>
        )}
      </div>

      {error && <div className="fee-alert"><span>{error}</span></div>}

      {draft && (
        <div className="util-form">
          <div className="util-form-grid">
            <label className="control-field">School Name
              <input value={draft.school_name} onChange={(e) => patch('school_name', e.target.value)} disabled={!isAdmin} />
            </label>
            <label className="control-field">School Name (Urdu)
              <input value={draft.school_name_urdu} onChange={(e) => patch('school_name_urdu', e.target.value)} disabled={!isAdmin} dir="rtl" />
            </label>
            <label className="control-field">Principal Name
              <input value={draft.principal_name} onChange={(e) => patch('principal_name', e.target.value)} disabled={!isAdmin} />
            </label>
            <label className="control-field">Established Year
              <input value={draft.established_year} onChange={(e) => patch('established_year', e.target.value)} disabled={!isAdmin} placeholder="e.g. 1995" />
            </label>
            <label className="control-field">Phone
              <input value={draft.phone} onChange={(e) => patch('phone', e.target.value)} disabled={!isAdmin} />
            </label>
            <label className="control-field">Email
              <input value={draft.email} onChange={(e) => patch('email', e.target.value)} disabled={!isAdmin} />
            </label>
            <label className="control-field">Website
              <input value={draft.website} onChange={(e) => patch('website', e.target.value)} disabled={!isAdmin} />
            </label>
            <label className="control-field">Logo URL
              <input value={draft.logo_url} onChange={(e) => patch('logo_url', e.target.value)} disabled={!isAdmin} placeholder="/New_LOGO_Final.PNG" />
            </label>
            <label className="control-field util-field-wide">Address
              <input value={draft.address} onChange={(e) => patch('address', e.target.value)} disabled={!isAdmin} placeholder="Street, area" />
            </label>
            <label className="control-field">City
              <input value={draft.city} onChange={(e) => patch('city', e.target.value)} disabled={!isAdmin} />
            </label>
            <label className="control-field">Affiliation No.
              <input value={draft.affiliation_no} onChange={(e) => patch('affiliation_no', e.target.value)} disabled={!isAdmin} />
            </label>
            <label className="control-field">Registration No.
              <input value={draft.registration_no} onChange={(e) => patch('registration_no', e.target.value)} disabled={!isAdmin} />
            </label>
          </div>

          <div className="util-profile-note">
            <Building2 size={15} />
            <span>This profile is used across printed fee statements and certificates wherever school details appear.</span>
          </div>
        </div>
      )}
    </div>
  );
}
