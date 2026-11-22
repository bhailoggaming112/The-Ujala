import { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Save, Search } from 'lucide-react';
import { fetchAllSmsTemplates, saveSmsTemplate, type SmsTemplate } from '@/lib/utilityTools';
import { useAuth } from '@/lib/auth';

type Props = {
  onToast: (message: string) => void;
};

export function UtilitySmsTemplatesTab({ onToast }: Props) {
  const { profile } = useAuth();
  const canEdit = profile?.role === 'admin' || profile?.role === 'office_assistant';
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const result = await fetchAllSmsTemplates();
    setTemplates(result.templates);
    setError(result.error ?? '');
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    if (!search) return templates;
    const q = search.toLowerCase();
    return templates.filter((t) => [t.notice_type, t.template_text, t.language].join(' ').toLowerCase().includes(q));
  }, [templates, search]);

  const startEdit = (template: SmsTemplate) => setEditing((prev) => ({ ...prev, [template.id]: template.template_text }));

  const save = async (template: SmsTemplate) => {
    const text = editing[template.id];
    if (text === undefined) return;
    const error = await saveSmsTemplate({ notice_type: template.notice_type, language: template.language, template_text: text });
    if (error) { onToast(error); return; }
    onToast('Template saved.');
    setEditing((prev) => { const next = { ...prev }; delete next[template.id]; return next; });
    void load();
  };

  const prettyType = (type: string) => type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="fee-card">
      <div className="fee-card-head">
        <div>
          <span className="eyebrow">SMS Templates</span>
          <h2>Message Templates</h2>
        </div>
      </div>

      <div className="fee-filters">
        <label className="control-field">
          <Search size={16} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by type or wording…" />
        </label>
      </div>

      {error && <div className="fee-alert"><span>{error}</span></div>}

      {loading ? (
        <p className="fee-empty">Loading templates…</p>
      ) : filtered.length === 0 ? (
        <p className="fee-empty">No SMS templates{search ? ' match your search' : ''}.</p>
      ) : (
        <div className="util-sms-list">
          {filtered.map((template) => {
            const isEditing = editing[template.id] !== undefined;
            return (
              <div key={template.id} className="util-sms-card">
                <div className="util-sms-head">
                  <div className="util-sms-title">
                    <MessageSquare size={15} />
                    <strong>{prettyType(template.notice_type)}</strong>
                    <span className="fee-status neutral">{template.language}</span>
                  </div>
                  {canEdit && !isEditing && (
                    <button className="fee-link" onClick={() => startEdit(template)}>Edit</button>
                  )}
                </div>
                {isEditing ? (
                  <div className="util-sms-edit">
                    <textarea value={editing[template.id]} onChange={(e) => setEditing((prev) => ({ ...prev, [template.id]: e.target.value }))} rows={3} />
                    <div className="fee-row-actions">
                      <button className="secondary-button" onClick={() => setEditing((prev) => { const next = { ...prev }; delete next[template.id]; return next; })}>Cancel</button>
                      <button className="primary-button" onClick={() => save(template)}><Save size={14} /> Save</button>
                    </div>
                  </div>
                ) : (
                  <p className="util-sms-text">{template.template_text}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
