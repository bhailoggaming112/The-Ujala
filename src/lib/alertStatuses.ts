import type { AbsenteeAlertStatus, AbsenteeTemplate, AlertNoticeType } from '@/lib/schoolTypes';

// The three register marks that reach parents. Order matters: it is the order the
// filter pills and the template tabs appear in.
export const ALERT_STATUSES: AbsenteeAlertStatus[] = ['absent', 'leave', 'late'];

export const ALERT_STATUS_LABELS: Record<AbsenteeAlertStatus, string> = {
  absent: 'Absent',
  leave: 'Leave',
  late: 'Late',
};

// Each status keeps its own saved wording and its own log type, so one day can raise
// an absence notice and a late notice without the second overwriting the first.
export const ALERT_NOTICE_TYPES: Record<AbsenteeAlertStatus, AlertNoticeType> = {
  absent: 'absentee_alert',
  leave: 'leave_alert',
  late: 'late_alert',
};

export const ALERT_NOTICE_TYPE_LIST: AlertNoticeType[] = ALERT_STATUSES.map((status) => ALERT_NOTICE_TYPES[status]);

export const isAlertStatus = (value: string | null | undefined): value is AbsenteeAlertStatus =>
  value === 'absent' || value === 'leave' || value === 'late';

export const statusForNoticeType = (noticeType: string): AbsenteeAlertStatus | null =>
  ALERT_STATUSES.find((status) => ALERT_NOTICE_TYPES[status] === noticeType) ?? null;

export type AlertTemplates = Record<AbsenteeAlertStatus, Record<AbsenteeTemplate['language'], string>>;

export const ALERT_PLACEHOLDERS = ['{student_name}', '{class}', '{date}', '{school_name}'];

export const DEFAULT_ALERT_WORDING: AlertTemplates = {
  absent: {
    English: 'Dear Parent or Guardian, {student_name} of {class} was marked absent on {date} at {school_name}. Please contact the school office if this was not expected.',
    Urdu: 'محترم والدین، {student_name} ({class}) {date} کو {school_name} میں غیر حاضر رہے۔ اگر یہ غیر متوقع تھا تو براہِ کرم اسکول دفتر سے رابطہ کریں۔',
  },
  leave: {
    English: 'Dear Parent or Guardian, {student_name} of {class} was on approved leave on {date} at {school_name}. Please contact the school office if this was not expected.',
    Urdu: 'محترم والدین، {student_name} ({class}) {date} کو {school_name} میں رخصت پر تھے۔ اگر یہ غیر متوقع تھا تو براہِ کرم اسکول دفتر سے رابطہ کریں۔',
  },
  late: {
    English: 'Dear Parent or Guardian, {student_name} of {class} arrived late on {date} at {school_name}. Please make sure your child reaches school on time.',
    Urdu: 'محترم والدین، {student_name} ({class}) {date} کو {school_name} میں دیر سے پہنچے۔ براہِ کرم اپنے بچے کو وقت پر اسکول بھیجیں۔',
  },
};

export const defaultWordingFor = (
  status: AbsenteeAlertStatus,
  language: AbsenteeTemplate['language'],
): string => DEFAULT_ALERT_WORDING[status][language];

// Saved wording wins over the built-in default, so a school's own edit is never lost.
export function alertWordingFrom(templates: AbsenteeTemplate[]): AlertTemplates {
  const next: AlertTemplates = {
    absent: { ...DEFAULT_ALERT_WORDING.absent },
    leave: { ...DEFAULT_ALERT_WORDING.leave },
    late: { ...DEFAULT_ALERT_WORDING.late },
  };
  for (const template of templates) {
    const status = statusForNoticeType(template.notice_type);
    if (!status || !template.template_text?.trim()) continue;
    next[status][template.language] = template.template_text;
  }
  return next;
}
