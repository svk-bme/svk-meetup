// POST /api/register — stores one registration in D1 (binding: DB).
// Body (JSON): { email, name, study, study_other, gdpr, photo, website, t }
//   study: "" | "bme-vik" | "other"; with "other", study_other is the school as typed.
//   website: honeypot, must be empty; t: ms timestamp when the form was shown.

const CLOSES_AT = "2026-11-03T17:00:00Z"; // 18:00 Budapest time (CET)
const MIN_FILL_MS = 3000;
const STUDY = new Set(["", "bme-vik", "other"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const fail = (status, error, field) => json({ ok: false, error, ...(field && { field }) }, status);

// Trim, collapse whitespace and drop control characters.
const clean = (v) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "");

export async function onRequestPost({ request, env }) {
  const closesAt = Date.parse(env.REGISTRATION_CLOSES_AT || CLOSES_AT);
  if (Date.now() >= closesAt) return fail(410, "A regisztráció lezárult.");

  // Only accept requests from our own pages.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return fail(403, "Érvénytelen kérés.");
  if (!(request.headers.get("content-type") || "").includes("application/json")) return fail(415, "Érvénytelen kérés.");

  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Érvénytelen kérés.");
  }
  if (!body || typeof body !== "object") return fail(400, "Érvénytelen kérés.");

  // Spam: a filled honeypot gets a fake success and nothing is stored.
  if (clean(body.website)) return json({ ok: true });
  const t = Number(body.t);
  if (!Number.isFinite(t) || Date.now() - t < MIN_FILL_MS) {
    return fail(400, "Ez túl gyors volt. Várj pár másodpercet, és próbáld újra.");
  }

  const email = clean(body.email).toLowerCase();
  const name = clean(body.name);
  const choice = clean(body.study);
  const other = clean(body.study_other);

  if (!email) return fail(400, "Add meg az e-mail-címed.", "email");
  if (email.length > 254 || !EMAIL_RE.test(email)) return fail(400, "Ez nem tűnik érvényes e-mail-címnek.", "email");
  if (name.length < 2) return fail(400, "Add meg a neved.", "name");
  if (name.length > 100) return fail(400, "A név legfeljebb 100 karakter lehet.", "name");
  if (!STUDY.has(choice)) return fail(400, "Válassz a megadott lehetőségek közül.", "study");
  if (choice === "other" && other.length < 2) return fail(400, "Írd be, hol tanulsz.", "study_other");
  if (other.length > 100) return fail(400, "Legfeljebb 100 karakter lehet.", "study_other");
  const study = { "bme-vik": "BME VIK", other }[choice] || "";
  if (body.gdpr !== true) return fail(400, "Az adatkezelési tájékoztató elfogadása kötelező.", "gdpr");
  if (body.photo !== true) return fail(400, "A fotózásról szóló tájékoztatás tudomásulvétele kötelező.", "photo");

  try {
    const result = await env.DB.prepare(
      `INSERT INTO registrations (email, name, study, consent_gdpr, consent_photo, created_at)
       VALUES (?1, ?2, ?3, 1, 1, ?4)
       ON CONFLICT(email) DO NOTHING`
    )
      .bind(email, name, study, new Date().toISOString())
      .run();
    // One registration per email: a repeat is reported, not overwritten.
    return json({ ok: true, already: result.meta.changes === 0 });
  } catch (err) {
    console.error("register: D1 error", err);
    return fail(500, "Szerverhiba, nem sikerült menteni a regisztrációt.");
  }
}

export const onRequest = () => fail(405, "Csak POST kérés engedélyezett.");
