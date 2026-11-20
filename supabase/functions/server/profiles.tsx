/**
 * Moon's cataloguing profiles, in the JSON form of LC's Marva profiles (Profile → resourceTemplates →
 * propertyTemplates, with mandatory / repeatable / type / valueConstraint). They are the one place that
 * says which fields a record has and which are required; the server's publish gate and the SHACL shapes
 * published at /profiles/<id>/shapes.ttl are generated from them.
 *
 * Moon additions (not in LC's format) start with "moon:": Arabic labels, and an inverse link that also
 * satisfies a property (a Work's bf:hasInstance counts as the Instance's bf:instanceOf).
 *
 * This file is shared: the edge function imports it, and so can the app and the tests.
 */

const BF = "http://id.loc.gov/ontologies/bibframe/";

export interface ValueConstraint {
  valueTemplateRefs?: string[];
  useValuesFrom?: string[];
  defaults?: { defaultURI?: string; defaultLiteral?: string }[];
  valueDataType?: { dataTypeURI?: string };
}

export interface PropertyTemplate {
  propertyURI: string;
  propertyLabel: string;
  "moon:propertyLabelAr": string;
  mandatory: "true" | "false";
  repeatable: "true" | "false";
  /** literal: text; resource: a node built from valueTemplateRefs; lookup: a term from useValuesFrom. */
  type: "literal" | "resource" | "lookup";
  valueConstraint: ValueConstraint;
  /** Moon: the same fact stated from the other end (e.g. bf:hasInstance on the Work for bf:instanceOf). */
  "moon:inverseOf"?: string;
}

export interface ResourceTemplate {
  id: string;
  resourceURI: string;
  resourceLabel: string;
  "moon:resourceLabelAr": string;
  propertyTemplates: PropertyTemplate[];
}

export interface Profile {
  Profile: {
    id: string;
    title: string;
    description: string;
    resourceTemplates: ResourceTemplate[];
  };
}

const P = (
  local: string, label: string, labelAr: string, mandatory: boolean, repeatable: boolean,
  type: PropertyTemplate["type"], valueConstraint: ValueConstraint = {}, extra: Partial<PropertyTemplate> = {},
): PropertyTemplate => ({
  propertyURI: BF + local,
  propertyLabel: label,
  "moon:propertyLabelAr": labelAr,
  mandatory: mandatory ? "true" : "false",
  repeatable: repeatable ? "true" : "false",
  type,
  valueConstraint,
  ...extra,
});

const vocab = (path: string) => `http://id.loc.gov/vocabulary/${path}`;

const lcDefault = (path: string, label: string) => [{ defaultURI: vocab(path), defaultLiteral: label }];

interface ProfileDefaults { content: [string, string]; media: [string, string]; carrier: [string, string]; issuance: [string, string] }

/**
 * A profile with LC's core requirements (as LC's Monograph profile): the same required fields for every
 * Moon template; what differs is the values pre-filled for them (music is notated music, a map a sheet...).
 */
function coreProfile(key: string, title: string, description: string, d: ProfileDefaults): Profile {
  const base = JSON.parse(JSON.stringify(MONOGRAPH_PROFILE)) as Profile;
  const id = `moon:${key}`;
  const rename = (s: string) => s.replace("moon:Monograph", id);
  base.Profile.id = id;
  base.Profile.title = title;
  base.Profile.description = description;
  for (const t of base.Profile.resourceTemplates) {
    t.id = rename(t.id);
    for (const p of t.propertyTemplates) {
      p.valueConstraint.valueTemplateRefs = p.valueConstraint.valueTemplateRefs?.map(rename);
      const name = p.propertyURI.slice(BF.length) as keyof ProfileDefaults;
      if (d[name] && (t.resourceURI === BF + "Work" || t.resourceURI === BF + "Instance")) p.valueConstraint.defaults = lcDefault(...d[name]);
    }
  }
  return base;
}

/** LC's core requirements for a printed monograph (BIBFRAME Monograph profile), with Moon's labels. */
export const MONOGRAPH_PROFILE: Profile = {
  Profile: {
    id: "moon:Monograph",
    title: "Monograph",
    description: "Printed books: a Work, its Instance, and their titles. Required fields follow LC's Monograph profile.",
    resourceTemplates: [
      {
        id: "moon:Monograph:Work",
        resourceURI: BF + "Work",
        resourceLabel: "Work",
        "moon:resourceLabelAr": "العمل",
        propertyTemplates: [
          P("title", "Work title", "عنوان العمل", true, true, "resource", { valueTemplateRefs: ["moon:Monograph:Title"] }),
          P("content", "Content type", "نوع المحتوى", true, true, "lookup", {
            useValuesFrom: [vocab("contentTypes")], defaults: [{ defaultURI: vocab("contentTypes/txt"), defaultLiteral: "text" }],
          }),
          P("language", "Language", "اللغة", false, true, "lookup", { useValuesFrom: [vocab("languages")] }),
          P("contribution", "Contribution", "المساهمة", false, true, "resource"),
          P("subject", "Subject", "الموضوع", false, true, "lookup", { useValuesFrom: ["http://id.loc.gov/authorities/subjects"] }),
          P("genreForm", "Genre / form", "النوع / الشكل", false, true, "lookup", { useValuesFrom: ["http://id.loc.gov/authorities/genreForms"] }),
          P("classification", "Classification", "التصنيف", false, true, "resource"),
        ],
      },
      {
        id: "moon:Monograph:Instance",
        resourceURI: BF + "Instance",
        resourceLabel: "Instance",
        "moon:resourceLabelAr": "التجسيد",
        propertyTemplates: [
          P("title", "Instance title", "عنوان التجسيد", true, true, "resource", { valueTemplateRefs: ["moon:Monograph:Title"] }),
          P("media", "Media type", "نوع الوسيط", true, true, "lookup", {
            useValuesFrom: [vocab("mediaTypes")], defaults: [{ defaultURI: vocab("mediaTypes/n"), defaultLiteral: "unmediated" }],
          }),
          P("carrier", "Carrier type", "نوع الحامل", true, true, "lookup", {
            useValuesFrom: [vocab("carriers")], defaults: [{ defaultURI: vocab("carriers/nc"), defaultLiteral: "volume" }],
          }),
          P("issuance", "Mode of issuance", "طريقة الإصدار", true, false, "lookup", {
            useValuesFrom: [vocab("issuance")], defaults: [{ defaultURI: vocab("issuance/mono"), defaultLiteral: "single unit" }],
          }),
          P("instanceOf", "Link from the Instance to its Work", "ربط التجسيد بعمله", true, false, "resource",
            { valueTemplateRefs: ["moon:Monograph:Work"] }, { "moon:inverseOf": BF + "hasInstance" }),
          P("provisionActivity", "Publication", "بيانات النشر", false, true, "resource"),
          P("identifiedBy", "Identifier", "المعرّف", false, true, "resource"),
          P("extent", "Extent", "الوصف المادي", false, true, "resource"),
        ],
      },
      {
        id: "moon:Monograph:Title",
        resourceURI: BF + "Title",
        resourceLabel: "Title",
        "moon:resourceLabelAr": "العنوان",
        propertyTemplates: [
          P("mainTitle", "Main title", "العنوان الرئيسي", true, true, "literal"),
          P("subtitle", "Subtitle", "العنوان الفرعي", false, true, "literal"),
        ],
      },
    ],
  },
};

const TEXT: [string, string] = ["contentTypes/txt", "text"];
const UNMEDIATED: [string, string] = ["mediaTypes/n", "unmediated"];
const VOLUME: [string, string] = ["carriers/nc", "volume"];
const SINGLE_UNIT: [string, string] = ["issuance/mono", "single unit"];

export const MANUSCRIPT_PROFILE = coreProfile("Manuscript", "Manuscript",
  "Handwritten works and their copies.", { content: TEXT, media: UNMEDIATED, carrier: VOLUME, issuance: SINGLE_UNIT });
export const SERIAL_PROFILE = coreProfile("Serial", "Serial",
  "Journals and other publications issued in successive parts.", { content: TEXT, media: UNMEDIATED, carrier: VOLUME, issuance: ["issuance/serl", "serial"] });
export const MUSIC_PROFILE = coreProfile("Music", "Notated music",
  "Printed scores and other notated music.", { content: ["contentTypes/ntm", "notated music"], media: UNMEDIATED, carrier: VOLUME, issuance: SINGLE_UNIT });
export const MAP_PROFILE = coreProfile("Map", "Cartographic material",
  "Printed maps and atlases.", { content: ["contentTypes/cri", "cartographic image"], media: UNMEDIATED, carrier: ["carriers/nb", "sheet"], issuance: SINGLE_UNIT });
export const STILL_IMAGE_PROFILE = coreProfile("StillImage", "Still image",
  "Pictures, photographs, posters and postage stamps.", { content: ["contentTypes/sti", "still image"], media: UNMEDIATED, carrier: ["carriers/nb", "sheet"], issuance: SINGLE_UNIT });

/** Profiles by their address (/profiles/<key>); the editor's template ids are listed too. */
export const PROFILES: Record<string, Profile> = {
  monograph: MONOGRAPH_PROFILE,
  manuscript: MANUSCRIPT_PROFILE,
  serial: SERIAL_PROFILE,
  music: MUSIC_PROFILE,
  map: MAP_PROFILE,
  "still-image": STILL_IMAGE_PROFILE,
  "monograph-complete": MONOGRAPH_PROFILE,
};

/** The values a profile pre-fills, per entity: { "bf:content": { "@id", "rdfs:label" }, ... }. */
export function profileDefaults(profile: Profile): { work: Record<string, { "@id": string; "rdfs:label": string }>; instance: Record<string, { "@id": string; "rdfs:label": string }> } {
  const out = { work: {} as Record<string, any>, instance: {} as Record<string, any> };
  for (const t of profile.Profile.resourceTemplates) {
    const entity = t.resourceURI === BF + "Work" ? out.work : t.resourceURI === BF + "Instance" ? out.instance : null;
    if (!entity) continue;
    for (const p of t.propertyTemplates) {
      const d = p.valueConstraint.defaults?.[0];
      if (d?.defaultURI) entity[`bf:${p.propertyURI.slice(BF.length)}`] = { "@id": d.defaultURI, "rdfs:label": d.defaultLiteral || "" };
    }
  }
  return out;
}

/** bf: properties (prefixed, e.g. "bf:title") a profile requires on a Work or an Instance. */
export function profileRequired(profile: Profile, entity: "Work" | "Instance"): Set<string> {
  const t = profile.Profile.resourceTemplates.find((r) => r.resourceURI === BF + entity);
  return new Set((t?.propertyTemplates || []).filter((p) => p.mandatory === "true").map((p) => `bf:${p.propertyURI.slice(BF.length)}`));
}
