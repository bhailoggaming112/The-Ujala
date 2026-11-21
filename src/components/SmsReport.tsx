import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock, RefreshCw, Send, XCircle } from 'lucide-react';
import { fetchSmsLog, updateSmsStatus, type SmsLogFilters } from '@/lib/smsLog';
import type { SmsLogEntry, SmsLogStatus } from '@/lib/schoolTypes';

const statusMeta: Record<SmsLogStatus, { label: string; icon: typeof CheckCircle2 }> = {
  sent: { label: 'Sent', icon: CheckCircle2 },
  failed: { label: 'Failed', icon: XCircle },
  pending: { label: 'Pending', icon: Clock },
};

const statusOptions: { value: SmsLogStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'sent', label: 'Sent' },
  { value: 'pending', label: 'Pending' },
  { value: 'failed', label: 'Failed' },
];

const formatStamp = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function SmsReport({ onToast }: { onToast: (message: string) => void }) {
  const [filters, setFilters] = useState<SmsLogFilters>({ date: '', status: '' });
  const [entries, setEntries] = useState<SmsLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [notice, setNotice] = useState('');

  const load = useCallback(async (next: SmsLogFilters) => {
    setLoading(true);
    const result = await fetchSmsLog(next);
    setEntries(result.entries);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => { void load(filters); }, [filters, load]);

  const dates = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.attendance_date).filter((value): value is string => Boolean(value)))).sort().reverse(),
    [entries],
  );

  const visible = useMemo(
    () => (notice.trim()
      ? entries.filter((entry) =>
        entry.student_name.toLowerCase().includes(notice.trim().toLowerCase())
        || (entry.parent_phone ?? '').includes(notice.trim())
        || (entry.message_body ?? '').toLowerCase().includes(notice.trim().toLowerCase()))
      : entries),
    [entries, notice],
  );

  const counts = useMemo(() => ({
    total: visible.length,
    sent: visible.filter((entry) => entry.status === 'sent').length,
    pending: visible.filter((entry) => entry.status === 'pending').length,
    failed: visible.filter((entry) => entry.status === 'failed').length,
  }), [visible]);

  const retry = async (entry: SmsLogEntry) => {
    setBusyIds((current) => [...current, entry.id]);
    const updateError = await updateSmsStatus([entry.id], 'sent');
    setBusyIds((current) => current.filter((id) => id !== entry.id));
    if (updateError) { onToast('This alert could not be marked as sent.'); return; }
    setEntries((current) => current.map((row) => (row.id === entry.id ? { ...row, status: 'sent', sent_at: new Date().toISOString() } : row)));
    onToast(`Alert to ${entry.student_name} marked as sent`);
  };

  return (
    <div className="sms-report">
      <div className="panel attendance-filters-panel">
        <div className="att-filters">
          <label className="control-field">Report date
            <input type="date" value={filters.date} onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))} />
          </label>
          <label className="control-field">Status
            <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as SmsLogStatus | '' }))}>
              {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="control-field">Search
            <input value={notice} onChange={(event) => setNotice(event.target.value)} placeholder="Student, number or message" />
          </label>
          <button type="button" className="secondary-button" onClick={() => { setFilters({ date: '', status: '' }); setNotice(''); }}><RefreshCw size={15} /> Clear filters</button>
        </div>
        <div className="sms-report-summary">
          <span className="sms-chip total"><Send size={14} /> {counts.total} logged</span>
          <span className="sms-chip sent"><CheckCircle2 size={14} /> {counts.sent} sent</span>
          <span className="sms-chip pending"><Clock size={14} /> {counts.pending} pending</span>
          <span className="sms-chip failed"><XCircle size={14} /> {counts.failed} failed</span>
        </div>
      </div>

      {dates.length > 0 && (
        <div className="panel sms-day-strip">
          <span className="sms-day-label">Jump to a date</span>
          <button type="button" className={`sms-day ${filters.date === '' ? 'on' : ''}`} onClick={() => setFilters((current) => ({ ...current, date: '' }))}>All dates</button>
          {dates.slice(0, 12).map((day) => (
            <button key={day} type="button" className={`sms-day ${filters.date === day ? 'on' : ''}`} onClick={() => setFilters((current) => ({ ...current, date: day }))}>
              {formatStamp(`${day}T00:00:00`)}
            </button>
          ))}
        </div>
      )}

      <div className="panel roster-panel">
        <div className="table-wrap">
          <table className="min-w-[980px]">
            <thead>
              <tr>
                <th>Student</th>
                <th>Class / Section</th>
                <th>Attendance date</th>
                <th>Parent number</th>
                <th>Message type</th>
                <th>Status</th>
                <th>Timestamp</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => {
                const meta = statusMeta[entry.status] ?? statusMeta.pending;
                const StatusIcon = meta.icon;
                return (
                  <tr key={entry.id}>
                    <td><strong>{entry.student_name}</strong></td>
                    <td>{entry.class_name ? `${entry.class_name} · ${entry.section_name ?? '—'}` : '—'}</td>
                    <td className="muted-cell">{entry.attendance_date ? formatStamp(`${entry.attendance_date}T00:00:00`) : '—'}</td>
                    <td>{entry.parent_phone || '—'}</td>
                    <td><span className="sms-type">{entry.message_type.replace(/_/g, ' ')}</span></td>
                    <td><span className={`sms-status ${entry.status}`}><StatusIcon size={14} /> {meta.label}</span></td>
                    <td className="muted-cell">{formatStamp(entry.sent_at ?? entry.created_at)}</td>
                    <td>
                      {entry.status !== 'sent' && (
                        <button
                          type="button"
                          className="row-action-btn"
                          disabled={busyIds.includes(entry.id)}
                          onClick={() => void retry(entry)}
                        >
                          <Send size={13} /> {busyIds.includes(entry.id) ? 'Working…' : 'Mark sent'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {loading && <div className="empty-state large">Loading SMS report…</div>}
          {!loading && error && <div className="empty-state large">{error}</div>}
          {!loading && !error && visible.length === 0 && (
            <div className="empty-state large">
              <CalendarDays size={20} />
              {entries.length === 0
                ? 'No SMS alerts logged for these filters yet. Send absentee alerts from the Daily Attendance tab and they will appear here.'
                : 'No alert matches that search.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
