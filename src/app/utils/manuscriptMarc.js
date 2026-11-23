// Al-Qamar's MARC 21 / RDA builder (MAN/server/marc_builder.js), used by Moon's Manuscripts screen to build each
// manuscript's record from its source fields, so the Supabase table does not have to store the MARC.
// Kept as Al-Qamar wrote it; only made an ES module, with an ISO 2709 writer that runs in the browser (toIso2709).
// Types: manuscriptMarc.d.ts.
// Al-Qamar MARC 21 / RDA record builder, validator and exporters.
// One place that turns a manuscript's source fields into a MARC record, so the bulk cleanup,
// the "regenerate MARC" button and the .mrc / .mrk exports all agree.
//
// Coding follows MARC 21 Bibliographic, RDA, and AMREMM practice for Islamic manuscripts
// (Princeton "Pre-Modern and Islamic Manuscript cataloging" guidelines):
//   - control fields 001-009 have a value only (no indicators or subfields)
//   - undefined indicators are blank, never "0"
//   - 040 $e rda $e amremm, 264 _0 for production, 546 $b for script, 852 for the holding library
//   - a Hijri year with no day/month is given as two possible Gregorian years ("1844 أو 1845")

"use strict";

const CATALOGING_AGENCY = "IQ-KaCCS";
const DATE_ENTERED = "261016"; // 2026-10-16, when the catalog was first built

// ----------------------------------------------------
// Text helpers
// ----------------------------------------------------
const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g; // harakat, Quranic marks, tatweel
const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g;      // zero-width and direction marks

function normalizeDigits(str) {
  return String(str || "")
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0));
}

export function cleanText(str) {
  return normalizeDigits(String(str || "").replace(INVISIBLE, "")).replace(/\s+/g, " ").trim();
}

// For matching and de-duplication only, never for display: strips tashkeel and unifies letter variants.
export function normalizeArabic(str) {
  return cleanText(str)
    .replace(TASHKEEL, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ی/g, "ي")
    .replace(/ک/g, "ك")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}

const EMPTY_VALUES = new Set(["", "بلا", "-", "--", "؟", "?", "؟؟", "لا يوجد", "غير معروف"]);
function isEmptyValue(v) {
  return EMPTY_VALUES.has(cleanText(v));
}

function endWith(str, mark) {
  const s = cleanText(str).replace(/[\s.،,:;/]+$/, "");
  return s ? s + mark : s;
}

// ----------------------------------------------------
// Hijri calendar (tabular / arithmetic). Accurate to a day or two, which is plenty for years.
// ----------------------------------------------------
function hijriToJdn(y, m, d) {
  return d + Math.ceil(29.5 * (m - 1)) + (y - 1) * 354 + Math.floor((3 + 11 * y) / 30) + 1948440 - 1;
}

function jdnToGregorian(jdn) {
  let l = jdn + 68569;
  const n = Math.floor((4 * l) / 146097);
  l = l - Math.floor((146097 * n + 3) / 4);
  const i = Math.floor((4000 * (l + 1)) / 1461001);
  l = l - Math.floor((1461 * i) / 4) + 31;
  const j = Math.floor((80 * l) / 2447);
  const day = l - Math.floor((2447 * j) / 80);
  l = Math.floor(j / 11);
  const month = j + 2 - 12 * l;
  const year = 100 * (n - 49) + i + l;
  return { year, month, day };
}

// Gregorian years covered by a Hijri year, or by one month / one day of it.
export function hijriToGregorianYears(y, m = null, d = null) {
  let first, last;
  if (m && d) {
    first = last = hijriToJdn(y, m, d);
  } else if (m) {
    first = hijriToJdn(y, m, 1);
    last = (m === 12 ? hijriToJdn(y + 1, 1, 1) : hijriToJdn(y, m + 1, 1)) - 1;
  } else {
    first = hijriToJdn(y, 1, 1);
    last = hijriToJdn(y + 1, 1, 1) - 1;
  }
  return [jdnToGregorian(first).year, jdnToGregorian(last).year];
}

function hijriYearNow() {
  const g = new Date().getFullYear();
  return Math.floor((g - 622) * 33 / 32) + 1;
}

// Month names after normalizeArabic().
const HIJRI_MONTHS = [
  [/محرم/, 1], [/صفر/, 2],
  [/ربيع ?(الاول|الاوله|الاولي)/, 3], [/ربيع ?(الثاني|الاخر|الاخير)/, 4],
  [/جماد[يا]? ?(الاول|الاولي|الاوله)/, 5], [/جماد[يا]? ?(الاخره|الاخر|الثانيه|الثاني)/, 6],
  [/رجب/, 7], [/شعبان/, 8], [/رمضان/, 9], [/شوال/, 10],
  [/ذ[وي] ?القعده/, 11], [/ذ[وي] ?الحجه/, 12]
];

function findMonthAndDay(normText) {
  for (const [re, month] of HIJRI_MONTHS) {
    const m = normText.match(re);
    if (!m) continue;
    const before = normText.slice(0, m.index);
    let day = null;
    const num = before.match(/(\d{1,2})\s*(?:من\s*)?(?:شهر\s*)?$/);
    if (num && +num[1] >= 1 && +num[1] <= 30) day = +num[1];
    else if (/غره\s*(?:شهر\s*)?$/.test(before)) day = 1;
    else if (/منتصف\s*(?:شهر\s*)?$/.test(before)) day = 15;
    else if (/سلخ\s*(?:شهر\s*)?$/.test(before)) day = 29;
    return { month, day };
  }
  return { month: null, day: null };
}

// Parse a free-text copy date (تاريخ النسخ). Returns what 008, 046 and 264 $c need.
//   type: MARC 008/06 - "s" single, "q" questionable (between two years), "i" inclusive, "n" unknown
export function parseCopyDate(raw) {
  const text = cleanText(raw);
  const unknown = { type: "n", date1: "uuuu", date2: "uuuu", display: "[تاريخ النسخ غير معروف]", start: null, end: null };
  if (isEmptyValue(text)) return unknown;

  const norm = normalizeArabic(text);
  const isGregorianText = /\d\s*م\b|ميلادي|للميلاد/.test(norm) && !/هـ|ه\b|هجري/.test(norm);

  // Centuries: "ق 11هـ", "11ق", "القرن 11", "(ق11)", "ق12 او 13هـ"
  const centuries = [];
  for (const m of norm.matchAll(/(?:ق|القرن)\s*(\d{1,2})(?!\d)|(?<!\d)(\d{1,2})\s*ق(?![ا-ي])/g)) {
    const c = +(m[1] || m[2]);
    if (c >= 1 && c <= 15) centuries.push(c);
  }
  // "ق12 او 13هـ": the second number is a century too
  const orCentury = norm.match(/(?:ق|القرن)\s*\d{1,2}\s*(?:او|و|-)\s*(\d{1,2})(?!\d)/);
  if (orCentury && +orCentury[1] <= 15) centuries.push(+orCentury[1]);

  // Years: 3-4 digit numbers that are not folio/part references
  const years = [];
  for (const m of norm.matchAll(/(?<!\d)(\d{3,4})(?!\d)/g)) {
    const after = norm.slice(m.index + m[0].length);
    const before = norm.slice(0, m.index);
    // skip numbers that are folio or page references: "الورقة رقم 12", "120 ورقة"
    if (/(?:ورق|ورقه|صفحه|صفح|رقم)\s*$/.test(before) || /^\s*(?:ورق|صفح)/.test(after)) continue;
    years.push(+m[1]);
  }

  if (years.length === 0 && centuries.length) {
    const cMin = Math.min(...centuries), cMax = Math.max(...centuries);
    const g1 = hijriToGregorianYears((cMin - 1) * 100 + 1)[0];
    const g2 = hijriToGregorianYears(cMax * 100)[1];
    return {
      type: "q", date1: String(g1).padStart(4, "0"), date2: String(g2).padStart(4, "0"),
      display: `${text} [${g1}-${g2}]`, start: g1, end: g2
    };
  }
  if (years.length === 0) return { ...unknown, display: text };

  if (isGregorianText || Math.min(...years) > 1500) {
    // Already Gregorian (miladi). Years in the future are typos ("8027"): treat the date as unknown.
    const plausible = years.filter(y => y >= 600 && y <= new Date().getFullYear());
    if (!plausible.length) return { ...unknown, display: text };
    const gMin = Math.min(...plausible), gMax = Math.max(...plausible);
    return gMin === gMax
      ? { type: "s", date1: String(gMin), date2: "    ", display: text, start: gMin, end: gMin }
      : { type: "i", date1: String(gMin), date2: String(gMax), display: text, start: gMin, end: gMax };
  }

  // Hijri years beyond the current one are typos
  const hYears = years.filter(y => y >= 1 && y <= hijriYearNow());
  if (!hYears.length) return { ...unknown, display: text };
  const hMin = Math.min(...hYears), hMax = Math.max(...hYears);

  if (hMin === hMax) {
    const { month, day } = findMonthAndDay(norm);
    const [g1, g2] = hijriToGregorianYears(hMin, month, month ? day : null);
    if (g1 === g2) {
      return { type: "s", date1: String(g1).padStart(4, "0"), date2: "    ", display: `${text} [${g1}]`, start: g1, end: g1 };
    }
    return {
      type: "q", date1: String(g1).padStart(4, "0"), date2: String(g2).padStart(4, "0"),
      display: `${text} [${g1} أو ${g2}]`, start: g1, end: g2
    };
  }

  // Several years: alternatives ("1208 أو 1280") are questionable; parts copied over time are inclusive.
  const g1 = hijriToGregorianYears(hMin)[0];
  const g2 = hijriToGregorianYears(hMax)[1];
  const alternative = /(?:^|\s)او\s/.test(norm);
  return {
    type: alternative ? "q" : "i", date1: String(g1).padStart(4, "0"), date2: String(g2).padStart(4, "0"),
    display: `${text} [${g1}-${g2}]`, start: g1, end: g2
  };
}

// ----------------------------------------------------
// Languages -> MARC language codes
// ----------------------------------------------------
const LANGUAGES = [
  // [pattern on normalized text, MARC code, display name]
  [/عربي|العربيه/, "ara", "عربي"],
  [/فارسي|الفارسيه/, "per", "فارسي"],
  [/عثماني|تركي|التركيه/, "ota", "تركي عثماني"],
  [/اردو|الارديه|الاوردو/, "urd", "أردو"],
  [/كردي|الكرديه/, "kur", "كردي"],
  [/پشتو|بشتو|افغاني/, "pus", "پشتو"],
  [/سرياني/, "syr", "سرياني"],
  [/عبري/, "heb", "عبري"],
  [/ملايو|ملاوي/, "may", "ملايو"],
  [/لاتيني/, "lat", "لاتيني"],
  [/انكليزي|انجليزي/, "eng", "إنجليزي"],
  [/فرنسي/, "fre", "فرنسي"],
  [/الماني/, "ger", "ألماني"]
];

export function parseLanguages(raw) {
  const norm = normalizeArabic(raw);
  if (isEmptyValue(norm)) return { codes: ["und"], label: "" };
  const found = [];
  for (const [re, code, name] of LANGUAGES) {
    const m = norm.match(re);
    if (m) found.push({ code, name, at: m.index });
  }
  if (!found.length) return { codes: ["und"], label: cleanText(raw) };
  found.sort((a, b) => a.at - b.at); // keep the order the cataloger wrote
  const names = found.map(f => f.name);
  const label = names.length === 1 ? names[0] : names.slice(0, -1).join("، ") + " و" + names[names.length - 1];
  return { codes: found.map(f => f.code), label };
}

// ----------------------------------------------------
// Scripts (نوع الخط)
// ----------------------------------------------------
const SCRIPT_FIXES = [[/نستعلق/g, "نستعليق"], [/شكسته/g, "شكسته"]];
export function parseScripts(raw) {
  let t = cleanText(raw);
  if (isEmptyValue(t)) return "";
  for (const [re, rep] of SCRIPT_FIXES) t = t.replace(re, rep);
  const parts = t.split(/\s*(?:،|,|-|\/|\s و\s?|\sو(?=[^\s]))\s*/).map(s => s.replace(/^خط\s+/, "").trim()).filter(Boolean);
  const unique = [...new Set(parts)];
  return unique.length ? "خط " + unique.join(" و") : "";
}

// ----------------------------------------------------
// Holding library country (852 $n)
// ----------------------------------------------------
const COUNTRIES = [
  [/العراق|بغداد|النجف|كربلاء|الكوفه|البصره|الموصل|الكاظميه|سامراء|الحله|المستنصريه/, "iq"],
  [/ايران|طهران|قم|مشهد|اصفهان|شيراز|يزد|خوانسار|خويي|تبريز|قزوين|كاشان|همدان|كرمان|سمنان|زنجان|اردبيل|رشت/, "ir"],
  [/السعوديه|الرياض|مكه|المدينه المنوره|جده/, "su"],
  [/تركيا|اسطنبول|استانبول|انقره|قونيه|بورصه/, "tu"],
  [/اليمن|صنعاء|زبيد|تريم/, "ye"],
  [/مصر|القاهره|الازهر|الاسكندريه/, "ua"],
  [/قطر|القطريه|الدوحه/, "qa"],
  [/الكويت/, "ku"],
  [/البحرين/, "ba"],
  [/لبنان|بيروت/, "le"],
  [/سوريا|سوريه|دمشق|حلب/, "sy"],
  [/الهند|حيدر اباد|لكهنو|رامبور|بومباي/, "ii"],
  [/باكستان|لاهور|كراتشي/, "pk"],
  [/افغانستان|كابل|هرات/, "af"],
  [/اليابان|طوكيو/, "ja"],
  [/المانيا|لايبزك|برلين|ميونخ|توبنغن/, "gw"],
  [/بريطانيا|لندن|اكسفورد|كامبردج/, "xxk"],
  [/فرنسا|باريس/, "fr"],
  [/المغرب|الرباط|فاس/, "mr"],
  [/تونس/, "ti"],
  [/الجزائر/, "ae"],
  [/اذربيجان|باكو/, "aj"],
  [/روسيا|بطرسبرغ/, "ru"],
  [/اوزبكستان|طشقند|بخارى|بخاري|سمرقند/, "uz"]
];

export function countryCode(source) {
  const norm = normalizeArabic(source);
  for (const [re, code] of COUNTRIES) if (re.test(norm)) return code;
  return null;
}

// ----------------------------------------------------
// Names
// ----------------------------------------------------
// Role prefixes in المؤلف: "الجامع/ ...", "الشارح: ...", "منسوبة إلى: ..."
const ROLE_PREFIXES = [
  [/^(?:ال)?جامع\s*[:/]\s*/, "جامع."],
  [/^(?:ال)?شارح\s*[:/]\s*/, "شارح."],
  [/^(?:ال)?مترجم\s*[:/]\s*/, "مترجم."],
  [/^(?:ال)?ناظم\s*[:/]\s*/, "ناظم."],
  [/^(?:ال)?محشي\s*[:/]\s*/, "محشي."],
  [/^(?:ال)?مختصر\s*[:/]\s*/, "مختصر."],
  [/^(?:ال)?مؤلف\s*[:/]\s*/, "مؤلف."],
  [/^إنشاء\s*[:/]\s*/, "مؤلف."],
  [/^منسوب[ةه]?\s*(?:إلى|الى|ل)\s*[:/]?\s*/, "مؤلف منسوب إليه."]
];

function isUnknownName(name) {
  const n = normalizeArabic(name);
  return isEmptyValue(n) || /^مجهول/.test(n) || n === "غير معروف" || /^[?؟\-.\s]+$/.test(n);
}

// "نفيس الكرماني، نفيس بن عوض (ت842هـ)" -> { name: "نفيس الكرماني، نفيس بن عوض", dates: "ت 842هـ", relator: "مؤلف." }
// The name is kept exactly as the source catalog wrote it: Arabic names are not "surname, forename",
// so they must not be split on the first word.
export function parsePersonName(raw, defaultRelator = "مؤلف.") {
  let text = cleanText(raw).replace(/\s*,\s*/g, "، ");
  let relator = defaultRelator;
  for (const [re, rel] of ROLE_PREFIXES) {
    if (re.test(text)) {
      text = text.replace(re, "").trim();
      relator = rel;
      break;
    }
  }
  if (isUnknownName(text)) return null;

  // Close a bracket the source forgot: "محمد باقر بن محمد مؤمن(ت1090هـ"
  if ((text.match(/\(/g) || []).length > (text.match(/\)/g) || []).length) text += ")";

  const dateParts = [];
  let name = text.replace(/\(([^)]*)\)/g, (whole, inner) => {
    const t = inner.trim();
    if (/\d|^ت\b|^ت\s*\d|حيا|حياً|كان حي|القرن|ق\s*\d|توفي|وفاة/.test(t)) {
      dateParts.push(t);
      return " ";
    }
    if (/^ع$|^عليه السلام$|^ره$|^قده$|^رض$/.test(t)) return " "; // honorifics are not part of the heading
    return whole;
  });
  name = name.replace(/\s+/g, " ").replace(/[\s،,.:\-]+$/, "").trim();
  if (isUnknownName(name)) return null;

  const dates = dateParts
    .map(d => d.replace(/^ت\s*(?=\d)/, "ت ").replace(/\s*هـ/g, "هـ").replace(/\s*-\s*/g, "-").replace(/\s+/g, " "))
    .join("، ");
  return { name, dates, relator, inverted: name.includes("،") };
}

// Values in الناسخ that describe the copy instead of naming a person.
// Patterns run on normalizeArabic() text, where ؤ has become و and ة has become ه.
const SCRIBE_NOTES = [
  [/^بخط (ال)?مولف|^(ال)?مولف$/, "النسخة بخط المؤلف."],
  [/^بخط (ال)?جامع|^(ال)?جامع$/, "النسخة بخط الجامع."],
  [/^بخط (ال)?ناظم/, "النسخة بخط الناظم."],
  [/^بخط (ال)?مجيز/, "النسخة بخط المجيز."],
  [/^بخط (ال)?مرسل/, "النسخة بخط المرسل."],
  [/^بخط (ال)?شارح/, "النسخة بخط الشارح."],
  [/^مجموعه نساخ|^عده نساخ|^نساخ متعددون/, "النسخة بخطوط نساخ متعددين."]
];

export function parseScribe(raw) {
  const text = cleanText(raw);
  const norm = normalizeArabic(text);
  for (const [re, note] of SCRIBE_NOTES) {
    if (re.test(norm)) return { note };
  }
  const person = parsePersonName(text, "ناسخ.");
  return person ? { person: { ...person, relator: "ناسخ." } } : {};
}

// ----------------------------------------------------
// Extent (عدد الاوراق) -> 300 $a
// ----------------------------------------------------
export function parseExtent(raw) {
  const t = cleanText(raw);
  if (isEmptyValue(t) || t === "مختلف") return "1 مجلد";
  if (/^\d+$/.test(t)) return `${t} ورقة`;
  if (/^\d+\s*-\s*\d+$/.test(t)) return `ورقة ${t.replace(/\s*-\s*/, "-")}`; // range inside a collection
  if (/^\d+\s*ص(فحة|فحات)?$/.test(t)) return `${t.match(/\d+/)[0]} صفحة`;
  if (t === "صفحة واحدة") return "1 صفحة";
  return t;
}

// ----------------------------------------------------
// Classification (local, machine-suggested) -> 090
// ----------------------------------------------------
function suggestClass(subject) {
  const s = normalizeArabic(subject);
  const map = [
    [/تفسير|قران|تجويد|قراءات/, "BP130.4"], [/حديث|درايه|رجال/, "BP135"],
    [/فقه|اصول|فرائض|ميراث/, "BP144"], [/كلام|عقائد|توحيد/, "BP166"],
    [/دعاء|ادعيه|زيارات|اوراد/, "BP183.3"], [/اخلاق|تصوف|عرفان|وعظ/, "BP188"],
    [/سيره|تاريخ|تراجم|انساب/, "DS38.2"], [/نحو|صرف|لغه|بلاغه|عروض|معاجم/, "PJ6101"],
    [/ادب|شعر|ديوان/, "PJ7541"], [/منطق|فلسفه|حكمه/, "B741"],
    [/طب|تشريح|صيدله/, "R128.3"], [/فلك|هيئه|حساب|رياضيات|هندسه/, "QB23"]
  ];
  for (const [re, cls] of map) if (re.test(s)) return cls;
  return null;
}

// ISO 2709 caps one field at 9,999 bytes. Split very long notes at a word boundary into several fields.
const utf8Bytes = (s) => new TextEncoder().encode(s).length;
function splitForMarc(text, maxBytes = 9000) {
  const pieces = [];
  let rest = String(text || "");
  while (utf8Bytes(rest) > maxBytes) {
    let cut = Math.floor(rest.length * (maxBytes / utf8Bytes(rest)));
    while (cut > 0 && utf8Bytes(rest.slice(0, cut)) > maxBytes) cut -= 50;
    const space = rest.lastIndexOf(" ", cut);
    if (space > cut * 0.5) cut = space;
    pieces.push(rest.slice(0, cut).trim() + " ...");
    rest = "... " + rest.slice(cut).trim();
  }
  pieces.push(rest);
  return pieces;
}

// ----------------------------------------------------
// Field helpers
// ----------------------------------------------------
// $d ends with a comma before $e, except an open date ("1349هـ-"), which ends with its hyphen.
const dateSubfield = d => (/-$/.test(cleanText(d)) ? cleanText(d) : endWith(d, "،"));

const ctrl = (tag, value) => ({ tag, value });
// Returns null when nothing is left after dropping empty subfields; buildMarcRecord filters those out.
const data = (tag, indicators, subfields) => {
  const kept = subfields.filter(s => s && s.value !== undefined && s.value !== null && String(s.value).trim() !== "");
  return kept.length ? { tag, indicators, subfields: kept } : null;
};
const sf = (code, value) => ({ code, value });

function build008(date, langCode, literaryForm) {
  const v =
    DATE_ENTERED +             // 00-05 date entered
    date.type +                // 06 type of date
    date.date1 +               // 07-10 date 1
    date.date2 +               // 11-14 date 2
    "xx " +                    // 15-17 place of production unknown
    "    " +                   // 18-21 illustrations
    " " +                      // 22 audience
    " " +                      // 23 form of item
    "    " +                   // 24-27 nature of contents
    " " +                      // 28 government publication
    "0" + "0" + "0" +          // 29 conference, 30 festschrift, 31 index
    " " +                      // 32 undefined
    literaryForm +             // 33 literary form
    " " +                      // 34 biography
    langCode +                 // 35-37 language
    " " +                      // 38 modified record
    "d";                       // 39 cataloging source: other
  if (v.length !== 40) throw new Error(`008 length ${v.length}`);
  return v;
}

function timestamp005(d = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}.0`;
}

// ----------------------------------------------------
// The builder
// ----------------------------------------------------
// record: { id, viewUrl, source_fields }
export function buildMarcRecord(record, options = {}) {
  const f = record.source_fields || {};
  const get = k => cleanText(f[k]);
  const id = String(record.id || "").trim();
  const viewUrl = record.viewUrl || null;

  const rawTitle = get("العنوان");
  const rawAuthor = get("المؤلف");
  const rawSubject = get("الموضوع");
  const rawCopyNum = get("رقم النسخة");
  const rawSource = get("المصدر");
  const rawPlace = get("مكان النسخ");
  const rawIncipit = get("أول النسخة");
  const rawExplicit = get("آخر النسخة");
  const rawDesc = get("وصف النسخة");

  const date = parseCopyDate(f["تاريخ النسخ"]);
  const langs = parseLanguages(f["اللغة"]);
  const script = parseScripts(f["نوع الخط"]);
  const author = parsePersonName(rawAuthor);
  const scribe = parseScribe(f["الناسخ"]);
  const subjects = isEmptyValue(rawSubject)
    ? []
    : [...new Set(rawSubject.split(/\s*[،,]\s*/).map(s => s.trim()).filter(s => s && !isEmptyValue(s)))];
  const isPoetry = subjects.some(s => /شعر|ديوان|قصيد|منظوم/.test(normalizeArabic(s)));

  const marc = [];

  // Leader: new record, manuscript language material, monograph, Unicode, minimal level (machine-generated), ISBD
  marc.push(ctrl("000", "00000ntm a2200000 i 4500"));
  marc.push(ctrl("001", `b${id}`));
  marc.push(ctrl("003", CATALOGING_AGENCY));
  marc.push(ctrl("005", options.timestamp || timestamp005()));
  marc.push(ctrl("008", build008(date, langs.codes[0], isPoetry ? "p" : "0")));

  marc.push(data("035", "\\\\", [sf("a", `(DROMH)${id}`)]));
  marc.push(data("040", "\\\\", [
    sf("a", CATALOGING_AGENCY), sf("b", "ara"), sf("e", "rda"), sf("e", "amremm"), sf("c", CATALOGING_AGENCY)
  ]));
  if (langs.codes.length > 1) {
    marc.push(data("041", "0\\", langs.codes.map(c => sf("a", c))));
  }
  if (date.start !== null) {
    // 046: machine-readable creation dates (Gregorian)
    marc.push(data("046", "\\\\", [
      sf("k", String(date.start)),
      date.end !== date.start ? sf("l", String(date.end)) : null
    ]));
  }
  const cls = suggestClass(rawSubject);
  if (cls) {
    // 090 = locally assigned, LC-style. It is suggested from the subject keyword, not assigned by a cataloger.
    marc.push(data("090", "\\\\", [sf("a", cls)]));
  }

  // Main entry
  if (author) {
    marc.push(data("100", author.inverted ? "1\\" : "0\\", [
      sf("a", endWith(author.name, "،")),
      author.dates ? sf("d", dateSubfield(author.dates)) : null,
      sf("e", author.relator)
    ]));
  }

  // Titles: the source separates alternative titles with "="
  const titleText = isEmptyValue(rawTitle) ? "[مخطوط بدون عنوان]" : rawTitle;
  const titleParts = titleText.split(/\s*=\s*/).map(s => s.trim()).filter(Boolean);
  const mainTitle = titleParts[0] || titleText;
  const altTitles = titleParts.slice(1);

  // A preferred (uniform) title only when the item carries several titles.
  if (altTitles.length) {
    if (author) marc.push(data("240", "10", [sf("a", mainTitle)]));
    else marc.push(data("130", "0\\", [sf("a", mainTitle)]));
  }
  const has1xx = !!author || altTitles.length > 0;
  const statement = author ? rawAuthor : "";
  marc.push(data("245", has1xx ? "10" : "00", statement
    ? [sf("a", endWith(titleText, " /")), sf("c", endWith(statement, "."))]
    : [sf("a", endWith(titleText, "."))]));
  for (const alt of altTitles) {
    marc.push(data("246", "3\\", [sf("a", alt)]));
  }

  // Production (RDA: manuscripts are "produced", 264 second indicator 0)
  marc.push(data("264", "\\0", [
    sf("a", isEmptyValue(rawPlace) ? "[مكان النسخ غير معروف]،" : endWith(rawPlace, "،")),
    sf("c", endWith(date.display, "."))
  ]));

  marc.push(data("300", "\\\\", [sf("a", endWith(parseExtent(f["عدد الاوراق"]), "."))]));
  marc.push(data("336", "\\\\", [sf("a", "نص"), sf("b", "txt"), sf("2", "rdacontent")]));
  marc.push(data("337", "\\\\", [sf("a", "بدون وسيط"), sf("b", "n"), sf("2", "rdamedia")]));
  marc.push(data("338", "\\\\", [sf("a", "مجلد"), sf("b", "nc"), sf("2", "rdacarrier")]));

  // Notes (each piece of source text appears once)
  if (!isEmptyValue(rawIncipit)) marc.push(data("500", "\\\\", [sf("a", `أوله: ${rawIncipit}`)]));
  if (!isEmptyValue(rawExplicit)) marc.push(data("500", "\\\\", [sf("a", `آخره: ${rawExplicit}`)]));
  if (scribe.note) marc.push(data("500", "\\\\", [sf("a", scribe.note)]));
  if (!isEmptyValue(rawDesc)) {
    for (const piece of splitForMarc(endWith(rawDesc, "."))) marc.push(data("500", "\\\\", [sf("a", piece)]));
  }
  const incomplete = [];
  if (/ناقص|مخروم|خرم/.test(normalizeArabic(rawIncipit))) incomplete.push("الأول");
  if (/ناقص|مخروم|خرم/.test(normalizeArabic(rawExplicit))) incomplete.push("الآخر");
  if (incomplete.length) marc.push(data("500", "\\\\", [sf("a", `النسخة ناقصة ${incomplete.join(" و")}.`)]));

  if (langs.label || script) {
    marc.push(data("546", "\\\\", [
      langs.label ? sf("a", endWith(langs.label, script ? "؛" : ".")) : null,
      script ? sf("b", endWith(script, ".")) : null
    ]));
  }

  // Subjects and genre
  for (const s of subjects) {
    marc.push(data("650", "\\4", [sf("a", s), sf("v", "مخطوطات.")]));
  }
  marc.push(data("655", "\\4", [sf("a", "مخطوطات.")]));

  // Added entry for the copyist
  if (scribe.person) {
    marc.push(data("700", scribe.person.inverted ? "1\\" : "0\\", [
      sf("a", endWith(scribe.person.name, "،")),
      scribe.person.dates ? sf("d", dateSubfield(scribe.person.dates)) : null,
      sf("e", "ناسخ.")
    ]));
  }

  // Holding library and shelf number
  if (!isEmptyValue(rawSource)) {
    marc.push(data("852", "\\\\", [
      sf("a", rawSource),
      isEmptyValue(rawCopyNum) ? null : sf("j", rawCopyNum),
      countryCode(rawSource) ? sf("n", countryCode(rawSource)) : null
    ]));
  }

  // Link to the description on dromh.org (a related resource, not the manuscript itself)
  if (viewUrl) {
    marc.push(data("856", "42", [sf("3", "وصف المخطوطة في المرجع الرقمي للتراث المخطوط"), sf("u", viewUrl)]));
  }

  return marc.filter(Boolean);
}

// ----------------------------------------------------
// Validation (structure, not cataloging judgement)
// ----------------------------------------------------
const IND_OK = /^[0-9\\ ]{2}$/;
const CODE_OK = /^[a-z0-9]$/;

export function validateMarc(marc) {
  const problems = [];
  if (!Array.isArray(marc)) return ["السجل ليس قائمة حقول"];
  const leader = marc.find(m => m.tag === "000");
  if (!leader || typeof leader.value !== "string" || leader.value.length !== 24) problems.push("الفاتح (LDR) يجب أن يكون 24 خانة");
  for (const m of marc) {
    const tag = String(m.tag || "");
    if (!/^\d{3}$/.test(tag)) { problems.push(`وسم غير صالح: ${tag}`); continue; }
    if (tag === "000") continue;
    if (+tag < 10) {
      if (m.subfields) problems.push(`الحقل الثابت =${tag} لا يقبل مؤشرات أو حقولاً فرعية`);
      if (tag === "008" && String(m.value || "").length !== 40) problems.push("الحقل =008 يجب أن يكون 40 خانة");
      continue;
    }
    if (!IND_OK.test(String(m.indicators || ""))) problems.push(`مؤشرات غير صالحة في =${tag}: "${m.indicators}"`);
    if (!Array.isArray(m.subfields) || m.subfields.length === 0) { problems.push(`الحقل =${tag} بلا حقول فرعية`); continue; }
    for (const s of m.subfields) {
      if (!CODE_OK.test(String(s.code || ""))) problems.push(`رمز حقل فرعي غير صالح في =${tag}: "${s.code}"`);
    }
  }
  if (!marc.some(m => m.tag === "245")) problems.push("لا يوجد حقل العنوان =245");
  return problems;
}

// ----------------------------------------------------
// Exporters
// ----------------------------------------------------
const FT = 0x1E, SD = 0x1F, RT = 0x1D;

function controlValue(field) {
  if (field.value !== undefined && field.value !== null) return String(field.value);
  // Records saved before the fix stored 001 as a subfield; keep the value, drop the wrapper.
  if (Array.isArray(field.subfields)) return field.subfields.map(s => s.value || "").join("");
  return "";
}

function stripControlChars(s) {
  return String(s).replace(/[\x1D\x1E\x1F]/g, " ");
}

// MARC text / "mnemonic" format (.mrk), as read by MarcEdit
export function toMrk(marc) {
  const lines = [];
  const leader = (marc.find(m => m.tag === "000") || {}).value;
  if (leader) lines.push(`=LDR  ${leader}`);
  for (const m of marc.filter(x => x.tag !== "000").slice().sort((a, b) => String(a.tag).localeCompare(String(b.tag)))) {
    if (+m.tag < 10) {
      lines.push(`=${m.tag}  ${controlValue(m).replace(/ /g, m.tag === "008" ? "\\" : " ")}`);
    } else {
      const ind = String(m.indicators || "").replace(/ /g, "\\").padEnd(2, "\\").slice(0, 2);
      lines.push(`=${m.tag}  ${ind}${(m.subfields || []).map(s => `$${s.code}${s.value}`).join("")}`);
    }
  }
  return lines.join("\n") + "\n";
}

// ISO 2709 (.mrc), UTF-8. The same layout as Al-Qamar's writer, with TextEncoder in place of Node's Buffer.
const enc = new TextEncoder();
const concat = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
export function toIso2709(marc) {
  const fields = marc.filter(m => m.tag !== "000").slice()
    .sort((a, b) => String(a.tag).localeCompare(String(b.tag)));
  const leaderSrc = (marc.find(m => m.tag === "000") || {}).value || "00000ntm a2200000 i 4500";
  let directory = "";
  const bufs = [];
  let offset = 0;
  for (const field of fields) {
    const tag = String(field.tag).padStart(3, "0").slice(0, 3);
    let buf;
    if (+tag < 10) {
      buf = concat([enc.encode(stripControlChars(controlValue(field))), Uint8Array.of(FT)]);
    } else {
      const ind = String(field.indicators || "").replace(/\\/g, " ").padEnd(2, " ").slice(0, 2);
      const parts = [enc.encode(ind)];
      for (const s of field.subfields || []) {
        parts.push(Uint8Array.of(SD), enc.encode(String(s.code || "a").slice(0, 1) + stripControlChars(s.value || "")));
      }
      parts.push(Uint8Array.of(FT));
      buf = concat(parts);
    }
    if (buf.length > 9999) throw new Error(`الحقل =${tag} أطول من الحد المسموح في ISO 2709 (9999 بايت)`);
    directory += tag + String(buf.length).padStart(4, "0") + String(offset).padStart(5, "0");
    offset += buf.length;
    bufs.push(buf);
  }
  const dirBuf = concat([enc.encode(directory), Uint8Array.of(FT)]);
  const base = 24 + dirBuf.length;
  const content = concat(bufs);
  const total = base + content.length + 1;
  if (total > 99999) throw new Error("السجل أطول من الحد المسموح في ISO 2709 (99999 بايت)");
  const l = leaderSrc.padEnd(24, " ").split("");
  const leader =
    String(total).padStart(5, "0") +
    l.slice(5, 9).join("") + "a" + "22" +
    String(base).padStart(5, "0") +
    l.slice(17, 20).join("") + "4500";
  return concat([enc.encode(leader), dirBuf, content, Uint8Array.of(RT)]);
}
