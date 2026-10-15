// GET /api/export — all registrations as CSV, for the organizers' Google Sheet.
// Auth: secret EXPORT_TOKEN, sent as "Authorization: Bearer <token>" or ?token=<token>
// (the query form is what Google Sheets' IMPORTDATA can use).

const COLUMNS = ["id", "created_at", "name", "email", "study", "consent_gdpr", "consent_photo"];

const text = (body, status) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))));
  return crypto.subtle.timingSafeEqual(ha, hb);
}

// RFC 4180 quoting, plus a leading ' on values a spreadsheet would run as a formula.
function cell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function onRequestGet({ request, env }) {
  const secret = env.EXPORT_TOKEN || "";
  if (secret.length < 24) return text("Export is not configured.", 503);

  const url = new URL(request.url);
  const auth = request.headers.get("authorization") || "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : url.searchParams.get("token") || "";
  if (!given || !(await sameSecret(given, secret))) return text("Unauthorized.", 401);

  const { results } = await env.DB.prepare(`SELECT ${COLUMNS.join(", ")} FROM registrations ORDER BY id`).all();
  const csv = [COLUMNS, ...results.map((r) => COLUMNS.map((c) => r[c]))].map((row) => row.map(cell).join(",")).join("\r\n");

  return new Response(csv + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="meetup-2026-regisztraciok.csv"`,
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}
