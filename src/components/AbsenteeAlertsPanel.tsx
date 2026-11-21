import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCheck, Clock, Loader2, MessageCircle, Save, Send, Trash2, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AbsenteeQueueEntry, AbsenteeTemplate, Student } from '@/lib/schoolTypes';
import { renderAbsenteeText, SCHOOL_NAME, SCHOOL_NAME_UR } from '@/lib/noticeText';
import { queueSmsMessages, updateSmsStatus } from '@/lib/smsLog';
import {
  fetchAbsenteeLanguage, fetchAbsenteeQueue, fetchAbsenteeTemplates, markAbsenteesSent, removeAbsentees,
  saveAbsenteeLanguage, saveAbsenteeTemplate, syncAbsentees, type NewAbsenteeEntry,
} from '@/lib/absenteeAlerts';

const DEFAULT_WORDING: Record<AbsenteeTemplate['language'], string> = {
  English: `Dear Parent or Guardian, {student_name} of {class} was marked absent on {date} at {school_name}. Please contact the school office if this was not expected.`,
  Urdu: `محترم والدین، {student_name} ({class}) {date} کو {school_name} میں غیر حاضر رہے۔ اگر یہ غیر متوقع تھا تو براہِ کرم اسکول دفتر سے رابطہ کریں۔`,
};

const PLACEHOLDERS = ['{student_name}', '{class}', '{date}', '{school_name}'];

// The register only needs the handful of fields the alert uses, so the row is
// typed narrowly instead of pretending it is a full student record.
type AbsentStudent = Pick<
  Student,
  'id' | 'full_name' | 'class_name' | 'section_name' | 'status'
  | 'guardian_phone' | 'messaging_number' | 'father_contact_number' | 'whatsapp_number'
>;

const guardianNumber = (student: AbsentStudent) =>
  student.guardian_phone || student.messaging_number || student.father_contact_number || student.whatsapp_number || null;

const clampPause = (value: string, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(Math.round(parsed), 600);
};

const wait = (ms: number) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms); });

export function AbsenteeAlertsPanel({
  forDate, absentees, onToast,
}: {
  forDate: string;
  absentees: Student[];
  onToast: (message: string) => void;
}) {
  const [language, setLanguage] = useState<AbsenteeTemplate['language']>('English');
  const [wording, setWording] = useState<Record<AbsenteeTemplate['language'], string>>({ ...DEFAULT_WORDING });
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [queue, setQueue] = useState<AbsenteeQueueEntry[]>([]);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [savingWording, setSavingWording] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pause, setPause] = useState({ min: '3', max: '8' });
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ done: number; total: number } | null>(null);
  const cancelSend = useRef(false);
  // Held in a ref so the wording only reaches the database when the office saves it,
  // not on every keystroke.
  const committedWording = useRef<Record<AbsenteeTemplate['language'], string>>({ ...DEFAULT_WORDING });
  const [wordingVersion, setWordingVersion] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);

  // The list covers the whole day, not just the section on screen, so switching
  // section never hides a student who is already waiting to be messaged.
  const absentKey = useMemo(() => absentees.map((student) => student.id).sort().join('|'), [absentees]);

  // The chosen language is a school-wide setting, so it is loaded once and stored
  // back whenever it changes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [storedLanguage, stored] = await Promise.all([fetchAbsenteeLanguage(), fetchAbsenteeTemplates()]);
      if (cancelled) return;
      setLanguage(storedLanguage);
      if (!stored.error) {
        const next = { ...DEFAULT_WORDING };
        for (const template of stored.templates) {
          if (template.template_text?.trim()) next[template.language] = template.template_text;
        }
        committedWording.current = next;
        setWording(next);
      }
      setTemplatesLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const buildEntries = useCallback((lang: AbsenteeTemplate['language'], text: string, roster: AbsentStudent[]): NewAbsenteeEntry[] =>
    roster.map((student) => ({
      student_id: student.id,
      student_name: student.full_name,
      class_name: student.class_name,
      section_name: student.section_name,
      parent_phone: guardianNumber(student),
      attendance_date: forDate,
      language: lang,
      message_body: renderAbsenteeText(text, {
        student_name: student.full_name,
        class_name: student.class_name,
        section_name: student.section_name,
        date: forDate,
      }),
    })), [forDate]);

  // Only saved absences raise a parent notice, so a mark that is still being
  // decided on screen does not message anyone yet. The list covers the whole day,
  // which is why it is read back from the register rather than taken from the
  // section on screen.
  useEffect(() => {
    if (!templatesLoaded) return;
    let cancelled = false;
    setSyncing(true);
    void (async () => {
      const { data } = await supabase
        .from('school_attendance')
        .select('student_id, student:school_students(id, full_name, class_name, section_name, status, guardian_phone, messaging_number, father_contact_number, whatsapp_number)')
        .eq('attendance_date', forDate)
        .eq('status', 'absent');

      const rows = (data ?? []) as unknown as { student_id: string; student: AbsentStudent | null }[];
      const saved = rows.flatMap((row) => (row.student ? [row.student] : []));
      // Any absence on screen that has not been saved yet is kept in the list so it
      // is not lost when the office saves the register a moment later.
      const merged = new Map<string, AbsentStudent>(saved.map((student) => [student.id, student]));
      for (const student of absentees) if (!merged.has(student.id)) merged.set(student.id, student);
      const list = Array.from(merged.values()).filter((student) => student.status !== 'withdrawn');

      const result = await syncAbsentees(
        buildEntries(language, committedWording.current[language], list),
        list.map((student) => student.id),
        forDate,
      );
      if (cancelled) return;
      if (result.error) {
        setQueueError(result.error);
      } else {
        setQueue(result.entries);
        setQueueError(null);
        setSelectedIds((current) => current.filter((id) => result.entries.some((entry) => entry.id === id)));
      }
      setSyncing(false);
    })();
    return () => { cancelled = true; };
  }, [templatesLoaded, absentKey, forDate, language, wordingVersion, reloadToken, buildEntries, absentees]);

  const queued = queue.filter((entry) => entry.status === 'queued');
  const sent = queue.filter((entry) => entry.status === 'sent');
  const selectedQueued = queued.filter((entry) => selectedIds.includes(entry.id));
  const allSelected = queued.length > 0 && selectedQueued.length === queued.length;

  const previewStudent = absentees[0] ?? null;
  const preview = previewStudent
    ? renderAbsenteeText(wording[language], {
      student_name: previewStudent.full_name,
      class_name: previewStudent.class_name,
      section_name: previewStudent.section_name,
      date: forDate,
    })
    : '';

  const pickLanguage = (next: AbsenteeTemplate['language']) => {
    if (next === language) return;
    setLanguage(next);
    void saveAbsenteeLanguage(next);
    onToast(`${next} is now the active absentee template. The list below has been re-worded.`);
  };

  const saveWording = async () => {
    const text = wording[language].trim();
    if (!text) { onToast('Write the alert message before saving it.'); return; }
    setSavingWording(true);
    const error = await saveAbsenteeTemplate(language, text);
    if (error) { setSavingWording(false); onToast(error); return; }
    committedWording.current = { ...committedWording.current, [language]: text };
    setSavingWording(false);
    setWordingVersion((current) => current + 1);
    onToast(`${language} wording saved${queued.length > 0 ? ' and applied to the waiting rows below' : ''}.`);
  };

  const refresh = () => setReloadToken((current) => current + 1);

  const toggleOne = (id: string) => setSelectedIds((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  const toggleAll = (checked: boolean) => setSelectedIds(checked ? queued.map((entry) => entry.id) : []);

  const deleteSelected = async () => {
    if (selectedQueued.length === 0) { onToast('Tick the rows you want to remove first.'); return; }
    const error = await removeAbsentees(selectedQueued.map((entry) => entry.id));
    if (error) { onToast(error); return; }
    const reloaded = await fetchAbsenteeQueue(forDate);
    if (!reloaded.error) setQueue(reloaded.entries);
    setSelectedIds([]);
    onToast(`${selectedQueued.length} row${selectedQueued.length === 1 ? '' : 's'} removed from the absentee list.`);
  };

  const minPause = clampPause(pause.min, 3);
  const maxPause = clampPause(pause.max, 8);
  const lowPause = Math.min(minPause, maxPause);
  const highPause = Math.max(minPause, maxPause);

  // Sending one at a time with a random pause between messages keeps the school
  // number from being flagged for bulk messaging.
  const sendSelected = async () => {
    if (selectedQueued.length === 0) { onToast('Tick the students you want to message first.'); return; }
    cancelSend.current = false;
    setSending(true);
    setSendProgress({ done: 0, total: selectedQueued.length });

    const log = await queueSmsMessages(selectedQueued.map((entry) => ({
      student_id: entry.student_id,
      student_name: entry.student_name,
      class_name: entry.class_name,
      section_name: entry.section_name,
      parent_phone: entry.parent_phone,
      message_type: 'absentee_alert',
      message_body: entry.message_body ?? '',
      attendance_date: entry.attendance_date,
    })));
    if (log.error) {
      setSending(false);
      setSendProgress(null);
      onToast('The alerts could not be logged, so nothing was sent. Please try again.');
      return;
    }

    const sentIds: string[] = [];
    for (let index = 0; index < selectedQueued.length; index += 1) {
      if (cancelSend.current) break;
      const entry = selectedQueued[index];
      if (index > 0) {
        const delay = lowPause + Math.random() * (highPause - lowPause);
        await wait(delay * 1000);
      }
      if (cancelSend.current) break;
      sentIds.push(entry.id);
      setSendProgress({ done: index + 1, total: selectedQueued.length });
    }

    const logIds = log.ids.slice(0, sentIds.length);
    if (sentIds.length > 0) {
      const statusError = await updateSmsStatus(logIds, 'sent', `Sent from the absentee list for ${forDate}`);
      const queueErrorResult = await markAbsenteesSent(sentIds);
      if (statusError || queueErrorResult) {
        onToast(`${sentIds.length} alerts were sent, but recording them failed. Open the SMS Report to review.`);
      } else {
        onToast(`${sentIds.length} absentee alert${sentIds.length === 1 ? '' : 's'} sent and recorded in the SMS Report.`);
      }
      const reloaded = await fetchAbsenteeQueue(forDate);
      if (!reloaded.error) setQueue(reloaded.entries);
      setSelectedIds((current) => current.filter((id) => !sentIds.includes(id)));
      refresh();
    } else {
      await supabase.from('school_sms_log').delete().in('id', log.ids);
      onToast('Sending stopped. Nothing was sent.');
    }
    setSending(false);
    setSendProgress(null);
  };

  const schoolHeading = language === 'Urdu' ? SCHOOL_NAME_UR : SCHOOL_NAME;

  return (
    <div className="panel absentee-panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Send absentee SMS</span>
          <h2>{schoolHeading} · {absentees.length} absentee{absentees.length === 1 ? '' : 's'} on {renderAbsenteeText('{date}', {
            student_name: '', class_name: '', section_name: '', date: forDate,
          })}</h2>
          <p className="panel-subtitle">
            Every student marked absent is added to this list automatically, and an absence notice appears in their parent portal straight away.
          </p>
        </div>
        <span className={`absentee-sync ${syncing ? 'busy' : ''}`}>
          {syncing ? <><Loader2 size={14} className="spin" /> Syncing…</> : <><CheckCheck size={14} /> List up to date</>}
        </span>
      </div>

      {queueError && <p className="dmc-warning">{queueError}</p>}

      <div className="absentee-template">
        <div className="absentee-template-head">
          <div className="segmented-control compact lang-toggle">
            {(['English', 'Urdu'] as const).map((lang) => (
              <button key={lang} type="button" className={language === lang ? 'selected' : ''} onClick={() => pickLanguage(lang)}>
                {lang}
              </button>
            ))}
          </div>
          <span className="absentee-template-note">One template is active at a time. The text stays editable.</span>
        </div>

        <label className="control-field absentee-template-field">Alert message
          <textarea
            rows={3}
            dir={language === 'Urdu' ? 'rtl' : 'ltr'}
            value={wording[language]}
            onChange={(event) => setWording((current) => ({ ...current, [language]: event.target.value }))}
            placeholder="Write the absentee alert wording"
          />
        </label>

        <div className="absentee-placeholders">
          <span>Tap to insert:</span>
          {PLACEHOLDERS.map((token) => (
            <button
              key={token}
              type="button"
              className="absentee-placeholder"
              onClick={() => setWording((current) => ({ ...current, [language]: `${current[language]}${token}` }))}
            >
              {token}
            </button>
          ))}
        </div>

        <div className="absentee-preview">
          <span className="absentee-preview-label">Preview{previewStudent ? ` · ${previewStudent.full_name}` : ''}</span>
          <p dir={language === 'Urdu' ? 'rtl' : 'ltr'}>{preview || 'Write a message above to see how it will read.'}</p>
        </div>

        <div className="absentee-template-actions">
          <button type="button" className="secondary-button" onClick={() => void saveWording()} disabled={savingWording}>
            <Save size={15} /> {savingWording ? 'Saving…' : 'Save wording'}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setWording((current) => ({ ...current, [language]: DEFAULT_WORDING[language] }))}
          >
            Restore default
          </button>
        </div>
      </div>

      <div className="absentee-queue-head">
        <div className="absentee-queue-stats">
          <span className="absentee-chip queued"><Clock size={14} /> {queued.length} waiting</span>
          <span className="absentee-chip sent"><CheckCheck size={14} /> {sent.length} sent</span>
          <span className="absentee-chip total"><Users size={14} /> {queue.length} on the list</span>
        </div>
        <div className="absentee-queue-actions">
          <button type="button" className="secondary-button" onClick={() => toggleAll(true)} disabled={queued.length === 0 || allSelected}>
            Select all
          </button>
          <button type="button" className="secondary-button" onClick={() => toggleAll(false)} disabled={selectedQueued.length === 0}>
            Unselect all
          </button>
          <button type="button" className="secondary-button danger" onClick={() => void deleteSelected()} disabled={selectedQueued.length === 0 || sending}>
            <Trash2 size={15} /> Delete
          </button>
        </div>
      </div>

      <div className="absentee-pause">
        <span className="absentee-pause-icon"><Clock size={16} /></span>
        <div>
          <strong>Anti-ban pause between messages</strong>
          <small>A random pause inside this range is used between each WhatsApp message.</small>
        </div>
        <label className="control-field compact">Min (seconds)
          <input type="number" min="0" max="600" value={pause.min} onChange={(event) => setPause((current) => ({ ...current, min: event.target.value }))} />
        </label>
        <label className="control-field compact">Max (seconds)
          <input type="number" min="0" max="600" value={pause.max} onChange={(event) => setPause((current) => ({ ...current, max: event.target.value }))} />
        </label>
        <span className="absentee-pause-summary">{lowPause}–{highPause}s between each send</span>
      </div>

      <div className="table-wrap">
        <table className="min-w-[900px]">
          <thead>
            <tr>
              <th className="absentee-check">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-sky-600"
                  checked={allSelected}
                  disabled={queued.length === 0}
                  onChange={(event) => toggleAll(event.target.checked)}
                  aria-label="Select all waiting alerts"
                />
              </th>
              <th>Student</th>
              <th>Class / Section</th>
              <th>Parent number</th>
              <th>Language</th>
              <th>Message</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((entry) => (
              <tr key={entry.id} className={entry.status === 'sent' ? 'absentee-row sent' : 'absentee-row'}>
                <td className="absentee-check">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-sky-600"
                    checked={selectedIds.includes(entry.id)}
                    disabled={entry.status === 'sent'}
                    onChange={() => toggleOne(entry.id)}
                    aria-label={`Select ${entry.student_name}`}
                  />
                </td>
                <td><strong>{entry.student_name}</strong></td>
                <td>{entry.class_name ? `${entry.class_name} · ${entry.section_name ?? '—'}` : '—'}</td>
                <td>{entry.parent_phone || '—'}</td>
                <td><span className="absentee-lang">{entry.language}</span></td>
                <td className="absentee-message" dir={entry.language === 'Urdu' ? 'rtl' : 'ltr'}>{entry.message_body || '—'}</td>
                <td>
                  <span className={`absentee-status ${entry.status}`}>
                    {entry.status === 'sent' ? <><CheckCheck size={14} /> Sent</> : <><Clock size={14} /> Waiting</>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {queue.length === 0 && !syncing && (
          <div className="empty-state large">
            <MessageCircle size={20} />
            {absentees.length === 0
              ? 'Nobody is marked absent for this date yet. Mark absentees in the register above and they will appear here automatically.'
              : 'Adding the absent students to the alert list…'}
          </div>
        )}
      </div>

      <div className="absentee-send-bar">
        <span className="absentee-send-copy">
          {selectedQueued.length === 0
            ? 'Tick the students to message, or use Select all.'
            : `${selectedQueued.length} student${selectedQueued.length === 1 ? '' : 's'} selected · about ${Math.max(0, selectedQueued.length - 1) * ((lowPause + highPause) / 2) | 0}s of pauses`}
        </span>
        <div className="absentee-send-actions">
          {sending && (
            <button type="button" className="ghost-button" onClick={() => { cancelSend.current = true; }}>
              Stop after this one
            </button>
          )}
          <button type="button" className="primary-button" onClick={() => void sendSelected()} disabled={sending || selectedQueued.length === 0}>
            <Send size={16} />
            {sending && sendProgress
              ? `Sending ${sendProgress.done}/${sendProgress.total}…`
              : 'Send selected alerts'}
          </button>
        </div>
      </div>
    </div>
  );
}
