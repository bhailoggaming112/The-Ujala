import { useEffect, useMemo, useState } from 'react';
import { CalendarOff, Search } from 'lucide-react';
import { fetchHolidays, type HolidayRow } from '@/lib/utilityTools';
import { CALENDAR_DAY_LABELS } from '@/lib/attendance';
import { useAuth } from '@/lib/auth';

type Props = {
  onToast: (message: string) => void;
};

export function UtilityHolidaysTab({ onToast }: Props) {
  void onToast;
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const load = async () => {
    setLoading(true);
    const result = await fetchHolidays();
    setHolidays(result.holidays);
    setError(result.error ?? '');
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    return holidays.filter((h) => {
      if (typeFilter && h.day_type !== typeFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return [h.title, h.notes ?? ''].join(' ').toLowerCase().includes(q);
    });
  }, [holidays, search, typeFilter]);

  const dayLabel = (type: string) => CALENDAR_DAY_LABELS[type as keyof typeof CALENDAR_DAY_LABELS] ?? type;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = filtered.filter((h) => h.end_date >= today).length;

  return (
    <div className="fee-card">
      <div className="fee-card-head">
        <div>
          <span className="eyebrow">Holidays</span>
          <h2>School Holidays &amp; Closed Days</h2>
        </div>
      </div>

      <p className="fee-hint">
        These are the same holidays used by the attendance system.{' '}
        {isAdmin ? 'To add or change them, open the Daily Attendance screen and use the school calendar settings.' : ''}
      </p>

      <div className="fee-filters">
        <label className="control-field">
          <Search size={16} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title…" />
        </label>
        <label className="control-field">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {Object.entries(CALENDAR_DAY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="fee-alert"><span>{error}</span></div>}

      {loading ? (
        <p className="fee-empty">Loading holidays…</p>
      ) : filtered.length === 0 ? (
        <p className="fee-empty">No holidays{search || typeFilter ? ' match your filters' : ''}.</p>
      ) : (
        <>
          <div className="fee-kpi-grid compact" style={{ marginBottom: 16 }}>
            <div className="fee-kpi sky">
              <span className="fee-kpi-icon"><CalendarOff size={20} /></span>
              <div><span>Total holidays</span><strong>{filtered.length}</strong></div>
            </div>
            <div className="fee-kpi mint">
              <span className="fee-kpi-icon"><CalendarOff size={20} /></span>
              <div><span>Upcoming</span><strong>{upcoming}</strong></div>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Title</th><th>Type</th><th>Start</th><th>End</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {filtered.map((h) => (
                  <tr key={h.id}>
                    <td><strong>{h.title}</strong></td>
                    <td><span className="fee-status neutral">{dayLabel(h.day_type)}</span></td>
                    <td className="fee-mono">{h.day_date}</td>
                    <td className="fee-mono">{h.end_date !== h.day_date ? h.end_date : '—'}</td>
                    <td>{h.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
