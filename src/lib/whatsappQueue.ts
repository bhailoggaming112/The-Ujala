import { whatsappLink, type AlertSendMode } from '@/lib/whatsapp';

export type OpenResult = { ok: boolean; link: string };

// Opens a WhatsApp chat with the message pre-filled. The real wa.me URL is opened
// directly — no blank tab is created first — so a blocked pop-up leaves nothing
// behind. When the browser blocks the window, ok is false and the caller can show
// the returned link as a clickable fallback.
export function openWhatsAppChat(
  phone: string | null,
  message: string,
  mode: AlertSendMode,
): OpenResult {
  const link = whatsappLink(phone, message, mode);

  if (mode === 'desktop') {
    // A custom-protocol link has no tab to report back, so the click is fired from a
    // throwaway anchor and WhatsApp Desktop takes over.
    const anchor = document.createElement('a');
    anchor.href = link;
    anchor.rel = 'noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return { ok: true, link };
  }

  const opened = window.open(link, '_blank', 'noopener,noreferrer');
  return { ok: Boolean(opened), link };
}
