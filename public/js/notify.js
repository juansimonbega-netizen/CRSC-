/*
 * Automatic waitlist promotion emails.
 *
 * The waitlist is positional: the first `cap` people on a list are confirmed,
 * everyone after is waiting. So when someone leaves a list (cancels, is
 * removed, or is moved by an exec), the person sitting at position `cap`
 * crosses into the confirmed group automatically — this module detects that
 * person *before* the removal happens and emails them afterwards.
 *
 * Emails are sent through EmailJS (free tier, no server needed). Configure it
 * in firebase-config.js as window.EMAILJS_CONFIG; without config the
 * promotion still happens and the app just tells the exec no email went out.
 */

/* Who gets promoted if `signup` leaves its list? (Call BEFORE the removal.) */
export function promotionCandidate(entries, cap, signup) {
  const idx = entries.findIndex(e => e.id === signup.id);
  if (idx === -1 || idx >= cap) return null;      // leaving from the waitlist frees nothing
  if (entries.length <= cap) return null;          // nobody is waiting
  return entries[cap];                             // first person on the waitlist
}

export async function sendPromotionEmail({ signup, event, listLabel, sessionLabel, settings }) {
  const cfg = (typeof window !== 'undefined' && window.EMAILJS_CONFIG) || null;
  if (!signup.email) return { sent: false, reason: 'no-email' };
  if (!cfg || !cfg.publicKey) return { sent: false, reason: 'not-configured' };

  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: cfg.serviceId,
      template_id: cfg.templateId,
      user_id: cfg.publicKey,
      template_params: {
        to_email: signup.email,
        to_name: signup.name,
        event_date: event.date,
        list_label: listLabel,
        session_label: sessionLabel,
        location: event.location || settings.location || '',
        etransfer_email: settings.etransferEmail || '',
        club_name: settings.clubName || 'CRSC',
      },
    }),
  });
  if (!res.ok) throw new Error('EmailJS responded ' + res.status);
  return { sent: true };
}
