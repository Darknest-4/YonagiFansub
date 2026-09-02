# Design system

夜凪 — „éjszakai szélcsend". A vizuális nyelv egyetlen képből indul: **egy
mozdulatlan tenger éjszaka, alulról megvilágítva.** Mély, deszaturált tinta
felületek, rajtuk hideg biolumineszcens cián és melegebb orchidea-lila. Semmi
nem világít, aminek nincs jelentése.

Forrás: [`src/styles/globals.css`](../src/styles/globals.css).

---

## Tokenrétegek

Három réteg, szigorú irányban:

1. **Paletta** — nyers színek. Komponens **soha** nem hivatkozik rá közvetlenül.
2. **Szemantikus** — szerep szerinti aliasok (`--color-surface`,
   `--color-content-muted`, `--color-accent`).
3. **Komponens** — méret, rádiusz, árnyék, mozgás.

Egy komponens csak a 2. és 3. rétegből olvas. Márkaváltás így egyetlen blokk
átírása, nem kétszáz fájl átfésülése.

### Paletta

| Skála | Szerep |
| --- | --- |
| `ink` 950→500 | Felületek. Nem tiszta fekete: enyhe kék árnyalat, ami OLED-en nem hat élettelennek, és ad valamit, amihez az akcentusok viszonyulhatnak |
| `tide` 50→900 | Elsődleges akcentus. Biolumineszcens cián |
| `orchid` 50→900 | Másodlagos. Gradiensek, „prémium" regiszter: kiemelt kártyák, aktív navigáció |
| `ember` 300→600 | **Fenntartott.** Friss kiadás, elsődleges CTA. A ritkaság a lényeg: ha minden borostyán, semmi nem az |
| `sakura` 300→500 | Közösségi felületek, takarékosan |
| `mist` 50→700 | Szövegskála, tinta felületre hangolva |
| status | `success`, `warning`, `danger`, `info` |

---

## Tipográfia

| Betűtípus | Szerep | Miért |
| --- | --- | --- |
| **Sora** | Display | Geometrikus, kissé technikai — „megtervezett", nem „játékos" |
| **Inter** | Kenyérszöveg | A hosszú szöveg munkáját végzi |
| **JetBrains Mono** | Technikai metaadat | Kodek, checksum, fájlméret. Egy monospace arc azonnal átfuthatóvá tesz egy kiadás-specifikációt, és a számoszlopok igazodnak |
| **Noto Sans JP** | Japán akcentus | Nincs előtöltve: sosem érdemes rá várni |

A méretskála **moduláris** (1.2-es kis terc), nem kézzel válogatott:
`2xs` 11px-től `6xl` 84px-ig. Minden méret levezetett, ezért nincs „majdnem
ugyanakkora" pár a rendszerben.

---

## Térköz és elrendezés

4px-es alaprács (`--spacing: 0.25rem`). Minden térköz ennek többszöröse.

| Konténer | Szélesség | Mire |
| --- | --- | --- |
| `container-prose` | 44rem | Cikkszöveg — optimális sorhossz |
| `container-content` | 76rem | Fő oszlop, rácsok |
| `container-wide` | 90rem | Hero, teljes szélességű szekciók |

### Töréspontok

`xs` **360px** — mert egy 360 pixeles Android valódi, gyakori eszköz, és a
kiadástáblázatoknak kell egy explicit célpont 640 alatt. Utána a szokásos
640 / 768 / 1024 / 1280 / 1536.

---

## Emelkedés

Sötét felületen az emelkedést **fény adja, nem árnyék**. Minden szint egy lágy
környezeti árnyékot *és* egy hajszálvékony világos szegélyt kap — enélkül a
kártyák kivágottnak látszanak, nem lebegőnek.

```
--shadow-e1 … e4        növekvő emelkedés
--shadow-glow-tide      fókusz és aktív állapot
--shadow-glow-ember     friss kiadás
```

---

## Mozgás

Négy időtartam és három görbe. Ennyi az egész szótár.

```
instant  90ms    azonnali visszajelzés (hover, aktív)
fast     160ms   állapotváltás
base     240ms   belépő/kilépő elem
slow     420ms   szekció-átmenet
cinematic 720ms  hero, nagy felület
```

Ha valami ötödik időtartamot kíván, az általában tervezési probléma, nem
időzítési.

**Minden animáció dekoratív vagy magyarázó** — egyik sem hordoz olyan
információt, ami elvész, ha ki van kapcsolva. A `prefers-reduced-motion`
globálisan nullázza őket, és a rendszer ettől nem veszít funkciót. A
felhasználó a fiókbeállításokban felül is bírálhatja.

---

## Komponensek

14 primitív a `src/shared/ui/` alatt:

| Komponens | Jellemző döntés |
| --- | --- |
| `Button` | `href` esetén valódi `<Link>` — egy „gomb" ne veszítse el a link-szemantikát csak azért, mert gombnak néz ki. Töltés közben a felirat marad, hogy ne ugorjon a layout |
| `Card` | Három regiszter: sík, üveg, gradiens szegély. `interactive` csak akkor, ha az egész kártya tényleg kattintható |
| `Field` | Generált id, társított label, `aria-describedby` a hinthez és a hibához, `aria-invalid`. A hiba ikon **és** szín — a szín önmagában kizárná a színtévesztőket |
| `Modal` | Fókuszcsapda, Escape, `aria-modal`, görgetészár a scrollbar szélességének kompenzálásával. `sm` alatt alsó lapból nyílik: telefonon a középre helyezett dialógus csak véletlenül teszi a hüvelykujj alá a fő gombot |
| `Toast` | `aria-live` régió; hiba `assertive`, minden más `polite`. Az időzítő hover és fókusz alatt megáll — egy toast ne tűnjön el, miközben a felhasználó a gombja felé nyúl |
| `Dropdown` | WAI-ARIA menü-gomb minta, roving fókusszal. Outside **pointerdown**, nem click |
| `Tooltip` | Hoverre **és** fókuszra. Csak kiegészítő információ: érintőeszközön nincs hover |
| `Pagination` | Valódi `<a>` valódi href-fel. Direktíva nélküli modul, hogy szerveroldalon renderelhessen |
| `Progress` | A `WorkflowProgress` a termék aláírás-komponense: a hat fansub fázis egyetlen szegmentált sávban |
| `Avatar` | A fallback generált, nem generikus: kezdőbetűk a névből származtatott színen. Egy fal azonos szürke kör tervezési hiba |
| `Skeleton` | A valódi elrendezést tükrözi. Egy rossz magasságú szürke doboz rosszabb, mint a semmi |
| `EmptyState` | Mindig megválaszol két kérdést: miért üres, és mit tehetsz. A puszta „Nincs találat" zsákutca |
| `ErrorState` | Éles környezetben csak request id, sosem belső üzenet |
| `Badge` | Az enum-fordítások egyetlen helyen élnek — ez tartja távol a `FHD_1080P`-t a felülettől |

---

## Akadálymentesség

Nem utólagos átvizsgálás, hanem beépített:

- **Fókusz.** Egyetlen kezelés az egész alkalmazásban, `:focus-visible`
  markáns, márkaszínű körvonallal. Sehol nincs `outline: none` pótlás nélkül.
- **Landmarkok.** `main#main`, minden oldalon; első tabstop az „Ugrás a
  tartalomra" link.
- **Címkék.** Minden űrlapelem társított label-lel. Az ikongombokon
  `aria-label`.
- **Élő régiók.** Toast, keresési találatszám, űrlaphibák.
- **Kontraszt.** A szövegskála tinta felületre hangolva; a törzsszöveg
  (`mist-200` / `ink-900`) AA fölött van.
- **Zoom.** Engedélyezett, `maximumScale: 5`. A letiltása akadálymentességi
  hiba, nem finomhangolás.
- **iOS zoom.** Az űrlapmezők mobilon 16px betűvel indulnak — kisebbnél a
  Safari ránagyít a mezőre fókuszkor, és a felhasználó egy elcsúszott
  viewportban találja magát.
- **Mozgás.** `prefers-reduced-motion` mindent lekapcsol.
- **Táblázatok.** Vízszintesen görgethető konténerben; a diagram
  `aria-hidden`, ugyanaz az adat táblázatként is jelen van.

---

## Reszponzivitás

A mobil nem összenyomott asztali változat. Ahol az elrendezés eltér, ott
**másképp is épül fel**:

| Felület | Asztali | Mobil |
| --- | --- | --- |
| Navigáció | Vízszintes sáv, csúszó aktív jelölővel | Teljes magasságú lap, leírásokkal |
| Admin tábla | Valódi `<table>` | Kártyalista, **ugyanabból az oszlopdefinícióból** |
| Modal | Középre igazított | Alsó lap, fogantyúval |
| Toast | Jobb alsó sarok | Alul középen, a hüvelykujj közelében |
| Kiadás sor | Egy sor, jobbra igazított metaadattal | Kétsoros; az időbélyeg alá kerül, nem tűnik el |
| Szűrők | Mindig látható | Összecsukható, aktív szűrők számlálójával |

Az admin tábla a kulcspélda: egyetlen `Column<T>[]` definícióból születik a
táblázat és a kártyalista is. Egy új mező egy helyen kerül be, és mindkét
nézetben megjelenik.
