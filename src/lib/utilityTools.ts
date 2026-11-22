import { supabase } from '@/lib/supabase';

// ============================================================================
// Types
// ============================================================================

export type CardType = 'staff' | 'visitor' | 'guest';
export type JobStatus = 'pending' | 'shortlisted' | 'rejected' | 'hired';
export type EventType = 'academic' | 'cultural' | 'sports' | 'meeting' | 'holiday' | 'other';
export type EventStatus = 'upcoming' | 'completed' | 'cancelled';
export type Audience = 'all' | 'staff' | 'students' | 'parents';
export type Priority = 'normal' | 'important' | 'urgent';

export type VisitingCard = {
  id: string;
  person_name: string;
  designation: string;
  phone: string;
  email: string;
  organization: string;
  card_type: CardType;
  notes: string | null;
  created_at: string;
};

export type JobApplication = {
  id: string;
  applicant_name: string;
  position_applied: string;
  phone: string;
  email: string;
  applied_date: string;
  status: JobStatus;
  notes: string | null;
  created_at: string;
};

export type SchoolEvent = {
  id: string;
  title: string;
  event_date: string;
  end_date: string | null;
  location: string;
  description: string | null;
  event_type: EventType;
  status: EventStatus;
  created_at: string;
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  priority: Priority;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
};

export type TimetableEntry = {
  id: string;
  class_name: string;
  section_name: string;
  day_of_week: number;
  period: number;
  subject: string;
  teacher_name: string;
  start_time: string;
  end_time: string;
  room: string;
  notes: string | null;
  updated_at: string;
};

export type VisitingCardDraft = Omit<VisitingCard, 'id' | 'created_at'>;
export type JobDraft = Omit<JobApplication, 'id' | 'created_at'>;
export type EventDraft = Omit<SchoolEvent, 'id' | 'created_at'>;
export type AnnouncementDraft = Omit<Announcement, 'id' | 'created_at'>;
export type TimetableDraft = Omit<TimetableEntry, 'id' | 'updated_at'>;

// ============================================================================
// Label maps
// ============================================================================

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  staff: 'Staff',
  visitor: 'Visitor',
  guest: 'Guest',
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  pending: 'Pending',
  shortlisted: 'Shortlisted',
  rejected: 'Rejected',
  hired: 'Hired',
};

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  academic: 'Academic',
  cultural: 'Cultural',
  sports: 'Sports',
  meeting: 'Meeting',
  holiday: 'Holiday',
  other: 'Other',
};

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  upcoming: 'Upcoming',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const AUDIENCE_LABELS: Record<Audience, string> = {
  all: 'Everyone',
  staff: 'Staff',
  students: 'Students',
  parents: 'Parents',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  normal: 'Normal',
  important: 'Important',
  urgent: 'Urgent',
};

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ============================================================================
// Generic error helper
// ============================================================================

const genericError = (err: unknown, fallback: string) => {
  console.error(fallback, err);
  return fallback;
};

// ============================================================================
// Visiting Cards
// ============================================================================

export async function fetchVisitingCards(): Promise<{ cards: VisitingCard[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('school_visiting_cards')
      .select('id, person_name, designation, phone, email, organization, card_type, notes, created_at')
      .order('created_at', { ascending: false });
    if (error) return { cards: [], error: error.message };
    return { cards: (data ?? []) as VisitingCard[], error: null };
  } catch (err) {
    return { cards: [], error: genericError(err, 'Visiting cards could not be loaded.') };
  }
}

export async function saveVisitingCard(draft: VisitingCardDraft): Promise<string | null> {
  try {
    const { error } = await supabase.from('school_visiting_cards').insert(draft);
    return error ? error.message : null;
  } catch (err) {
    return genericError(err, 'The visiting card could not be saved.');
  }
}

export async function deleteVisitingCard(id: string): Promise<string | null> {
  try {
    const { error } = await supabase.from('school_visiting_cards').delete().eq('id', id);
    return error ? error.message : null;
  } catch (err) {
    return genericError(err, 'That card could not be removed.');
  }
}

// ============================================================================
// Job Applications
// ============================================================================

export async function fetchJobApplications(): Promise<{ jobs: JobApplication[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('school_job_applications')
      .select('id, applicant_name, position_applied, phone, email, applied_date, status, notes, created_at')
      .order('applied_date', { ascending: false });
    if (error) return { jobs: [], error: error.message };
    return { jobs: (data ?? []) as JobApplication[], error: null };
  } catch (err) {
    return { jobs: [], error: genericError(err, 'Job applications could not be loaded.') };
  }
}

export async function saveJobApplication(draft: JobDraft): Promise<string | null> {
  try {
    const { error } = await supabase.from('school_job_applications').insert(draft);
    return error ? error.message : null;
  } catch (err) {
    return genericError(err, 'The job application could not be saved.');
  }
}

export async function updateJobStatus(id: string, status: JobStatus): Promise<string | null> {
  try {
    const { error } = await supabase.from('school_job_applications').update({ status }).eq('id', id);
    return error ? error.message : null;
  } catch (err) {
    return genericError(err, 'The status could not be updated.');
  }
}

export async function deleteJobApplication(id: string): Promise<string | null> {
  try {
    const { error } = await supabase.from('school_job_applications').delete().eq('id', id);
    return error ? error.message : null;
  } catch (err) {
    return genericError(err, 'That application could not be removed.');
  }
}

// ============================================================================
// Events
// ============================================================================

export async function fetchEvents(): Promise<{ events: SchoolEvent[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('school_events')
      .select('id, title, event_date, end_date, location, description, event_type, status, created_at')
      .order('event_date', { ascending: true });
    if (error) return { events: [], error: error.message };
    return { events: (data ?? []) as SchoolEvent[], error: null };
  } catch (err) {
    return { events: [], error: genericError(err, 'Events could not be loaded.') };
  }
}

export async function saveEvent(draft: EventDraft): Promise<string | null> {
  try {
    const { error } = await supabase.from('school_events').insert(draft);
    return error ? error.message : null;
  } catch (err) {
    return genericError(err, 'The event could not be saved.');
  }
}

export async function updateEventStatus(id: string, status: EventStatus): Promise<string | null> {
  try {
    const { error } = await supabase.from('school_events').update({ status }).eq('id', id);
    return error ? error.message : null;
  } catch (err) {
    return genericError(err, 'The status could not be updated.');
  }
}

export async function deleteEvent(id: string): Promise<string | null> {
  try {
    const { error } = await supabase.from('school_events').delete().eq('id', id);
    return error ? error.message : null;
  } catch (err) {
    return genericError(err, 'That event could not be removed.');
  }
}

// ============================================================================
// Announcements
// ============================================================================

export async function fetchAnnouncements(): Promise<{ announcements: Announcement[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('school_announcements')
      .select('id, title, body, audience, priority, start_date, end_date, is_active, created_at')
      .order('created_at', { ascending: false });
    if (error) return { announcements: [], error: error.message };
    return { announcements: (data ?? []) as Announcement[], error: null };
  } catch (err) {
    return { announcements: [], error: genericError(err, 'Announcements could not be loaded.') };
  }
}

export async function saveAnnouncement(draft: AnnouncementDraft): Promise<string | null> {
  try {
    const { error } = await supabase.from('school_announcements').insert(draft);
    return error ? error.message : null;
  } catch (err) {
    return genericError(err, 'The announcement could not be saved.');
  }
}

export async function toggleAnnouncementActive(id: string, isActive: boolean): Promise<string | null> {
  try {
    const { error } = await supabase.from('school_announcements').update({ is_active: isActive }).eq('id', id);
    return error ? error.message : null;
  } catch (err) {
    return genericError(err, 'The announcement could not be updated.');
  }
}

export async function deleteAnnouncement(id: string): Promise<string | null> {
  try {
    const { error } = await supabase.from('school_announcements').delete().eq('id', id);
    return error ? error.message : null;
  } catch (err) {
    return genericError(err, 'That announcement could not be removed.');
  }
}

// ============================================================================
// Timetable
// ============================================================================

export async function fetchTimetable(classFilter: string, sectionFilter: string): Promise<{ entries: TimetableEntry[]; error: string | null }> {
  try {
    let query = supabase
      .from('school_timetables')
      .select('id, class_name, section_name, day_of_week, period, subject, teacher_name, start_time, end_time, room, notes, updated_at')
      .order('day_of_week', { ascending: true })
      .order('period', { ascending: true });
    if (classFilter) query = query.eq('class_name', classFilter);
    if (sectionFilter) query = query.eq('section_name', sectionFilter);
    const { data, error } = await query;
    if (error) return { entries: [], error: error.message };
    return { entries: (data ?? []) as TimetableEntry[], error: null };
  } catch (err) {
    return { entries: [], error: genericError(err, 'The timetable could not be loaded.') };
  }
}

export async function saveTimetableEntry(draft: TimetableDraft): Promise<string | null> {
  try {
    const { error } = await supabase.from('school_timetables').insert(draft);
    return error ? error.message : null;
  } catch (err) {
    return genericError(err, 'The timetable entry could not be saved.');
  }
}

export async function deleteTimetableEntry(id: string): Promise<string | null> {
  try {
    const { error } = await supabase.from('school_timetables').delete().eq('id', id);
    return error ? error.message : null;
  } catch (err) {
    return genericError(err, 'That entry could not be removed.');
  }
}

// ============================================================================
// SMS Templates — reuses existing school_notice_templates table
// ============================================================================

export type SmsTemplate = {
  id: string;
  notice_type: string;
  language: 'English' | 'Urdu';
  template_text: string;
  updated_at: string;
};

export async function fetchAllSmsTemplates(): Promise<{ templates: SmsTemplate[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('school_notice_templates')
      .select('id, notice_type, language, template_text, updated_at')
      .order('notice_type', { ascending: true })
      .order('language', { ascending: true });
    if (error) return { templates: [], error: error.message };
    return { templates: (data ?? []) as SmsTemplate[], error: null };
  } catch (err) {
    return { templates: [], error: genericError(err, 'SMS templates could not be loaded.') };
  }
}

export async function saveSmsTemplate(template: { notice_type: string; language: 'English' | 'Urdu'; template_text: string }): Promise<string | null> {
  try {
    const { error } = await supabase
      .from('school_notice_templates')
      .upsert(
        { ...template, updated_at: new Date().toISOString() },
        { onConflict: 'notice_type,language' },
      );
    return error ? error.message : null;
  } catch (err) {
    return genericError(err, 'The template could not be saved.');
  }
}

// ============================================================================
// Reports — computed from the above tables plus calendar days
// ============================================================================

export type UtilityReportData = {
  totalCards: number;
  totalJobs: number;
  jobsByStatus: Record<string, number>;
  totalEvents: number;
  upcomingEvents: number;
  totalAnnouncements: number;
  activeAnnouncements: number;
  totalHolidays: number;
};

export async function fetchUtilityReportData(): Promise<{ data: UtilityReportData | null; error: string | null }> {
  try {
    const [cardsR, jobsR, eventsR, annR, daysR] = await Promise.all([
      supabase.from('school_visiting_cards').select('id', { count: 'exact', head: true }),
      supabase.from('school_job_applications').select('status'),
      supabase.from('school_events').select('id, status, event_date'),
      supabase.from('school_announcements').select('id, is_active'),
      supabase.from('school_calendar_days').select('id', { count: 'exact', head: true }),
    ]);

    const jobs = (jobsR.data ?? []) as { status: string }[];
    const jobsByStatus: Record<string, number> = {};
    for (const job of jobs) jobsByStatus[job.status] = (jobsByStatus[job.status] ?? 0) + 1;

    const events = (eventsR.data ?? []) as { status: string; event_date: string }[];
    const today = new Date().toISOString().slice(0, 10);
    const upcomingEvents = events.filter((e) => e.status === 'upcoming' && e.event_date >= today).length;

    const anns = (annR.data ?? []) as { is_active: boolean }[];
    const activeAnnouncements = anns.filter((a) => a.is_active).length;

    return {
      data: {
        totalCards: cardsR.count ?? 0,
        totalJobs: jobs.length,
        jobsByStatus,
        totalEvents: events.length,
        upcomingEvents,
        totalAnnouncements: anns.length,
        activeAnnouncements,
        totalHolidays: daysR.count ?? 0,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: genericError(err, 'The report data could not be loaded.') };
  }
}

// ============================================================================
// Holidays — reuses existing school_calendar_days table
// ============================================================================

export type HolidayRow = {
  id: string;
  day_date: string;
  end_date: string;
  day_type: string;
  title: string;
  notes: string | null;
};

export async function fetchHolidays(): Promise<{ holidays: HolidayRow[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('school_calendar_days')
      .select('id, day_date, end_date, day_type, title, notes')
      .order('day_date', { ascending: true });
    if (error) return { holidays: [], error: error.message };
    return { holidays: (data ?? []) as HolidayRow[], error: null };
  } catch (err) {
    return { holidays: [], error: genericError(err, 'Holidays could not be loaded.') };
  }
}
