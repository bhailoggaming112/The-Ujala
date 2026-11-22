import { fetchAbsenteeSendMode } from '@/lib/absenteeAlerts';
import { SCHOOL_NAME } from '@/lib/noticeText';
import { formatMoney, monthLabel } from '@/lib/fees';
import { queueSmsMessages, updateSmsStatus } from '@/lib/smsLog';
import { pickWhatsAppContact } from '@/lib/whatsapp';
import { closeWhatsAppWindow, openWhatsAppChat, primeWhatsAppWindow } from '@/lib/whatsappQueue';
import { supabase } from '@/lib/supabase';
import type { Student } from '@/lib/schoolTypes';

// The wording of a fee reminder, shared by every screen that can send one.
export function feeReminderMessage(student: Student, due: number, month: string) {
  return [
    SCHOOL_NAME,
    `Fee reminder — ${monthLabel(month)}`,
    `Dear Parent, the fee account for ${student.full_name} (${student.class_name} · Section ${student.section_name}) has an outstanding balance of ${formatMoney(due)}.`,
    'Kindly clear the dues at the school office at your earliest convenience. Thank you.',
  ].join('\n');
}

export type ReminderResult = { sent: number; skipped: number; error: string | null };

// Posts a fee reminder notification into the portal so it appears in both the Parent
// Portal and the Student Portal. The database unique index on
// (student_id, notification_type, attendance_date) prevents duplicates per day.
async function createPortalReminder(student: Student, due: number, today: string): Promise<void> {
  try {
    await supabase.rpc('create_fee_reminder_notification', {
      p_student_id: student.id,
      p_due_amount: due,
      p_reminder_date: today,
    });
  } catch {
    // The portal notification is a convenience, not a gate on the WhatsApp send.
  }
}

// Sends fee reminders through the school's existing WhatsApp route. Each message is
// logged first (so a send that fails is still visible in the SMS report) and only
// students with a usable contact number are messaged.
export async function sendFeeReminders(targets: Student[], month: string, today: string): Promise<ReminderResult> {
  if (targets.length === 0) return { sent: 0, skipped: 0, error: null };

  let sendMode: 'web' | 'desktop' = 'web';
  try { sendMode = await fetchAbsenteeSendMode(); } catch { sendMode = 'web'; }

  const senderWindow: Window | null = null;
  let sent = 0;
  let skipped = 0;
  let primed = false;

  for (const student of targets) {
    const contact = pickWhatsAppContact(student);
    if (!contact.number) { skipped += 1; continue; }
    if (!primed) { primeWhatsAppWindow(sendMode); primed = true; }
    const body = feeReminderMessage(student, Math.max(0, Number(student.fee_balance ?? 0)), month);
    const { ids, error } = await queueSmsMessages([{
      student_id: student.id,
      student_name: student.full_name,
      class_name: student.class_name,
      section_name: student.section_name,
      parent_phone: contact.number,
      message_type: 'fee_reminder',
      message_body: body,
      attendance_date: today,
    }]);
    if (error) { if (senderWindow) closeWhatsAppWindow(senderWindow); return { sent, skipped, error }; }
    const result = openWhatsAppChat(contact.number, body, sendMode);
    await updateSmsStatus(ids, result.ok ? 'sent' : 'failed', result.ok ? `WhatsApp opened (${sendMode})` : 'WhatsApp window was blocked');
    if (result.ok) {
      sent += 1;
      await createPortalReminder(student, Math.max(0, Number(student.fee_balance ?? 0)), today);
    } else {
      skipped += 1;
    }
  }

  if (sent === 0 && senderWindow) closeWhatsAppWindow(senderWindow);
  return { sent, skipped, error: null };
}
