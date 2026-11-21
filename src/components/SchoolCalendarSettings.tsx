import { useEffect, useState } from 'react';
import { CalendarPlus, Info, MousePointerClick, Percent, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import {
  ALL_WEEKDAYS, CALENDAR_DAY_LABELS, MONTH_NAMES, WEEKDAY_LABELS, WEEKDAY_SHORT,
  isClosedDayType, toDateKey, todayKey,
  type CalendarDay, type CalendarDayType, type CalendarPolicy,
} from '@/lib/attendance';

type CalendarForm = { date: string; title: string; notes: string };

const emptyForm = (): CalendarForm => ({ date: '', title: '', notes: '' });

const formatDay = (value: string) =>
  new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });

const groupByMonth = (days: CalendarDay[]) => {
  const groups: { key: string; label: string; items: CalendarDay[] }[] = [];
  for (const day of [...days].sort((a, b) => a.day_date.localeCompare(b.day_date))) {
    const date = new Date(`${day.day_date.slice(0, 10)}T00:00:00`);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const label = `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(day);
    else groups.push({ key, label, items: [day] });
  }
  return groups;
};

type Props = {
  policy: CalendarPolicy;
  days: CalendarDay[];
  saving: boolean;
  onPolicyChange: (policy: CalendarPolicy) => void;
  onSavePolicy: () => void;
  onAddDay: (entry: { day_date: string; day_type: CalendarDayType; title: string; notes?: string | null }) => void;
  onRemoveDay: (dayDate: string) => void;
  onToast: (message: string) => void;
};

export function SchoolCalendarSettings({
  policy, days, saving, onPolicyChange, onSavePolicy, onAddDay, onRemoveDay, onToast,
}: Props) {
  const [holidayForm, setHolidayForm] = useState<CalendarForm>(emptyForm);
  const [specialForm, setSpecialForm] = useState<CalendarForm>(emptyForm);
  const [thresholdDraft, setThresholdDraft] = useState(String(policy.low_attendance_threshold));
  const [showAllWeekdays, setShowAllWeekdays] = useState(false);

  // Follows the saved policy, so the box is right even when the policy finishes
  // loading after this tab is already open.
  useEffect(() => { setThresholdDraft(String(policy.low_attendance_threshold)); }, [policy.low_attendance_threshold]);

  const holidays = days.filter((day) => isClosedDayType(day.day_type));
  const specials = days.filter((day) => day.day_type === 'special_working');

  const threshold = Number(thresholdDraft);
  const thresholdValid = thresholdDraft.trim() !== '' && Number.isFinite(threshold) && threshold >= 0 && threshold <= 100;

  const applyThreshold = () => {
    if (!thresholdValid) { setThresholdDraft(String(policy.low_attendance_threshold)); return; }
    onPolicyChange({ ...policy, low_attendance_threshold: threshold });
  };

  const toggleWeekday = (weekday: number) => {
    const next = policy.working_days.includes(weekday)
      ? policy.working_days.filter((day) => day !== weekday)
      : [...policy.working_days, weekday].sort((a, b) => a - b);
    if (next.length === 0) { onToast('A school week needs at least one working day.'); return; }
    onPolicyChange({ ...policy, working_days: next });
  };

  const addDay = (type: CalendarDayType, form: CalendarForm, reset: () => void, label: string) => {
    if (!form.date) { onToast(`Choose the date for the ${label.toLowerCase()} first.`); return; }
    if (form.date < todayKey()) { onToast('Choose today or a future date.'); return; }
    onAddDay({ day_date: form.date, day_type: type, title: form.title, notes: form.notes });
    reset();
  };

  const renderList = (items: CalendarDay[], emptyText: string) => {
    if (items.length === 0) return <p className="cal-empty">{emptyText}</p>;
    return (
      <div className="cal-list">
        {groupByMonth(items).map((group) => (
          <div className="cal-month" key={group.key}>
            <span className="cal-month-label">{group.label}</span>
            {group.items.map((day) => (
              <div className={`cal-item ${day.day_type}`} key={day.id}>
                <span className="cal-item-date">{formatDay(day.day_date)}</span>
                <span className="cal-item-copy">
                  <strong>{day.title}</strong>
                  <small>{CALENDAR_DAY_LABELS[day.day_type]}{day.notes ? ` · ${day.notes}` : ''}</small>
                </span>
                <button
                  type="button"
                  className="cal-item-remove"
                  aria-label={`Remove ${day.title}`}
                  onClick={() => onRemoveDay(day.day_date.slice(0, 10))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  const weekdayTiles = showAllWeekdays ? ALL_WEEKDAYS : policy.working_days;

  return (
    <div className="cal-settings">
      <div className="panel cal-panel">
        <div className="cal-panel-header">
          <div className="cal-panel-copy">
            <span className="eyebrow">Attendance policy</span>
            <h2>School Working Schedule &amp; Policy</h2>
            <p>These settings decide which days count towards attendance and when a student is flagged for low attendance.</p>
          </div>
          <button type="button" className="primary-button" onClick={onSavePolicy} disabled={saving || !thresholdValid}>
            <Save size={16} /> {saving ? 'Saving…' : 'Save Policy'}
          </button>
        </div>

        <div className="cal-block">
          <div className="cal-block-head">
            <strong>Working days</strong>
            <span>Tap a day to switch it between a working day and a weekly off. Off days are shown in yellow.</span>
          </div>
          <div className="cal-week">
            {weekdayTiles.map((weekday) => {
              const working = policy.working_days.includes(weekday);
              return (
                <button
                  key={weekday}
                  type="button"
                  className={`cal-day-pill ${working ? 'working' : 'off'}`}
                  aria-pressed={!working}
                  onClick={() => toggleWeekday(weekday)}
                >
                  <span className="cal-day-short">{WEEKDAY_SHORT[weekday]}</span>
                  <span className="cal-day-full">{WEEKDAY_LABELS[weekday]}</span>
                  <span className="cal-day-state">{working ? 'Working' : 'Weekly off'}</span>
                </button>
              );
            })}
          </div>
          <button type="button" className="cal-week-toggle" onClick={() => setShowAllWeekdays((current) => !current)}>
            {showAllWeekdays ? 'Show only working days' : 'Show all seven days'}
          </button>
        </div>

        <div className="cal-policy-grid">
          <div className="cal-policy-card">
            <span className="cal-policy-icon"><Percent size={17} /></span>
            <div className="cal-policy-body">
              <strong>Low Attendance Warning Threshold (%)</strong>
              <small>Students below this attendance percentage are highlighted in the monthly report.</small>
              <div className="cal-threshold-row">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={thresholdDraft}
                  onChange={(event) => setThresholdDraft(event.target.value)}
                  onBlur={applyThreshold}
                  aria-label="Low attendance warning threshold percentage"
                />
                <span className="cal-threshold-unit">%</span>
              </div>
              {!thresholdValid && <span className="cal-inline-error">Enter a number between 0 and 100.</span>}
            </div>
          </div>

          <label className="cal-policy-card checkable">
            <span className="cal-policy-icon"><ShieldCheck size={17} /></span>
            <div className="cal-policy-body">
              <strong>Exclude approved leave days from attendance denominator</strong>
              <small>When on, a day a student was on approved leave is left out of the total instead of counting against them.</small>
            </div>
            <input
              type="checkbox"
              className="h-5 w-5 accent-sky-600"
              checked={policy.exclude_leave_from_denominator}
              onChange={(event) => onPolicyChange({ ...policy, exclude_leave_from_denominator: event.target.checked })}
            />
          </label>
        </div>

        <p className="cal-hint">
          <Info size={14} />
          Sundays are treated as a weekly off by default. Everything you change here takes effect as soon as you save the policy.
        </p>
      </div>

      <div className="cal-grid">
        <div className="panel cal-panel">
          <div className="cal-panel-header">
            <div className="cal-panel-copy">
              <span className="eyebrow">Closed days</span>
              <h2>School Vacations &amp; Public Holidays</h2>
              <p>Add every closed day so it is left out of the attendance count instead of being treated as an absence.</p>
            </div>
            <span className="cal-count">{holidays.length}</span>
          </div>

          <div className="cal-form">
            <label className="control-field">Date
              <input type="date" value={holidayForm.date} onChange={(event) => setHolidayForm((current) => ({ ...current, date: event.target.value }))} />
            </label>
            <label className="control-field">Title
              <input value={holidayForm.title} placeholder="Eid holidays, Independence Day…" onChange={(event) => setHolidayForm((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label className="control-field">Notes (optional)
              <input value={holidayForm.notes} placeholder="Office open for staff only" onChange={(event) => setHolidayForm((current) => ({ ...current, notes: event.target.value }))} />
            </label>
            <button
              type="button"
              className="secondary-button cal-add-button"
              onClick={() => addDay('holiday', holidayForm, () => setHolidayForm(emptyForm()), 'Holiday')}
            >
              <CalendarPlus size={16} /> Add Vacation / Holiday
            </button>
          </div>

          {renderList(holidays, 'No vacations or public holidays added yet.')}
        </div>

        <div className="panel cal-panel">
          <div className="cal-panel-header">
            <div className="cal-panel-copy">
              <span className="eyebrow">Open days</span>
              <h2>Special Working Day Overrides</h2>
              <p>Add a day the school opens even though the working week would normally keep it closed.</p>
            </div>
            <span className="cal-count special">{specials.length}</span>
          </div>

          <div className="cal-form">
            <label className="control-field">Date
              <input type="date" value={specialForm.date} onChange={(event) => setSpecialForm((current) => ({ ...current, date: event.target.value }))} />
            </label>
            <label className="control-field">Title
              <input value={specialForm.title} placeholder="Sports day, make-up class…" onChange={(event) => setSpecialForm((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label className="control-field">Notes (optional)
              <input value={specialForm.notes} placeholder="Half day, exams only" onChange={(event) => setSpecialForm((current) => ({ ...current, notes: event.target.value }))} />
            </label>
            <button
              type="button"
              className="secondary-button cal-add-button"
              onClick={() => addDay('special_working', specialForm, () => setSpecialForm(emptyForm()), 'Special working day')}
            >
              <Plus size={16} /> Add Special Working Day
            </button>
          </div>

          {renderList(specials, 'No special working days added yet.')}
        </div>
      </div>
    </div>
  );
}

// A month laid out as a clickable grid: tap a date to treat it as an off day,
// tap the same date again to reopen it.
type DayGridProps = {
  month: string;
  days: CalendarDay[];
  workingDays: number[];
  onToggle: (date: string) => void;
};

export function CalendarDayGrid({ month, days, workingDays, onToggle }: DayGridProps) {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return null;

  const firstDay = new Date(year, monthNumber - 1, 1).getDay();
  const totalDays = new Date(year, monthNumber, 0).getDate();
  const byDate = new Map(days.map((day) => [day.day_date.slice(0, 10), day]));
  const today = todayKey();

  const cells: (string | null)[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: totalDays }, (_, index) => toDateKey(new Date(year, monthNumber - 1, index + 1))),
  ];

  return (
    <div className="panel cal-grid-panel">
      <div className="cal-grid-head">
        <div>
          <span className="eyebrow">Tap to change</span>
          <strong>{MONTH_NAMES[monthNumber - 1]} {year}</strong>
        </div>
        <span className="cal-grid-note"><MousePointerClick size={15} /> Tap a date to mark it as an off day, or tap an off day again to reopen the school.</span>
      </div>
      <div className="cal-grid-weekdays">
        {WEEKDAY_SHORT.map((label) => <span key={label}>{label}</span>)}
      </div>
      <div className="cal-grid-cells">
        {cells.map((date, index) => {
          if (!date) return <span className="cal-cell blank" key={`blank-${index}`} />;
          const entry = byDate.get(date);
          const state = entry
            ? (entry.day_type === 'special_working' ? 'special' : 'off')
            : (workingDays.includes(new Date(`${date}T00:00:00`).getDay()) ? 'working' : 'off');
          return (
            <button
              type="button"
              key={date}
              className={`cal-cell ${state}${date === today ? ' today' : ''}`}
              title={entry ? `${entry.title} — ${CALENDAR_DAY_LABELS[entry.day_type]}` : 'Tap to mark this date as an off day'}
              onClick={() => onToggle(date)}
            >
              <span>{Number(date.slice(8, 10))}</span>
              {entry && <i className="cal-cell-dot" />}
            </button>
          );
        })}
      </div>
      <div className="cal-grid-legend">
        <span><i className="swatch working" /> School open</span>
        <span><i className="swatch off" /> Off day</span>
        <span><i className="swatch special" /> Special working day</span>
      </div>
    </div>
  );
}
