# API

Verziózott REST API a `/api/v1` alatt. Ugyanazokat a végpontokat használja a
böngésző interaktív része és bármely külső kliens.

## Boríték

Minden válasz ugyanabban a formában érkezik. A kliens egyetlen dolgot néz meg:
van-e `error` kulcs.

**Siker**

```json
{
  "data": { "...": "..." },
  "meta": { "page": 1, "perPage": 24, "total": 137, "totalPages": 6,
            "hasNext": true, "hasPrevious": false }
}
```

**Hiba**

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "A megadott adatok érvénytelenek.",
    "details": { "fields": { "slug": ["Csak kisbetű, szám és kötőjel használható."] } },
    "requestId": "404ec147-9c08-4f59-b8ee-b6e547522a9b"
  }
}
```

A `code` gépi olvasásra való és stabil — sosem változik szövegszerkesztés miatt.
A `message` a felhasználónak szól, magyarul. A `requestId` minden válaszban
szerepel (fejlécben is: `X-Request-Id`), és megegyezik a szerver naplójában
lévővel — ez a kapocs egy felhasználói bejelentés és a log között.

**Fontos:** 5xx esetén a `message` mindig általános. A valódi hibaüzenet soha
nem hagyja el a szervert, mert kapcsolati stringet, fájlútvonalat vagy belső
hosztnevet tartalmazhat.

## Hibakódok

| Kód | HTTP | Mikor |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | Értelmezhetetlen kérés (pl. hibás JSON) |
| `UNAUTHORIZED` | 401 | Nincs érvényes munkamenet |
| `FORBIDDEN` | 403 | Van munkamenet, de nincs jogosultság; CSRF hiba; zárolt fiók |
| `NOT_FOUND` | 404 | Nincs ilyen erőforrás — vagy nincs jogod látni |
| `CONFLICT` | 409 | Egyediség-ütközés (foglalt slug, duplikált kiadás) |
| `PAYLOAD_TOO_LARGE` | 413 | 512 KB feletti JSON törzs |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Nem `application/json` |
| `VALIDATION_FAILED` | 422 | Séma-hiba; `details.fields` mezőnként bontva |
| `RATE_LIMITED` | 429 | Kimerült keret; `Retry-After` fejléc kíséri |
| `INTERNAL_ERROR` | 500 | Váratlan hiba |
| `SERVICE_UNAVAILABLE` | 503 | Adatbázis nem elérhető |

A 404 tudatosan kettős jelentésű: egy piszkozat projekt nem létezőként
viselkedik a nyilvános felületen. Egy 403 elárulná, hogy létezik.

## Autentikáció

Adatbázis-alapú, opak munkamenet-token `httpOnly` sütiben
(`__Host-yonagi_session` élesben). Nincs `Authorization` fejléc, nincs JWT.

Írási művelethez **CSRF token kell**: a middleware kiad egy JavaScriptből
olvasható `__Host-yonagi_csrf` sütit, a kliens ezt átmásolja az
`X-CSRF-Token` fejlécbe, a szerver pedig összeveti a kettőt *és* ellenőrzi a
HMAC aláírást. Emellett `Origin`/`Host` egyezés is kell.

A böngészőből a `src/lib/client/api.ts` mindezt automatikusan kezeli:

```ts
await apiFetch('/api/v1/admin/projects', { method: 'POST', body: payload });
```

## Lapozás, rendezés, szűrés

Minden listavégpont ugyanazt a query-alakot fogadja:

```
?page=2&perPage=24&sort=-releasedAt&q=steins&status=ONGOING&genre=akcio,drama
```

- `page` 1-től, `perPage` legfeljebb 100.
- `sort`: `mező` növekvő, `-mező` csökkenő. **Allow-listás** — ismeretlen mező
  esetén az alapértelmezésre esik vissza, nem hibázik és nem enged tetszőleges
  oszlop szerint rendezni.
- Többértékű szűrő vesszővel; a műfajszűrő ÉS-kapcsolatú (szűkít, nem bővít).

---

## Nyilvános végpontok

### Katalógus

| Metódus | Útvonal | Leírás |
| --- | --- | --- |
| `GET` | `/api/v1/projects` | Projektlista. Szűrők: `q`, `status`, `type`, `season`, `year`, `genre`, `featured`, `sort` |
| `GET` | `/api/v1/projects/{slug}` | Projekt részletei stáblistával |
| `GET` | `/api/v1/projects/{slug}/episodes` | Epizódok munkafolyamat-állapottal |
| `GET` | `/api/v1/genres` | Műfajok projektszámmal |

### Kiadások

| Metódus | Útvonal | Leírás |
| --- | --- | --- |
| `GET` | `/api/v1/releases` | Kiadásfolyam. Szűrők: `projectId`, `projectSlug`, `resolution`, `kind`, `sort` |
| `GET` | `/api/v1/downloads/{linkId}/resolve` | **302** a valódi célra |
| `POST` | `/api/v1/downloads/{linkId}/resolve` | Ugyanaz JSON-ban: `{ url, releaseId }` |

A letöltési URL sosem kerül be a HTML-be. A feloldás rögzíti az eseményt,
növeli a számlálókat, és csak utána adja vissza a célt. Ez ad pontos
statisztikát, és lehetővé teszi egy halott tükör központi cseréjét.

### Tartalom

| Metódus | Útvonal | Leírás |
| --- | --- | --- |
| `GET` | `/api/v1/news` | Hírek. Szűrők: `q`, `category` |
| `GET` | `/api/v1/news/{slug}` | Hír teljes tartalommal |
| `GET` | `/api/v1/team` | Aktív csapattagok |
| `GET` | `/api/v1/team/{slug}` | Csapattag profil, közreműködésekkel |
| `GET` | `/api/v1/search?q=…` | Globális keresés, típus szerint csoportosítva |
| `POST` | `/api/v1/contact` | Kapcsolati űrlap (honeypot + 3/óra limit) |
| `GET` | `/api/v1/comments` | Hozzászólások egy célhoz |
| `POST` | `/api/v1/comments` | Új hozzászólás (megerősített e-mail kell) |

---

## Fiók

| Metódus | Útvonal | Leírás |
| --- | --- | --- |
| `POST` | `/api/v1/auth/register` | Regisztráció |
| `POST` | `/api/v1/auth/login` | Belépés |
| `POST` | `/api/v1/auth/logout` | Kilépés (bejelentkezés nélkül is működik) |
| `GET` | `/api/v1/auth/me` | Aktuális munkamenet — `{ user: null }`, ha nincs |
| `POST` | `/api/v1/auth/verify` | E-mail megerősítés |
| `POST` | `/api/v1/auth/password/forgot` | Visszaállító link kérése |
| `POST` | `/api/v1/auth/password/reset` | Új jelszó tokennel |
| `POST` | `/api/v1/auth/password/change` | Jelszócsere (a többi eszközt kilépteti) |
| `PATCH` | `/api/v1/me/profile` | Profil |
| `PATCH` | `/api/v1/me/preferences` | Értesítési beállítások |
| `GET` `PATCH` | `/api/v1/notifications` | Értesítések listája / olvasottnak jelölés |
| `PUT` `DELETE` | `/api/v1/favorites/{projectId}` | Projektkövetés |

A `/auth/me` szándékosan `{ user: null }`-t ad 401 helyett: a „ki vagyok?"
kérdésre a „senki" legitim válasz, és nem érdemes minden hívót try/catch-be
kényszeríteni.

---

## Admin

Minden végpont a nevében szereplő jogosultságot követeli meg
(lásd `src/lib/auth/permissions.ts`).

| Erőforrás | Végpontok | Jogosultság |
| --- | --- | --- |
| Projektek | `GET POST /admin/projects`, `GET PUT DELETE /admin/projects/{id}`, `POST /admin/projects/{id}/restore` | `project:read` / `project:write` / `project:delete` |
| Epizódok | `POST /admin/episodes`, `PUT DELETE /admin/episodes/{id}` | `episode:write` / `episode:delete` |
| Kiadások | `GET POST /admin/releases`, `GET PUT DELETE /admin/releases/{id}`, `POST /admin/releases/publish` | `release:write` / `release:publish` / `release:delete` |
| Hírek | `GET POST /admin/news`, `GET PUT DELETE /admin/news/{id}` | `news:write` / `news:delete` |
| Csapat | `GET POST /admin/team`, `GET PUT DELETE /admin/team/{id}` | `team:write` / `team:delete` |
| Felhasználók | `GET /admin/users`, `GET PUT DELETE /admin/users/{id}` | `user:read` / `user:write` / `user:delete` |
| Szerepkörök | `GET POST /admin/roles`, `PUT DELETE /admin/roles/{id}` | `role:manage` |
| Beállítások | `GET PUT /admin/settings` | `settings:read` / `settings:write` |
| Üzenetek | `GET /admin/contact`, `PATCH /admin/contact/{id}` | `contact:read` / `contact:write` |
| Hozzászólások | `GET /admin/comments`, `PATCH /admin/comments/{id}` | `comment:moderate` |
| Médiatár | `GET POST /admin/media`, `GET PUT DELETE /admin/media/{id}` | `media:write` / `media:delete` |
| GYIK | `GET POST /admin/faq`, `GET PUT DELETE /admin/faq/{id}` | `faq:write` |
| Statisztika | `GET /admin/stats` | `stats:read` |
| Audit napló | `GET /admin/audit` | `audit:read` |

### Publikálás

A `*:publish` jogosultságokat **az írási útvonal** ellenőrzi, nem csak a
dedikált publikáló végpont. A szerkesztő űrlap tartalmaz státusz mezőt, tehát
enélkül bárki publikálhatna, aki írhat — a `staff` és `editor` szerepkör közti
különbség érdemben megszűnne.

A szabály mindkét irányban él: `PUBLISHED`-re váltani és `PUBLISHED`-ről
lelépni is publikálási döntés. Ami sosem érinti a `PUBLISHED` állapotot
(piszkozat ↔ archivált, vagy egy publikált bejegyzés szerkesztése státuszváltás
nélkül) sima írás marad.

```jsonc
// PUT /api/v1/admin/projects/{id}  —  publishStatus: "PUBLISHED", project:publish nélkül
{ "error": { "code": "FORBIDDEN",
             "message": "Nincs jogosultságod a publikáláshoz. Mentsd piszkozatként." } }
```

### Feltöltés

`POST /admin/media` az egyetlen végpont, ami nem JSON törzset vár:
`multipart/form-data`, `file` mezővel, opcionális `folder` és `alt` mezőkkel.
Minden más — rate limit, CSRF, jogosultság, hibaboríték — ugyanúgy a
`defineRoute`-ból jön.

A tárolt típust **a fájl magic byte-jai** döntik el, nem a `Content-Type` és nem
a kiterjesztés: PNG, JPEG, WebP, GIF és AVIF fogadható, fájlonként legfeljebb
8 MB. Az SVG tudatosan nincs a listán (script-futtatási kontextus, nem csak kép).

A kulcs tartalomcímzett (`{mappa}/{sha256 első 24 karaktere}.{kiterjesztés}`),
így ugyanaz a fájl kétszer feltöltve nem készít másolatot — a válasz ilyenkor
`deduplicated: true`, és a meglévő rekordot adja vissza.

```jsonc
// POST /api/v1/admin/media  (multipart/form-data)
{ "data": { "asset": { "id": "…", "url": "/uploads/projects/9f2a….png",
                       "mimeType": "image/png", "sizeBytes": "184320",
                       "width": 1200, "height": 630 },
            "deduplicated": false } }
```

Az admin írások mind auditálva vannak, mezőnkénti diff-fel. Az audit tábla
kizárólag append: sehol a kódban nincs olyan út, ami módosítaná vagy törölné
(a retenciós job kivételével).

---

## Rate limitek

Akciónként külön keret, hogy egy böngészési hullám ne merítse ki senki belépési
kvótáját. A táblázat forrása: `src/lib/api/rate-limit.ts`.

| Akció | Keret |
| --- | --- |
| Belépés | 8 / 5 perc |
| Regisztráció | 5 / óra |
| Jelszó-visszaállítás kérése | 4 / óra |
| Kapcsolati űrlap | 3 / óra |
| Hozzászólás | 12 / 10 perc |
| Keresés | 60 / perc |
| Letöltés feloldása | 60 / 5 perc |
| Általános olvasás | 240 / perc |
| Általános írás | 60 / perc |
| Admin írás | 120 / perc |

A válasz `X-RateLimit-Limit`, `X-RateLimit-Remaining` és `X-RateLimit-Reset`
fejléceket ad; 429 esetén `Retry-After` is.

Bejelentkezett felhasználónál a kulcs a felhasználó azonosítója, egyébként az
IP sózott lenyomata. Sikeres belépés törli a belépési keretet — egy elgépelt
jelszó ne kerüljön semmibe.

## Cache fejlécek

Megosztott cache fejlécet (`s-maxage` + `stale-while-revalidate`) csak olyan
végpont kap, ami **`auth: 'public'`-ként van deklarálva** és nem mutáció.

A feltétel szándékosan a deklarált auth módra néz, nem arra, hogy éppen van-e
munkamenet. A `defineRoute` csak akkor tölti be a sessiont, ha az útvonal
megköveteli, tehát egy publikus útvonalon a `user` mindig `null` — egy „nincs
bejelentkezett felhasználó" feltétel önmagában sosem sülne el, és pont azon a
tíz végponton lenne hatástalan, aminek `cache` blokkja van. Ami ténylegesen
kizárja a személyre szabott választ a CDN-ből, az az, hogy egy publikus
útvonalnak nincs miből személyre szabnia. (A `!user` ellenőrzés megmarad
második zárként az `optional` esetre.)

Minden más — mutáció, hitelesített olvasás, hibaválasz — `no-store`.

> A `next.config.ts` szándékosan **nem** tesz `Cache-Control`-t az
> `/api/:path*` útvonalra. Az ott felsorolt fejlécek a handler futása után
> kerülnek a válaszra és felülírják azt, amit a handler állított be — egy
> `no-store` ott csendben kiütné az egész CDN réteget.
