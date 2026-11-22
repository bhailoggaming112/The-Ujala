import { useEffect, useState } from 'react';
import { Layers, Plus, Save, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

type SectionRecord = { id: string; class_name: string; section_name: string; class_teacher: string | null; capacity: number | null };

const classOptions = ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'];
const sectionOptions = ['A', 'B', 'C', 'D'];

type Draft = {
  id: string | null;
  class_name: string;
  section_name: string;
  class_teacher: string;
  capacity: string;
};

const emptyDraft = (): Draft => ({ id: null, class_name: 'Class 1', section_name: 'A', class_teacher: '', capacity: '' });

export function SystemClassesSectionsTab({ onToast }: { onToast: (message: string) => void }) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [sections, setSections] = useState<SectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('school_sections').select('id, class_name, section_name, class_teacher, capacity').order('class_name').order('section_name');
      if (error) throw error;
      setSections((data ?? []) as SectionRecord[]);
      setError('');
    } catch {
      setError('Classes and sections could not be loaded.');
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const startEdit = (row: SectionRecord) => setDraft({
    id: row.id,
    class_name: row.class_name,
    section_name: row.section_name,
    class_teacher: row.class_teacher ?? '',
    capacity: row.capacity != null ? String(row.capacity) : '',
  });

  const submit = async () => {
    if (!draft.class_name || !draft.section_name) { onToast('Choose a class and section.'); return; }
    const capacity = draft.capacity.trim() === '' ? null : Number(draft.capacity);
    if (capacity !== null && (!Number.isFinite(capacity) || capacity < 0)) { onToast('Capacity must be a valid number.'); return; }
    setSaving(true);
    try {
      const payload = {
        class_name: draft.class_name,
        section_name: draft.section_name,
        class_teacher: draft.class_teacher.trim() || null,
        capacity,
      };
      const { error } = draft.id
        ? await supabase.from('school_sections').update(payload).eq('id', draft.id)
        : await supabase.from('school_sections').insert(payload);
      if (error) throw error;
      onToast(draft.id ? 'Section updated.' : 'Section added.');
      setDraft(emptyDraft());
      void load();
    } catch {
      onToast('The section could not be saved.');
    }
    setSaving(false);
  };

  const remove = async (id: string) => {
    if (!window.confirm('Remove this section? Class teachers and capacity for it will be cleared.')) return;
    const { error } = await supabase.from('school_sections').delete().eq('id', id);
    if (error) { onToast('The section could not be removed.'); return; }
    onToast('Section removed.');
    void load();
  };

  return (
    <div className="fee-card">
      <div className="fee-card-head">
        <div>
          <span className="eyebrow">Classes &amp; Sections</span>
          <h2>Class Sections</h2>
        </div>
      </div>

      {isAdmin && (
        <div className="util-form">
          <div className="util-form-grid">
            <label className="control-field">Class
              <select value={draft.class_name} onChange={(e) => setDraft({ ...draft, class_name: e.target.value })}>
                {classOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="control-field">Section
              <select value={draft.section_name} onChange={(e) => setDraft({ ...draft, section_name: e.target.value })}>
                {sectionOptions.map((s) => <option key={s} value={s}>Section {s}</option>)}
              </select>
            </label>
            <label className="control-field">Class Teacher
              <input value={draft.class_teacher} onChange={(e) => setDraft({ ...draft, class_teacher: e.target.value })} placeholder="Teacher name" />
            </label>
            <label className="control-field">Capacity
              <input type="number" value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} placeholder="e.g. 40" />
            </label>
          </div>
          <div className="util-form-actions">
            <button className="secondary-button" onClick={() => setDraft(emptyDraft())}>Clear</button>
            <button className="primary-button" onClick={submit} disabled={saving}>
              {draft.id ? <Save size={15} /> : <Plus size={15} />} {saving ? 'Saving…' : draft.id ? 'Update Section' : 'Add Section'}
            </button>
          </div>
        </div>
      )}

      {error && <div className="fee-alert"><span>{error}</span></div>}

      {loading ? (
        <p className="fee-empty">Loading sections…</p>
      ) : sections.length === 0 ? (
        <p className="fee-empty">No sections recorded yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Class</th><th>Section</th><th>Class Teacher</th><th>Capacity</th>{isAdmin && <th></th>}</tr>
            </thead>
            <tbody>
              {sections.map((row) => (
                <tr key={row.id}>
                  <td><div className="table-student"><Layers size={14} /><strong>{row.class_name}</strong></div></td>
                  <td>{row.section_name}</td>
                  <td>{row.class_teacher || '—'}</td>
                  <td className="fee-mono">{row.capacity ?? '—'}</td>
                  {isAdmin && (
                    <td>
                      <div className="fee-row-actions">
                        <button className="fee-link" onClick={() => startEdit(row)}>Edit</button>
                        <button className="fee-link danger" onClick={() => remove(row.id)}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
