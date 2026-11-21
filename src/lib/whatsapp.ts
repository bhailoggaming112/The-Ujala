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
// expects, so "0300 1234567", "+92 300 1234567" and "0092-300-1234567" all become
// 923001234567.
export function cleanPhoneNumber(raw: string | null | undefined): string {
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = DEFAULT_COUNTRY_CODE + digits.slice(1);
  return digits;
}

export function whatsappLink(rawPhone: string | null | undefined, message: string): string {
  const phone = cleanPhoneNumber(rawPhone);
  const text = encodeURIComponent(message);
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
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
