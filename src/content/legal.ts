/**
 * Legal documents.
 *
 * Kept in source rather than in the database on purpose: they change roughly
 * once a year, every change should be reviewable in a pull request, and a
 * compromised admin session must not be able to rewrite the site's terms.
 *
 * These are drafted for a Hungarian, non-commercial fansub group and are not a
 * substitute for legal advice. Review with counsel before going live.
 */

export const LEGAL_UPDATED_AT = '2026-01-15';

export const PRIVACY_POLICY = `
A Yonagi Fansub önkéntes, nonprofit rajongói csapat. Az alábbiakban átlátható módon
leírjuk, milyen adatot kezelünk, miért, meddig, és hogyan élhetsz a jogaiddal.

## Ki az adatkezelő?

A Yonagi Fansub csapata. Kapcsolatfelvétel: a [kapcsolati űrlapon](/kapcsolat) keresztül.

## Milyen adatokat kezelünk?

**Regisztráció nélkül**

- **Álnevesített IP-cím.** Nem tároljuk a nyers IP-címedet: a szerver egy titkos kulccsal
  képzett, visszafejthetetlen lenyomatot ment belőle. Ezt kizárólag visszaélés-szűrésre
  (rate limiting) és letöltési statisztikára használjuk.
- **Böngésző-azonosító (user agent).** Hibakereséshez és statisztikához.
- **Munkamenet-süti.** A bejelentkezéshez és a CSRF-védelemhez szükséges. Nincs
  harmadik féltől származó süti, és nincs hirdetési vagy követő szkript az oldalon.

**Regisztrációval**

- E-mail-cím, felhasználónév, megjelenített név.
- Jelszó — kizárólag scrypt algoritmussal képzett, egyedi sózású lenyomatként. A nyers
  jelszavadat sem mi, sem más nem tudja visszafejteni.
- Profilkép és bemutatkozás, ha megadod.
- Beállítások: értesítési preferenciák, kedvenc projektek.

## Miért kezeljük ezeket?

| Cél | Jogalap |
| --- | --- |
| Fiók működtetése, bejelentkezés | Szerződés teljesítése |
| Visszaélés és túlterhelés elleni védelem | Jogos érdek |
| Értesítés új kiadásról | Hozzájárulás (bármikor visszavonható) |
| Kapcsolatfelvételre válasz | Jogos érdek |
| Biztonsági naplózás (audit log) | Jogos érdek |

## Meddig őrizzük?

- **Munkamenetek:** legfeljebb 90 nap, kijelentkezés után azonnal érvénytelenné válnak.
- **Letöltési események:** 12 hónap, utána automatikusan törlődnek.
- **Kapcsolatfelvételi üzenetek:** legfeljebb 24 hónap.
- **Audit napló:** 12 hónap; a biztonsági szempontból lényeges bejegyzések tovább.
- **Fiókadatok:** a fiók törléséig. Törlés után a felhasználóneved és e-mail-címed
  felszabadul, a hozzászólásaid pedig anonimizálódnak.

## Kinek adjuk át?

Senkinek. Nincs analitikai szolgáltatónk, nincs hirdetési partnerünk, és nem
értékesítünk adatot. A tárhelyszolgáltatónk technikailag hozzáfér a szerverhez —
velük adatfeldolgozói szerződésünk van.

## Milyen jogaid vannak?

Kérheted az adataidhoz való hozzáférést, azok helyesbítését, törlését, a kezelés
korlátozását, illetve az adathordozhatóságot. A hozzájáruláson alapuló kezelést
(pl. értesítő e-mailek) bármikor visszavonhatod a fiókbeállításokban.

Panasszal a Nemzeti Adatvédelmi és Információszabadság Hatósághoz fordulhatsz
(naih.hu).

## Biztonság

Az oldal kizárólag HTTPS-en érhető el, szigorú Content Security Policy mellett.
A jelszavak memóriaigényes algoritmussal hashelve tárolódnak, a munkamenet-tokeneknek
csak a lenyomata kerül adatbázisba, így egy esetleges adatbázis-szivárgás nem
teszi lehetővé a fiókok átvételét.
`.trim();

export const TERMS_OF_SERVICE = `
Az oldal használatával elfogadod az alábbi feltételeket. Igyekeztünk emberi nyelven
megfogalmazni őket.

## Mi ez az oldal?

A Yonagi Fansub rajongói felirat-készítő csapat weboldala. A kiadásaink **nem
hivatalosak**, díjmentesek, és nem állnak kapcsolatban a művek jogtulajdonosaival.

## Használati feltételek

- A feliratokat és kiadásokat **kizárólag magáncélra** töltheted le.
- Ha egy mű hivatalosan megjelenik Magyarországon, **támogasd a hivatalos kiadást**.
  Ilyenkor a saját kiadásunkat jellemzően visszavonjuk.
- Tilos a kiadásainkat **továbbértékesíteni**, fizetős oldalra feltölteni, vagy
  reklámbevétel céljából újraosztani.
- A feliratainkat más csapat felhasználhatja, ha **feltünteti a forrást**. Kérdezz
  előtte — általában igent mondunk.

## Felhasználói fiók

- Egy ember egy fiókot hozhat létre. A fiókod biztonságáért te felelsz.
- Tilos a zaklató, gyűlölködő, illegális vagy spam tartalom.
- A szabályokat sértő fiókokat figyelmeztetés nélkül felfüggeszthetjük.

## Felelősség

Az oldalt „ahogy van” alapon nyújtjuk. A külső tárhelyekre mutató linkek tartalmáért
nem vállalunk felelősséget. Nem garantáljuk a folyamatos elérhetőséget, sem azt,
hogy egy megkezdett projektet befejezünk — önkéntesek vagyunk.

## Változtatás

A feltételeket frissíthetjük. Lényeges változás esetén az oldal tetején jelezzük.
`.trim();

export const DMCA_NOTICE = `
## Jogtulajdonosoknak

A Yonagi Fansub nonprofit, rajongói felirat-készítő csapat. Nem hostolunk videót:
a feliratainkat és a hozzájuk tartozó linkeket tesszük közzé, a fájlok külső
tárhelyeken találhatók.

Ha Ön egy mű jogtulajdonosa vagy annak képviselője, és úgy ítéli meg, hogy egy
kiadásunk sérti a jogait, kérjük, vegye fel velünk a kapcsolatot. **A bejelentéseket
komolyan vesszük, és jellemzően 72 órán belül eltávolítjuk az érintett tartalmat** —
akkor is, ha a bejelentés nem felel meg minden formai követelménynek.

## Mit tartalmazzon a bejelentés?

1. Az érintett mű megnevezése.
2. A kifogásolt tartalom pontos URL-je az oldalunkon.
3. A jogosultság igazolása vagy a képviseleti jogkör megjelölése.
4. Elérhetőség, ahol visszaigazolhatjuk az intézkedést.

## Hova küldje?

A [kapcsolati űrlapon](/kapcsolat) a „Jogi megkeresés” kategóriával, vagy közvetlenül
a jogi e-mail-címünkre. Az űrlapon érkező jogi megkereséseket elsőbbséggel kezeljük.

## Amit magunktól is megteszünk

- Ha egy mű **hivatalosan megjelenik magyar felirattal**, a saját kiadásunkat
  visszavonjuk, és a projektoldalon a hivatalos forrásra irányítjuk a látogatókat.
- Nem teszünk közzé olyan művet, amely hivatalos magyar streaming-szolgáltatón
  elérhető.
- Nem fogadunk el adományt, nem futtatunk hirdetést, és semmilyen formában nem
  szerzünk bevételt a kiadásainkból.
`.trim();
