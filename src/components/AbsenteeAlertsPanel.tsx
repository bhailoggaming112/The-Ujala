import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCheck, Clock, ExternalLink, Loader2, MessageCircle, Paperclip, RefreshCw, Save, Send, Trash2, Upload, Users, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AbsenteeQueueEntry, AbsenteeTemplate } from '@/lib/schoolTypes';
import { renderAbsenteeText, SCHOOL_NAME, SCHOOL_NAME_UR } from '@/lib/noticeText';
import { todayKey } from '@/lib/attendance';
import { queueSmsMessages, updateSmsStatus } from '@/lib/smsLog';
import {
  buildAbsenteeEntries, fetchAbsenteeLanguage, fetchAbsenteeQueue, fetchAbsenteeTemplates,
  fetchAbsentStudentsForDate, markAbsenteesSent, removeAbsentees, saveAbsenteeLanguage,
  saveAbsenteeTemplate, syncAbsentees,
} from '@/lib/absenteeAlerts';
import { ATTACHMENT_ACCEPT, isValidWhatsAppNumber, messageWithAttachment, uploadAbsenteeAttachment, whatsappLink } from '@/lib/whatsapp';

const DEFAULT_WORDING: Record<AbsenteeTemplate['language'], string> = {
  English: `Dear Parent or Guardian, {student_name} of {class} was marked absent on {date} at {school_name}. Please contact the school office if this was not expected.`,
  Urdu: `محترم والدین، {student_name} ({class}) {date} کو {school_name} میں غیر حاضر رہے۔ اگر یہ غیر متوقع تھا تو براہِ کرم اسکول دفتر سے رابطہ کریں۔`,
};

const PLACEHOLDERS = ['{student_name}', '{class}', '{date}', '{school_name}'];

const clampPause = (value: string, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(Math.round(parsed), 600);
};

const wait = (ms: number) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms); });

export function AbsenteeAlertsPanel({ onToast, onQueueChanged }: { onToast: (message: string) => void; onQueueChanged?: () => void }) {
  const [forDate, setForDate] = useState(todayKey);
  const [language, setLanguage] = useState<AbsenteeTemplate['language']>('English');
  const [wording, setWording] = useState<Record<AbsenteeTemplate['language'], string>>({ ...DEFAULT_WORDING });
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [queue, setQueue] = useState<AbsenteeQueueEntry[]>([]);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [savingWording, setSavingWording] = useState(false);
  // The chosen language and the ticked rows are staged on screen; the ticked rows
  // are written only when the office presses "Send selected alerts".
  const [draftSelected, setDraftSelected] = useState<string[]>([]);
  const [pause, setPause] = useState({ min: '3', max: '8' });
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ done: number; total: number } | null>(null);
  const cancelSend = useRef(false);
  // Held in a ref so the wording only reaches the database when the office saves it,
  // not on every keystroke.
  const committedWording = useRef<Record<AbsenteeTemplate['language'], string>>({ ...DEFAULT_WORDING });
  const [wordingVersion, setWordingVersion] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  // One optional file for the whole batch: its link is appended to every message and
  // carried onto the parent portal notice.
  const [attachment, setAttachment] = useState<{ url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  // Rows the browser refused to open in a new tab, kept so the office can click each
  // one and still send it.
  const [blocked, setBlocked] = useState<{ id: string; logId: string | null; student: string; phone: string; link: string }[]>([]);
  // Selected students with no usable WhatsApp number, listed so the office can fix
  // the student record instead of the app opening a broken chat.
  const [unreachable, setUnreachable] = useState<{ id: string; student: string }[]>([]);
  const fileInput = useRef<HTMLInputElement | null>(null);
  // Held in a ref so the count callback's changing identity cannot retrigger the
  // effect below on every render.
  const queueChanged = useRef(onQueueChanged);
  queueChanged.current = onQueueChanged;

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

  // The list shows every absence saved for the chosen date, across all classes and
  // sections, so the office can work through a whole day in one pass.
  useEffect(() => {
    if (!templatesLoaded) return;
    let cancelled = false;
    setSyncing(true);
    void (async () => {
      const roster = await fetchAbsentStudentsForDate(forDate);
      if (cancelled) return;
      if (roster.error) {
        setQueueError(roster.error);
        setSyncing(false);
        return;
      }

      const result = await syncAbsentees(
        buildAbsenteeEntries(language, committedWording.current[language], roster.students, forDate, attachment),
        roster.students.map((student) => student.id),
        forDate,
      );
      if (cancelled) return;
      if (result.error) {
        setQueueError(result.error);
      } else {
        setQueue(result.entries);
        setQueueError(null);
        setDraftSelected((current) => current.filter((id) => result.entries.some((entry) => entry.id === id)));
      }
      setSyncing(false);
    })();
    return () => { cancelled = true; };
  }, [templatesLoaded, forDate, language, wordingVersion, reloadToken, attachment]);

  const queuedRows = queue.filter((entry) => entry.status === 'queued');
  const toSend = queuedRows.filter((entry) => draftSelected.includes(entry.id));
  const previewEntry = toSend[0] ?? queuedRows[0] ?? null;

  // How many of the rows on screen cannot be messaged because no real WhatsApp
  // number is saved for the student.
  const missingNumbers = queuedRows.filter((entry) => !isValidWhatsAppNumber(entry.parent_phone)).length;

  const sent = queue.filter((entry) => entry.status === 'sent');
  const allSelected = queuedRows.length > 0 && toSend.length === queuedRows.length;

  // Keeps the sidebar count in step whenever the list of waiting alerts changes.
  useEffect(() => { queueChanged.current?.(); }, [queuedRows.length]);

  const preview = previewEntry
    ? messageWithAttachment(
      renderAbsenteeText(wording[language], {
        student_name: previewEntry.student_name,
        class_name: previewEntry.class_name ?? '',
        section_name: previewEntry.section_name ?? '',
        date: forDate,
      }),
      previewEntry.attachment_url ?? attachment?.url ?? null,
    )
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
    onToast(`${language} wording saved${queuedRows.length > 0 ? ' and applied to the waiting rows below' : ''}.`);
  };

  const refresh = () => setReloadToken((current) => current + 1);

  // Ticking a row only stages it. Nothing is written until "Send selected alerts"
  // is pressed, so a stray tap cannot queue or send a message.
  const toggleOne = (id: string) => setDraftSelected((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  const toggleAll = (checked: boolean) => setDraftSelected(checked ? queuedRows.map((entry) => entry.id) : []);

  const deleteSelected = async () => {
    if (toSend.length === 0) { onToast('Tick the rows you want to remove first.'); return; }
    const ids = toSend.map((entry) => entry.id);
    const error = await removeAbsentees(ids);
    if (error) { onToast(error); return; }
    const reloaded = await fetchAbsenteeQueue(forDate);
    if (!reloaded.error) setQueue(reloaded.entries);
    setDraftSelected((current) => current.filter((id) => !ids.includes(id)));
    onToast(`${ids.length} row${ids.length === 1 ? '' : 's'} removed from the absentee list.`);
  };

  const minPause = clampPause(pause.min, 3);
  const maxPause = clampPause(pause.max, 8);
  const lowPause = Math.min(minPause, maxPause);
  const highPause = Math.max(minPause, maxPause);

  const pickAttachment = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    const result = await uploadAbsenteeAttachment(file);
    setUploading(false);
    if (result.error) { onToast(result.error); return; }
    setAttachment({ url: result.url, name: result.name });
    onToast(`${result.name} attached. Its link is added to every alert and to the parent portal notice.`);
  };

  const clearAttachment = () => {
    setAttachment(null);
    if (fileInput.current) fileInput.current.value = '';
    onToast('Attachment removed. Alerts will go out as text only.');
  };

  // Each alert opens its own WhatsApp tab with the message pre-filled. The pause
  // between sends keeps the school number from being flagged for bulk messaging.
  const sendSelected = async () => {
    if (toSend.length === 0) { onToast('Tick the students you want to message first.'); return; }
    // A row whose saved contact is not a real phone number is never dialled; the
    // office is told which students need a WhatsApp number saved instead.
    const sendable = toSend.filter((entry) => isValidWhatsAppNumber(entry.parent_phone));
    const unreachable = toSend.filter((entry) => !isValidWhatsAppNumber(entry.parent_phone));
    if (sendable.length === 0) {
      onToast(`${unreachable.length} selected student${unreachable.length === 1 ? ' has' : 's have'} no valid WhatsApp number saved. Add one on the student record, then try again.`);
      return;
    }
    cancelSend.current = false;
    setSending(true);
    setSendProgress({ done: 0, total: sendable.length });
    setBlocked([]);
    setUnreachable([]);
    if (unreachable.length > 0) {
      setUnreachable(unreachable.map((entry) => ({ id: entry.id, student: entry.student_name })));
    }

    const outgoing = sendable.map((entry) => ({
      entry,
      message: messageWithAttachment(entry.message_body ?? '', entry.attachment_url ?? attachment?.url ?? null),
    }));

    const log = await queueSmsMessages(sendable.map((entry, index) => ({
      student_id: entry.student_id,
      student_name: entry.student_name,
      class_name: entry.class_name,
      section_name: entry.section_name,
      parent_phone: entry.parent_phone,
      message_type: 'absentee_alert',
      message_body: outgoing[index].message,
      attendance_date: entry.attendance_date,
      attachment_url: entry.attachment_url ?? attachment?.url ?? null,
      attachment_name: entry.attachment_name ?? attachment?.name ?? null,
    })));
    if (log.error) {
      setSending(false);
      setSendProgress(null);
      onToast('The alerts could not be logged, so nothing was sent. Please try again.');
      return;
    }

    const sentIds: string[] = [];
    const sentLogIds: string[] = [];
    const blockedRows: typeof blocked = [];
    for (let index = 0; index < outgoing.length; index += 1) {
      if (cancelSend.current) break;
      if (index > 0) {
        const delay = lowPause + Math.random() * (highPause - lowPause);
        await wait(delay * 1000);
      }
      if (cancelSend.current) break;
      const { entry, message } = outgoing[index];
      const link = whatsappLink(entry.parent_phone, message);
      const opened = window.open(link, '_blank', 'noopener,noreferrer');
      if (opened) {
        sentIds.push(entry.id);
        sentLogIds.push(log.ids[index]);
      } else {
        blockedRows.push({ id: entry.id, logId: log.ids[index] ?? null, student: entry.student_name, phone: entry.parent_phone ?? '', link });
      }
      setSendProgress({ done: index + 1, total: outgoing.length });
    }

    if (sentLogIds.length > 0) {
      const statusError = await updateSmsStatus(sentLogIds, 'sent', `WhatsApp opened for ${forDate}`);
      const queueErrorResult = await markAbsenteesSent(sentIds);
      if (statusError || queueErrorResult) {
        onToast(`${sentIds.length} WhatsApp chats were opened, but recording them failed. Open the WhatsApp SMS Report to review.`);
      }
    }

    if (blockedRows.length > 0) {
      setBlocked(blockedRows);
      onToast(`${blockedRows.length} chat${blockedRows.length === 1 ? '' : 's'} could not open because your browser blocked new tabs. Use the links below to send them.`);
    } else if (sentIds.length > 0) {
      onToast(`${sentIds.length} WhatsApp chat${sentIds.length === 1 ? '' : 's'} opened and recorded in the WhatsApp SMS Report.`);
    } else {
      await supabase.from('school_sms_log').delete().in('id', log.ids);
      onToast('Sending stopped. Nothing was sent.');
    }
    if (sentIds.length > 0) {
      const reloaded = await fetchAbsenteeQueue(forDate);
      if (!reloaded.error) setQueue(reloaded.entries);
      setDraftSelected((current) => current.filter((id) => !sentIds.includes(id)));
      refresh();
    }
    setSending(false);
    setSendProgress(null);
  };

  // A chat the browser blocked is marked sent once the office confirms it was opened
  // from the fallback link.
  const confirmBlockedSent = async (row: typeof blocked[number]) => {
    if (row.logId) await updateSmsStatus([row.logId], 'sent', `Sent from a fallback link for ${forDate}`);
    await markAbsenteesSent([row.id]);
    setBlocked((current) => current.filter((item) => item.id !== row.id));
    const reloaded = await fetchAbsenteeQueue(forDate);
    if (!reloaded.error) setQueue(reloaded.entries);
    setDraftSelected((current) => current.filter((id) => id !== row.id));
    onToast(`Recorded the alert to ${row.student} as sent.`);
    refresh();
  };

  const schoolHeading = language === 'Urdu' ? SCHOOL_NAME_UR : SCHOOL_NAME;

  return (
    <div className="absentee-panel">
      <div className="panel absentee-toolbar">
        <div className="absentee-toolbar-head">
          <div>
            <span className="eyebrow">Send absentee WhatsApp SMS</span>
            <h2>{schoolHeading} · {queuedRows.length} alert{queuedRows.length === 1 ? '' : 's'} waiting to send</h2>
            <p className="panel-subtitle">
              Every absence saved in the Daily Attendance register lands here on its own, and an absence notice appears in the parent portal straight away.
            </p>
          </div>
          <span className={`absentee-sync ${syncing ? 'busy' : ''}`}>
            {syncing ? <><Loader2 size={14} className="spin" /> Syncing…</> : <><CheckCheck size={14} /> List up to date</>}
          </span>
        </div>
        <div className="absentee-toolbar-controls">
          <label className="control-field">Absence date
            <input type="date" value={forDate} onChange={(event) => setForDate(event.target.value)} />
          </label>
          <button type="button" className="secondary-button" onClick={() => setForDate(todayKey())}><RefreshCw size={15} /> Today</button>
          <button type="button" className="secondary-button" onClick={refresh} disabled={syncing}><Loader2 size={15} className={syncing ? 'spin' : ''} /> Refresh list</button>
        </div>
      </div>

      {queueError && <p className="dmc-warning">{queueError}</p>}

      {missingNumbers > 0 && (
        <p className="dmc-warning">
          {missingNumbers} waiting student{missingNumbers === 1 ? ' has' : 's have'} no valid WhatsApp number saved. WhatsApp Number is used first, then Messaging Number, then Father Contact No. Add a WhatsApp number on the student record to message them.
        </p>
      )}

      <div className="panel absentee-attachment">
        <div className="absentee-attachment-head">
          <span className="absentee-attachment-icon"><Paperclip size={16} /></span>
          <div>
            <strong>Optional attachment</strong>
            <small>JPEG, PNG, PDF or Word document, up to 10 MB. Its link is added to every alert and to the parent portal notice.</small>
          </div>
        </div>
        <div className="absentee-attachment-body">
          <input
            ref={fileInput}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            className="absentee-file-input"
            onChange={(event) => void pickAttachment(event.target.files?.[0] ?? null)}
          />
          <button type="button" className="secondary-button" onClick={() => fileInput.current?.click()} disabled={uploading || sending}>
            <Upload size={15} /> {uploading ? 'Uploading…' : attachment ? 'Replace file' : 'Choose file'}
          </button>
          {attachment && (
            <span className="absentee-attachment-chip">
              <Paperclip size={13} /> {attachment.name}
              <a href={attachment.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open</a>
              <button type="button" onClick={clearAttachment} aria-label="Remove attachment" disabled={sending}><X size={13} /></button>
            </span>
          )}
        </div>
      </div>

      <div className="panel absentee-template">
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
            className={language === 'Urdu' ? 'urdu-text' : undefined}
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
          <span className="absentee-preview-label">
            Preview{previewEntry ? ` · ${previewEntry.student_name}` : ''}{toSend.length > 0 ? ' (first selected row)' : ''}
          </span>
          <p className={language === 'Urdu' ? 'urdu-text' : undefined} dir={language === 'Urdu' ? 'rtl' : 'ltr'}>
            {preview || 'Save the register in Daily Attendance and the wording will preview here.'}
          </p>
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

      <div className="panel absentee-queue">
      <div className="absentee-queue-head">
        <div className="absentee-queue-stats">
          <span className="absentee-chip queued"><Clock size={14} /> {queuedRows.length} waiting</span>
          <span className="absentee-chip sent"><CheckCheck size={14} /> {sent.length} sent</span>
          <span className="absentee-chip total"><Users size={14} /> {queue.length} on the list</span>
        </div>
        <div className="absentee-queue-actions">
          <button type="button" className="secondary-button" onClick={() => toggleAll(true)} disabled={queuedRows.length === 0 || allSelected}>
            Select all
          </button>
          <button type="button" className="secondary-button" onClick={() => toggleAll(false)} disabled={toSend.length === 0}>
            Unselect all
          </button>
          <button type="button" className="secondary-button danger" onClick={() => void deleteSelected()} disabled={toSend.length === 0 || sending}>
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
        <table className="min-w-[1040px]">
          <thead>
            <tr>
              <th className="absentee-check">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-sky-600"
                  checked={allSelected}
                  disabled={queuedRows.length === 0}
                  onChange={(event) => toggleAll(event.target.checked)}
                  aria-label="Select all waiting alerts"
                />
              </th>
              <th>Student</th>
              <th>Class / Section</th>
              <th>Parent number</th>
              <th>Language</th>
              <th>Message</th>
              <th>Attachment</th>
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
                    checked={draftSelected.includes(entry.id)}
                    disabled={entry.status === 'sent'}
                    onChange={() => toggleOne(entry.id)}
                    aria-label={`Select ${entry.student_name}`}
                  />
                </td>
                <td><strong>{entry.student_name}</strong></td>
                <td>{entry.class_name ? `${entry.class_name} · ${entry.section_name ?? '—'}` : '—'}</td>
                <td>
                  {entry.parent_phone
                    ? <span className="absentee-number">{entry.parent_phone}</span>
                    : <span className="absentee-number missing">No number</span>}
                </td>
                <td><span className="absentee-lang">{entry.language}</span></td>
                <td
                  className={`absentee-message ${entry.language === 'Urdu' ? 'urdu-text' : ''}`}
                  dir={entry.language === 'Urdu' ? 'rtl' : 'ltr'}
                >
                  {entry.message_body || '—'}
                </td>
                <td>
                  {entry.attachment_url
                    ? <a className="sms-attachment" href={entry.attachment_url} target="_blank" rel="noreferrer"><Paperclip size={12} /> {entry.attachment_name || 'File'}</a>
                    : <span className="muted-cell">—</span>}
                </td>
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
            No absences are saved for this date yet. Save the register in Daily Attendance and the absentees will appear here on their own.
          </div>
        )}
      </div>

      <div className="absentee-send-bar">
        <span className="absentee-send-copy">
          {toSend.length === 0
            ? 'Tick the students to message, or use Select all.'
            : `${toSend.length} student${toSend.length === 1 ? '' : 's'} selected · about ${Math.max(0, toSend.length - 1) * ((lowPause + highPause) / 2) | 0}s of pauses`}
        </span>
        <div className="absentee-send-actions">
          {sending && (
            <button type="button" className="ghost-button" onClick={() => { cancelSend.current = true; }}>
              Stop after this one
            </button>
          )}
          <button type="button" className="primary-button" onClick={() => void sendSelected()} disabled={sending || uploading || toSend.length === 0}>
            <Send size={16} />
            {sending && sendProgress
              ? `Opening ${sendProgress.done}/${sendProgress.total}…`
              : 'Send selected alerts'}
          </button>
        </div>
      </div>

      {unreachable.length > 0 && (
        <div className="absentee-blocked unreachable">
          <div className="absentee-blocked-head">
            <AlertTriangle size={16} />
            <div>
              <strong>{unreachable.length} student{unreachable.length === 1 ? '' : 's'} could not be messaged</strong>
              <small>No valid WhatsApp number is saved for them, so no chat was opened. Save a WhatsApp number on the student record and send again.</small>
            </div>
          </div>
          <ul>
            {unreachable.map((row) => (
              <li key={row.id}><span><strong>{row.student}</strong><small>No valid WhatsApp number saved</small></span></li>
            ))}
          </ul>
        </div>
      )}

      {blocked.length > 0 && (
        <div className="absentee-blocked">
          <div className="absentee-blocked-head">
            <AlertTriangle size={16} />
            <div>
              <strong>{blocked.length} chat{blocked.length === 1 ? '' : 's'} were blocked by your browser</strong>
              <small>Click each link to open WhatsApp with the message ready, then mark it as sent.</small>
            </div>
          </div>
          <ul>
            {blocked.map((row) => (
              <li key={row.id}>
                <span><strong>{row.student}</strong><small>{row.phone || 'No number saved'}</small></span>
                <a className="secondary-button" href={row.link} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open WhatsApp</a>
                <button type="button" className="ghost-button" onClick={() => void confirmBlockedSent(row)}><CheckCheck size={14} /> Mark as sent</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      </div>
    </div>
  );
}
