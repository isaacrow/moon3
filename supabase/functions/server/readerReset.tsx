/**
 * A reader who forgot their password sets a new one with a one-time reset code. The code reaches them in one of
 * two ways:
 *   - by email: "Forgot password" in the catalogue sends a link with the code (Brevo's transactional email API,
 *     once the BREVO_API_KEY secret is set; valid 30 minutes);
 *   - at the loan desk: staff make a code for the reader account linked to a borrower card, after seeing the reader
 *     (valid 24 hours), for when email is not set up or does not arrive.
 * Only a hash of each code is kept; a code works once; setting the new password signs the reader out everywhere.
 * The pure part is here (codes, the email); the routes are in readerRoutes.tsx and circulationRoutes.tsx.
 */

// No 0/O, 1/I/L: a code read out or typed from paper must not be misread.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 12;
export const EMAIL_MINUTES = 30;
export const DESK_HOURS = 24;

/** A new code, shown in groups of four: ABCD-EFGH-JKMN. */
export function makeResetCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  // 256 is a multiple of neither 31 nor anything handy; drop bytes that would bias the letters.
  const out: string[] = [];
  while (out.length < CODE_LENGTH) {
    for (const b of random(CODE_LENGTH * 2)) {
      if (b < 248 && out.length < CODE_LENGTH) out.push(ALPHABET[b % ALPHABET.length]);
    }
  }
  const s = out.join("");
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

/** A code as typed or pasted (any case, with or without spaces and dashes), or null. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.toUpperCase().replace(/[\s-]/g, "");
  // 0, O, 1, I and L are never in a code: one holding them was mistyped.
  if (s.length !== CODE_LENGTH || [...s].some((ch) => !ALPHABET.includes(ch))) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

export const resetExpiry = (now: Date, via: "email" | "desk") =>
  new Date(now.getTime() + (via === "email" ? EMAIL_MINUTES * 60_000 : DESK_HOURS * 3_600_000)).toISOString();

/** The link in the email: the catalogue opens "Set a new password" with the code filled in. */
export const resetLink = (site: string, code: string) => `${site.replace(/\/+$/, "")}/opac.html?reset=${encodeURIComponent(code)}`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** The reset email, in Arabic and English together (the reader may read either). */
export function resetEmail(name: string, code: string, link: string): { subject: string; text: string; html: string } {
  const subject = "إعادة تعيين كلمة المرور · Reset your password — Moon";
  const text = [
    `مرحبًا ${name}،`,
    `لتعيين كلمة مرور جديدة لحسابك في فهرس مون، افتح هذا الرابط خلال ${EMAIL_MINUTES} دقيقة:`,
    link,
    `أو اكتب هذا الرمز: ${code}`,
    "إن لم تطلب هذا، فتجاهل الرسالة؛ كلمة مرورك لم تتغير.",
    "",
    `Hello ${name},`,
    `To set a new password for your Moon catalogue account, open this link within ${EMAIL_MINUTES} minutes:`,
    link,
    `or type this code: ${code}`,
    "If you did not ask for this, ignore this email; your password has not changed.",
  ].join("\n");
  const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif;max-width:520px;margin:auto;color:#0f172a">
<div dir="rtl" style="text-align:right">
<p>مرحبًا ${esc(name)}،</p>
<p>لتعيين كلمة مرور جديدة لحسابك في فهرس مون، افتح الرابط خلال ${EMAIL_MINUTES} دقيقة:</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">تعيين كلمة مرور جديدة</a></p>
<p>أو اكتب هذا الرمز: <b dir="ltr" style="font-family:monospace;font-size:16px">${esc(code)}</b></p>
<p style="color:#64748b;font-size:13px">إن لم تطلب هذا، فتجاهل الرسالة؛ كلمة مرورك لم تتغير.</p>
</div>
<hr style="border:0;border-top:1px solid #e2e8f0;margin:20px 0">
<div dir="ltr">
<p>Hello ${esc(name)},</p>
<p>To set a new password for your Moon catalogue account, open this link within ${EMAIL_MINUTES} minutes:</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">Set a new password</a></p>
<p>or type this code: <b style="font-family:monospace;font-size:16px">${esc(code)}</b></p>
<p style="color:#64748b;font-size:13px">If you did not ask for this, ignore this email; your password has not changed.</p>
</div></div>`;
  return { subject, text, html };
}

/**
 * Sends one email through Brevo. Returns false (and sends nothing) when the key is not set, or when Brevo refuses.
 * `send` is the fetch to use (the tests pass their own).
 */
export async function sendBrevo(
  env: { apiKey?: string; from?: string; fromName?: string },
  to: { email: string; name: string },
  mail: { subject: string; text: string; html: string },
  send: typeof fetch = fetch,
): Promise<boolean> {
  if (!env.apiKey) return false;
  try {
    const res = await send("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: { email: env.from || "no-reply@mooon.site", name: env.fromName || "Moon" },
        to: [{ email: to.email, name: to.name }],
        subject: mail.subject, textContent: mail.text, htmlContent: mail.html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
