import { supabase } from '@/lib/supabase';

// Pakistan is the default country for local numbers entered as 03001234567.
const DEFAULT_COUNTRY_CODE = '92';
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.pdf,.doc,.docx';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// Turns whatever the office typed into the digits-only international form WhatsApp
// expects, so "0300 1234567", "+92 300 1234567", "92-0300-1234567" and
// "0092-300-1234567" all become 923001234567.
export function cleanPhoneNumber(raw: string | null | undefined): string {
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith(`${DEFAULT_COUNTRY_CODE}0`)) digits = DEFAULT_COUNTRY_CODE + digits.slice(3);
  if (digits.startsWith('0')) digits = DEFAULT_COUNTRY_CODE + digits.slice(1);
  return digits;
}

// A national identity number is 13 digits, which is exactly the shape a CNIC takes,
// so it can never be treated as a phone number.
const CNIC_DIGITS = 13;

export function isValidWhatsAppNumber(raw: string | null | undefined): boolean {
  const digits = cleanPhoneNumber(raw);
  if (!digits) return false;
  if (digits.length === CNIC_DIGITS) return false;
  if (digits.length < 10 || digits.length > 15) return false;
  // A number that already carries the country code must be a full 92 + 10 digits.
  if (digits.startsWith(DEFAULT_COUNTRY_CODE) && digits.length !== 12) return false;
  return true;
}

export type WhatsAppSource = 'WhatsApp Number' | 'Messaging Number' | 'Father Contact No.' | 'Guardian Phone' | 'Mother Number';

export type WhatsAppContact = { number: string; source: WhatsAppSource | null; raw: string | null };

export type WhatsAppFields = {
  whatsapp_number?: string | null;
  messaging_number?: string | null;
  father_contact_number?: string | null;
  guardian_phone?: string | null;
  mother_number?: string | null;
};

// The WhatsApp Number saved on the student is always the first choice. Messaging
// Number, Father Contact, Guardian Phone and Mother Number are fallbacks, checked in
// that order. A value that is not a real phone number (a CNIC, for example) is skipped
// rather than dialled.
export function pickWhatsAppContact(student: WhatsAppFields): WhatsAppContact {
  const candidates: { label: WhatsAppSource; value: string | null }[] = [
    { label: 'WhatsApp Number', value: student.whatsapp_number ?? null },
    { label: 'Messaging Number', value: student.messaging_number ?? null },
    { label: 'Father Contact No.', value: student.father_contact_number ?? null },
    { label: 'Guardian Phone', value: student.guardian_phone ?? null },
    { label: 'Mother Number', value: student.mother_number ?? null },
  ];
  for (const candidate of candidates) {
    const raw = (candidate.value ?? '').trim();
    if (!raw || !isValidWhatsAppNumber(raw)) continue;
    return { number: cleanPhoneNumber(raw), source: candidate.label, raw };
  }
  return { number: '', source: null, raw: null };
}

// Explains why a student cannot be messaged, so the office knows what to fix instead
// of the app opening a WhatsApp chat with a broken number.
export function whatsappNumberWarning(student: WhatsAppFields): string {
  const saved = [student.whatsapp_number, student.messaging_number, student.father_contact_number, student.guardian_phone, student.mother_number]
    .map((value) => (value ?? '').trim())
    .filter(Boolean);
  if (saved.length === 0) return 'No WhatsApp, messaging or contact number is saved for this student.';
  if (saved.some((value) => cleanPhoneNumber(value).length === CNIC_DIGITS)) {
    return 'The saved number looks like a CNIC rather than a phone number. Save a real WhatsApp number on the student record.';
  }
  return 'The saved contact numbers are not valid phone numbers, so no WhatsApp chat can be opened for this student.';
}

// 'web' opens WhatsApp Web (web.whatsapp.com/send) in a browser tab; 'app' hands the
// message to the installed WhatsApp app via the whatsapp:// protocol; 'wa.me' uses the
// universal wa.me link that works on both mobile and desktop without a landing page.
export type AlertSendMode = 'web' | 'app' | 'wa.me';

export function whatsappLink(
  rawPhone: string | null | undefined,
  message: string,
  mode: AlertSendMode = 'app',
): string {
  const phone = cleanPhoneNumber(rawPhone);
  const text = encodeURIComponent(message);
  if (mode === 'app') {
    return phone ? `whatsapp://send?phone=${phone}&text=${text}` : `whatsapp://send?text=${text}`;
  }
  if (mode === 'web') {
    return phone
      ? `https://web.whatsapp.com/send?phone=${phone}&text=${text}`
      : `https://web.whatsapp.com/send?text=${text}`;
  }
  return phone
    ? `https://wa.me/${phone}?text=${text}`
    : `https://wa.me/?text=${text}`;
}

export function whatsappWebLink(rawPhone: string | null | undefined, message: string): string {
  return whatsappLink(rawPhone, message, 'web');
}

export function attachmentError(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) return 'Attach a JPEG, PNG, PDF or Word document.';
  if (file.size > MAX_ATTACHMENT_BYTES) return 'That file is larger than 10 MB. Please choose a smaller one.';
  return null;
}

const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80) || 'attachment';

// Uploads to a private bucket in a folder named after the signed-in account, then
// returns a long-lived signed link. The link is what goes into the WhatsApp text and
// the parent portal notice, so it has to stay valid well past the moment of upload.
export async function uploadAbsenteeAttachment(
  file: File,
): Promise<{ url: string; name: string; error: string | null }> {
  const invalid = attachmentError(file);
  if (invalid) return { url: '', name: '', error: invalid };

  try {
    const { data: session } = await supabase.auth.getUser();
    const userId = session.user?.id;
    if (!userId) return { url: '', name: '', error: 'Your session has ended. Sign in again to attach a file.' };

    const path = `${userId}/${Date.now()}-${safeName(file.name)}`;
    const { error } = await supabase.storage
      .from('whatsapp-attachments')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) return { url: '', name: '', error: 'The file could not be uploaded. Please try again.' };

    const { data: signed, error: signError } = await supabase.storage
      .from('whatsapp-attachments')
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    if (signError || !signed?.signedUrl) {
      return { url: '', name: '', error: 'The file uploaded but its shareable link could not be created.' };
    }
    return { url: signed.signedUrl, name: file.name, error: null };
  } catch {
    return { url: '', name: '', error: 'The file could not be uploaded. Check your connection and try again.' };
  }
}

// Appends the attachment link to the alert wording once, so re-sending the same row
// never stacks two copies of the link.
export function messageWithAttachment(message: string, attachmentUrl: string | null | undefined): string {
  const body = message.trim();
  if (!attachmentUrl) return body;
  if (body.includes(attachmentUrl)) return body;
  return `${body}\n\nAttachment: ${attachmentUrl}`;
}
