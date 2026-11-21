import { whatsappLink, type AlertSendMode } from '@/lib/whatsapp';

// One named tab is reused for a whole batch, so bulk sending leaves a single tab open
// instead of one tab per student.
const SENDER_WINDOW = 'whatsapp_sender';

export type OpenResult = { ok: boolean; link: string };

// Claims the reusable tab while the click still counts as a user action. Without this
// the first send, which happens after the alert log is written, can look like a blocked
// pop-up. Returns the tab so the caller can close it if nothing ends up being sent.
export function primeWhatsAppWindow(mode: AlertSendMode): Window | null {
  if (mode !== 'web') return null;
  const existing = window.open('', SENDER_WINDOW);
  existing?.focus();
  return existing;
}

export function closeWhatsAppWindow(handle: Window | null): void {
  try {
    handle?.close();
  } catch {
    // A window the browser already took over cannot be closed; nothing to do.
  }
}

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

  // A tab left open by an earlier send is steered to the new chat rather than a second
  // tab being opened.
  const reused = window.open('', SENDER_WINDOW);
  if (reused && !reused.closed) {
    try {
      reused.location.href = link;
      reused.focus();
      return { ok: true, link };
    } catch {
      // The tab belongs to WhatsApp Web, which cannot be read back; opening by name
      // below still reuses it.
    }
  }
  const opened = window.open(link, SENDER_WINDOW);
  return { ok: Boolean(opened), link };
}
