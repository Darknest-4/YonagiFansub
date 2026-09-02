/**
 * A fejlesztési napló tartalma.
 *
 * ## Miért fájlban, és nem az adatbázisban
 *
 * Ez az egyetlen tartalom az oldalon, amit nem az admin felületről szerkesztünk,
 * és ez szándékos: a napló arról szól, mi került be a kódba, a forrása pedig a
 * verziókezelés előzménye. Egy külön adatbázistábla azt jelentené, hogy a naplót
 * kézzel kell szinkronban tartani azzal, ami tényleg megtörtént — és az a fajta
 * duplikáció mindig ugyanúgy végződik: a napló elavul, aztán hazudik.
 *
 * Így viszont a bejegyzés és a hozzá tartozó változás egyszerre, egy
 * felülvizsgálatban keletkezik, és a `commit` mező az igazolás rá: bárki
 * megnézheti, hogy a mondat mögött van-e valódi kód.
 *
 * ## Kinek íródik
 *
 * A látogatónak, nem a fejlesztőnek. A commitok üzenete angol és tömör; itt
 * magyarul, egész mondatokban áll, és azt mondja el, mi változott *neki* — nem
 * azt, melyik függvény hova költözött. Ahol egy változás technikai, ott is a
 * következménye a lényeg („a keresés nem omlott össze ékezetes szavaknál”), nem
 * a megvalósítás.
 */

export type ChangeKind = 'new' | 'improved' | 'fixed' | 'security' | 'performance' | 'infra';

export interface ChangelogChange {
  kind: ChangeKind;
  title: string;
  /** Bővebb magyarázat. Elhagyható, ha a cím önmagában elmond mindent. */
  body?: string;
  /**
   * A commit rövid azonosítója.
   *
   * Elhagyható, és pontosan egy esetben hiányzik: a legfrissebb bejegyzésnél,
   * amelynek a commitja még nem létezett, amikor a szöveg megíródott — a napló
   * abban a repóban él, amit leír. A következő bejegyzésnél már pótoljuk.
   */
  commit?: string;
}

export interface ChangelogEntry {
  /** `YYYY-MM-DD`. */
  date: string;
  title: string;
  summary: string;
  changes: ChangelogChange[];
}

export const CHANGE_KIND_LABELS: Record<ChangeKind, string> = {
  new: 'Új',
  improved: 'Jobb lett',
  fixed: 'Javítás',
  security: 'Biztonság',
  performance: 'Gyorsítás',
  infra: 'Háttérmunka',
};

/**
 * Legfrissebb elöl.
 *
 * A napló fordított időrendben olvasható, mert a visszatérő olvasót az érdekli,
 * mi történt azóta, hogy legutóbb itt járt — és ő az olvasók többsége.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-09-02',
    title: 'Nézési lista',
    summary:
      'Mostantól minden bejelentkezett néző saját listát kap arról, mit néz, mit tervez, mit fejezett be és mit hagyott abba. A négyből kettőt nem kell bejelölni: magától tudja, hol tartasz.',
    changes: [
      {
        kind: 'new',
        title: 'Négy állapot, ebből kettő magától áll be',
        body:
          'A „nézem” és a „befejezett” a nézési előrehaladásból következik: ha elkezdtél egy részt, nézed; ha minden megjelent részt végignéztél, befejezted. Ezt a kettőt szándékosan nem lehet kézzel átállítani — egy gomb, amit a következő megnézett rész úgyis felülír, hazugság lenne. A „tervezett” és az „elhagyott” marad kézi, mert ezt a kettőt semmilyen adatból nem lehet tisztességesen kitalálni: attól, hogy valaki egy hónapja nem nyitott meg egy sorozatot, még nem hagyta el.',
      },
      {
        kind: 'new',
        title: 'A lista a profilban, a kapcsoló a projektoldalon',
        body:
          'A /profil/nezesi-lista négy csoportban mutatja a sorozatokat, a „nézem” áll elöl — ezért nyitja meg az ember. Ahol van értelme, ott a haladás is látszik („8 / 12 rész · 67%”). A projektoldalon két gomb van, „Tervezett” és „Elhagytam”; ugyanarra koppintva a jelölés visszavonódik. A kiszámolt állapot ott is megjelenik, de jelzésként, gomb nélkül, egy mondattal arról, honnan tudjuk.',
      },
      {
        kind: 'improved',
        title: 'A válasz azt mondja meg, mi lett belőle — nem azt, amit kértél',
        body:
          'Aki egy már elkezdett sorozatot jelöl tervezettnek, azonnal azt látja, hogy „nézem”. Ez nem hiba, hanem a szabály: a felület nem tud eltérni attól, amit a lista mutatni fog, mert ugyanazt a kiszámolt állapotot kapja vissza a szervertől.',
      },
      {
        kind: 'fixed',
        title: 'A még el nem készült részek nem számítanak bele',
        body:
          'Egy futó sorozatnál a nevező csak a megjelent részekből áll. Enélkül soha semmit nem lehetne befejezettnek látni, pedig aki minden kint lévő részt megnézett, pontosan azt szeretné olvasni, hogy utolérte. Ugyanígy: a be nem jelentett, nulla részes projekt nem „befejezett” — a nulla nem azt jelenti, hogy mindet megnézted.',
      },
    ],
  },

  {
    date: '2026-09-02',
    title: 'Átvilágítás, és ami kijött belőle',
    summary:
      'Az oldal átment egy teljes akadálymentességi és üzemkészségi átvilágításon, valódi böngészőben, három képernyőméreten. Ami hibát talált, azt megjavítottuk; a mérés maga pedig bekerült a kódba, hogy legközelebb magától kibukjon.',
    changes: [
      {
        kind: 'fixed',
        title: 'A halvány szövegek olvashatóvá váltak',
        commit: '3cb5a52',
        body:
          'A másodlagos szövegszín kontrasztja a háttérrel szemben nem érte el a WCAG AA küszöbét — napfényben, olcsó kijelzőn vagy gyengébb látással ezek a sorok elmosódtak. A paletta két árnyalata világosabb lett, és ahol a szám mellett álló címke még így is kevés volt, ott a címke kapott erősebb színt. A mérés 115 hibás elemről nullára ment le, 48 ellenőrzésen keresztül.',
      },
      {
        kind: 'fixed',
        title: 'A szövegbe ágyazott hivatkozások aláhúzva',
        commit: '3cb5a52',
        body:
          'A láblécben és néhány leírásban a link csak színnel különbözött a körülötte lévő szövegtől, 2.09:1 kontraszttal — ez színtévesztéssel gyakorlatilag láthatatlan. Aláhúzást kaptak, ami minden látásmódnál működik.',
      },
      {
        kind: 'infra',
        title: 'A füstpróba mostantól őrzi az eredményt',
        commit: 'ac2e98b',
        body:
          'Az átvilágítás mérései bekerültek a `npm run smoke` parancsba: minden fontos oldalt megnyit mobil, tablet és asztali méretben, és elbukik, ha bárhol vízszintes görgetés vagy akadálymentességi hiba jelenik meg. Ellenőriztük, hogy tényleg tud bukni — egy javítás visszavonása azonnal piros lett tőle.',
      },
    ],
  },

  {
    date: '2026-09-02',
    title: 'A kiadások megszűntek, a hírfolyam kinyílt',
    summary:
      'A „kiadás” mint külön fogalom eltűnt az oldalról: mostantól az epizód maga a megjelenés. Az oldal megtanulta, hogy melyik domainen fut, a hírfolyam pedig új címre költözött, olvashatóvá vált, és már az új részekről is szól.',
    changes: [
      {
        kind: 'improved',
        title: 'Nincs többé külön „Kiadások”',
        commit: '6518313',
        body:
          'Eddig két nyilvántartás volt ugyanarról az eseményről: az epizód, ami elkészült, és a hozzá tartozó „kiadás”, saját állapottal, saját dátummal, saját publikálási folyamattal. A kettő az első alkalommal elcsúszott, amikor valaki epizódot jelölt késznek kiadássor nélkül. Innentől egy nyilvántartás van, az epizód. A /kiadasok oldal, az admin kiadásszerkesztő, a letöltési linkek, a tükör-ellenőrző és a letöltésszámláló mind megszűnt — adatbázisostól.',
      },
      {
        kind: 'new',
        title: 'Az epizód megkapta a saját megjelenési dátumát',
        commit: '6518313',
        body:
          'Ez az egyetlen adat, amit a kiadásokból át kellett menteni: enélkül nincs válasz arra, hogy „mi jelent meg a héten”. A migráció minden epizódnak a legkorábbi publikált kiadása dátumát adja — a v2 javítás nem új megjelenés —, a törölt és vázlat sorokat figyelmen kívül hagyva; aminek nem volt kiadása, az a saját utolsó módosítását kapja. Kipróbálva valódi adaton, mielőtt bármit eldobtunk volna.',
      },
      {
        kind: 'fixed',
        title: 'Az oldal megtanulta, melyik domainen fut',
        commit: '6518313',
        body:
          'Eddig minden abszolút cím — kanonikus link, megosztási kártya, sitemap, hírfolyam — egy környezeti változóból jött, aminek az alapértéke localhost:3000. Ha nem volt beállítva, az oldal tökéletesen működött, miközben a Google-nek és minden hírolvasónak azt mondta, hogy a látogató saját gépén lakik. Mostantól, ha nincs beállítva, a kérésből olvassa ki a valódi hosztot.',
      },
      {
        kind: 'security',
        title: 'A levelekbe kerülő cím nem a kérésből jön',
        commit: '6518313',
        body:
          'A Host fejlécet a hívó adja meg. A saját oldalunkba visszaírt címnél ez rendben van — aki meghamisítja, a saját nézetét rontja el. Egy jelszó-visszaállító levélbe kerülő hamis cím viszont működő adathalász link, amit mi kézbesítünk az áldozat postafiókjába. A levelek ezért kizárólag a beállított értéket használják, és ez a kódban külön, nevesített döntés.',
      },
      {
        kind: 'fixed',
        title: 'A beállítás futásidőben is érvényre jut',
        commit: '6518313',
        body:
          'A Next a NEXT_PUBLIC_ előtagú változókat fordításkor beégeti a kódba, tehát a telepítés után beállított érték nem érvényesült — se hibaüzenet, se magyarázat. Pontosan ez volt a csapda. A kód mostantól futásidőben olvassa ki, így mindegy, hogy fordításkor vagy utána állítod be.',
      },
      {
        kind: 'improved',
        title: 'A hírfolyam /rss lett, és böngészőben is olvasható',
        commit: '6518313',
        body:
          'Az .xml végződés semmit nem mondott, amit a Content-Type fejléc ne mondana el pontosabban. A régi cím állandó átirányítással él tovább, hogy senki feliratkozása ne szakadjon meg. Aki böngészővel nyitja meg, rendes oldalt kap a szögletes zárójelek fala helyett — ugyanaz a cím, ugyanaz a dokumentum, a hírolvasónak érvényes RSS.',
      },
      {
        kind: 'new',
        title: 'A hírfolyamban már új részek is vannak',
        commit: '6518313',
        body:
          'Eddig csak hírek és kiadások voltak benne. Most három forrásból áll: megjelent epizódok, hírek és a fejlesztési napló bejegyzései, dátum szerint összefésülve.',
      },
      {
        kind: 'security',
        title: 'A hírfolyam saját, szűkebb biztonsági szabályt kapott',
        commit: '6518313',
        body:
          'A Chrome az XSLT-stíluslapot a script-src alá sorolja, az oldal fő szabálya pedig strict-dynamic-ot használ, ami kikapcsolja a hosztlistát — így a stíluslap betöltése tiltott volt, egyetlen konzolsorral magyarázva. A megoldás nem a fő szabály lazítása: a hírfolyam és a stíluslapja saját, szigorúbb szabályt kapott, amiben semmi nincs a saját stíluslapon kívül.',
      },
      {
        kind: 'improved',
        title: 'Ami a letöltésszámláló helyére lépett',
        commit: '6518313',
        body:
          'Az admin irányítópulton és a nyilvános számokban a letöltés helyett a megkezdett nézések és a lejátszások száma áll. Ez most az őszinte mérték: letöltés nincs, egy megállt számláló pedig halott oldalnak látszana, nem megváltozottnak.',
      },
    ],
  },

  {
    date: '2026-09-02',
    title: 'Béta mód, sokkal több beállítás, és ez a napló',
    summary:
      'Az oldal mostantól meg tudja mondani magáról, hogy még épül. Az admin felületen a beállítások száma tizennyolcról harmincötre nőtt, és mindegyik mögött valódi viselkedés áll — kapcsoló, ami nem csinál semmit, rosszabb, mintha ott sem lenne.',
    changes: [
      {
        kind: 'new',
        title: 'Béta mód',
        commit: '771cbaf',
        body:
          'Bekapcsolva sáv jelenik meg az oldal tetején, ami közli a látogatóval, hogy a Yonagi Fansub még fejlesztés alatt áll, és odaad egy „Hibát találtál?” hivatkozást. A sáv szövege és a hivatkozás célja is beállítható; ha nincs megadva cél, a kapcsolati oldalra visz. A láblécben egy kis „Béta” címke marad, mert a felső sáv elgörgethető, és aki középen érkezik egy oldalra, az sosem látná. A mód alapból ki van kapcsolva, és egyetlen kattintással kikapcsolható, amikor az oldal kinőtte.',
      },
      {
        kind: 'new',
        title: 'Fejlesztési napló',
        commit: '771cbaf',
        body:
          'Ez az oldal. Az összes eddigi munka, dátum szerint, magyarul, a commitok azonosítójával együtt. Külön beállítással kikapcsolható — ilyenkor eltűnik a menüből, kikerül a sitemapból, és a címe 404-et ad.',
      },
      {
        kind: 'new',
        title: 'Tizenhét új beállítás',
        commit: '771cbaf',
        body:
          'Kikapcsolható az adásnaptár, a fejlesztési napló, a nyilvános felhasználói profilok, a toborzás, az összefoglaló e-mailek, a letöltési hivatkozások, az online lejátszás, a nézési előrehaladás mentése és az értékelés. Számmal állítható, hány percig szerkesztheti valaki a saját hozzászólását, hány projekt fér egy lapra, és hogy a naptár hány napra lásson előre és vissza. A lábléchez tartozik egy szabad szöveges sor is.',
      },
      {
        kind: 'security',
        title: 'A kapcsolók a szerveren is érvényesek, nem csak a felületen',
        commit: '771cbaf',
        body:
          'Egy elrejtett gomb udvariasság, nem szabály: a végpontok böngésző nélkül is elérhetők. Ezért az értékelés, a letöltés-feloldás, a nézési előrehaladás és a lejátszás mind a kiszolgálón is ellenőrzi a saját kapcsolóját, és 403-mal, magyar indoklással utasít vissza. A lejátszásnál ez egyetlen közös ponton történik, amin mind a négy útvonal (manifest, lejátszási lista, szegmens, közvetlen fájl) átmegy — különben a lejátszó ugyan nem indulna el, de a már kiadott szegmens-címek tovább élnének.',
      },
      {
        kind: 'fixed',
        title: 'A számbeállítások nem vehetnek fel értelmetlen értéket',
        commit: '771cbaf',
        body:
          'Minden számnak van alsó és felső határa, és a korlátozás azon a ponton történik, amin minden olvasás és írás átmegy — így az űrlapon, az API-n és az adatbázisban közvetlenül szerkesztett soron át is ugyanaz érvényes. Egy régebbi, tartományon kívüli érték már olvasáskor helyre áll, tehát nem ülhet ott csendben, amíg valakinek fel nem tűnik.',
      },
      {
        kind: 'improved',
        title: 'A kikapcsolt oldalak eltűnnek a menükből is',
        commit: '771cbaf',
        body:
          'Nem elég 404-et adni: egy szándékosan kikapcsolt oldalra mutató menüpont rosszabb, mint egy elrontott hivatkozás. A fejléc, az alsó tab sáv, a „Több” lap, a lábléc és a sitemap mind ugyanabból a listából dolgozik, és mind ugyanazt a szűrést végzi.',
      },
    ],
  },

  {
    date: '2026-09-02',
    title: 'Mobil navigáció újragondolva',
    summary:
      'Az alsó menü lebegő szigetté vált, a nyíl végre csinál is valamit, és a sáv összehúzódik, amíg olvasol.',
    changes: [
      {
        kind: 'improved',
        title: 'Lebegő sziget a teljes szélességű sáv helyett',
        commit: '016a568',
        body:
          'A menü mindhárom széltől beljebb került, és teljesen lekerekített. Két dolgot nyer ezzel: a tartalom láthatóan folytatódik alatta, tehát nem tűnik levágottnak, és nem versenyez a böngésző saját sávjával, ami iOS-en közvetlenül alatta ül. Az aktív fül nem elszínezett, hanem kitöltött világos pirula — egy sötét sávon az „akcentus” és a „halvány” között egy árnyalat a különbség, ami nem elég ahhoz, hogy a szemed sarkából lásd, hol vagy.',
      },
      {
        kind: 'improved',
        title: 'A nyíl az oldal aljára visz, vagy vissza a tetejére',
        commit: 'cb91322',
        body:
          'Az irány követi, hol tartasz: az oldal elején lefelé, utána vissza felfelé mutat. Egy gomb, ami mindig ugyanazt jelentené, minden oldal felén holt súly lenne. A görgetés sima, de tiszteletben tartja, ha a rendszerben kevesebb mozgást kértél.',
      },
      {
        kind: 'improved',
        title: 'A sáv összehúzódik görgetés közben',
        commit: 'cb91322',
        body:
          'Nyolcvan képpont után a feliratok összecsukódnak és a belső térköz szűkül: a sziget a magassága körülbelül egyötödét visszaadja a tartalomnak, miközben minden gomb elérhető marad. A küszöb kétszintű (80-nál húzódik össze, 40-nél nyílik ki), mert egyetlen határnál a sáv villogna, amíg valaki pont ott mozog — ami telefonon minden görgetés első mozdulata.',
      },
      {
        kind: 'fixed',
        title: 'Az AniList-import megmondja, mi a baj',
        commit: '78f578a',
        body:
          'Eddig három különböző helyzetre ugyanaz az egy mondat jutott: nem létező azonosító, manga azonosítója, és rossz mezőbe írt szám. Ebből kettőnél a felhasználó hibátlan számot ellenőrzött újra és újra. Mostantól az üzenet megmondja, ha az azonosító létezik, csak nem anime (a manga címével együtt), megmutatja a helyes URL alakját, és külön szól, ha maga a forrás nem elérhető — mert olyankor nem a számmal van baj, hanem tíz percet kell várni.',
      },
      {
        kind: 'infra',
        title: 'Egy teszt a régi szövegre hivatkozott',
        commit: 'de4a300',
        body:
          'Az előző javítás átírta a hibaüzenetet, de egy állítás a régi mondatot kereste. A hiba a képernyőn látszott, csak a parancs kimenetét átvezettem egy szűrőn, ami elnyelte a kilépési kódot — így a commit átment. A teszt javítva; a tanulság a folyamatban van.',
      },
    ],
  },

  {
    date: '2026-09-01',
    title: 'Naptár, saját tartalom feletti kontroll, és egy éles hiba',
    summary:
      'Megjelent az adásnaptár, mindenki törölheti a saját fiókját és hozzászólásait, és kiderült, hogy a keresés függvényei a Postgres számára láthatatlanok voltak.',
    changes: [
      {
        kind: 'security',
        title: 'A keresés függvényei megnevezett sémába kerültek',
        commit: '0652691',
        body:
          'Az éles telepítés elhasalt azzal, hogy `function immutable_unaccent(text) does not exist` — miközben a függvény ott volt. A Postgres az indexkifejezéseket szűkített kereséssel értékeli ki: sem az indexépítés, sem az automatikus karbantartás nem látja azt az útvonalat, amit a hívó lát. Ugyanez a hiba csendben ott volt a helyi adatbázis naplójában is, az automatikus elemzés alatt — vagyis a tábla karbantartása hónapokig sikertelen lett volna anélkül, hogy bárki észreveszi. Minden függvényhivatkozás sémával együtt szerepel, és van rá teszt, ami a szűkített útvonalat állítja be, hogy ez ne fordulhasson elő újra.',
      },
      {
        kind: 'new',
        title: 'Adásnaptár, ami magát tartja karban',
        commit: 'e6be518',
        body:
          'Nincs benne kézzel felvitt adat: egy projekt attól kerül a naptárba, hogy fut és publikált, egy rész pedig attól, hogy van sugárzási dátuma — mindkettőt a metaadat-import tölti. A naptár a japán adást mutatja, és ezt a kenyérmorzsa alatt ki is mondja, mert aki „szombat 01:30”-at olvas és a magyar feliratra vár, azt egy magát meg nem magyarázó menetrend félrevezeti. Amelyik futó projekthez nincs előre datált rész, az külön szakaszban látszik: a „dolgozunk rajta, a csatorna nem jelentett be dátumot” információ, az üres hely nem.',
      },
      {
        kind: 'new',
        title: 'Fiók törlése és adatexport',
        commit: '185a3fa',
        body:
          'Az adatkezelési tájékoztató eddig ígért valamit, amit a felület nem tudott teljesíteni. Mostantól bárki letöltheti a saját adatait olvasható, magyar kulcsokkal ellátott fájlban, és törölheti a fiókját. A törlés nem visz magával idegen tartalmat: akinek a hozzászólására más válaszolt, annál a hozzászólás megmarad szerző nélkül, mert a válasz különben értelmezhetetlen maradna. Az utolsó tulajdonos nem törölheti magát.',
      },
      {
        kind: 'new',
        title: 'Saját hozzászólás szerkesztése és törlése',
        commit: 'c04fa3e',
        body:
          'Időablakon belül javítható az elgépelés — nem örökre, mert egy már megválaszolt szöveg csendes átírása a válaszolót teszi értelmetlenné. A szerkesztés ténye látszik. Törlésnél, ha van alatta válasz, a sor sírkőként marad meg, ugyanabból az okból.',
      },
      {
        kind: 'new',
        title: 'A médiatár megmondja, mi használja a fájlt',
        commit: '4a7d3d8',
        body:
          'Törlés előtt megnézzük, hol szerepel a fájl, és nevesítve kiírjuk — „Kagerou Line (borítókép)” —, nem pedig egy általános figyelmeztetést adunk. A keresés a tárolási kulcs alapján megy, nem a nyilvános cím alapján: ha a nyilvános alapcím megváltozik, egy címre épülő ellenőrzés azt jelentené, hogy „semmi nem használja”, pont akkor, amikor minden.',
      },
      {
        kind: 'fixed',
        title: 'A médiatár törlésgombja elérhető telefonon is',
        commit: '7eabbef',
        body:
          'A gomb egérrel fölé húzásra jelent meg, amiből érintőképernyőn semmi nincs. A rosszabbik fele: a láthatatlan gomb továbbra is fogadta a koppintást, tehát vakon működött. Mostantól az alapállapot a látható gomb, és csak ott rejtjük el, ahol tényleg van egérmutató.',
      },
    ],
  },

  {
    date: '2026-08-31',
    title: 'Közösség, kereshetőség és kézbesítés',
    summary:
      'A leghosszabb nap: hozzászólások, értesítések, e-mail, teljes szöveges keresés, profilok, nézési előrehaladás, telepíthetőség — és a mögéjük tett integrációs tesztek.',
    changes: [
      {
        kind: 'new',
        title: 'Több szolgáltatótól érkező online lejátszás',
        commit: '787102b',
        body:
          'A lejátszó tetszőleges számú forrást kap, a csapat által megadott sorrendben, és hiba esetén továbblép a következőre. Egy halott tárhely így kapcsoló kérdése, nem törött oldal.',
      },
      {
        kind: 'security',
        title: 'SSRF lezárva a fájlproxyban, halott sebességkorlátok javítva',
        commit: '8f2067e',
        body:
          'A proxy tetszőleges belső címre rá tudott kérdezni, ha valaki a megfelelő paramétert küldte; ez a réteg mostantól csak arra megy ki, amire szabad. Emellett kiderült, hogy néhány sebességkorlát olyan kulcsra épült, ami sosem ismétlődött — vagyis nem korlátozott semmit.',
      },
      {
        kind: 'fixed',
        title: 'Elavult gyorsítótár-bejegyzés nem dönti le az oldalt',
        commit: 'ecf4c32',
        body:
          'Egy lekérdezés új mezőket kapott, a gyorsítótárban viszont ott ült egy régebbi kód által írt bejegyzés, amiben ezek nem szerepeltek — az oldal 500-zal elszállt, miközben a típusok szerint ez lehetetlen volt. Egy gyorsítótár-bejegyzést más kód ír, mint ami visszaolvassa, tehát ez az egyetlen hely, ahová a fordító garanciája nem ér el. A kulcsok mostantól verziót hordoznak: régi bejegyzést új kód nem tud beolvasni.',
      },
      {
        kind: 'new',
        title: 'HLS-csomagolás, és a lejátszó nem fagy le halott forráson',
        commit: 'd3d1001',
        body:
          'A csomagoló folyamat elkészíti és feltölti a szeletelt változatot; a lejátszó pedig nem vár a végtelenségig egy nem válaszoló forrásra, hanem lép tovább.',
      },
      {
        kind: 'new',
        title: 'Hozzászólások felülete',
        commit: '5429259',
        body:
          'Szálakba rendezve, válaszokkal, moderálási sorral. Ugyanebben a körben javult a kezdeti adatfeltöltés, ami üres adatbázison elszállt.',
      },
      {
        kind: 'new',
        title: 'Értesítések, amiket a beállítások addig csak ígértek',
        commit: '7f7b824',
        body:
          'A profilban régóta ott volt, hogy miről kérsz értesítést; mostantól tényleg kapsz. Az összefoglaló levél nem második csatorna, hanem az egyediek helyettesítője — nem érkezik ugyanaz kétszer.',
      },
      {
        kind: 'new',
        title: 'Levélküldés Resenden át, látható hibával',
        commit: '6b67b56',
        body:
          'Ha a feladó nincs rendben, az nem csendes elnyelés: látszik, hogy miért nem ment ki a levél. Egy némán elveszett megerősítő e-mail a legrosszabb fajta hiba, mert a felhasználó a saját postafiókjában keresi a hibát.',
      },
      {
        kind: 'fixed',
        title: 'Kiút a megerősítetlen fiókból',
        commit: '0ebdf1c',
        body:
          'Aki nem kapta meg a visszaigazoló levelet, be tudott ragadni egy fiókba, amivel nem lehetett csinálni semmit, és amit nem lehetett újraindítani.',
      },
      {
        kind: 'new',
        title: 'Megosztási kép minden oldalra, és géppel olvasható kenyérmorzsa',
        commit: 'f090afc',
      },
      {
        kind: 'new',
        title: 'Az oldal telepíthető',
        commit: '63385c0',
        body: 'Kezdőképernyőre tehető, saját ikonnal és indítóképernyővel.',
      },
      {
        kind: 'new',
        title: 'Nyilvános profil a hozzászólók mögé',
        commit: '0e5581f',
        body:
          'A felhasználónév eddig is megvolt, csak nem vezetett sehova. Ezek az oldalak szándékosan nincsenek indexelve: aki egy fansub oldalon hozzászól, nem arra jelentkezett, hogy a neve keresési találat legyen.',
      },
      {
        kind: 'new',
        title: 'Nézési előrehaladás és értékelés',
        commit: 'cb90ca4',
        body:
          'A lejátszó megjegyzi, hol hagytad abba, és felajánlja a folytatást; a projektoldalon tízes skálán pontozhatsz. A pontozáshoz megerősített cím kell — egy pontszám nyilvános állítás valakinek a munkájáról.',
      },
      {
        kind: 'improved',
        title: 'Látszik, melyik kiadott részt nem lehet valójában megnézni',
        commit: '58add85',
        body:
          'Egy „kiadva” állapotú rész, amihez nincs élő forrás, addig ugyanúgy nézett ki, mint a többi.',
      },
      {
        kind: 'new',
        title: 'Rangsorolt teljes szöveges keresés',
        commit: 'b895bbf',
        body:
          'Az ékezetek és a magyar szótövek kezelésével, a korábbi részleges egyezés megtartása mellett — a kettő együtt ad használható találati sorrendet.',
      },
      {
        kind: 'infra',
        title: 'A szervermodulok valódi Postgres ellen futnak a tesztekben',
        commit: 'ce7c701',
        body:
          'Nem utánzat, hanem tényleges adatbázis. Az itt megfogott hibák nagy része olyan, amit egy imitált adatréteg soha nem mutatott volna meg.',
      },
      {
        kind: 'improved',
        title: 'A csomagoló szkript regisztrálja is, amit feltöltött',
        commit: 'e341953',
        body: 'Külön kézi lépés nélkül, valódi naplóbejegyzéssel arról, ki csinálta.',
      },
      {
        kind: 'improved',
        title: 'A japán szöveg japánként van megjelölve',
        commit: 'c21693a',
        body:
          'Így a böngésző és a felolvasó is a megfelelő betűkészletet és kiejtést használja — a kínai és a japán karakterek egy része ugyanaz a kódpont, más rajzolattal.',
      },
      {
        kind: 'improved',
        title: 'A kezdőlap névjegye egyetlen főcím lett',
        commit: 'a203430',
      },
      {
        kind: 'fixed',
        title: 'A README jogosultságszáma nem stimmelt',
        commit: '4495148',
      },
    ],
  },

  {
    date: '2026-08-28',
    title: 'Arculat, csapatkezelés és metaadat-import',
    summary:
      'Az oldal megkapta a mostani kinézetét, a csapat kezelhetővé vált a felületről, és az AniList–MyAnimeList import elkezdte kitölteni a projektek adatait.',
    changes: [
      {
        kind: 'new',
        title: 'Új arculat: magenta paletta, lepke jel, kétosztatú hero',
        commit: 'ab92286',
      },
      {
        kind: 'improved',
        title: 'Projektoldal, csapatoldal és admin áttekintő újratervezve',
        commit: '67414ce',
      },
      {
        kind: 'new',
        title: 'Alsó navigáció mobilon',
        commit: '7bc9130',
        body:
          'A hamburger menü helyett: hat inches képernyőn a jobb felső sarok a hüvelykujj számára a legnehezebben elérhető pont, és pont oda tettük addig az összes úticélt.',
      },
      {
        kind: 'new',
        title: 'Csapatkezelés felületről',
        commit: 'fdabb7b',
        body:
          'Ugyanitt derült ki, hogy néhány űrlap visszautasította a saját kimenetét: az opcionális mezőkre olyan ellenőrzés vonatkozott, ami az üres értéket nem fogadta el, pedig a mentés maga adta vissza így.',
      },
      {
        kind: 'improved',
        title: 'A csapattagot fiókból választjuk, nem névre gépeljük',
        commit: '7d43ab0',
        body:
          'Kézzel beírt névnél két helyen élt ugyanaz az ember, és a kettő azonnal elcsúszott egymástól.',
      },
      {
        kind: 'new',
        title: 'Metaadat-import AniListről és Jikanról, ütemezett frissítéssel',
        commit: '6c42fe2',
        body:
          'Cím, leírás, évad, borító, epizódlista. Amit egyszer be lehet hozni, azt nem kell harmincszor begépelni.',
      },
      {
        kind: 'fixed',
        title: 'Ha az egyik forrás nem elérhető, megmondjuk, melyik',
        commit: '5c1a010',
        body:
          'Egy leállt szolgáltatás nem viszi magával a másikat, és nem néz ki rossz azonosítónak.',
      },
      {
        kind: 'new',
        title: 'Védett online lejátszás',
        commit: 'f10e169',
        body:
          'Aláírt, lejáró, nézőhöz kötött HLS: a cím nem másolható át más gépre, és nem él tovább a munkamenetnél.',
      },
      {
        kind: 'security',
        title: 'Az első regisztráló lesz a tulajdonos',
        commit: '2694015',
        body:
          'Környezeti változóban tárolt jelszó vagy előre beégetett fiók helyett. Ugyanitt magyarra kerültek a környezeti beállítások hibaüzenetei.',
      },
      {
        kind: 'fixed',
        title: 'A tartalombiztonsági szabály mindent üresen hagyott',
        commit: 'f4b3524',
        body:
          'A böngészős füstpróba mutatta meg: az oldal betöltődött, és semmi nem látszott rajta. Azóta minden nagyobb változtatás után készül képernyőkép valódi böngészőben — egy oldal, amit senki nem nézett meg, nincs kész.',
      },
      {
        kind: 'infra',
        title: 'Teljes indulási sorrend a konténerben',
        commit: '398eaac',
        body: 'Kezdeti adatfeltöltés nélkül be sem lehetett lépni az oldalra.',
      },
      {
        kind: 'infra',
        title: 'Dockerfile rendbetéve',
        commit: '8510125',
        body:
          'Több lépésben: migrációs parancs, helyi Prisma-bináris, hiányzó könyvtár másolása, végül a szerkezet átláthatóbbra igazítása.',
      },
    ],
  },

  {
    date: '2026-08-27',
    title: 'Az alapok',
    summary:
      'Az első nap: adatmodell, jogosultságok, tervezői rendszer, API-váz, admin felület, tesztek — és minden, amire a többi épül.',
    changes: [
      {
        kind: 'new',
        title: 'Adatmodell, magrétegek, tervezői rendszer, API',
        commit: '925a1c0',
        body:
          'Az adatbázis sémája, a hitelesítés és a jogosultságkezelés váza, a színpaletta és a komponenskészlet, valamint az a útvonal-gyár, amin azóta minden végpont átmegy: sebességkorlát, CSRF, jogosultság, ellenőrzés, egységes válaszboríték és hibatérkép — egy helyen, minden hívásra ugyanúgy.',
      },
      {
        kind: 'new',
        title: 'Nyilvános felület: oldalak, belépés, fiókkezelés, SEO',
        commit: '6e711e8',
      },
      {
        kind: 'new',
        title: 'Admin rendszer és kezdeti adatok',
        commit: '10c9117',
        body: 'Valódi böngészőben ellenőrzött működéssel, nem csak fordítási hibák hiányával.',
      },
      {
        kind: 'infra',
        title: 'Tesztek, infrastruktúra és dokumentáció',
        commit: '6687196',
      },
      {
        kind: 'improved',
        title: 'Gyorsítótárral együttműködő adatréteg és magyar hibaszövegek',
        commit: '4e8174b',
        body:
          'Az ellenőrzés hibái attól kezdve magyarul szólnak, és van külön parancs a kézzel írt SQL futtatására.',
      },
      {
        kind: 'new',
        title: 'Médiatár: feltöltés, tárolási illesztők, kiszolgálás',
        commit: '5a9fff3',
        body:
          'Helyi lemez és S3-kompatibilis tároló ugyanazon a felületen, hogy a kettő között ne kelljen kódot írni.',
      },
      {
        kind: 'security',
        title: 'Publikálási jogosultság kikényszerítése',
        commit: '4445e78',
        body: 'Ugyanebben a körben a GYIK kezelése és a hibák központi gyűjtése.',
      },
      {
        kind: 'infra',
        title: 'Fordítás adatbázis nélkül, Render-terv, Next biztonsági frissítés',
        commit: '4c94e18',
        body:
          'A fordításnak nem szabad élő adatbázistól függenie, különben a telepítés attól bukik el, hogy egy szolgáltatás éppen indul.',
      },
      {
        kind: 'security',
        title: 'Önálló kimenet és szűkebb tartalombiztonsági szabály',
        commit: '90c603a',
      },
    ],
  },
];

/** A napló első és utolsó napja, meg hogy összesen hány tétel van benne. */
export function changelogStats() {
  const dates = CHANGELOG.map((entry) => entry.date).sort();
  const changes = CHANGELOG.reduce((total, entry) => total + entry.changes.length, 0);

  return {
    entries: CHANGELOG.length,
    changes,
    // A tömb üresen is fordulhat, ezért nincs `!` egyik végén sem.
    first: dates[0] ?? null,
    last: dates[dates.length - 1] ?? null,
  };
}
