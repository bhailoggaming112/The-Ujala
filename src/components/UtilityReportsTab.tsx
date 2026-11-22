import { useEffect, useState } from 'react';
import { AlertCircle, Briefcase, CalendarDays, CreditCard, Megaphone } from 'lucide-react';
import { fetchUtilityReportData, JOB_STATUS_LABELS, type JobStatus, type UtilityReportData } from '@/lib/utilityTools';

export function UtilityReportsTab() {
  const [data, setData] = useState<UtilityReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    const result = await fetchUtilityReportData();
    if (result.data) setData(result.data);
    if (result.error) setError(result.error);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  if (loading) return <p className="fee-empty">Loading report…</p>;
  if (error || !data) return <div className="fee-alert"><AlertCircle size={16} /><span>{error || 'Report unavailable.'}</span></div>;

  const cards = [
    { label: 'Visiting Cards', value: data.totalCards, icon: CreditCard, tone: 'sky' },
    { label: 'Job Applications', value: data.totalJobs, icon: Briefcase, tone: 'sun' },
    { label: 'Upcoming Events', value: data.upcomingEvents, icon: CalendarDays, tone: 'mint' },
    { label: 'Active Announcements', value: data.activeAnnouncements, icon: Megaphone, tone: 'coral' },
    { label: 'Total Events', value: data.totalEvents, icon: CalendarDays, tone: 'sky' },
    { label: 'Total Holidays', value: data.totalHolidays, icon: CalendarDays, tone: 'mint' },
  ];

  const jobKeys = Object.keys(JOB_STATUS_LABELS) as JobStatus[];

  return (
    <div className="fee-card">
      <div className="fee-card-head">
        <div>
          <span className="eyebrow">Reports</span>
          <h2>Utility Summary</h2>
        </div>
      </div>

      <div className="fee-kpi-grid">
        {cards.map((item) => (
          <div key={item.label} className={`fee-kpi ${item.tone}`}>
            <span className="fee-kpi-icon"><item.icon size={20} /></span>
            <div>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          </div>
        ))}
      </div>

      {data.totalJobs > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="fee-card-head">
            <div>
              <span className="eyebrow">Job Applications</span>
              <h2>By Status</h2>
            </div>
          </div>
          <div className="util-report-status-grid">
            {jobKeys.map((key) => (
              <div key={key} className="util-report-status">
                <span>{JOB_STATUS_LABELS[key]}</span>
                <strong>{data.jobsByStatus[key] ?? 0}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="fee-hint" style={{ marginTop: 20 }}>
        Figures are live counts from the database. Use each tab above to manage the records behind these numbers.
      </p>
    </div>
  );
}
