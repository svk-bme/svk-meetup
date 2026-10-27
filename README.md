# XX. Schönherz MeetUp — weboldal

A 2026. november 3-i XX. Schönherz MeetUp weboldala („Kreatív mérnöki
gondolkodás ereje”). Szervezi a Schönherz Vállalati Kapcsolatok.

Statikus oldal: HTML, CSS és natív JavaScript, build-lépés és függőség nélkül.

## Helyi futtatás

```
python -m http.server 8000
```

majd `http://localhost:8000`.

A regisztrációs űrlap backendje (Pages Functions + D1) így nem fut; ahhoz
`npx wrangler pages dev .` kell (lásd lent).

## Regisztráció (ideiglenes, Cloudflare)

A 2026-os MeetUpra szóló megoldás; az esemény után az oldal az SVK saját
VM-jére költözik, ezért az adat sima SQLite tábla, semmi Cloudflare-specifikus.

- **Űrlap:** `index.html`, `#regisztracio`; a kliensoldali logika az
  `assets/js/site.js` `initRegister()` függvénye. Mezők: e-mail*, név*, hol
  tanulsz (nem kötelező: „BME VIK” vagy „Máshol” + szabad szöveg; a `study`
  oszlopba „BME VIK”, a beírt intézmény vagy üres kerül), adatkezelési
  hozzájárulás*, fotózás tudomásulvétele*.
- **API:** `functions/api/register.js` → `POST /api/register` (JSON). Szerveroldali
  validáció, normalizált (kisbetűs) e-mail, e-mailenként egy regisztráció (az
  ismételt beküldés nem írja felül, csak jelzi), honeypot (`website` mező) és
  legalább 3 mp kitöltési idő. A regisztráció 2026. 11. 03. 18:00-kor (CET)
  zárul: a dátum a `register.js` `CLOSES_AT` konstansában és az űrlap
  `data-closes` attribútumában van (a `REGISTRATION_CLOSES_AT` környezeti
  változó felülírja).
- **Adatbázis:** D1, binding neve `DB`, adatbázis `svk-meetup`; a kötés a
  `wrangler.toml`-ban van. Séma: `migrations/0001_registrations.sql`.
- **Adatkezelési tájékoztató:** `adatkezeles.html`.

### Első beállítás

```
npx wrangler d1 create svk-meetup          # az id-t írd a wrangler.toml-ba
npx wrangler d1 migrations apply svk-meetup --remote
npx wrangler pages secret put EXPORT_TOKEN --project-name svk-meetup
```

Az `EXPORT_TOKEN` legalább 24 karakteres véletlen szöveg (pl.
`openssl rand -hex 24`). Csak titkosként tárold, a repóba ne kerüljön.

### A lista lekérése (Google Sheets)

`GET /api/export` CSV-t ad, ha megkapja a tokent (`Authorization: Bearer <token>`
fejlécben vagy `?token=<token>` paraméterben).

- **Google Sheets (élő):** a Drive-on lévő táblázat A1 cellájába:
  `=IMPORTDATA("https://meetup.svk.bme.hu/api/export?token=<EXPORT_TOKEN>")`.
  A Sheets óránként frissíti. A képletben benne van a token, ezért a táblázatot
  csak a szervezőkkel oszd meg.
- **Egyszeri letöltés:** a fenti URL megnyitása böngészőben letölti a CSV-t,
  vagy `npx wrangler d1 execute svk-meetup --remote --command "SELECT * FROM registrations"`.

### Törlés az esemény után: 2026. december 3.

Az adatkezelési tájékoztató ezt a dátumot ígéri.

1. Ha kell, mentsd a végső létszámot (pl. `SELECT COUNT(*), study FROM registrations GROUP BY study`).
2. `npx wrangler d1 execute svk-meetup --remote --command "DELETE FROM registrations"`
   (vagy a D1 adatbázis teljes törlése: `npx wrangler d1 delete svk-meetup`).
3. Töröld a Google Sheets táblázatot is a Drive-ról (a Drive kukájából is).
4. Vond vissza az `EXPORT_TOKEN`-t, vagy állíts be helyette újat.

## Licencek

A betűtípusok (Unbounded, DM Sans, JetBrains Mono, Caveat) a SIL Open Font
License 1.1 alatt állnak, a licencszövegek az `assets/fonts/` mappában.
Az SVK és a Schönherz logó a szervezők tulajdona.

## Támogató (2026-10-27)
A Datapao a MeetUp támogatója, ezt a „Támogatónk” kártya mutatja a regisztráció ALATT, ugyanabban
az oszlopban (`.reg-col` > `.sponsors`, `assets/img/datapao.webp` – a cégtől kapott HIVATALOS piros
logó, fehér alapon mindkét témában). Új támogató: új `<li>` a `.sponsors ul`-ba, és a felirat
„Támogatóink” – a logók egymás alá kerülnek, a bal oszlop (nyereményjáték) nem mozdul.
A program 18:00-s sora „Nyitó beszéd” (2026-10-27: kapuzárás NINCS).
Norbi kérése: CSAK a támogatás látszik — azt, hogy tőlük ki ad elő, NEM írjuk ki. A többi cég
és az előadók neve továbbra sem kerül a lapra.
