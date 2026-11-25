/**
 * BIBFRAME in Arabic (plan step E1, after "BIBFRAME en español", 2026): an Arabic label for every BIBFRAME and
 * BFLC term Moon's published data uses, in the words Moon's editor already uses (an Instance is "التجسيد", a copy
 * "النسخة"). Each label is a draft until the library's Super Admin reviews it (accepts it or writes a better one);
 * the vocabulary is published as open RDF (/resource/bibframe-ar.ttl), reviewed labels as rdfs:label, drafts as
 * skos:altLabel with an editorial note, so nothing unreviewed passes for an authority.
 * Pure: index.tsx serves it with the reviews kept in the store.
 */

export const BF = "http://id.loc.gov/ontologies/bibframe/";
export const BFLC = "http://id.loc.gov/ontologies/bflc/";

/** Draft Arabic labels, by term (bf: or bflc:). */
export const BF_ARABIC: Record<string, string> = {
  // ---- Classes ----
  "bf:Work": "العمل",
  "bf:Instance": "التجسيد",
  "bf:Item": "النسخة",
  "bf:Hub": "المجمّع",
  "bf:Text": "نص",
  "bf:Print": "مطبوع",
  "bf:Title": "العنوان",
  "bf:VariantTitle": "عنوان مختلف",
  "bf:Agent": "الفاعل",
  "bf:Person": "شخص",
  "bf:Organization": "هيئة",
  "bf:Family": "أسرة",
  "bf:Contribution": "المساهمة",
  "bf:PrimaryContribution": "المساهمة الرئيسية",
  "bf:Role": "الدور",
  "bf:Topic": "موضوع",
  "bf:Place": "مكان",
  "bf:GenreForm": "النوع والشكل",
  "bf:Language": "اللغة",
  "bf:Content": "نوع المحتوى",
  "bf:Media": "نوع الوسيط",
  "bf:Carrier": "نوع الحامل",
  "bf:Issuance": "طريقة الإصدار",
  "bf:ProvisionActivity": "نشاط الإتاحة",
  "bf:Publication": "النشر",
  "bf:Production": "الإنتاج",
  "bf:Extent": "الامتداد",
  "bf:Note": "تبصرة",
  "bf:Summary": "ملخص",
  "bf:TableOfContents": "قائمة المحتويات",
  "bf:IntendedAudience": "الجمهور المستهدف",
  "bf:SupplementaryContent": "محتوى إضافي",
  "bf:Illustration": "إيضاحيات",
  "bf:Notation": "نظام الكتابة",
  "bf:Series": "سلسلة",
  "bf:Dissertation": "أطروحة",
  "bf:GeographicCoverage": "التغطية الجغرافية",
  "bf:Identifier": "معرّف",
  "bf:Isbn": "ردمك (ISBN)",
  "bf:Lccn": "رقم ضبط مكتبة الكونغرس (LCCN)",
  "bf:Local": "معرّف محلي",
  "bf:ShelfMark": "رقم الرف",
  "bf:ClassificationLcc": "تصنيف مكتبة الكونغرس",
  "bf:ClassificationDdc": "تصنيف ديوي العشري",
  "bf:Source": "المصدر",
  "bf:AdminMetadata": "البيانات الإدارية",
  "bf:GenerationProcess": "طريقة إنشاء الوصف",
  "bf:AcquisitionSource": "مصدر التزويد",
  "bf:ImmediateAcquisition": "طريقة الاقتناء المباشر",
  "bf:AccessPolicy": "سياسة الإتاحة",
  "bf:Relation": "علاقة",

  // ---- Properties ----
  "bf:title": "العنوان",
  "bf:mainTitle": "العنوان الرئيسي",
  "bf:subtitle": "العنوان الفرعي",
  "bf:contribution": "المساهمة",
  "bf:agent": "الفاعل",
  "bf:role": "الدور",
  "bf:subject": "الموضوع",
  "bf:genreForm": "النوع والشكل",
  "bf:language": "اللغة",
  "bf:content": "نوع المحتوى",
  "bf:media": "نوع الوسيط",
  "bf:carrier": "نوع الحامل",
  "bf:issuance": "طريقة الإصدار",
  "bf:instanceOf": "تجسيد لـ",
  "bf:hasInstance": "له تجسيد",
  "bf:hasItem": "له نسخة",
  "bf:itemOf": "نسخة من",
  "bf:expressionOf": "تعبير عن",
  "bf:hasExpression": "له تعبير",
  "bf:identifiedBy": "المعرّف",
  "bf:provisionActivity": "بيانات النشر",
  "bf:provisionActivityStatement": "بيان النشر",
  "bf:responsibilityStatement": "بيان المسؤولية",
  "bf:editionStatement": "بيان الطبعة",
  "bf:seriesStatement": "بيان السلسلة",
  "bf:extent": "الامتداد",
  "bf:dimensions": "الأبعاد",
  "bf:illustrativeContent": "المحتوى الإيضاحي",
  "bf:supplementaryContent": "محتوى إضافي",
  "bf:note": "تبصرة",
  "bf:noteType": "نوع التبصرة",
  "bf:summary": "الملخص",
  "bf:tableOfContents": "قائمة المحتويات",
  "bf:intendedAudience": "الجمهور المستهدف",
  "bf:classification": "التصنيف",
  "bf:classificationPortion": "رقم التصنيف",
  "bf:itemPortion": "رقم المادة (رمز المؤلف)",
  "bf:date": "التاريخ",
  "bf:place": "المكان",
  "bf:originDate": "تاريخ العمل",
  "bf:originPlace": "مكان نشأة العمل",
  "bf:copyrightDate": "تاريخ حقوق النشر",
  "bf:geographicCoverage": "التغطية الجغرافية",
  "bf:temporalCoverage": "التغطية الزمنية",
  "bf:notation": "نظام الكتابة",
  "bf:hasSeries": "له سلسلة",
  "bf:hasPart": "له جزء",
  "bf:partOf": "جزء من",
  "bf:relatedTo": "ذو صلة بـ",
  "bf:translationOf": "ترجمة لـ",
  "bf:hasDerivative": "له عمل مشتق",
  "bf:originalVersion": "النسخة الأصلية",
  "bf:relation": "العلاقة",
  "bf:relationship": "نوع العلاقة",
  "bf:associatedResource": "المصدر المرتبط",
  "bf:dissertation": "الأطروحة",
  "bf:degree": "الدرجة العلمية",
  "bf:heldBy": "تقتنيه",
  "bf:shelfMark": "رقم الرف",
  "bf:usageAndAccessPolicy": "سياسة الاستخدام والإتاحة",
  "bf:acquisitionSource": "مصدر التزويد",
  "bf:immediateAcquisition": "الاقتناء المباشر",
  "bf:code": "الرمز",
  "bf:source": "المصدر",
  "bf:status": "الحالة",
  "bf:adminMetadata": "البيانات الإدارية",
  "bf:assigner": "الجهة المسؤولة",
  "bf:creationDate": "تاريخ إنشاء الوصف",
  "bf:changeDate": "تاريخ تعديل الوصف",
  "bf:descriptionConventions": "قواعد الوصف",
  "bf:descriptionLanguage": "لغة الوصف",
  "bf:descriptionLevel": "مستوى الوصف",
  "bf:descriptionAuthentication": "توثيق الوصف",
  "bf:generationProcess": "طريقة إنشاء الوصف",
  "bflc:aap": "نقطة الإتاحة المعتمدة",
  "bflc:marcKey": "مفتاح مارك",
  "bflc:encodingLevel": "مستوى الترميز",
  "bflc:metadataLicensor": "مانح ترخيص البيانات",
  "bflc:catalogerId": "رمز المفهرس",
  "bflc:simpleAgent": "الناشر كما ورد",
  "bflc:simplePlace": "مكان النشر كما ورد",
  "bflc:simpleDate": "تاريخ النشر كما ورد",
  "bflc:nonSortNum": "عدد حروف الإهمال في الترتيب",
  "bflc:projectedProvisionDate": "تاريخ النشر المتوقع",
};

export interface TermRow { term: string; uri: string; kind: "class" | "property"; en: string; ar: string; draft: string; status: "reviewed" | "draft"; uses?: number; by?: string; at?: string }
export interface Review { ar: string; by: string; at: string }

/** "mainTitle" → "Main title", "ProvisionActivity" → "Provision activity" (the ontology's own label style). */
export function englishOf(term: string): string {
  const local = term.replace(/^bf(?:lc)?:/, "");
  const words = local.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
export const uriOf = (term: string) => (term.startsWith("bflc:") ? BFLC : BF) + term.replace(/^bf(?:lc)?:/, "");
export const isClass = (term: string) => /^[A-Z]/.test(term.replace(/^bf(?:lc)?:/, ""));

/** Every term with its label, the reviewed label in place of the draft where there is one; the most used first. */
export function vocabulary(reviews: Record<string, Review> = {}, uses: Record<string, number> = {}): TermRow[] {
  return Object.entries(BF_ARABIC).map(([term, draft]) => {
    const r = reviews[term];
    return {
      term, uri: uriOf(term), kind: isClass(term) ? "class" as const : "property" as const, en: englishOf(term), draft,
      ar: r?.ar || draft, status: r ? "reviewed" as const : "draft" as const,
      ...(uses[term] !== undefined ? { uses: uses[term] } : {}), ...(r ? { by: r.by, at: r.at } : {}),
    };
  }).sort((a, b) => (a.kind === b.kind ? (b.uses ?? 0) - (a.uses ?? 0) || a.term.localeCompare(b.term) : a.kind === "class" ? -1 : 1));
}

/** A review checked: a known term and an Arabic label of sensible length. */
export function readReview(body: any): { term: string; ar: string } | { error: string } {
  const term = String(body?.term || "");
  if (!(term in BF_ARABIC)) return { error: "Not a term in the vocabulary" };
  const ar = String(body?.ar ?? "").replace(/\s+/g, " ").trim();
  if (!ar || ar.length > 80) return { error: "Write the Arabic label (up to 80 characters)" };
  if (!/[؀-ۿ]/.test(ar)) return { error: "The label should be in Arabic" };
  return { term, ar };
}

const lit = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** The vocabulary as Turtle: reviewed labels as rdfs:label @ar, drafts as skos:altLabel @ar with a note. */
export function toTurtle(rows: TermRow[], base = "https://mooon.site"): string {
  const reviewed = rows.filter((r) => r.status === "reviewed").length;
  const head = [
    "@prefix bf: <http://id.loc.gov/ontologies/bibframe/> .",
    "@prefix bflc: <http://id.loc.gov/ontologies/bflc/> .",
    "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
    "@prefix skos: <http://www.w3.org/2004/02/skos/core#> .",
    "@prefix dct: <http://purl.org/dc/terms/> .",
    "",
    `<${base}/resource/bibframe-ar.ttl> dct:title "BIBFRAME in Arabic: labels for the terms Moon uses"@en , ${lit("BIBFRAME بالعربية: تسميات المصطلحات التي يستعملها مون")}@ar ;`,
    `  dct:license <https://creativecommons.org/publicdomain/zero/1.0/> ;`,
    `  dct:publisher <${base}/> ;`,
    `  dct:description ${lit(`${rows.length} terms; ${reviewed} reviewed by the library, the rest drafts (skos:altLabel).`)}@en .`,
    "",
  ];
  const body = rows.map((r) => {
    const name = r.term;
    return r.status === "reviewed"
      ? `${name} rdfs:label ${lit(r.ar)}@ar .`
      : `${name} skos:altLabel ${lit(r.ar)}@ar ;\n  skos:editorialNote "Draft Arabic label, not yet reviewed"@en .`;
  });
  return [...head, ...body, ""].join("\n");
}
