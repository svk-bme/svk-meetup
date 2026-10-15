-- Registrations for the XX. Schönherz MeetUp (2026-11-03).
-- Plain SQLite, nothing Cloudflare-specific: portable to SVK's own VM after the event.
CREATE TABLE IF NOT EXISTS registrations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,            -- trimmed, lowercased
  name          TEXT    NOT NULL,
  study         TEXT    NOT NULL DEFAULT '',        -- 'BME VIK', the school as typed, or '' (not given)
  consent_gdpr  INTEGER NOT NULL CHECK (consent_gdpr = 1),
  consent_photo INTEGER NOT NULL CHECK (consent_photo = 1),
  created_at    TEXT    NOT NULL                    -- ISO 8601, UTC
);
