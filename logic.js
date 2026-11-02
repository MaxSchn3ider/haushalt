/* Haushalt – reine Logik (ohne DOM): Normalisierung, Regeln, Bon-Parser, Auswertung */
(function (root) {
  'use strict';

  // ---------- Normalisierung ----------
  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
      .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\b\d+\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ---------- Standard-Gruppen (feste IDs -> beide Handys identisch) ----------
  const DEFAULT_CATS = [
    // id, name, parent, color
    ['c_leb', 'Lebensmittel', null, '#22c55e'],
    ['c_leb_obst', 'Obst & Gemüse', 'c_leb'],
    ['c_leb_milch', 'Milch, Käse & Eier', 'c_leb'],
    ['c_leb_fleisch', 'Fleisch, Wurst & Fisch', 'c_leb'],
    ['c_leb_brot', 'Brot & Backwaren', 'c_leb'],
    ['c_leb_vorrat', 'Vorrat & Konserven', 'c_leb'],
    ['c_leb_snack', 'Süßes & Snacks', 'c_leb'],
    ['c_leb_tk', 'Tiefkühl & Fertiggerichte', 'c_leb'],
    ['c_getr', 'Getränke', null, '#3b82f6'],
    ['c_getr_soft', 'Wasser, Saft & Softdrinks', 'c_getr'],
    ['c_getr_kaffee', 'Kaffee & Tee', 'c_getr'],
    ['c_getr_alk', 'Alkohol', 'c_getr'],
    ['c_getr_pfand', 'Pfand', 'c_getr'],
    ['c_dro', 'Drogerie & Haushalt', null, '#a855f7'],
    ['c_dro_pflege', 'Körperpflege', 'c_dro'],
    ['c_dro_putz', 'Putz- & Waschmittel', 'c_dro'],
    ['c_dro_haus', 'Haushaltswaren', 'c_dro'],
    ['c_dro_gesund', 'Gesundheit', 'c_dro'],
    ['c_wohn', 'Wohnen', null, '#f59e0b'],
    ['c_wohn_miete', 'Miete & Nebenkosten', 'c_wohn'],
    ['c_wohn_energie', 'Strom & Gas', 'c_wohn'],
    ['c_wohn_tel', 'Internet & Handy', 'c_wohn'],
    ['c_wohn_rundfunk', 'Rundfunkbeitrag', 'c_wohn'],
    ['c_vers', 'Versicherungen', null, '#ef4444'],
    ['c_vers_haft', 'Haftpflicht', 'c_vers'],
    ['c_vers_hausrat', 'Hausrat', 'c_vers'],
    ['c_vers_kfz', 'Kfz & Motorrad', 'c_vers'],
    ['c_vers_sonst', 'Weitere Versicherungen', 'c_vers'],
    ['c_mob', 'Mobilität', null, '#06b6d4'],
    ['c_mob_tank', 'Tanken', 'c_mob'],
    ['c_mob_oepnv', 'Bahn & ÖPNV', 'c_mob'],
    ['c_mob_werk', 'Werkstatt & Wartung', 'c_mob'],
    ['c_frei', 'Freizeit & Leben', null, '#ec4899'],
    ['c_frei_essen', 'Essen gehen & Lieferdienst', 'c_frei'],
    ['c_frei_abo', 'Abos & Streaming', 'c_frei'],
    ['c_frei_kleid', 'Kleidung', 'c_frei'],
    ['c_frei_hobby', 'Hobbys & Ausflüge', 'c_frei'],
    ['c_sonst', 'Sonstiges', null, '#64748b'],
    ['c_unsort', 'Unsortiert', null, '#94a3b8']
  ];
  const UNSORTED = 'c_unsort';

  // Stichwort -> Untergruppe. "!" am Anfang = nur ganzes Wort
  const DEFAULT_RULES = {
    c_leb_obst: 'banane apfel birne traube orange zitrone limette mandarine clementine kiwi beere erdbeer heidelbeer himbeer mango ananas melone wassermelone avocado tomate gurke paprika zwiebel knoblauch kartoffel mohre karotte salat eisberg rucola spinat brokkoli blumenkohl zucchini aubergine pilz champignon kohl lauch porree ingwer petersilie basilikum schnittlauch krauter obst gemuse radieschen spargel',
    c_leb_milch: 'milch h milch joghurt jogurt quark kase gouda mozzarella feta parmesan emmentaler butter sahne schmand creme fraiche frischkase skyr kefir !eier eier buttermilch',
    c_leb_fleisch: 'hahnchen huhn pute rind schwein hack wurst salami schinken lachs thunfisch fisch garnele bratwurst wiener aufschnitt speck filet steak schnitzel gyros frikadelle leberwurst mortadella',
    c_leb_brot: 'brot brotchen toast baguette croissant brezel laugen kuchen semmel wrap tortilla zwieback',
    c_leb_vorrat: 'nudel spaghetti penne fusilli reis mehl zucker salz pfeffer olivenol sonnenblumenol rapsol essig haferflocken musli cornflakes mais bohnen linsen kichererbsen passata tomatenmark ketchup senf mayo mayonnaise gewurz bruhe honig marmelade konfiture nutella sosse sauce pesto hefe backpulver',
    c_leb_snack: 'kartoffelchip schoko schokolade chips keks gummi haribo bonbon riegel nuss erdnuss popcorn cracker salzstangen praline milka ritter sport snack waffel kinder lakritz',
    c_leb_tk: 'tiefkuhl !tk pizza pommes iglo frosta speiseeis !eis eiscreme magnum lasagne ravioli suppe fertig instant',
    c_getr_soft: 'wasser mineralwasser sprudel cola fanta sprite limo limonade saft schorle eistee energy red bull',
    c_getr_kaffee: 'kaffee espresso !tee kakao kaffeepads kapseln cappuccino',
    c_getr_alk: 'bier pils radler wein sekt prosecco aperol vodka wodka whisky !rum !gin likor jager',
    c_getr_pfand: 'pfand leergut einweg mehrweg',
    c_dro_pflege: 'friseur frisor shampoo dusch duschgel seife zahnpasta zahncreme zahnburste !deo deodorant rasier lotion bodylotion haar spulung balea nivea tampon binden watte wattepad creme gesichtscreme mascara',
    c_dro_putz: 'spulmittel waschmittel weichspuler reiniger putz !wc schwamm spultabs persil ariel frosch mullbeutel allzweck entkalker',
    c_dro_haus: 'toilettenpapier klopapier kuchenrolle taschentuch taschentucher alufolie frischhalte batterie gluhbirne kerze teelicht servietten zewa tempo backpapier gefrierbeutel',
    c_dro_gesund: 'apotheke tablette ibuprofen paracetamol vitamin pflaster nasenspray magnesium',
    c_wohn_miete: 'miete nebenkosten hausgeld',
    c_wohn_energie: 'strom !gas stadtwerke energie heizung',
    c_wohn_tel: 'internet telekom vodafone !o2 handy mobilfunk dsl',
    c_wohn_rundfunk: 'rundfunk !gez',
    c_vers_haft: 'haftpflicht',
    c_vers_hausrat: 'hausrat',
    c_vers_kfz: 'kfz motorrad autoversicherung',
    c_vers_sonst: 'versicherung berufsunfahigkeit rechtsschutz',
    c_mob_tank: 'tanken tankstelle benzin !e10 super diesel aral shell esso jet',
    c_mob_oepnv: 'deutschlandticket !bahn !db ticket',
    c_mob_werk: 'werkstatt !tuv inspektion reifen ol wechsel',
    c_frei_essen: 'restaurant lieferando mcdonalds burger king doner pizzeria cafe imbiss',
    c_frei_abo: 'netflix spotify disney amazon prime youtube premium apple icloud abo',
    c_frei_kleid: 'kleidung zalando h m primark schuhe',
    c_frei_hobby: 'kino ausflug hobby fitness gym'
  };

  function defaultCats() {
    let sort = 0;
    return DEFAULT_CATS.map(([id, name, parent, color]) => ({
      id, name, parent: parent || null, color: color || null, sort: sort++
    }));
  }

  function defaultRules() {
    const out = [];
    const seen = new Set();
    Object.keys(DEFAULT_RULES).forEach(cat => {
      // Mehrwort-Stichworte zusammenhalten
      const multi = ['h milch', 'creme fraiche', 'ritter sport', 'red bull', 'burger king', 'amazon prime', 'youtube premium', 'h m', 'ol wechsel'];
      let txt = ' ' + DEFAULT_RULES[cat] + ' ';
      const words = [];
      multi.forEach(m => { if (txt.includes(' ' + m + ' ')) { words.push(m); txt = txt.replace(' ' + m + ' ', ' '); } });
      txt.trim().split(/\s+/).filter(Boolean).forEach(w => words.push(w));
      words.forEach(w => {
        const whole = w.startsWith('!');
        const pattern = whole ? w.slice(1) : w;
        const id = 'r_' + cat + '_' + (whole ? 'w_' : '') + pattern.replace(/\s/g, '_');
        if (seen.has(id)) return;
        seen.add(id);
        out.push({ id, pattern, whole, cat, learned: false });
      });
    });
    return out;
  }

  // ---------- Klassifizierung ----------
  // rules: [{pattern, whole, cat, learned}] ; cats: Map id->cat
  function classify(name, rules, catExists) {
    const n = norm(name);
    if (!n) return UNSORTED;
    const padded = ' ' + n + ' ';
    // 1) gelernte Zuordnung (exakter Artikelname)
    for (const r of rules) {
      if (r.learned && r.pattern === n && catExists(r.cat)) return r.cat;
    }
    // 2) Stichwort-Regeln – spezifischstes Stichwort gewinnt
    //    (länger = besser, ganzes Wort +3, erstes Wort im Namen +2)
    const first = n.split(' ')[0];
    let best = null, bestScore = 0;
    for (const r of rules) {
      if (r.learned || !r.pattern || !catExists(r.cat)) continue;
      const p = norm(r.pattern);
      if (!p) continue;
      const hit = r.whole ? padded.includes(' ' + p + ' ') : n.includes(p);
      if (!hit) continue;
      const score = p.length + (r.whole ? 3 : 0) + (first === p ? 2 : 0);
      if (score > bestScore) { best = r.cat; bestScore = score; }
    }
    return best || UNSORTED;
  }

  // ---------- Kassenbon-Parser ----------
  const STORES = ['rewe', 'edeka', 'aldi', 'lidl', 'kaufland', 'netto', 'penny', 'marktkauf', 'real', 'globus', 'dm', 'rossmann', 'muller', 'famila', 'combi', 'hit', 'tegut', 'norma', 'denns', 'alnatura', 'action', 'ikea', 'tedi', 'aral', 'shell', 'esso', 'jet'];
  const STORE_NAMES = { dm: 'dm', muller: 'Müller', denns: 'denn\'s' };
  const STOP_TOTAL = /\b(summe|zu zahlen|zahlbetrag|gesamtbetrag|gesamt|total|endbetrag)\b/i;
  const SKIP = /\b(mwst|ust|steuer|netto|brutto|gegeben|ruckgeld|rückgeld|wechselgeld|bar|ec|karte|girocard|visa|mastercard|maestro|kontaktlos|betrag|zwischensumme|trace|terminal|beleg|kasse|bon|tse|signatur|seriennummer|payback|punkte|treuepunkte)\b/i;
  const DISCOUNT = /(rabatt|preisvorteil|coupon|nachlass|aktion|sofortrabatt|ersparnis|reduziert)/i;
  const PRICE_END = /^(.*?)\s+(-?)\s?(\d{1,4}[.,]\d{2})\s*(-?)\s*(?:eur|€)?\s*(?:[a-z0-9*]{1,2})?\s*$/i;

  function toNum(s) { return parseFloat(String(s).replace(/\s/g, '').replace(',', '.')); }

  function cleanName(s) {
    return s.replace(/^[\s*#.:\-]+/, '').replace(/\s{2,}/g, ' ').replace(/[\s.:\-]+$/, '').trim();
  }

  function parseReceipt(text) {
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let store = '', date = '', total = null;
    // Markt erkennen
    for (const l of lines.slice(0, 10)) {
      const n = norm(l);
      const hit = STORES.find(s => (' ' + n + ' ').includes(' ' + s + ' '));
      if (hit) { store = STORE_NAMES[hit] || hit.toUpperCase(); break; }
    }
    if (!store && lines.length) {
      const first = lines.find(l => /[a-zA-ZäöüÄÖÜ]{3,}/.test(l));
      if (first) store = cleanName(first).slice(0, 30);
    }
    // Datum
    for (const l of lines) {
      const m = l.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/);
      if (m) {
        let [_, d, mo, y] = m; y = y.length === 2 ? '20' + y : y;
        const dd = +d, mm = +mo, yy = +y;
        if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && yy >= 2000 && yy <= 2100) {
          date = `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`; break;
        }
      }
    }
    // Positionen
    const items = [];
    let ended = false;
    for (const l of lines) {
      if (ended) break;
      const m = l.match(PRICE_END);
      if (!m) continue;
      let name = cleanName(m[1]);
      const amount = toNum(m[3]) * ((m[2] || m[4]) ? -1 : 1);
      if (isNaN(amount)) continue;
      if (STOP_TOTAL.test(name)) { total = Math.abs(amount); ended = true; continue; }
      if (SKIP.test(name)) continue;
      // Mengen-/Gewichtszeilen ("2 Stk x 0,99", "0,512 kg x 1,99 EUR/kg")
      if (/^\s*[\d.,]+\s*(stk|st|kg|g|x|\*)\b/i.test(name) || /\/\s*kg/i.test(l) || /^\s*x\s/i.test(name)) continue;
      if (!/[a-zA-ZäöüÄÖÜß]{2,}/.test(name)) continue;
      if (DISCOUNT.test(name) && amount < 0 && items.length) {
        items[items.length - 1].amount = Math.round((items[items.length - 1].amount + amount) * 100) / 100;
        continue;
      }
      items.push({ name, amount: Math.round(amount * 100) / 100 });
    }
    return { store, date, total, items };
  }

  // ---------- Fixkosten ----------
  function monthIndex(ym) { const [y, m] = ym.split('-').map(Number); return y * 12 + (m - 1); }
  function fixedActive(f, ym) {
    const i = monthIndex(ym);
    if (f.start && i < monthIndex(f.start)) return false;
    if (f.end && i > monthIndex(f.end)) return false;
    return true;
  }
  function fixedMonthly(f) { return (Number(f.amount) || 0) / (Number(f.every) || 1); }
  function fixedDue(f, ym) {
    if (!fixedActive(f, ym)) return false;
    const every = Number(f.every) || 1;
    const start = f.start ? monthIndex(f.start) : 0;
    return ((monthIndex(ym) - start) % every + every) % every === 0;
  }

  // ---------- Schlaue Gruppierung für die Anzeige ----------
  // subs: [{id,name,amount,count}] einer Hauptgruppe -> kleine zu "Weitere" zusammenfassen
  function foldSmall(subs, thresholdPct) {
    const total = subs.reduce((a, s) => a + s.amount, 0);
    if (total <= 0) return subs;
    const small = subs.filter(s => (s.amount / total) * 100 < thresholdPct);
    if (small.length < 2) return subs.slice().sort((a, b) => b.amount - a.amount);
    const big = subs.filter(s => !small.includes(s)).sort((a, b) => b.amount - a.amount);
    big.push({
      id: '__weitere', name: 'Weitere', folded: small,
      amount: small.reduce((a, s) => a + s.amount, 0),
      count: small.reduce((a, s) => a + s.count, 0)
    });
    return big;
  }

  const api = { norm, defaultCats, defaultRules, classify, parseReceipt, fixedActive, fixedMonthly, fixedDue, foldSmall, monthIndex, UNSORTED };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HL = api;
})(this);
