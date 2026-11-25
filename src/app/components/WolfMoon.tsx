/**
 * BLUE MOON — Premium Ontology-Driven BIBFRAME Linked Data Editor
 *
 * A production-grade, RDF-native cataloging platform that generates fully valid
 * JSON-LD compliant with the official BIBFRAME vocabulary from the Library of Congress.
 *
 * Core capabilities:
 * - Real BIBFRAME RDF with @graph, real URIs, blank nodes, canonical serialization
 * - Full WEMI modeling: Work → Expression → Instance → Item
 * - Ontology-driven field engine (subject–predicate–object triple store)
 * - Live authority control: LOC, VIAF, Wikidata, ISBNdb
 * - W3C-compliant JSON-LD, Turtle, N-Triples export
 * - MARC 21 mapped export
 * - SHACL graph validation, institutional validation (LOC/PCC)
 * - OPAC preview, Mind Map, Authority Graph visualizations
 *
 * Designed and developed by Isaac Faleh
 */

"use client";
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Save, Upload, 
  BookOpen, Package, Layers, Database, FileText, Code, Braces,
  Sparkles, Network, CheckCircle2, AlertCircle, AlertTriangle,
  Eye, Globe, User,
  Archive, Shield, Hash, Activity,
  Copy, ExternalLink, Settings, RefreshCw, Plus, X, Home,
  Orbit, 
  Sliders, LayoutGrid, List, Lock, Box,
  Trash2, History, Send, ChevronDown, Check
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "./ui/dropdown-menu";

/** The material types' names in Arabic (the templates carry English names). */
const TEMPLATE_NAMES_AR: Record<string, string> = {
  'monograph-complete': 'كتاب', serial: 'دورية', manuscript: 'مخطوط', music: 'موسيقى', map: 'مواد خرائطية', 'still-image': 'صورة / طابع',
};
import { motion, AnimatePresence } from "motion/react";
import moonLogoWhite from "../../assets/white.png";

// ===== OFFICIAL BIBFRAME 3.0.1 ONTOLOGY (from bibframe.rdf) =====

// ===== CORE SERVICES =====
import { GraphStore } from "../../services/graphStore";
import { toTurtle, toRdfXml, extractTriples, validateGraphConnectivity } from "../../services/rdfGraphBuilder";
import {
  RelationshipGraph, Relationship, generateRelationshipId,
  RELATIONSHIP_DEFINITIONS, getRelationshipTypesForDomain
} from "../../services/relationshipManager";
import { validateBibframeRecord, ValidationResult as BFValidationResult } from "../../services/bibframeValidator";
import { validateInstitutionalBibframe, getValidationBadge, InstitutionalValidationResult } from "../../services/institutionalValidator";
import {
  
  getCategoriesForDomain, getPropertiesByCategory, getPropertiesByDomain
} from "../../services/ontologyRegistry";
import {
  MONOGRAPH_COMPLETE_TEMPLATE, 
  
  getAllTemplates, getTemplate} from "../../services/templateEngine";
import {
  generateRecordId, mintUriSet, 
  
  UriSet, BASE_URI
} from "../../services/uriMintingService";
import { OutputTabs } from "./wolfmoon/OutputTabs";
import { BF_ONTOLOGY_VERSION } from "../../services/bibframeTerms.generated";
import {
  ISBNData
  
  } from "../../services/authoritySearch";

// ===== APP SERVICES =====
import { getPropertiesForDomain } from "../../services/standardFields";
import { buildBibframeGraph } from "../services/graphBuilder";
import {
  buildW3CJsonLd, validateW3CJsonLd, jsonLdToTurtle, jsonLdToNTriples,
  JsonLdValidationResult
} from "../../services/w3cJsonLdBuilder";

// ===== APP UTILS =====
import { saveRecord, getAllRecordsLocal, getRecordById, RecordConflictError, toServerDocument, checkDuplicates } from "../utils/recordStorageBackend";
import { deriveRecord } from "../../services/deriveRecord";
import { reportEditing, reportStoppedEditing, type ActiveEditor } from "../utils/recordEditing";
import { EditingWarning } from "./EditingWarning";
import { LivePresence } from "./LivePresence";
import { LiveCursors } from "./LiveCursors";
import { FolioSendDialog } from "./FolioSendDialog";
import { saveChecks, checksText } from "../../services/saveChecks";
import { LiveFieldPresence } from "./LiveFieldPresence";
import { connectLiveRoom, type LiveRoomHandle } from "../utils/liveRoom";
import { otherPeople, type LivePeer } from "../utils/livePeers";
import { RecordCoverPanel } from "./RecordCoverPanel";
import { CopiesPanel } from "./CopiesPanel";
import { RomanizePanel } from "./RomanizePanel";
import { MajmuPanel } from "./MajmuPanel";
import { SubjectFinderPanel } from "./SubjectFinderPanel";
import { MaqamPanel, isMusic } from "./MaqamPanel";
import { SIMPLE_FIELDS, readSimpleMode, writeSimpleMode, isPractice, keepPractice } from "../utils/editorModes";
import { LICENCES } from "../../../supabase/functions/server/licence.tsx";
import { ItemCopy, nodeToCopy, copyToNode } from "../../services/itemCopies";
import { findIsbn, uploadCover } from "../utils/recordCovers";
import { RecordCommentsContext, useRecordComments } from "./FieldComments";
import type { SaveConflict } from "./SaveConflictDialog";

// ===== COMPONENTS =====
import { OntologyField } from "./ontology/OntologyField";
import { OntologyDrivenFormRenderer, PrefilledDefaultsContext } from "./cataloging/OntologyDrivenFormRenderer";
import { IsbnAutofillBar } from "./cataloging/IsbnAutofillBar";
import { ValidationPanel, validateGraph, ValidationResult } from "./cataloging/ValidationPanel";
import { AuthoritySearchDialog } from "./AuthoritySearchDialog";
import { MarcView } from "./RecordView/MarcView";

// Panels shown only on their own tab or dialog load when first opened, so the editor itself opens fast.
const WolfMoonStandaloneOpac = React.lazy(() => import("./WolfMoonStandaloneOpac"));
// MARC 21 cataloguing layout (loads only when chosen).
const MarcEditor = React.lazy(() => import("./wolfmoon/MarcEditor").then(m => ({ default: m.MarcEditor })));
const MindMapPreview = React.lazy(() => import("./ontology/MindMapPreview").then(m => ({ default: m.MindMapPreview })));
const SolarSystemMindMap = React.lazy(() => import("./SolarSystemMindMap").then(m => ({ default: m.SolarSystemMindMap })));
const ImportRecordDialog = React.lazy(() => import("./ontology/ImportRecordDialog").then(m => ({ default: m.ImportRecordDialog })));
const AuthorFinder = React.lazy(() => import("./AuthorFinder"));
const RecordViewerDialog = React.lazy(() => import("./cataloging/RecordViewerDialog").then(m => ({ default: m.RecordViewerDialog })));
const AuthorityGraph = React.lazy(() => import("./AuthorityGraph").then(m => ({ default: m.AuthorityGraph })));
const LinkedDataDiscovery = React.lazy(() => import("./LinkedDataDiscovery"));
const Marc21Viewer = React.lazy(() => import("./Marc21Viewer").then(m => ({ default: m.Marc21Viewer })));
const RecordHistoryPanel = React.lazy(() => import("./RecordHistoryPanel"));
const SaveConflictDialog = React.lazy(() => import("./SaveConflictDialog"));
const BlueMoonAIPanel = React.lazy(() => import("./BlueMoonAIPanel").then(m => ({ default: m.BlueMoonAIPanel })));
const MarvaToolsModal = React.lazy(() => import("./marva/MarvaToolsModal").then(m => ({ default: m.MarvaToolsModal })));
const MarvaHubEditor = React.lazy(() => import("./marva/MarvaHubEditor").then(m => ({ default: m.MarvaHubEditor })));
const MarvaRemergeMarc = React.lazy(() => import("./marva/MarvaRemergeMarc").then(m => ({ default: m.MarvaRemergeMarc })));

function LazyPanelFallback() {
  return (
    <div className="flex items-center justify-center py-16" role="status" aria-label="Loading">
      <div className="w-8 h-8 border-4 border-sky-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ===== CONTEXTS =====
import { useAuth } from "../contexts/AuthContext";
import { PROFILES, profileDefaults } from "../../../supabase/functions/server/profiles.tsx";
import { BIBFRAMERecord } from "../types/bibframe";

// ===== ASSETS & CONFIG =====
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { moonHeaders } from "../utils/moonApi";
import "../../styles/glassmorphism.css";

// ===== MARVA & BIBFRAME PRIMER EXTENSIONS =====
import {
  MarvaPreferencesModal, DEFAULT_MARVA_PREFERENCES, MarvaPreferences
} from "./marva/MarvaPreferencesModal";
import {
  BibframeHub
} from "../../services/hubService";
import {
  MARVA_DIACRITICS, MarvaHistoryLog, MarvaHistoryEntry} from "../../services/marvaService";
import { GlassTheme, BM_DARK, BM_LEGACY, BM_CLASSIC, TEMPLATE_ICONS, BMThemeContext } from './wolfmoon/theme';
import { DRAFT_KEY, WolfMoonDraft, readDraft, clearDraft } from './wolfmoon/drafts';
import { isBlankValue, getPropertyValue, shortenUri } from './wolfmoon/values';
import { LCCutterPanel } from './wolfmoon/LCCutterPanel';
import { ScriptShifterPanel } from './wolfmoon/ScriptShifterPanel';
import { type SaveStatus, BMCard, BMEntitySection, BMFieldWrapper, BMSaveStatus, BMSmallBtn, BMSaveTemplateDialog } from './wolfmoon/parts';


// ============================== TYPES ==============================

type OutputTab = "editor" | "marc-editor" | "history" | "jsonld" | "w3c-jsonld" | "rdf-xml" | "turtle" | "ntriples" | "marc" | "marc21-viewer" | "triples" | "opac" | "mindmap" | "validation" | "relationships" | "authority-graph" | "discovery" | "scriptshifter" | "lc-cutter" | "ai-engine" | "hubs" | "remerge-marc" | "marva-tools";
type MarvaLoadType = "work-instance" | "work-only" | "instance-only" | "hub-only" | "item-only";

// ============================== FIELD TEMPLATE TYPE ==============================

interface FieldTemplate {
  id: string;
  name: string;
  baseTemplate: string;
  hiddenFields: string[];
  allFields: string[];
  createdAt: string;
}

const FIELD_TEMPLATES_KEY = "bm-field-templates";

interface WolfMoonProps {
  onBack?: () => void;
  initialWork?: any;
  initialInstance?: any;
  // The full saved record being edited: its Item, Expression, AdminMetadata and storage id.
  initialRecord?: BIBFRAMERecord | null;
  /** Called after a save with the record's storage id. */
  onRecordSaved?: (storageId: string) => void;
  // Reopens the editor on an unsaved draft (the parent remounts with it as the initial record).
  onRestoreDraft?: (draft: BIBFRAMERecord) => void;
  // Reopens the editor on the saved record as the server now has it (after a revert).
  onReloadRecord?: (record: BIBFRAMERecord) => void;
  /** Opens a new record derived from this one (a new edition or a translation of the same Work). */
  onDerive?: (derived: { work: any; instance: any }) => void;
  /** A new record chosen in Technical services > New record: its template, and the choice kept in metadata. */
  initialTemplate?: string;
  materialChoice?: { materialType: string; carrierKind: string; rare: boolean } | null;
}



// The values each template's profile pre-fills (as Marva does) for the fields LC requires; the profiles
// (supabase/functions/server/profiles.tsx) are also what the server's publish gate checks.
type LcDefault = { "@id": string; "rdfs:label": string };
const LC_TEMPLATE_DEFAULTS = Object.fromEntries(
  ["monograph-complete", "manuscript", "serial", "music", "map", "still-image"].map((id) => [id, profileDefaults(PROFILES[id])]),
);

























// ============================== MAIN COMPONENT ==============================

export default function WolfMoon({
  onBack, initialWork, initialInstance, initialRecord, onRecordSaved, onRestoreDraft, onReloadRecord, onDerive, initialTemplate, materialChoice
}: WolfMoonProps) {
  const { t, i18n } = useTranslation();
  const { username, user } = useAuth();
  const isSuperAdmin = username?.toLowerCase() === 'isaac' || user?.role === 'admin';
  const [language, setLanguage] = useState<"en" | "ar">(i18n.language as "en" | "ar");

  // ===== GLASS THEME =====
  // ===== 3D BACKGROUND TOGGLE =====
  type StudioBgColor = "black" | "gray";
  const [show3dBackground, setShow3dBackground] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("moon_wolf_3d_bg");
      return stored !== null ? stored === "true" : true;
    } catch {
      return true;
    }
  });

  const [studioBgColor, setStudioBgColor] = useState<StudioBgColor>(() => {
    try {
      const stored = localStorage.getItem("moon_wolf_bg_color") as StudioBgColor;
      if (stored === "black" || stored === "gray") return stored;
      return "black";
    } catch {
      return "black";
    }
  });

  const toggle3dBackground = () => {
    setShow3dBackground(prev => {
      const next = !prev;
      try {
        localStorage.setItem("moon_wolf_3d_bg", String(next));
      } catch {}
      return next;
    });
  };

  const [glassTheme, setGlassTheme] = useState<GlassTheme>("dark");
  const BM = glassTheme === "legacy" ? BM_LEGACY : glassTheme === "classic" ? BM_CLASSIC : BM_DARK;
  const gradientClass = glassTheme === "legacy" ? "animated-gradient-bg" : glassTheme === "classic" ? "" : "animated-gradient-bg-blue";
  const isLegacy = glassTheme === "legacy";
  const isClassic = glassTheme === "classic";
  const isLight = isLegacy || isClassic; // any light theme
  const hasGlass = isLegacy; // only legacy uses frosted glass blur
  const glassElBg = isClassic ? "#f9fafb" : isLegacy ? "rgba(255,255,255,0.6)" : "rgba(30,41,59,0.5)";
  const glassElBorder = isClassic ? "1px solid #e5e7eb" : isLegacy ? "1px solid rgba(255,255,255,0.5)" : "1px solid rgba(59,130,246,0.08)";
  const glassElBgActive = isClassic ? "#eff6ff" : isLegacy ? "rgba(255,255,255,0.75)" : "rgba(59,130,246,0.15)";

  // ===== MIND MAP VIEW MODE =====
  const [mindmapView, setMindmapView] = useState<"classic" | "solar">("solar");

  // ===== TEMPLATE SELECTION =====
  const [selectedTemplate, setSelectedTemplate] = useState<string>(() => (initialTemplate && getTemplate(initialTemplate) ? initialTemplate : (initialRecord?.metadata as any)?.templateId && getTemplate((initialRecord?.metadata as any).templateId) ? (initialRecord?.metadata as any).templateId : "monograph-complete"));
  const template = useMemo(() => getTemplate(selectedTemplate) || MONOGRAPH_COMPLETE_TEMPLATE, [selectedTemplate]);

  // ===== ACTIVE TAB =====
  const [activeTab, setActiveTab] = useState<OutputTab>(() => {
    try {
      if (localStorage.getItem("moon-open-tab") === "marc-editor") { localStorage.removeItem("moon-open-tab"); return "marc-editor"; }
    } catch { /* private window */ }
    return "editor";
  });
  const [coverUrl, setCoverUrl] = useState<string | undefined>((initialRecord?.metadata as any)?.coverUrl);
  // A cover picked on a new record before its first save; uploaded by handleSave once it has an id.
  const [pendingCover, setPendingCover] = useState<File | null>(null);
  const pendingCoverRef = useRef<File | null>(null);
  pendingCoverRef.current = pendingCover;
  // The record's copies (holdings), saved as bf:Item nodes of the Instance.
  const [copies, setCopies] = useState<ItemCopy[]>(() => (initialRecord?.copies || []).map(nodeToCopy));

  // ===== URI MINTING =====
  // A record that already has a Moon URI keeps its id, and every entity URI derives from it. Any other
  // id (the app's old http://example.org/... placeholders, or another library's URI on an imported
  // record) is never taken over as this record's own URI.
  const [recordId] = useState(() => {
    const existing = typeof initialWork?.['@id'] === 'string' && initialWork['@id'].startsWith(`${BASE_URI}/work/`)
      ? initialWork['@id'].slice(`${BASE_URI}/work/`.length)
      : '';
    return /^[A-Za-z0-9_-]+$/.test(existing) ? existing : generateRecordId();
  });
  const [uriSet] = useState<UriSet>(() => mintUriSet(recordId));
  // Storage id of the saved record; set after the first save so later saves update that record.
  const storageIdRef = useRef<string | undefined>(initialRecord?.metadata?.storageId);
  // The same id as state, so effects (who is editing) start once a new record is first saved.
  const [storageId, setStorageId] = useState<string | undefined>(initialRecord?.metadata?.storageId);
  // The server version this editor started from. A save sends it, so a newer save by someone else is
  // never overwritten silently; the server answers with a conflict instead.
  const baseVersionRef = useRef<number | undefined>((initialRecord?.metadata as any)?.serverVersion);
  const [saveConflict, setSaveConflict] = useState<(SaveConflict & { myDocument: any }) | null>(null);
  // Possible duplicates the cataloger already chose to save anyway, so later saves don't ask again.
  const acceptedDuplicatesRef = useRef<Set<string>>(new Set());
  const [otherEditors, setOtherEditors] = useState<ActiveEditor[]>([]);
  // Catalogers in this record's live room right now (empty while live editing is off).
  const [livePeople, setLivePeople] = useState<LivePeer[]>([]);
  const [livePeers, setLivePeers] = useState<Record<string, LivePeer>>({});
  const [liveRoom, setLiveRoom] = useState<LiveRoomHandle | null>(null);
  // Whether to draw the others' cursors (remembered in this browser only).
  const [showLiveCursors, setShowLiveCursors] = useState<boolean>(() => {
    try { return localStorage.getItem("moon_live_cursors_hidden") !== "1"; } catch { return true; }
  });
  const toggleLiveCursors = () => setShowLiveCursors((on) => {
    try { localStorage.setItem("moon_live_cursors_hidden", on ? "1" : "0"); } catch { /* private window */ }
    return !on;
  });
  // Comments on this record's fields (review v2); none until the record has been saved.
  const recordComments = useRecordComments(storageId);

  // ===== GRAPH STORE =====
  const [graphStore] = useState(new GraphStore());
  const [enableExpression, setEnableExpression] = useState(false);
  const [relationshipGraph] = useState(new RelationshipGraph());
  const [relationships, setRelationships] = useState<Relationship[]>([]);

  // ===== SERIALIZATION STATE =====
  const [graphJsonld, setGraphJsonld] = useState<any>(null);
  const [graphTurtle, setGraphTurtle] = useState("");
  const [graphRdfXml, setGraphRdfXml] = useState("");
  const [graphTriples, setGraphTriples] = useState<any[]>([]);
  const [graphValidation, setGraphValidation] = useState<ValidationResult | null>(null);
  const [bfValidation, setBfValidation] = useState<BFValidationResult | null>(null);
  const [institutionalValidation, setInstitutionalValidation] = useState<InstitutionalValidationResult | null>(null);

  // ===== W3C-COMPLIANT OUTPUT =====
  const [w3cJsonLd, setW3cJsonLd] = useState<any>(null);
  const [w3cTurtle, setW3cTurtle] = useState("");
  const [w3cNTriples, setW3cNTriples] = useState("");
  const [w3cValidation, setW3cValidation] = useState<JsonLdValidationResult | null>(null);

  // ===== ONTOLOGY-DRIVEN STATE =====
  // Category Cards is the main way to catalog; the last layout the cataloger picked is remembered.
  const [fieldViewMode, setFieldViewMode] = useState<'both' | 'categories' | 'standard' | 'marc'>(() => {
    try {
      const saved = localStorage.getItem("moon-field-view-mode");
      return saved === "standard" || saved === "both" ? saved : "categories";
    } catch {
      return "categories";
    }
  });
  useEffect(() => {
    try { localStorage.setItem("moon-field-view-mode", fieldViewMode); } catch {}
  }, [fieldViewMode]);
  const [workData, setWorkData] = useState<any>(
    initialWork || { "@type": "bf:Work", "@id": uriSet.work, "bf:contribution": [] }
  );
  const [instanceData, setInstanceData] = useState<any>(
    initialInstance || { "@type": "bf:Instance", "@id": uriSet.instance }
  );

  // ===== SAVE STATE =====
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(initialWork ? "saved" : "unsaved");
  const [recordTitle, setRecordTitle] = useState(() => {
    if (initialWork) {
      const t = initialWork["bf:title"];
      if (t) {
        if (typeof t === "string") return t;
        if (t["bf:mainTitle"]) return typeof t["bf:mainTitle"] === "string" ? t["bf:mainTitle"] : (t["bf:mainTitle"]["@value"] || t["bf:mainTitle"]);
        if (t["mainTitle"]) return t["mainTitle"];
        if (t["rdfs:label"]) return t["rdfs:label"];
      }
    }
    return "Untitled Record";
  });
  const [showRecordViewer, setShowRecordViewer] = useState(false);

  // ===== AUTOSAVE DRAFT =====
  // Unsaved edits are kept in this browser every few seconds, so a refresh or crash doesn't lose them.
  // Item and Expression edits only touch the graph store, so this polls rather than watching state.
  const saveStatusRef = useRef(saveStatus);
  saveStatusRef.current = saveStatus;
  useEffect(() => {
    if (saveStatus !== "unsaved") return;
    let last = "";
    const writeDraft = () => {
      // A save clears the draft; never write it back afterwards. Practice keeps no draft: restored later, it
      // would become a real new record.
      if (saveStatusRef.current !== "unsaved" || isPractice(initialRecord as any)) return;
      try {
        const draft: WolfMoonDraft = {
          record: {
            "@context": "http://id.loc.gov/ontologies/bibframe/",
            work: workData,
            instance: instanceData,
            item: graphStore.getNode(uriSet.item) || undefined,
            copies: copies.map((c) => copyToNode(c, uriSet.instance)),
            expression: enableExpression ? graphStore.getNode(uriSet.expression) || undefined : undefined,
            adminMetadata: graphStore.getNode(uriSet.admin) || undefined,
            metadata: { storageId: storageIdRef.current, recordId, uriSet, createdAt: initialRecord?.metadata?.createdAt },
          },
          title: recordTitle,
          savedAt: new Date().toISOString(),
        };
        const json = JSON.stringify(draft.record);
        if (json === last) return;
        last = json;
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {}
    };
    writeDraft();
    const timer = window.setInterval(writeDraft, 3000);
    return () => { window.clearInterval(timer); writeDraft(); };
  }, [saveStatus, workData, instanceData, recordTitle, enableExpression, copies]);

  // On open, offer the unsaved draft: any draft for a new record, or this record's own draft.
  useEffect(() => {
    if (!onRestoreDraft || (initialRecord?.metadata as any)?.restoredFromDraft) return;
    const draft = readDraft();
    if (!draft) return;
    const draftMeta: any = draft.record.metadata || {};
    const sameRecord = draftMeta.storageId
      ? draftMeta.storageId === storageIdRef.current
      : draftMeta.recordId === recordId;
    if ((initialWork || initialRecord) && !sameRecord) return;
    const when = new Date(draft.savedAt).toLocaleString();
    toast(language === "ar" ? `توجد مسودة غير محفوظة: «${draft.title}»` : `Unsaved draft found: "${draft.title}"`, {
      description: language === "ar" ? `آخر تعديل ${when}` : `Last edited ${when}`,
      id: "moon-wolf-draft",
      duration: 20000,
      action: {
        label: language === "ar" ? "استعادة" : "Restore",
        onClick: () => onRestoreDraft({ ...draft.record, metadata: { ...draftMeta, restoredFromDraft: true } }),
      },
      cancel: {
        label: language === "ar" ? "تجاهل" : "Discard",
        onClick: () => clearDraft(),
      },
    });
  }, []);

  // ===== DIALOGS =====
  const [showAuthoritySearch, setShowAuthoritySearch] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showDeriveMenu, setShowDeriveMenu] = useState(false);
  const [showFolio, setShowFolio] = useState(false);
  // Learning (S22): practice on a copy (saves stay in this browser), and simple mode (few fields).
  const practice = isPractice(initialRecord as any);
  // The description's licence (S23): CC0 unless the record came from somewhere with other terms.
  const [licence, setLicence] = useState<string>(() => String((initialRecord?.metadata as any)?.license || "cc0"));
  const [simpleMode, setSimpleMode] = useState(readSimpleMode);
  const toggleSimple = () => setSimpleMode((on) => { writeSimpleMode(!on); return !on; });
  // The "should fix" list the cataloger already chose to save with, so the same list is not asked again.
  const acceptedChecksRef = useRef("");
  const [showIraqiAuthorityModal, setShowIraqiAuthorityModal] = useState(false);

  const handleInsertIraqiAuthor = (author: any, targetType: 'author' | 'contributor' | 'subject' = 'author') => {
    const authorName = author.name || author.primaryName || author.preferredName || "Unknown Author";
    const authorUri: string | undefined = author.moonUri || undefined;

    if (targetType === 'subject') {
      const newSubject = {
        '@type': 'bf:Person',
        '@id': authorUri,
        'rdfs:label': authorName,
        'bflc:name00MatchKey': authorName,
        ...(author.wikidataId ? {
          'bf:identifiedBy': [{
            '@type': 'bf:Identifier',
            'rdf:value': author.wikidataId,
            'bf:source': { '@id': 'http://www.wikidata.org/entity/' }
          }]
        } : {})
      };
      const existingSubjects = Array.isArray(workData["bf:subject"]) ? [...workData["bf:subject"]] : [];
      const isDuplicate = existingSubjects.some(s => s["rdfs:label"] === authorName);
      if (!isDuplicate) {
        existingSubjects.push(newSubject);
        setWorkData((prev: any) => ({
          ...prev,
          "bf:subject": existingSubjects
        }));
        toast.success(`تم إدراج الشخصية الاستنادية "${authorName}" كموضوع (Subject) بنجاح`);
      } else {
        toast.info(`الموضوع "${authorName}" موجود بالفعل في التسجيلة`);
      }
    } else {
      const isAuthor = targetType === 'author';
      const newContrib = {
        '@type': 'bf:Contribution',
        'bf:agent': {
          '@type': 'bf:Person',
          '@id': authorUri,
          'rdfs:label': authorName,
          'bflc:name00MatchKey': authorName,
          ...(author.wikidataId ? {
            'bf:identifiedBy': [{
              '@type': 'bf:Identifier',
              'rdf:value': author.wikidataId,
              'bf:source': { '@id': 'http://www.wikidata.org/entity/' }
            }]
          } : {})
        },
        'bf:role': {
          '@type': 'bf:Role',
          '@id': isAuthor ? 'http://id.loc.gov/vocabulary/relators/aut' : 'http://id.loc.gov/vocabulary/relators/ctb',
          'rdfs:label': isAuthor ? 'Author / مؤلف' : 'Contributor / مساهم'
        }
      };

      const existingContributions = Array.isArray(workData["bf:contribution"]) ? [...workData["bf:contribution"]] : [];
      const isDuplicate = existingContributions.some(c => c["bf:agent"]?.["rdfs:label"] === authorName);
      if (!isDuplicate) {
        existingContributions.push(newContrib);
        setWorkData((prev: any) => ({
          ...prev,
          "bf:contribution": existingContributions
        }));
        toast.success(`تم إدراج "${authorName}" بنجاح كـ ${isAuthor ? 'مؤلف (Author)' : 'مساهم (Contributor)'}`);
      } else {
        toast.info(`"${authorName}" موجود بالفعل في مساهمات التسجيلة`);
      }
    }
    setShowIraqiAuthorityModal(false);
  };

  const [showExampleMenu, setShowExampleMenu] = useState(false);

  // ===== EXPANDED SECTIONS =====
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set(["Work", "Instance"]));

  // ===== HIDDEN FIELDS (for delete/restore tracking) =====
  const [hiddenFields, setHiddenFields] = useState<Set<string>>(new Set());
  const [showFieldManager, setShowFieldManager] = useState(false);

  // ===== MARVA CATALOGING STATE =====
  const [loadType, setLoadType] = useState<MarvaLoadType>("work-instance");
  const [marvaPreferences, setMarvaPreferences] = useState<MarvaPreferences>(() => {
    try {
      const saved = localStorage.getItem("marva-user-preferences");
      return saved ? { ...DEFAULT_MARVA_PREFERENCES, ...JSON.parse(saved) } : DEFAULT_MARVA_PREFERENCES;
    } catch {
      return DEFAULT_MARVA_PREFERENCES;
    }
  });
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [activeHub, setActiveHub] = useState<BibframeHub | null>(null);
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());
  const historyLogManager = useRef(new MarvaHistoryLog());
  const [historyEntries, setHistoryEntries] = useState<MarvaHistoryEntry[]>([]);

  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [showLoadTemplateDialog, setShowLoadTemplateDialog] = useState(false);
  const [savedFieldTemplates, setSavedFieldTemplates] = useState<FieldTemplate[]>(() => {
    try { return JSON.parse(localStorage.getItem(FIELD_TEMPLATES_KEY) || "[]"); } catch { return []; }
  });

  // Load field templates from backend on mount (backend = source of truth)
  const TEMPLATES_API = `https://${projectId}.supabase.co/functions/v1/make-server-49c0e13c/field-templates`;
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(TEMPLATES_API, {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.templates) && data.templates.length > 0) {
            setSavedFieldTemplates(data.templates);
            knownTemplateIds.current = data.templates.map((t: any) => t.id);
            localStorage.setItem(FIELD_TEMPLATES_KEY, JSON.stringify(data.templates));
          } else if (data.success && data.templates.length === 0) {
            // Backend is empty — seed it with any localStorage templates
            const localTemplates = (() => { try { return JSON.parse(localStorage.getItem(FIELD_TEMPLATES_KEY) || "[]"); } catch { return []; } })();
            if (localTemplates.length > 0) {
              fetch(TEMPLATES_API, {
                method: "PUT",
                headers: moonHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ templates: localTemplates }),
              }).catch(() => {});
            }
          }
        }
      } catch (err) {
        console.log("Failed to load field templates from backend, using localStorage:", err);
      }
    })();
  }, []);

  const hideField = useCallback((fieldKey: string) => {
    setHiddenFields(prev => { const n = new Set(prev); n.add(fieldKey); return n; });
    toast.success(t("deleteField"), { description: fieldKey.replace("ontology:", "").replace("registry:", "").split("/").pop() });
  }, [t]);

  const restoreField = useCallback((fieldKey: string) => {
    setHiddenFields(prev => { const n = new Set(prev); n.delete(fieldKey); return n; });
    toast.success(t("restoreField"), { description: fieldKey.replace("ontology:", "").replace("registry:", "").split("/").pop() });
  }, [t]);

  const restoreAllFields = useCallback(() => {
    setHiddenFields(new Set());
    toast.success(t("restoreAll"));
  }, [t]);

  // The template ids this browser's copy holds, so a save never removes a template someone added meanwhile.
  const knownTemplateIds = useRef<string[]>([]);
  useEffect(() => { if (!knownTemplateIds.current.length) knownTemplateIds.current = savedFieldTemplates.map((t: any) => t.id); }, [savedFieldTemplates]);
  const persistFieldTemplates = useCallback((templates: FieldTemplate[]) => {
    setSavedFieldTemplates(templates);
    localStorage.setItem(FIELD_TEMPLATES_KEY, JSON.stringify(templates));
    // Each template has an owner and a version: the server keeps what this save may change and answers with
    // the list as it now is (and what it refused: another's template, or an older copy).
    fetch(TEMPLATES_API, {
      method: "PUT",
      headers: moonHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ templates, known: knownTemplateIds.current }),
    }).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) { console.log("Backend field template save failed:", res.status); return; }
      setSavedFieldTemplates(data.templates);
      localStorage.setItem(FIELD_TEMPLATES_KEY, JSON.stringify(data.templates));
      knownTemplateIds.current = data.templates.map((t: any) => t.id);
      for (const r of data.refused || []) {
        toast.error(r.reason === "stale"
          ? (language === "ar" ? `لم يُحفظ القالب «${r.name || r.id}»: عُدّل بعد أن فتحته. فُتحت النسخة الأحدث.` : `Template "${r.name || r.id}" was not saved: it was changed after you opened it. The newer version is loaded.`)
          : (language === "ar" ? `القالب «${r.name || r.id}» لصاحبه أو للمسؤول العام فقط؛ لم يُغيَّر.` : `Template "${r.name || r.id}" belongs to its owner or the Super Admin; it was not changed.`));
      }
    }).catch(err => console.log("Backend field template save error:", err));
  }, [language]);

  // ===== LANGUAGE TOGGLE =====
  const toggleLanguage = useCallback(() => {
    const newLang = language === "en" ? "ar" : "en";
    setLanguage(newLang);
    i18n.changeLanguage(newLang);
  }, [language, i18n]);

  // ===== ONTOLOGY PROPERTIES =====
  const workProperties = getPropertiesForDomain("bf:Work");
  const instanceProperties = getPropertiesForDomain("bf:Instance");

  // Compute the full manifest of all fields (registry + ontology) for template tracking
  const allFieldKeys = useMemo(() => {
    const keys: string[] = [];
    getCategoriesForDomain("Work").forEach(cat => {
      getPropertiesByCategory("Work", cat).forEach(p => keys.push(`registry:${p.shortName}`));
    });
    getCategoriesForDomain("Instance").forEach(cat => {
      getPropertiesByCategory("Instance", cat).forEach(p => keys.push(`registry:${p.shortName}`));
    });
    getCategoriesForDomain("Expression").forEach(cat => {
      getPropertiesByCategory("Expression", cat).forEach(p => keys.push(`registry:${p.shortName}`));
    });
    getCategoriesForDomain("Item").forEach(cat => {
      getPropertiesByCategory("Item", cat).forEach(p => keys.push(`registry:${p.shortName}`));
    });
    workProperties.forEach(p => keys.push(`ontology:${p.uri}`));
    instanceProperties.forEach(p => keys.push(`ontology:${p.uri}`));
    return [...new Set(keys)];
  }, [workProperties, instanceProperties]);

  const handleSaveFieldTemplate = useCallback((name: string) => {
    const tmpl: FieldTemplate = {
      id: `ft-${Date.now()}`,
      name,
      baseTemplate: template.name,
      hiddenFields: Array.from(hiddenFields),
      allFields: allFieldKeys,
      createdAt: new Date().toISOString(),
    };
    const updated = [...savedFieldTemplates, tmpl];
    persistFieldTemplates(updated);
    setShowSaveTemplateDialog(false);
    toast.success(t("templateSaved"), { description: `${name} — ${allFieldKeys.length - hiddenFields.size} ${t("fieldsKept")}, ${hiddenFields.size} ${t("fieldsRemoved")}` });
  }, [hiddenFields, allFieldKeys, template, savedFieldTemplates, persistFieldTemplates, t]);

  const handleLoadFieldTemplate = useCallback((tmpl: FieldTemplate) => {
    setHiddenFields(new Set(tmpl.hiddenFields));
    setShowLoadTemplateDialog(false);
    toast.success(t("templateApplied"), { description: tmpl.name });
  }, [t]);

  const handleDeleteFieldTemplate = useCallback((id: string) => {
    const updated = savedFieldTemplates.filter(t => t.id !== id);
    persistFieldTemplates(updated);
    toast.success(t("templateDeleted"));
  }, [savedFieldTemplates, persistFieldTemplates, t]);

  // ===== RESET ALL FIELDS =====
  const handleResetAll = useCallback(() => {
    // Reset work and instance data to blank defaults
    setWorkData({ "@type": "bf:Work", "@id": uriSet.work, "bf:contribution": [] });
    setInstanceData({ "@type": "bf:Instance", "@id": uriSet.instance });
    // Reset hidden fields
    setHiddenFields(new Set());
    // Reset graph store nodes
    graphStore.setNode(uriSet.work, { "@id": uriSet.work, "@type": "bf:Work" });
    graphStore.setNode(uriSet.instance, { "@id": uriSet.instance, "@type": "bf:Instance" });
    graphStore.setNode(uriSet.item, { "@id": uriSet.item, "@type": "bf:Item" });
    if (enableExpression) {
      graphStore.setNode(uriSet.expression, { "@id": uriSet.expression, "@type": "bf:Expression" });
    }
    // Reset serialization outputs
    setGraphJsonld(null);
    setGraphTurtle("");
    setGraphTriples([]);
    setGraphValidation(null);
    setBfValidation(null);
    setInstitutionalValidation(null);
    setW3cJsonLd(null);
    setW3cTurtle("");
    setW3cNTriples("");
    setW3cValidation(null);
    // Reset title and save status
    setRecordTitle("Untitled Record");
    setSaveStatus("unsaved");
    // Go back to editor tab
    setActiveTab("editor");
    toast.success(t("resetComplete") || "All fields have been reset", {
      description: t("resetDescription") || "Form cleared to blank state",
    });
    // Regenerate RDF after reset
    setTimeout(() => regenerateRef.current(), 100);
  }, [uriSet, graphStore, enableExpression, t]);

  // ===== TEMPLATE-AWARE PROPERTIES =====
  // The section headers count the Category Cards' own groups and required fields (from the profile).
  const templateWorkGroups = useMemo(() => getCategoriesForDomain("Work"), []);
  const templateInstanceGroups = useMemo(() => getCategoriesForDomain("Instance"), []);
  const templateItemGroups = useMemo(() => getCategoriesForDomain("Item"), []);
  const workRequiredProps = useMemo(() => getPropertiesByDomain("Work").filter(p => p.required), []);
  const instanceRequiredProps = useMemo(() => getPropertiesByDomain("Instance").filter(p => p.required), []);

  // ============================== INITIALIZATION ==============================

  useEffect(() => {
    graphStore.setNode(uriSet.work, { "@id": uriSet.work, "@type": "bf:Work" });
    graphStore.setNode(uriSet.instance, { "@id": uriSet.instance, "@type": "bf:Instance" });
    // A saved record brings back its own Item, Expression and AdminMetadata instead of blank ones.
    const savedItem = initialRecord?.item;
    const savedExpression = initialRecord?.expression;
    const savedAdmin = initialRecord?.adminMetadata;
    graphStore.setNode(uriSet.item, { ...(savedItem || {}), "@id": uriSet.item, "@type": "bf:Item" });

    if (template.enableExpression || savedExpression) {
      setEnableExpression(true);
      graphStore.setNode(uriSet.expression, { ...(savedExpression || {}), "@id": uriSet.expression, "@type": savedExpression?.["@type"] || "bf:Expression" });
      graphStore.createWEMILinks(uriSet.work, uriSet.expression, uriSet.instance, uriSet.item);
    } else {
      graphStore.createWEMILinks(uriSet.work, undefined, uriSet.instance, uriSet.item);
    }

    const adminUri = uriSet.admin;
    const today = new Date().toISOString().split("T")[0];
    graphStore.setNode(adminUri, {
      "@id": adminUri, "@type": "bf:AdminMetadata",
      "bf:creationDate": today,
      "bf:source": { "@id": new URL(BASE_URI).origin, "rdfs:label": "Moon Library System — Wolf Moon" },
      "bf:descriptionConventions": { "@id": "http://id.loc.gov/vocabulary/descriptionConventions/rda", "rdfs:label": "RDA" },
      "bf:descriptionLanguage": language === "ar"
        ? { "@id": "http://id.loc.gov/vocabulary/languages/ara", "rdfs:label": "العربية" }
        : { "@id": "http://id.loc.gov/vocabulary/languages/eng", "rdfs:label": "English" },
      "bf:generationProcess": `Wolf Moon v1.0 (${template.name})`,
      "bf:catalogerId": username || "anonymous",
      // Keeps the original creation date and cataloger of a saved record; editing it records a change date.
      ...(savedAdmin ? { ...savedAdmin, "@id": adminUri, "@type": "bf:AdminMetadata", "bf:changeDate": today } : {}),
    });
    regenerateRDF();
  }, []);

  // The description is written in the cataloging interface's language unless the record says otherwise.
  useEffect(() => {
    const admin = graphStore.getNode(uriSet.admin);
    if (!admin) return;
    admin["bf:descriptionLanguage"] = language === "ar"
      ? { "@id": "http://id.loc.gov/vocabulary/languages/ara", "rdfs:label": "العربية" }
      : { "@id": "http://id.loc.gov/vocabulary/languages/eng", "rdfs:label": "English" };
    regenerateRDF();
  }, [language]);

  useEffect(() => {
    if (template.enableExpression && !enableExpression) {
      setEnableExpression(true);
      graphStore.setNode(uriSet.expression, { "@id": uriSet.expression, "@type": "bf:Expression" });
      graphStore.createWEMILinks(uriSet.work, uriSet.expression, uriSet.instance, uriSet.item);
    }
    regenerateRDF();
  }, [selectedTemplate]);

  useEffect(() => {
    if (initialWork) {
      setWorkData({ ...initialWork, "@id": uriSet.work });
      const t = initialWork["bf:title"];
      if (t) {
        if (typeof t === "string") setRecordTitle(t);
        else if (t["bf:mainTitle"]) setRecordTitle(typeof t["bf:mainTitle"] === "string" ? t["bf:mainTitle"] : (t["bf:mainTitle"]["@value"] || t["bf:mainTitle"]));
        else if (t["mainTitle"]) setRecordTitle(t["mainTitle"]);
        else if (t["rdfs:label"]) setRecordTitle(t["rdfs:label"]);
      }
      setSaveStatus("saved");
    }
  }, [initialWork]);

  useEffect(() => {
    if (initialInstance) {
      setInstanceData({ ...initialInstance, "@id": uriSet.instance, "bf:instanceOf": { "@id": uriSet.work } });
    }
  }, [initialInstance]);

  // New records start with LC's profile defaults for the fields LC requires (content, media, carrier,
  // issuance). Opened records are never touched. Changing template swaps a value only while it still
  // holds the previous template's default.
  const [isNewRecord] = useState(() => !initialRecord?.metadata?.storageId && isBlankValue(initialWork?.["bf:title"]));
  const appliedDefaultsRef = useRef<{ work: Record<string, LcDefault>; instance: Record<string, LcDefault> } | null>(null);
  useEffect(() => {
    if (!isNewRecord) return;
    const next = LC_TEMPLATE_DEFAULTS[selectedTemplate];
    if (!next) return;
    const prev = appliedDefaultsRef.current;
    const merge = (data: any, defaults: Record<string, LcDefault>, previous?: Record<string, LcDefault>) => {
      let changed = false;
      const out = { ...data };
      for (const [key, value] of Object.entries(defaults)) {
        const current = data[key];
        const stillPreviousDefault = previous?.[key] && current?.["@id"] === previous[key]["@id"];
        if (isBlankValue(current) || stillPreviousDefault) {
          if (current?.["@id"] !== value["@id"]) { out[key] = value; changed = true; }
        }
      }
      return changed ? out : data;
    };
    setWorkData((d: any) => merge(d, next.work, prev?.work));
    setInstanceData((d: any) => merge(d, next.instance, prev?.instance));
    appliedDefaultsRef.current = next;
  }, [selectedTemplate, isNewRecord]);

  // The pre-filled values nobody has changed yet, so their fields can say "LC default".
  const prefilledDefaults = useMemo(() => {
    const ids = new Set<string>();
    const applied = isNewRecord ? LC_TEMPLATE_DEFAULTS[selectedTemplate] : undefined;
    if (!applied) return ids;
    for (const [key, d] of Object.entries(applied.work)) if (workData[key]?.["@id"] === d["@id"]) ids.add(d["@id"]);
    for (const [key, d] of Object.entries(applied.instance)) if (instanceData[key]?.["@id"] === d["@id"]) ids.add(d["@id"]);
    return ids;
  }, [isNewRecord, selectedTemplate, workData, instanceData]);

  // A restored draft has not been saved yet, even though it arrived as the initial record.
  useEffect(() => {
    if ((initialRecord?.metadata as any)?.restoredFromDraft) setSaveStatus("unsaved");
  }, [initialRecord]);

  useEffect(() => {
    const currentWork = graphStore.getNode(uriSet.work) || {};
    graphStore.setNode(uriSet.work, { ...currentWork, ...workData, "@id": uriSet.work, "@type": "bf:Work" });
    const currentInstance = graphStore.getNode(uriSet.instance) || {};
    graphStore.setNode(uriSet.instance, { ...currentInstance, ...instanceData, "@id": uriSet.instance, "@type": "bf:Instance" });
    const timer = setTimeout(() => regenerateRDF(), 300);
    return () => clearTimeout(timer);
  }, [workData, instanceData]);

  // ============================== GRAPH ENGINE ==============================

  // Memoized callbacks below schedule a rebuild for later; they call the latest regenerateRDF through
  // this ref, or the exports would be rebuilt from the Work/Instance as they were when the callback was made.
  const regenerateRef = useRef<() => void>(() => {});

  const handlePropertyChange = useCallback((nodeUri: string, property: string, value: any) => {
    graphStore.setProperty(nodeUri, property, value);
    const unprefixed = property.replace(/^bf:/, '');
    if (property === 'bf:contribution' || property === 'contribution' || unprefixed === 'contribution') {
      const contribArray = Array.isArray(value) ? value : (value ? [value] : []);
      setWorkData((prev: any) => ({
        ...prev,
        'bf:contribution': contribArray,
        'contribution': contribArray,
      }));
      graphStore.setProperty(nodeUri, 'bf:contribution', contribArray);
      setSaveStatus("unsaved");
      setTimeout(() => regenerateRef.current(), 500);
      return;
    }
    const titleVal = typeof value === 'object' && value ? (value['bf:mainTitle'] || value.mainTitle || value['rdfs:label'] || value) : value;
    if (nodeUri === uriSet.work) {
      setWorkData((prev: any) => ({
        ...prev,
        [property]: value,
        [unprefixed]: unprefixed === 'title' ? (titleVal?.['bf:mainTitle'] || titleVal?.mainTitle || titleVal) : value,
        ...(unprefixed === 'title' ? { mainTitle: titleVal?.['bf:mainTitle'] || titleVal?.mainTitle || titleVal } : {})
      }));
      if (property === 'bf:title' || property === 'title') {
        const tStr = typeof value === 'string' ? value : (value?.['bf:mainTitle'] || value?.mainTitle || value?.['rdfs:label'] || '');
        if (tStr) setRecordTitle(tStr);
      }
    } else if (nodeUri === uriSet.instance) {
      setInstanceData((prev: any) => ({
        ...prev,
        [property]: value,
        [unprefixed]: unprefixed === 'title' ? (titleVal?.['bf:mainTitle'] || titleVal?.mainTitle || titleVal) : value,
        ...(unprefixed === 'title' ? { mainTitle: titleVal?.['bf:mainTitle'] || titleVal?.mainTitle || titleVal } : {})
      }));
    }
    setSaveStatus("unsaved");
    setTimeout(() => regenerateRef.current(), 500);
  }, [uriSet]);

  const toggleExpression = () => {
    const newValue = !enableExpression;
    setEnableExpression(newValue);
    setSaveStatus("unsaved");
    if (newValue) {
      graphStore.setNode(uriSet.expression, { "@id": uriSet.expression, "@type": "bf:Expression" });
    } else {
      const work = graphStore.getNode(uriSet.work);
      if (work) delete work["bf:hasExpression"];
      const inst = graphStore.getNode(uriSet.instance);
      if (inst) inst["bf:instanceOf"] = { "@id": uriSet.work };
    }
    graphStore.createWEMILinks(uriSet.work, newValue ? uriSet.expression : undefined, uriSet.instance, uriSet.item);
    regenerateRDF();
  };

  const regenerateRDF = () => {
    try {
      const graphData = graphStore.toJsonLd();
      relationshipGraph.addToJsonLdGraph(graphData["@graph"] || [], relationships);
      const validationResult = validateGraph(graphStore, enableExpression);
      setGraphValidation(validationResult);
      const bfResult = validateBibframeRecord(graphData);
      setBfValidation(bfResult);
      const instResult = validateInstitutionalBibframe(graphData);
      setInstitutionalValidation(instResult);
      setGraphJsonld(graphData);
      const triples = extractTriples(graphData);
      setGraphTriples(triples);
      try { setGraphTurtle(toTurtle(graphData)); } catch { setGraphTurtle(""); }
      try {
        const itemNode = graphStore.getNode(uriSet.item);
        const exprNode = graphStore.getNode(uriSet.expression);
        const adminNode = graphStore.getNode(uriSet.admin);
        const w3cDoc = buildW3CJsonLd({ workData, instanceData, itemData: itemNode || {}, expressionData: exprNode || {}, adminData: adminNode || {}, uriSet, enableExpression });
        setW3cJsonLd(w3cDoc);
        const w3cVal = validateW3CJsonLd(w3cDoc);
        setW3cValidation(w3cVal);
        try { setW3cTurtle(jsonLdToTurtle(w3cDoc)); } catch { setW3cTurtle(""); }
        try { setW3cNTriples(jsonLdToNTriples(w3cDoc)); } catch { setW3cNTriples(""); }
        try { setGraphRdfXml(toRdfXml(w3cDoc)); } catch { setGraphRdfXml(""); }
      } catch (e) { console.error("W3C JSON-LD build error:", e); }
    } catch (error) { console.error("Graph RDF generation error:", error); }
  };
  regenerateRef.current = regenerateRDF;

  // ============================== ONTOLOGY FORM ==============================

  const updateWorkProperty = useCallback((uri: string, value: any) => {
    const propertyName = uri.split("/").pop() || uri;
    const bfKey = propertyName.startsWith("bf:") ? propertyName : `bf:${propertyName}`;
    const unprefixed = propertyName.replace(/^bf:/, "");
    setWorkData((prev: any) => {
      const prevVal = prev[propertyName] || prev[bfKey] || prev[unprefixed];
      historyLogManager.current.addEntry({
        cataloger: "LC Cataloger",
        entity: "Work",
        field: propertyName,
        previousValue: prevVal,
        newValue: value,
        description: `Updated Work field ${propertyName}`
      });
      setHistoryEntries(historyLogManager.current.getEntries());
      const updated = {
        ...prev,
        [propertyName]: value,
        [bfKey]: value,
        [unprefixed]: value,
      };
      if (propertyName === "title" || bfKey === "bf:title") {
        const tStr = typeof value === 'string' ? value : (value?.['bf:mainTitle'] || value?.mainTitle || value?.['rdfs:label'] || '');
        if (tStr) setRecordTitle(tStr);
      }
      return updated;
    });
    setDirtyFields(prev => new Set(prev).add(`work:${propertyName}`));
    setSaveStatus("unsaved");
  }, []);

  const updateInstanceProperty = useCallback((uri: string, value: any) => {
    const propertyName = uri.split("/").pop() || uri;
    const bfKey = propertyName.startsWith("bf:") ? propertyName : `bf:${propertyName}`;
    const unprefixed = propertyName.replace(/^bf:/, "");
    setDirtyFields(prev => new Set(prev).add(`instance:${propertyName}`));
    if (value && value._isbnLookupData) {
      const data: ISBNData = value._isbnLookupData;
      const cleanValue = { ...value };
      delete cleanValue._isbnLookupData;
      fillFromIsbnData(data, [cleanValue.isbn], { [propertyName]: cleanValue, [bfKey]: cleanValue, [unprefixed]: cleanValue });
      return;
    }
    setInstanceData((prev: any) => ({
      ...prev,
      [propertyName]: value,
      [bfKey]: value,
      [unprefixed]: value,
    }));
    setSaveStatus("unsaved");
  }, [language, uriSet, workData, instanceData]);

  /**
   * Fills the empty Work/Instance fields from an ISBN lookup (Standard fields and Category Cards both use
   * this). Anything the cataloger already entered is kept. `instanceExtra` is merged into the Instance too.
   */
  const fillFromIsbnData = useCallback((data: ISBNData, enteredIsbns: (string | undefined)[], instanceExtra: any = {}) => {
    {
      const ar = language === "ar";
      // Auto-fill only fills what is empty: anything the cataloger already entered is kept.
      const filled: string[] = [];
      const kept: string[] = [];
      const instancePatch: any = {};
      const workPatch: any = {};
      const offer = (label: string, current: any, apply: () => void) => {
        if (isBlankValue(current)) { apply(); filled.push(label); } else kept.push(label);
      };

      if (data.numberOfPages) {
        offer(ar ? "الوصف المادي" : "extent", instanceData["bf:extent"], () => {
          const label = ar ? `${data.numberOfPages} صفحة` : `${data.numberOfPages} pages`;
          instancePatch["bf:extent"] = { value: label, "rdfs:label": label, "@type": "bf:Extent" };
        });
      }
      if (data.publishers?.length || data.place || data.publishDate) {
        offer(ar ? "بيانات النشر" : "publication", instanceData["bf:provisionActivity"], () => {
          instancePatch["bf:provisionActivity"] = {
            "@type": "bf:Publication",
            ...(data.publishers?.length ? { "bf:agent": { "@type": "bf:Agent", "rdfs:label": data.publishers[0] } } : {}),
            ...(data.place ? { "bf:place": { "@type": "bf:Place", "rdfs:label": data.place } } : {}),
            ...(data.publishDate ? { "bf:date": data.publishDate } : {}),
          };
        });
      }
      if (data.title) {
        offer(ar ? "العنوان" : "title", workData["bf:title"], () => {
          workPatch["bf:title"] = {
            "@type": "bf:Title", "bf:mainTitle": data.title, mainTitle: data.title,
            ...(data.subtitle ? { "bf:subtitle": data.subtitle, subtitle: data.subtitle } : {}),
          };
        });
      }
      if (data.authors?.length) {
        offer(ar ? "المؤلفون" : "authors", workData["bf:contribution"], () => {
          const contributions = data.authors!.map(name => ({
            "@type": "bf:Contribution",
            "bf:agent": { "@type": "bf:Person", "rdfs:label": name },
            "bf:role": { "@type": "bf:Role", "@id": "http://id.loc.gov/vocabulary/relators/aut", "rdfs:label": ar ? "مؤلف" : "author" },
          }));
          workPatch["bf:contribution"] = contributions;
          workPatch["contribution"] = contributions;
        });
      }
      if (data.language && /^[a-z]{3}$/.test(data.language)) {
        offer(ar ? "اللغة" : "language", workData["bf:language"], () => {
          workPatch["bf:language"] = { "@type": "bf:Language", "@id": `http://id.loc.gov/vocabulary/languages/${data.language}` };
        });
      }

      setInstanceData((prev: any) => ({
        ...prev,
        ...instanceExtra,
        ...instancePatch,
      }));
      if (Object.keys(workPatch).length) setWorkData((prev: any) => ({ ...prev, ...workPatch }));
      if (workPatch["bf:title"]) setRecordTitle(data.title!);
      setSaveStatus("unsaved");

      // Like Marva's copy-cataloging check: warn when another saved record already has this ISBN.
      const isbns = [data.isbn13, data.isbn10, ...enteredIsbns].filter(Boolean) as string[];
      const duplicate = getAllRecordsLocal().find(r =>
        r.record?.work?.["@id"] !== uriSet.work &&
        isbns.some(isbn => JSON.stringify(r.record?.instance || {}).replace(/[-\s]/g, "").includes(isbn))
      );
      setTimeout(() => {
        if (filled.length) toast.success(ar ? `تم ملء: ${filled.join("، ")}` : `Filled: ${filled.join(", ")}`, {
          description: kept.length ? (ar ? `لم يتم تغيير ما أدخلته في: ${kept.join("، ")}` : `Kept what you entered in: ${kept.join(", ")}`) : undefined,
        });
        else if (kept.length) toast.info(ar ? "كل الحقول مملوءة مسبقاً؛ لم يتم تغيير شيء." : "Those fields were already filled; nothing was changed.");
        if (duplicate) toast.warning(
          ar ? `يوجد سجل محفوظ بنفس الردمك: «${duplicate.title}»` : `A saved record already has this ISBN: "${duplicate.title}"`,
          { description: ar ? "تحقق من أنك لا تفهرس الكتاب مرتين." : "Check that you are not cataloging the same book twice.", duration: 10000 }
        );
      }, 0);
    }
  }, [language, uriSet, workData, instanceData]);

  /** Category Cards ISBN auto-fill: adds the ISBN as a bf:Isbn identifier, then fills the empty fields. */
  const handleCategoryIsbn = useCallback((isbn: string, data: ISBNData | null) => {
    const current = instanceData["bf:identifiedBy"];
    const list = Array.isArray(current) ? current : current ? [current] : [];
    const digits = (v: any) => String(v ?? "").replace(/[^0-9Xx]/g, "");
    const has = list.some((id: any) => [id?.value, id?.isbn, id?.["rdf:value"]].some(v => digits(v) === isbn));
    const identifiers = has ? list : [...list, { type: "Isbn", value: isbn }];
    graphStore.setProperty(uriSet.instance, "bf:identifiedBy", identifiers);
    const extra = { "bf:identifiedBy": identifiers, identifiedBy: identifiers };
    if (data) fillFromIsbnData(data, [isbn], extra);
    else { setInstanceData((prev: any) => ({ ...prev, ...extra })); setSaveStatus("unsaved"); }
  }, [instanceData, graphStore, uriSet, fillFromIsbnData]);

  // ============================== RELATIONSHIPS ==============================

  const addRelationship = (domain: "Work" | "Instance" = "Work") => {
    const types = getRelationshipTypesForDomain(domain);
    setRelationships(prev => [...prev, { id: generateRelationshipId(), type: types[0] || "relatedTo", sourceUri: domain === "Work" ? uriSet.work : uriSet.instance, targetUri: "", label: "" }]);
    setSaveStatus("unsaved");
  };
  const updateRelationship = (id: string, field: string, value: any) => {
    setRelationships(prev => prev.map(rel => rel.id === id ? { ...rel, [field]: value } : rel));
    setSaveStatus("unsaved");
    setTimeout(() => regenerateRef.current(), 500);
  };
  const removeRelationship = (id: string) => {
    setRelationships(prev => prev.filter(rel => rel.id !== id));
    setSaveStatus("unsaved");
    setTimeout(() => regenerateRef.current(), 500);
  };

  // ============================== AUTHORITY ==============================

  const handleAuthoritySelect = (entity: any) => {
    if (entity.type === "book") {
      setInstanceData((prev: any) => ({ ...prev, "bf:title": { "@type": "bf:Title", "bf:mainTitle": entity.title_long || entity.title || entity.label }, "bf:identifiedBy": [{ "@type": "bf:Isbn", "rdf:value": entity.isbn13 || entity.isbn || entity.id }] }));
      if (entity.authors) {
        const authors = Array.isArray(entity.authors) ? entity.authors : [entity.authors];
        setWorkData((prev: any) => ({ ...prev, "bf:contribution": [...(prev["bf:contribution"] || []), ...authors.map((a: string) => ({ "@type": "bf:Contribution", "bf:agent": { "@type": "bf:Person", "rdfs:label": a }, "bf:role": { "@id": "http://id.loc.gov/vocabulary/relators/aut", "rdfs:label": "Author" } }))] }));
      }
      toast.success("Book imported!", { description: entity.title || entity.label });
      return;
    }
    if (entity.type === "subject") {
      setWorkData((prev: any) => ({ ...prev, "bf:subject": [...(prev["bf:subject"] || []), { "@type": "bf:Topic", "rdfs:label": entity.subject || entity.label }] }));
      toast.success("Subject added!");
      return;
    }
    // Link the person by an authority URI (LC, then VIAF, then Wikidata); internal ids such as "ai-…" are not IRIs.
    const ids = entity.identifiers || {};
    const agentUri = ids.loc ? `http://id.loc.gov/authorities/names/${ids.loc}`
      : ids.viaf ? `http://viaf.org/viaf/${ids.viaf}`
      : ids.wikidata ? `http://www.wikidata.org/entity/${ids.wikidata}`
      : (typeof entity.id === "string" && /^https?:\/\//.test(entity.id) ? entity.id : undefined);
    const contribution = { "@type": "bf:Contribution", "bf:agent": { ...(agentUri ? { "@id": agentUri } : {}), "@type": "bf:Person", "rdfs:label": entity.label }, "bf:role": { "@id": "http://id.loc.gov/vocabulary/relators/aut", "rdfs:label": "Author" } };
    setWorkData((prev: any) => ({ ...prev, "bf:contribution": [...(prev["bf:contribution"] || []), contribution] }));
    toast.success(`${entity.label} added!`);
  };

  // ============================== EXAMPLES & IMPORT ==============================

  const handleLoadExample = (exampleData: any) => {
    setWorkData({ ...exampleData.work, "@id": uriSet.work });
    setInstanceData({ ...exampleData.instance, "@id": uriSet.instance, "bf:instanceOf": { "@id": uriSet.work } });
    const t = exampleData.work?.["bf:title"];
    if (t) {
      if (typeof t === "string") setRecordTitle(t);
      else if (t["bf:mainTitle"]) setRecordTitle(typeof t["bf:mainTitle"] === "string" ? t["bf:mainTitle"] : (t["bf:mainTitle"]["@value"] || t["bf:mainTitle"]));
      else if (t["mainTitle"]) setRecordTitle(t["mainTitle"]);
      else if (t["rdfs:label"]) setRecordTitle(t["rdfs:label"]);
    }
    setShowExampleMenu(false);
    setSaveStatus("saved");
    toast.success("Loaded Real LOC Example", { description: "Complete bibliographic record with proper authority URIs.", duration: 4000 });
  };
  const handleImport = (importedWorkData: any, importedInstanceData: any, importedItemData?: any) => {
    setWorkData({ ...importedWorkData, "@id": uriSet.work });
    setInstanceData({ ...importedInstanceData, "@id": uriSet.instance, "bf:instanceOf": { "@id": uriSet.work } });
    if (importedItemData) {
      graphStore.setNode(uriSet.item, { ...importedItemData, "@id": uriSet.item, "@type": "bf:Item", "bf:itemOf": { "@id": uriSet.instance } });
    }
    setSaveStatus("unsaved");
    toast.success("Record imported!");
  };

  /**
   * Import a federated discovery record's @graph into the cataloging form fields.
   * Extracts Work, Instance, Contribution, and ProvisionActivity nodes from
   * the BIBFRAME @graph array and merges them into workData / instanceData.
   */
  const handleDiscoveryImport = useCallback((record: any) => {
    const doc = record?.document;
    const graph: any[] = doc?.["@graph"] || [];
    if (graph.length === 0) {
      toast.error("Record has no @graph data to import");
      return;
    }

    // Extract Work node
    const workNode = graph.find((n: any) => {
      const types = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"] || ""];
      return types.some((t: string) => t.includes("Work"));
    });

    // Extract Instance node
    const instanceNode = graph.find((n: any) => {
      const types = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"] || ""];
      return types.some((t: string) => t.includes("Instance"));
    });

    // Extract Contributions
    const contributions = graph.filter((n: any) => {
      const types = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"] || ""];
      return types.some((t: string) => t.includes("Contribution"));
    });

    // Extract ProvisionActivity / Publication
    const publications = graph.filter((n: any) => {
      const types = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"] || ""];
      return types.some((t: string) => t.includes("ProvisionActivity") || t.includes("Publication"));
    });

    // Build work data from the graph
    const newWorkData: any = {
      "@type": "bf:Work",
      "@id": uriSet.work,
    };

    if (workNode) {
      for (const [key, val] of Object.entries(workNode)) {
        if (key.startsWith("@")) continue;
        newWorkData[key] = val;
      }
    }

    // Attach contributions to work
    if (contributions.length > 0) {
      newWorkData["bf:contribution"] = contributions;
    }

    // Build instance data
    const newInstanceData: any = {
      "@type": "bf:Instance",
      "@id": uriSet.instance,
      "bf:instanceOf": { "@id": uriSet.work },
    };

    if (instanceNode) {
      for (const [key, val] of Object.entries(instanceNode)) {
        if (key === "@id" || key === "@type" || key === "bf:instanceOf") continue;
        newInstanceData[key] = val;
      }
    }

    // Attach publication info to instance
    if (publications.length > 0) {
      newInstanceData["bf:provisionActivity"] = publications;
    }

    setWorkData(newWorkData);
    setInstanceData(newInstanceData);
    setSaveStatus("unsaved");

    // Update record title
    const importedTitle = newWorkData["bf:title"]?.["bf:mainTitle"]
      || newWorkData["bf:title"]?.["mainTitle"]
      || (typeof newWorkData["bf:title"] === "string" ? newWorkData["bf:title"] : null)
      || record.title
      || "Imported Record";
    setRecordTitle(importedTitle);

    // Switch back to editor tab so the user sees populated fields
    setActiveTab("editor");

    toast.success(`"${importedTitle}" imported to form`, {
      description: `Source: ${record.source || "external"} — ${contributions.length} contributor(s), ${publications.length} publication(s)`,
      duration: 5000,
    });
  }, [uriSet]);

  // ============================== SAVE ==============================

  // overwriteVersion: set when the cataloger chose "Keep my edits" over a conflicting save.
  const handleSave = async (overwriteVersion?: number) => {
    try {
      setSaveStatus("saving");
      let title = recordTitle;
      if (title === "Untitled Record") {
        const t = workData["bf:title"];
        if (t) title = typeof t === "string" ? t : (t["bf:mainTitle"] || t["rdfs:label"] || title);
      }
      const record: BIBFRAMERecord = {
        "@context": { bf: "http://id.loc.gov/ontologies/bibframe/", bflc: "http://id.loc.gov/ontologies/bflc/", rdfs: "http://www.w3.org/2000/01/rdf-schema#", rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#", xsd: "http://www.w3.org/2001/XMLSchema#", madsrdf: "http://www.loc.gov/mads/rdf/v1#" },
        work: workData,
        instance: instanceData,
        // Item, Expression and AdminMetadata live only in the graph store; without these the save dropped them.
        item: graphStore.getNode(uriSet.item) || undefined,
        copies: copies.map((c) => copyToNode(c, uriSet.instance)),
        expression: enableExpression ? graphStore.getNode(uriSet.expression) || undefined : undefined,
        adminMetadata: graphStore.getNode(uriSet.admin) || undefined,
        metadata: {
          storageId: storageIdRef.current,
          catalogingLanguage: language, descriptionConventions: "rda",
          catalogingInterface: "Wolf Moon",
          resourceType: `Wolf Moon (${template.name})`,
          templateId: selectedTemplate, recordId, uriSet, license: licence,
          // The kind of material chosen when the record was started (kept through later saves).
          ...(materialChoice || ((initialRecord?.metadata as any)?.materialType ? {
            materialType: (initialRecord?.metadata as any).materialType,
            carrierKind: (initialRecord?.metadata as any).carrierKind,
            rare: (initialRecord?.metadata as any).rare,
          } : {})),
          ontologyVersion: BF_ONTOLOGY_VERSION,
          createdAt: initialRecord?.metadata?.createdAt || new Date().toISOString(),
          catalogerId: username || "anonymous",
          hiddenFields: Array.from(hiddenFields),
          status: (username?.toLowerCase() === "isaac" || username?.toLowerCase() === "admin") ? "complete" : "pending-review",
          catalogerRole: (username?.toLowerCase() === "isaac" || username?.toLowerCase() === "admin") ? "super-admin" : "cataloger"
        },
      };
      // The server decides the final status from the signed-in user's session.
      // Before a duplicate goes in: is this book already catalogued (same ISBN, LCCN or title)?
      if (overwriteVersion === undefined) {
        // A practice copy is the real record's twin: comparing it with the catalogue would only find itself.
        const duplicates = practice ? [] : (await checkDuplicates(record)).filter((d) => !acceptedDuplicatesRef.current.has(d.id));
        if (duplicates.length) {
          const why = (r: string) => (language === "ar"
            ? ({ isbn: "نفس ردمك ISBN", lccn: "نفس رقم LCCN", title: "نفس العنوان" } as Record<string, string>)[r]
            : ({ isbn: "same ISBN", lccn: "same LCCN", title: "same title" } as Record<string, string>)[r]) || r;
          const list = duplicates.slice(0, 5).map((d) => `• ${d.title} — ${d.reasons.map(why).join(", ")}${d.cataloger ? ` (${d.cataloger})` : ""}`).join("\n");
          const ok = window.confirm(language === "ar"
            ? `قد تكون هذه المادة مفهرسة من قبل:\n\n${list}\n\nهل تريد الحفظ على أي حال؟`
            : `This may already be catalogued:\n\n${list}\n\nSave anyway?`);
          if (!ok) {
            setSaveStatus("unsaved");
            return;
          }
          duplicates.forEach((d) => acceptedDuplicatesRef.current.add(d.id));
        }

        // The checks before a save, in three levels (Phase 13 S17): "must" stops the save, "should" asks
        // first (once for the same list), "note" is shown and never in the way.
        const checks = saveChecks(workData, instanceData);
        const ar = language === "ar";
        const must = checks.filter((c) => c.level === "must");
        if (must.length) {
          toast.error(ar ? "لا يمكن الحفظ بعد" : "Cannot save yet", { description: checksText(must, ar) });
          setSaveStatus("unsaved");
          return;
        }
        const should = checks.filter((c) => c.level === "should");
        const shouldKey = should.map((c) => c.field).join(",");
        if (should.length && shouldKey !== acceptedChecksRef.current) {
          const ok = window.confirm(ar
            ? `ينقص التسجيلة ما يُتوقع في كل تسجيلة مشتركة:\n\n${checksText(should, true)}\n\nهل تريد الحفظ على أي حال؟`
            : `This record is missing what every shared record is expected to have:\n\n${checksText(should, false)}\n\nSave anyway?`);
          if (!ok) {
            setSaveStatus("unsaved");
            return;
          }
          acceptedChecksRef.current = shouldKey;
        }
        const notes = checks.filter((c) => c.level === "note");
        if (notes.length) toast.message(ar ? "لجعل التسجيلة أفضل" : "To make the record better", { description: checksText(notes, ar) });
      }
      if (practice) {
        // Practice: every check above has run; the record stays in this browser and never reaches the catalogue.
        keepPractice({ id: recordId, title, savedAt: new Date().toISOString(), from: String((initialRecord?.metadata as any)?.practiceFrom || ""), document: toServerDocument(record) });
        clearDraft();
        setSaveStatus("saved");
        toast.success(language === "ar" ? "تمرين: فُحصت التسجيلة وحُفظت في هذا المتصفح فقط" : "Practice: checked and kept in this browser only",
          { description: language === "ar" ? "لم يصل شيء إلى الفهرس." : "Nothing reached the catalogue." });
        return;
      }
      let saved;
      try {
        saved = await saveRecord(record, username || "Anonymous", { baseVersion: overwriteVersion ?? baseVersionRef.current });
      } catch (error) {
        if (!(error instanceof RecordConflictError)) throw error;
        // Someone saved meanwhile: nothing was saved; let the cataloger compare and choose.
        setSaveStatus("unsaved");
        setSaveConflict({ currentVersion: error.currentVersion, savedBy: error.savedBy, savedAt: error.savedAt, myDocument: toServerDocument(record) });
        return;
      }
      storageIdRef.current = saved.id;
      setStorageId(saved.id);
      baseVersionRef.current = saved.version;
      setSaveConflict(null);
      // A cover chosen before the first save goes up now that the record exists.
      const pending = pendingCoverRef.current;
      if (pending) {
        pendingCoverRef.current = null;
        setPendingCover(null);
        uploadCover(saved.id, pending).then((res) => {
          if (res.ok) setCoverUrl(res.coverUrl);
          else toast.error(language === "ar" ? "حُفظت التسجيلة لكن تعذّر رفع الغلاف" : "Saved, but the cover could not be uploaded", { description: res.error });
        });
      }
      clearDraft();
      const initialStatus = saved.status || "complete";
      setSaveStatus("saved");
      if (saved.ruleWarnings?.length) {
        // The library's own checks (ISBN check digit, LCCN form, duplicates) that only warn.
        toast.warning(language === "ar" ? "قواعد المكتبة: تنبيه" : "Library rules: worth a look", {
          description: saved.ruleWarnings.map((w) => (language === "ar" ? w.ar : w.en)).join(" · "), duration: 12000,
        });
      }
      if (saved.publishBlocked?.length) {
        // The Super Admin's save went through but the record is not published until it is complete.
        const list = saved.publishBlocked.map((m) => (language === "ar" ? m.ar : m.en)).join(language === "ar" ? "، " : ", ");
        toast.warning(
          language === "ar" ? "حُفظت التسجيلة لكنها لم تُنشر بعد" : "Saved, but not published yet",
          { description: language === "ar" ? `حقول مطلوبة ناقصة: ${list}` : `Required fields still missing: ${list}`, duration: 10000 },
        );
      } else if (initialStatus === "pending-review" && saved.publishedVersion) {
        // An edit to a published record: the catalogue keeps showing the published version meanwhile.
        toast.info(
          language === "ar" ? "تم حفظ التعديل وهو قيد المراجعة بانتظار اعتماد المشرف العام (isaac)" : "Edit saved and waiting for review by the Super Admin (isaac)",
          { description: language === "ar" ? `يبقى الإصدار ${saved.publishedVersion} المنشور ظاهرًا في الفهرس العام حتى اعتماد التعديل.` : `The catalogue keeps showing the published version (v${saved.publishedVersion}) until your edit is approved.` },
        );
      } else if (initialStatus === "pending-review") {
        toast.info(language === "ar" ? "تم حفظ التسجيلة وهي قيد المراجعة بانتظار اعتماد المشرف العام (isaac)" : "Record saved! Status: Pending review by Super Admin (isaac)", { description: title });
      } else {
        toast.success(language === "ar" ? "تم حفظ التسجيلة واعتمادها في الفهرس العام!" : "Record saved and approved into catalog!", { description: title });
      }
      if (onRecordSaved) onRecordSaved(saved.id);
    } catch (error) {
      console.error("Save error:", error);
      setSaveStatus("error");
      toast.error("Save failed", { description: error instanceof Error ? error.message : "Unknown error" });
    }
  };

  // Reports this cataloger as editing the record every 15 seconds while they are active (a key or
  // click in the last two minutes, page visible), and shows who else is: both the one who opened the
  // record first and the one who came after see the warning, and someone arriving also gets a toast.
  // Going quiet or leaving the record drops them from others' warnings within a minute and a half.
  useEffect(() => {
    if (!storageId || !username) return;
    let lastActivity = Date.now();
    let stopped = false;
    let known: Set<string> | null = null;
    const onActivity = () => { lastActivity = Date.now(); };
    const activity = ["keydown", "pointerdown", "input"] as const;
    activity.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const beat = async () => {
      if (document.visibilityState !== "visible" || Date.now() - lastActivity > 120_000) return;
      const editors = await reportEditing(storageId).catch(() => null);
      if (stopped || !editors) return;
      // Someone who opened the record after this cataloger: say so right away, not only in the banner.
      if (known) {
        for (const e of editors) {
          if (!known.has(e.username)) {
            toast.warning(language === "ar" ? `فتح ${e.username} هذه التسجيلة الآن` : `${e.username} just opened this record`, {
              description: language === "ar" ? "إذا حفظتما معًا فستُسأل أي النسختين تبقى." : "If you both save, you'll be asked which version to keep.",
            });
          }
        }
      }
      known = new Set(editors.map((e) => e.username));
      setOtherEditors(editors);
    };
    beat();
    const timer = window.setInterval(beat, 15_000);
    const leave = () => reportStoppedEditing(storageId);
    window.addEventListener("pagehide", leave);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      activity.forEach((e) => window.removeEventListener(e, onActivity));
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [storageId, username, language]);

  // The live room: who else has this record open, the moment they open or close it.
  useEffect(() => {
    if (!storageId || !username) return;
    const room = connectLiveRoom(storageId, (state) => {
      setLivePeople(otherPeople(state, username));
      setLivePeers(state.peers);
    });
    setLiveRoom(room);
    return () => { room.stop(); setLiveRoom(null); setLivePeople([]); setLivePeers({}); };
  }, [storageId, username]);

  const loadLatestVersion = async () => {
    if (!storageIdRef.current) return;
    const latest = await getRecordById(storageIdRef.current);
    if (!latest) return;
    clearDraft();
    setSaveConflict(null);
    onReloadRecord?.(latest.record);
  };

  // ============================== DOWNLOAD ==============================

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };
  const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text); toast.success("Copied to clipboard!"); };

  // ============================== COMPUTED VALUES ==============================

  const graph = buildBibframeGraph(workData, instanceData);
  const graphStats = graphStore.getStats();
  const rawContribs = workData["bf:contribution"] || workData["contribution"];
  const normalizedContributions: any[] = Array.isArray(rawContribs)
    ? rawContribs
    : rawContribs && typeof rawContribs === "object"
    ? [rawContribs]
    : [];
  const authorityNodes = normalizedContributions.filter((c: any) => c && typeof c === 'object' && c["bf:agent"]).map((c: any, i: number) => ({
    id: c["bf:agent"]["@id"] || `agent-${i}`, label: c["bf:agent"]["rdfs:label"] || "Unknown",
    source: c["bf:agent"]["@id"]?.includes("loc.gov") ? ("LOC" as const) : ("AfIqa" as const),
    uri: c["bf:agent"]["@id"] || "", type: "person" as const, connections: [],
  }));

  const completionScore = useMemo(() => {
    let filled = 0, total = 0;
    (template.entities.work || []).forEach((s: any) => s.fields.forEach((f: any) => {
      total++;
      const prop = f.property.replace("bf:", "");
      if (workData[f.property] || workData[`bf:${prop}`] || workData[prop]) filled++;
    }));
    (template.entities.instance || []).forEach((s: any) => s.fields.forEach((f: any) => {
      total++;
      const prop = f.property.replace("bf:", "");
      if (instanceData[f.property] || instanceData[`bf:${prop}`] || instanceData[prop]) filled++;
    }));
    return total > 0 ? Math.round((filled / total) * 100) : 0;
  }, [workData, instanceData, template]);

  const tripleCount = graphTriples.length;
  const connectivity = useMemo(() => graphJsonld ? validateGraphConnectivity(graphJsonld) : { connected: false, orphans: [] }, [graphJsonld]);

  function toggleEntity(entity: string) {
    const newSet = new Set(expandedEntities);
    if (newSet.has(entity)) newSet.delete(entity); else newSet.add(entity);
    setExpandedEntities(newSet);
  }

  // ============================== RENDER ==============================

  return (
    <BMThemeContext.Provider value={BM}>
    <PrefilledDefaultsContext.Provider value={prefilledDefaults}>
    <RecordCommentsContext.Provider value={recordComments}>
    <div
      className={`h-screen flex flex-col overflow-hidden relative ${gradientClass} ${!isClassic ? "dark" : ""}`}
      dir={language === "ar" ? "rtl" : "ltr"}
      style={{
        background: isClassic ? "#ffffff" : "#060913",
        color: isClassic ? "#111827" : "#ffffff",
      }}
    >
      {/* ===== 1. INTERACTIVE 3D SPLINE SCENE BACKGROUND ===== */}
      {show3dBackground && (
        <div
          className="fixed inset-0 z-0 overflow-hidden pointer-events-auto"
          style={{ top: '-10%', height: '120%' }}
        >
          <iframe
            src="https://my.spline.design/3ddesigntextcopycopy-ICjwUjRH9s8O1NCNqRAWjo5g-5OJ/"
            frameBorder="0"
            width="100%"
            height="100%"
            className="w-full h-full"
            title="Spline 3D Scene"
            allow="fullscreen; autoplay"
            style={{
              pointerEvents: 'auto',
              border: 'none',
              background: 'transparent'
            }}
          />
        </div>
      )}

      {/* ===== 2. FROSTED GLASS / SLEEK STUDIO BACKDROP OVERLAY ===== */}
      {show3dBackground ? (
        <div
          className="fixed inset-0 z-0 pointer-events-none"
          style={{
            background: 'rgba(255, 255, 255, 0.40)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        />
      ) : (
        <div
          className="fixed inset-0 z-0 pointer-events-none transition-colors duration-300"
          style={{
            background: studioBgColor === "gray"
              ? "#666666"
              : "#000000",
          }}
        />
      )}


      {/* ===== HERO NAVBAR ===== */}
      <header
        className="relative z-20 px-6 pt-3 pb-4 glass-luxury-panel m-3 mb-0 rounded-2xl"
      >
        {/* ===== ROW 1: BRANDING (LEFT) — DYNAMIC NOTCH (CENTER) — FINDER & CONTROLS (RIGHT) ===== */}
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-center gap-2.5 -mt-3 mb-2.5">
          {/* Left: Back Button & MOON Studio Logo */}
          <div className="flex items-center justify-start gap-2.5 shrink-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="glass-bubble-pill hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white cursor-pointer shadow-xl shrink-0"
                title="Return to Dashboard"
              >
                <Home className="h-3.5 w-3.5 text-white drop-shadow" />
                <span className="text-xs font-bold">{t("back") || "Dashboard"}</span>
              </button>
            )}
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative flex items-center justify-center">
                <img src={moonLogoWhite} alt="Moon Logo" className="h-7 w-auto object-contain drop-shadow-lg" />
              </div>
              <h1 className="text-base font-black tracking-tight flex items-center gap-1.5 text-white">
                <span>MOON</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 border border-white/30 text-white font-bold uppercase tracking-wider">
                  Studio
                </span>
              </h1>
            </div>
            {/* The kind of material (template): one menu instead of a row of buttons. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="group glass-bubble-pill hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white cursor-pointer shadow-xl shrink-0"
                  title={language === "ar" ? "نوع المادة" : "Kind of material"}
                >
                  {TEMPLATE_ICONS[selectedTemplate] || <BookOpen className="h-3.5 w-3.5" />}
                  <span>{language === "ar" ? (TEMPLATE_NAMES_AR[selectedTemplate] || template.name) : template.name}</span>
                  <ChevronDown className="h-3 w-3 opacity-70 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={8}
                className="w-60 rounded-2xl border-white/20 bg-slate-900/85 text-white backdrop-blur-xl shadow-2xl p-1.5"
                style={{ direction: language === "ar" ? "rtl" : "ltr" }}
              >
                <DropdownMenuLabel className="text-[11px] font-bold uppercase tracking-wider text-white/60">
                  {language === "ar" ? "نوع المادة" : "Kind of material"}
                </DropdownMenuLabel>
                {getAllTemplates().map((tmpl, i) => {
                  const isSelected = selectedTemplate === tmpl.id;
                  return (
                    <DropdownMenuItem
                      key={tmpl.id}
                      onSelect={() => setSelectedTemplate(tmpl.id)}
                      className={`moon-menu-item flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-bold cursor-pointer text-white focus:bg-white/15 focus:text-white ${isSelected ? "bg-white/20" : ""}`}
                      style={{ animationDelay: `${i * 35}ms` }}
                    >
                      <span className="shrink-0">{TEMPLATE_ICONS[tmpl.id] || <BookOpen className="h-4 w-4" />}</span>
                      <span className="flex-1">{language === "ar" ? (TEMPLATE_NAMES_AR[tmpl.id] || tmpl.name) : tmpl.name}</span>
                      {isSelected && <Check className="h-4 w-4 text-emerald-300" />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Center: The Dynamic Notch (True Centered in Column 2, will NEVER collide) */}
          <div className="flex justify-center shrink-0">
            <div
              className="liquid-glass-notch flex items-center gap-2 px-3 py-1 transition-all shadow-2xl"
            >
              {/* Institutional Score Badge */}
              {institutionalValidation && (
                <div
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black transition-all shrink-0"
                  style={{
                    background: institutionalValidation.score >= 85 ? "rgba(52, 211, 153, 0.22)" : institutionalValidation.score >= 50 ? "rgba(251, 191, 36, 0.22)" : "rgba(248, 113, 113, 0.22)",
                    color: institutionalValidation.score >= 85 ? "#34d399" : institutionalValidation.score >= 50 ? "#fbbf24" : "#f87171",
                    border: `1px solid ${institutionalValidation.score >= 85 ? "rgba(52, 211, 153, 0.45)" : institutionalValidation.score >= 50 ? "rgba(251, 191, 36, 0.45)" : "rgba(248, 113, 113, 0.45)"}`,
                  }}
                >
                  <Shield className="h-3 w-3 animate-pulse" />
                  <span>{getValidationBadge(institutionalValidation)} ({institutionalValidation.score}/100)</span>
                </div>
              )}

              {/* Vertical Divider */}
              <div className="h-3 w-px bg-white/25 shrink-0" />

              {/* Live Graph Metrics */}
              <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
                {[
                  { icon: <Database className="h-3 w-3 text-cyan-300" />, label: `${graphStats.nodeCount} ${t("nodes")}` },
                  { icon: <Network className="h-3 w-3 text-purple-300" />, label: `${tripleCount} ${t("triples")}` },
                  { icon: <Activity className="h-3 w-3 text-emerald-300" />, label: `${completionScore}%` },
                  {
                    icon: connectivity.connected ? <CheckCircle2 className="h-3 w-3 text-emerald-300" /> : <AlertTriangle className="h-3 w-3 text-amber-300" />,
                    label: connectivity.connected ? t("connectedLabel") : `${connectivity.orphans.length} ${t("orphans")}`,
                    alert: !connectivity.connected
                  },
                ].map((stat, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold transition-all shrink-0"
                    style={{
                      background: 'rgba(255, 255, 255, 0.12)',
                      border: '1px solid rgba(255, 255, 255, 0.22)',
                      color: stat.alert ? '#fbbf24' : '#ffffff',
                    }}
                  >
                    {stat.icon}
                    <span>{stat.label}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Iraqi Authority Finder + 3D Toggle + Background Toggle (Black/Gray only) + Language Toggle */}
          <div className="flex items-center justify-end gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowIraqiAuthorityModal(true)}
              className="glass-bubble-pill hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 px-3 py-1.5 text-xs font-black text-white cursor-pointer shadow-xl shrink-0"
            >
              <img src={moonLogoWhite} alt="Moon Logo" className="h-3.5 w-auto object-contain drop-shadow" />
              <span>IQ Authority Finder</span>
            </button>
            <button
              type="button"
              onClick={toggle3dBackground}
              className={`glass-bubble-pill hover:scale-105 active:scale-95 transition-all flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold cursor-pointer shrink-0 ${show3dBackground ? 'text-cyan-300' : 'text-white/60'}`}
              title={show3dBackground ? (language === "ar" ? "إيقاف الخلفية ثلاثية الأبعاد (3D)" : "Turn 3D background OFF") : (language === "ar" ? "تشغيل الخلفية ثلاثية الأبعاد (3D)" : "Turn 3D background ON")}
            >
              <Box className={`h-3.5 w-3.5 ${show3dBackground ? 'text-cyan-300' : 'text-white/40'}`} />
              <span>{show3dBackground ? (language === "ar" ? "3D مفعّل" : "3D ON") : (language === "ar" ? "3D معطّل" : "3D OFF")}</span>
            </button>

            {/* Background Color Toggle (When 3D is OFF: Only Black #000000 & Gray #666666, White Removed) */}
            {!show3dBackground && (
              <button
                type="button"
                onClick={() => {
                  const next = studioBgColor === "black" ? "gray" : "black";
                  setStudioBgColor(next);
                  try { localStorage.setItem("moon_wolf_bg_color", next); } catch {}
                }}
                className="glass-bubble-pill hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold cursor-pointer shrink-0 shadow-lg"
                title={language === "ar" ? `التبديل إلى ${studioBgColor === "black" ? "الرمادي" : "الأسود"}` : `Switch to ${studioBgColor === "black" ? "Gray" : "Black"}`}
              >
                <div
                  className="w-3 h-3 rounded-full border border-white/50 shadow-xs shrink-0"
                  style={{ backgroundColor: studioBgColor === "black" ? "#000000" : "#666666" }}
                />
                <span>{studioBgColor === "black" ? (language === "ar" ? "أسود" : "Black") : (language === "ar" ? "رمادي" : "Gray")}</span>
              </button>
            )}

            <button
              type="button"
              onClick={toggleLanguage}
              className="glass-bubble-pill hover:scale-105 active:scale-95 transition-all flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold cursor-pointer shrink-0"
            >
              <Globe className="h-3.5 w-3.5 text-cyan-300" />
              <span>{language === "en" ? "عربي" : "EN"}</span>
            </button>
          </div>
        </div>

        {/* ===== ROW 2: TEMPLATES & RECORD CONTROLS (UNIFIED ON A SINGLE LINE WITH DIVIDER) ===== */}
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-1.5 flex-nowrap overflow-x-auto scrollbar-none pt-2 pb-1.5 border-t border-white/10">

          {/* Record Title input with Save Status indicator */}
          <div className="flex items-center gap-1.5 glass-bubble-pill px-2.5 py-1 text-xs shrink-0">
            <BMSaveStatus status={saveStatus} neverSaved={!storageIdRef.current} />
            <input
              type="text"
              value={recordTitle}
              onChange={(e) => { setRecordTitle(e.target.value); setSaveStatus("unsaved"); }}
              className="bg-transparent text-xs font-bold focus:outline-none placeholder-white/50 text-white w-28 sm:w-32"
              placeholder={t("recordTitle")}
            />
          </div>

          {/* Save Button */}
          <button
            type="button"
            onClick={() => handleSave()}
            className="glass-bubble-pill hover:scale-105 active:scale-95 transition-all flex items-center gap-1 px-3 py-1 text-xs font-black text-white cursor-pointer shadow-xl shrink-0"
          >
            <Save className="h-3 w-3 text-emerald-300 drop-shadow" />
            <span>{t("save")}</span>
          </button>

          {/* Reset Button */}
          <button
            type="button"
            onClick={handleResetAll}
            className="glass-bubble-pill hover:scale-105 active:scale-95 transition-all flex items-center gap-1 px-2.5 py-1 text-xs font-bold cursor-pointer text-rose-300 border-rose-400/30 hover:border-rose-400 shrink-0"
          >
            <RefreshCw className="h-3 w-3 text-rose-400" />
            <span>{t("reset") || "Reset"}</span>
          </button>

          {/* Copy and derive: a new edition or a translation of this Work (Libris / Marva) */}
          {onDerive && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowDeriveMenu((s) => !s)}
                aria-expanded={showDeriveMenu}
                title={language === "ar" ? "ابدأ تسجيلة جديدة من هذا العمل" : "Start a new record from this Work"}
                className="glass-bubble-pill hover:scale-105 active:scale-95 transition-all flex items-center gap-1 px-2.5 py-1 text-xs font-bold cursor-pointer text-white"
              >
                <Copy className="h-3 w-3 text-amber-300" />
                <span>{language === "ar" ? "اشتقاق" : "Derive"}</span>
              </button>
              {showDeriveMenu && (
                <div className="absolute z-50 mt-1 min-w-[220px] rounded-xl bg-slate-900/95 p-1 text-xs text-white shadow-2xl ring-1 ring-white/10" style={{ insetInlineStart: 0 }}>
                  {([
                    ["edition", language === "ar" ? "طبعة جديدة من هذا العمل" : "New edition of this work", language === "ar" ? "العمل نفسه؛ الناشر والتاريخ والردمك جديدة" : "Same Work; new publisher, date, ISBN"],
                    ["translation", language === "ar" ? "ترجمة لهذا العمل" : "Translation of this work", language === "ar" ? "عمل جديد مرتبط بالأصل (bf:translationOf)" : "New Work linked to the original (bf:translationOf)"],
                  ] as const).map(([kind, label, hint]) => (
                    <button key={kind} type="button" className="block w-full rounded-lg px-3 py-2 text-start hover:bg-white/10"
                      onClick={() => {
                        setShowDeriveMenu(false);
                        if (saveStatus === "unsaved" && !window.confirm(language === "ar" ? "في هذه التسجيلة تغييرات غير محفوظة. المتابعة دون حفظ؟" : "This record has unsaved changes. Continue without saving?")) return;
                        const fresh = mintUriSet(generateRecordId());
                        onDerive(deriveRecord({ work: { ...workData, "@id": uriSet.work }, instance: { ...instanceData, "@id": uriSet.instance } }, kind, { work: fresh.work, instance: fresh.instance }));
                        toast.success(kind === "edition"
                          ? (language === "ar" ? "طبعة جديدة: أكمل بيانات النشر والردمك" : "New edition: fill in the publication details and ISBN")
                          : (language === "ar" ? "ترجمة جديدة: أضف العنوان المترجم واللغة والمترجم" : "New translation: add the translated title, language and translator"));
                      }}>
                      <div className="font-bold">{label}</div>
                      <div className="text-white/60">{hint}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Import Button */}
          <button
            type="button"
            onClick={() => setShowImportDialog(true)}
            className="glass-bubble-pill hover:scale-105 active:scale-95 transition-all flex items-center gap-1 px-2.5 py-1 text-xs font-bold cursor-pointer text-white shrink-0"
          >
            <Upload className="h-3 w-3 text-cyan-300" />
            <span>{t("import")}</span>
          </button>

          {/* Open this record in the public catalogue (OPAC), as readers see it: its published version. */}
          {!practice && (
            <button
              type="button"
              disabled={!storageId}
              onClick={() => {
                if (!storageId) return;
                // The site root (mooon.site/ or a subfolder), from the editor's own address (…/moon/).
                const root = window.location.pathname.replace(/(moon|dashboard|editor)\/.*$/, "").replace(/[^/]*$/, "");
                window.open(`${root}opac.html?work=${encodeURIComponent(storageId)}`, "_blank", "noopener");
              }}
              title={!storageId
                ? (language === "ar" ? "احفظ التسجيلة أولاً" : "Save the record first")
                : (language === "ar" ? "افتح التسجيلة في الفهرس العام كما يراها القراء (النسخة المنشورة)" : "Open the record in the public catalogue as readers see it (the published version)")}
              className="glass-bubble-pill hover:scale-105 active:scale-95 transition-all flex items-center gap-1 px-2.5 py-1 text-xs font-bold cursor-pointer text-white shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              <ExternalLink className="h-3 w-3 text-sky-200" />
              <span>{language === "ar" ? "افتح في الفهرس العام" : "Open in OPAC"}</span>
            </button>
          )}

          {/* Simple mode (S22): only the fields a language expert needs. */}
          <button
            type="button"
            onClick={toggleSimple}
            aria-pressed={simpleMode}
            title={language === "ar" ? "الوضع المبسط: الحقول الأساسية وحدها" : "Simple mode: the main fields only"}
            className={`glass-bubble-pill hover:scale-105 active:scale-95 transition-all flex items-center gap-1 px-2.5 py-1 text-xs font-bold cursor-pointer text-white shrink-0 ${simpleMode ? "ring-2 ring-white/70" : ""}`}
          >
            <span>{language === "ar" ? (simpleMode ? "مبسّط ✓" : "مبسّط") : (simpleMode ? "Simple ✓" : "Simple")}</span>
          </button>

          {/* Send to FOLIO: MARC + Instance, or Instance only (the record must be saved and published) */}
          {!practice && <button
            type="button"
            onClick={() => setShowFolio(true)}
            title={language === "ar" ? "أرسل التسجيلة المنشورة إلى FOLIO" : "Send the published record to FOLIO"}
            className="glass-bubble-pill hover:scale-105 active:scale-95 transition-all flex items-center gap-1 px-2.5 py-1 text-xs font-bold cursor-pointer text-white shrink-0"
          >
            <Send className="h-3 w-3 text-emerald-300" />
            <span>FOLIO</span>
          </button>}
          {showFolio && <FolioSendDialog recordId={recordId} rtl={language === "ar"} onClose={() => setShowFolio(false)} />}

          {/* Field Manager (Restricted to Super Admin Isaac) */}
          <button
            type="button"
            onClick={() => {
              if (!isSuperAdmin) {
                toast.error(
                  language === "ar"
                    ? "عذراً، تخصيص القوالب مقتصر على المشرف العام (إسحاق) فقط."
                    : "Access restricted: Custom templates are only accessible by Super Admin (Isaac)."
                );
                return;
              }
              setShowFieldManager(!showFieldManager);
            }}
            className="glass-bubble-pill hover:scale-105 active:scale-95 transition-all flex items-center gap-1 px-2.5 py-1 text-xs font-bold cursor-pointer shrink-0"
            style={{
              borderColor: hiddenFields.size > 0 ? "rgba(251,191,36,0.8)" : undefined,
              color: hiddenFields.size > 0 ? "#fbbf24" : undefined,
              opacity: isSuperAdmin ? 1 : 0.85,
            }}
            title={!isSuperAdmin ? (language === "ar" ? "مخصص للمشرف العام إسحاق فقط" : "Super Admin Isaac only") : undefined}
          >
            <Settings className="h-3 w-3" />
            <span>{hiddenFields.size > 0 ? `${hiddenFields.size} ${t("fieldsHidden")}` : t("customTemplates")}</span>
            {!isSuperAdmin && <Lock className="h-2.5 w-2.5 text-white/50" />}
          </button>
        </div>
      </header>

      {/* ===== SEGMENTED OUTPUT TABS (Frosted Glass Bubble Pills - Sharp & Clear) ===== */}
      <nav
        className="relative z-10 px-6 py-2"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {([
            { key: "editor" as OutputTab, icon: <Layers className="h-3.5 w-3.5" />, label: t("bibframeEditor"), color: "#38bdf8" },
            { key: "w3c-jsonld" as OutputTab, icon: <Shield className="h-3.5 w-3.5" />, label: `${t("w3cJsonLd")} ${w3cValidation?.valid ? "✓" : ""}`, color: "#34d399" },
            { key: "jsonld" as OutputTab, icon: <Braces className="h-3.5 w-3.5" />, label: t("rawJsonLd"), color: "#22d3ee" },
            { key: "rdf-xml" as OutputTab, icon: <Code className="h-3.5 w-3.5" />, label: "RDF/XML", color: "#10b981" },
            { key: "turtle" as OutputTab, icon: <Code className="h-3.5 w-3.5" />, label: t("turtle"), color: "#a78bfa" },
            { key: "ntriples" as OutputTab, icon: <FileText className="h-3.5 w-3.5" />, label: t("nTriples"), color: "#fb923c" },
            { key: "marc21-viewer" as OutputTab, icon: <BookOpen className="h-3.5 w-3.5" />, label: "MARC 21 View", color: "#f43f5e" },
            // Cataloguing in MARC 21, converted to BIBFRAME live: its own tab beside the BIBFRAME editor.
            { key: "marc-editor" as OutputTab, icon: <Code className="h-3.5 w-3.5" />, label: language === "ar" ? "محرر مارك 21" : "MARC 21 Editor", color: "#60a5fa" },
            // A record has a history once it has been saved.
            ...(storageIdRef.current ? [{ key: "history" as OutputTab, icon: <History className="h-3.5 w-3.5" />, label: language === "ar" ? "السجل" : "History", color: "#fbbf24" }] : [])
          ]).map(tab => {
            const isSelected = activeTab === tab.key;
            return (
              <button
                type="button"
                key={tab.key}
                onClick={() => {
                  if (tab.key === "opac") {
                    window.location.href = "/opac.html";
                    return;
                  }
                  setActiveTab(tab.key);
                }}
                className={`glass-bubble-pill cursor-pointer px-4 py-1.5 text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all duration-200 ${
                  isSelected
                    ? "bg-white/35 border-white text-white shadow-xl scale-[1.03] ring-1 ring-white/60"
                    : "text-white/85 hover:text-white hover:bg-white/20 border-white/25 hover:scale-105"
                }`}
              >
                <span style={{ color: isSelected ? "#ffffff" : tab.color }}>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ===== MAIN CONTENT ===== */}
      {/* data-live-root: the area where live cursors are shared (fields inside carry data-live-field). */}
      <div data-live-root="" className="flex-1 overflow-auto p-6 relative"
        style={{
          background: isClassic
            ? "#ffffff"
            : isLegacy
            ? "linear-gradient(135deg, rgba(0, 0, 0, 0.15) 0%, rgba(10, 10, 20, 0.25) 100%)"
            : "linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(20, 20, 30, 0.5) 100%)",
          backdropFilter: isClassic ? undefined : isLegacy ? "blur(20px) saturate(120%)" : "blur(40px) saturate(150%)",
          WebkitBackdropFilter: isClassic ? undefined : isLegacy ? "blur(20px) saturate(120%)" : "blur(40px) saturate(150%)",
          boxShadow: isLight
            ? (isClassic ? "0 1px 3px rgba(0,0,0,0.1)" : undefined)
            : "inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(0, 0, 0, 0.5), 0 20px 60px rgba(0, 0, 0, 0.6)",
        }}>
        {/* Background decorative elements — cyberpunk glow (hidden in classic) */}
        {!isClassic && (
        <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden -z-10">
          <div className="absolute -top-20 -left-32 w-[500px] h-[500px] rounded-full" style={{ background: "radial-gradient(circle, rgba(59,130,246,0.08), transparent 70%)" }} />
          <div className="absolute top-1/2 -right-40 w-[600px] h-[600px] rounded-full" style={{ background: "radial-gradient(circle, rgba(30,64,175,0.06), transparent 70%)" }} />
          <div className="absolute -bottom-32 left-1/3 w-[400px] h-[400px] rounded-full" style={{ background: "radial-gradient(circle, rgba(96,165,250,0.07), transparent 70%)" }} />
        </div>
        )}

        <LivePresence
          people={livePeople}
          language={language}
          light={isLight}
          cursorsShown={showLiveCursors}
          onToggleCursors={toggleLiveCursors}
        />
        <LiveCursors room={liveRoom} peers={livePeers} myUsername={username || ""} show={showLiveCursors} />
        <LiveFieldPresence room={liveRoom} peers={livePeers} myUsername={username || ""} language={language} />
        <EditingWarning editors={otherEditors} language={language} />

        {practice && (
          <div role="status" className="mb-3 rounded-2xl px-4 py-3 text-sm text-white flex flex-wrap items-center gap-3"
            style={{ background: "rgba(245,158,11,0.25)", border: "1px solid rgba(253,230,138,0.6)" }} dir={language === "ar" ? "rtl" : "ltr"}>
            <b>{language === "ar" ? "تمرين" : "Practice"}</b>
            <span className="flex-1 min-w-[14rem]">{language === "ar"
              ? "هذه نسخة من تسجيلة حقيقية للتمرين. جرّب ما شئت: الحفظ يفحص التسجيلة ويحفظها في هذا المتصفح فقط، ولا يصل شيء إلى الفهرس."
              : "This is a copy of a real record to practise on. Try anything: Save checks the record and keeps it in this browser only; nothing reaches the catalogue."}</span>
            <a href="/learn.html" target="_blank" rel="noreferrer" className="underline">{language === "ar" ? "الدروس" : "Lessons"}</a>
          </div>
        )}
        {activeTab === "editor" && (
          // Cover, copies and romanization side by side (one column on narrow screens), so they take one row.
          <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-3 items-stretch [&>*]:min-w-0 [&>*>*]:h-full">
            <div>
              <RecordCoverPanel recordId={storageId} coverUrl={coverUrl} isbn={findIsbn(instanceData)} language={language} onChange={setCoverUrl}
                pendingCover={pendingCover} onPendingCoverChange={setPendingCover} />
            </div>
            {/* With copies listed (four fields each), the copies take the whole row below. */}
            <div className={copies.length ? "lg:col-span-3 lg:order-last" : ""}>
              <CopiesPanel copies={copies} instanceId={uriSet.instance} language={language}
                onChange={(next) => { setCopies(next); setSaveStatus("unsaved"); }} />
            </div>
            <div>
              <RomanizePanel work={workData} instance={instanceData} language={language}
                onApply={(w, inst) => { setWorkData(w); setInstanceData(inst); setSaveStatus("unsaved"); }} />
            </div>
            <div>
              <MajmuPanel work={workData} language={language} onChange={(w) => { setWorkData(w); setSaveStatus("unsaved"); }} />
            </div>
            <div>
              <SubjectFinderPanel work={workData} instance={instanceData} recordId={storageId} language={language}
                onAdd={(subject) => { setWorkData((prev: any) => ({ ...prev, "bf:subject": [...(Array.isArray(prev["bf:subject"]) ? prev["bf:subject"] : prev["bf:subject"] ? [prev["bf:subject"]] : []), subject] })); setSaveStatus("unsaved"); }} />
            </div>
            <div>
              <div className="p-3 space-y-1.5" style={{ borderRadius: 16, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.25)' }} dir={language === "ar" ? "rtl" : "ltr"}>
                <label className="flex items-center gap-2 text-sm font-bold text-white">
                  {language === "ar" ? "ترخيص الوصف" : "Licence of this description"}
                  <select value={licence} onChange={(e) => { setLicence(e.target.value); setSaveStatus("unsaved"); }}
                    className="ms-auto rounded-lg px-2.5 py-1.5 text-xs text-white outline-none [&>option]:text-slate-900"
                    style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.2)' }}>
                    {LICENCES.map((l) => <option key={l.id} value={l.id}>{language === "ar" ? l.ar : l.en}</option>)}
                  </select>
                </label>
                <p className="text-[11px] text-white/60">{language === "ar"
                  ? "بيانات مون مفتوحة بترخيص CC0. غيّره فقط إن جاء الوصف من مصدر له شروط أخرى؛ «لا يُعاد نشره» يُبقي التسجيلة خارج التنزيل الشامل وSPARQL."
                  : "Moon's data is open under CC0. Change this only if the description came from a source with other terms; \"Not for redistribution\" keeps the record out of the bulk downloads and SPARQL."}</p>
              </div>
            </div>
            {isMusic(workData) && (
              <div>
                <MaqamPanel work={workData} language={language} onChange={(w) => { setWorkData(w); setSaveStatus("unsaved"); }} />
              </div>
            )}
          </div>
        )}

        {saveConflict && storageIdRef.current && (
          <React.Suspense fallback={null}>
            <SaveConflictDialog
              recordId={storageIdRef.current}
              conflict={saveConflict}
              myDocument={saveConflict.myDocument}
              theme={BM}
              language={language}
              busy={saveStatus === "saving"}
              onKeepMine={() => handleSave(saveConflict.currentVersion)}
              onLoadTheirs={loadLatestVersion}
              onCancel={() => setSaveConflict(null)}
            />
          </React.Suspense>
        )}

        {/* ===== BIBFRAME EDITOR ===== */}
        {activeTab === "editor" && (
          <div className="moon-enter space-y-4">

            {/* Floating Marva Diacritics Bar */}
            {marvaPreferences.showDiacriticBar && (
              <div
                className="sticky top-0 z-20 px-6 py-2.5 flex items-center justify-between gap-3 flex-wrap"
                style={{
                  borderRadius: "120px",
                  background: "rgba(255, 255, 255, 0.21)",
                  backdropFilter: "blur(9px) saturate(1.5) brightness(1.1)",
                  WebkitBackdropFilter: "blur(36px) saturate(1.8) brightness(1.15) contrast(1.05)",
                  boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.15), inset 1.5px 1.5px 0 rgba(255, 255, 255, 0.5), inset 0 0 12px rgba(255, 255, 255, 0.2), 0 8px 32px rgba(0, 0, 0, 0.2)",
                  border: "1px solid rgba(255, 255, 255, 0.4)",
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-cyan-300" /> Marva Diacritics:
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {MARVA_DIACRITICS.map((d) => (
                      <button
                        key={d.name}
                        type="button"
                        title={`${d.name} (${d.shortcut})`}
                        onClick={() => {
                          navigator.clipboard.writeText(d.char);
                          toast.success(`Copied '${d.char}' (${d.name}) to clipboard!`);
                        }}
                        className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/30 text-white font-bold text-sm flex items-center justify-center transition-all cursor-pointer border border-white/20 shadow-sm"
                      >
                        {d.char}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-white/70">
                  <span className="font-mono">Click to copy</span>
                </div>
              </div>
            )}

            {/* Template Info */}
            <BMCard>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 flex items-center justify-center text-white"
                    style={{
                      borderRadius: "20px",
                      background: "rgba(255, 255, 255, 0.21)",
                      backdropFilter: "blur(9px) saturate(1.5) brightness(1.1)",
                      WebkitBackdropFilter: "blur(36px) saturate(1.8) brightness(1.15) contrast(1.05)",
                      boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.15), inset 1.5px 1.5px 0 rgba(255, 255, 255, 0.5), inset 0 0 12px rgba(255, 255, 255, 0.2), 0 8px 32px rgba(0, 0, 0, 0.2)",
                      border: "1px solid rgba(255, 255, 255, 0.4)",
                    }}
                  >
                    {TEMPLATE_ICONS[selectedTemplate] || <BookOpen className="h-5 w-5 text-white" />}
                  </div>
                  <div>
                    <h2 className="text-lg font-black" style={{ color: BM.text }}>{template.name} {t("templateLabel")}</h2>
                    <p className="text-xs" style={{ color: BM.textDim }}>{template.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer" style={{ color: BM.textMuted }}>
                    <input type="checkbox" checked={enableExpression} onChange={toggleExpression}
                      className="w-4 h-4 rounded accent-sky-500" />
                    {t("expressionLayer")}
                  </label>
                  <span className="text-[10px] font-mono px-2 py-1 rounded-md" style={{ background: BM.accentGlow, color: BM.accent }}>
                    {uriSet.work.split("/").pop()}
                  </span>
                </div>
              </div>
              {graphValidation && (
                <div className="mt-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2 font-semibold"
                  style={{
                    background: graphValidation.valid ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.08)",
                    color: "#ffffff",
                    border: "1px solid rgba(255,255,255,0.2)",
                  }}>
                  {graphValidation.valid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                  {graphValidation.valid
                    ? `${t("graphValid")} — ${graphStats.nodeCount} ${t("nodes")}, ${tripleCount} ${t("triples")}`
                    : `${graphValidation.errors.length} ${t("errors")}, ${graphValidation.warnings.length} ${t("warnings")}`}
                </div>
              )}
            </BMCard>

            {/* ===== LC MARVA DYNAMIC WORK / INSTANCE / HUB LAYOUT ===== */}
            {loadType === "hub-only" ? (
              <React.Suspense fallback={<LazyPanelFallback />}><MarvaHubEditor
                currentHub={activeHub}
                onSelectHub={(h) => {
                  setActiveHub(h);
                  updateWorkProperty("bf:expressionOf", h.uri);
                }}
                onSaveHub={(h) => setActiveHub(h)}
                isDark={!isLight}
              /></React.Suspense>
            ) : (
            <>
            {/* How to catalogue: BIBFRAME forms, or MARC 21 converted to BIBFRAME as you type. The MARC 21
                editor used to be a fourth layout chip here and was easy to miss; it is now the first choice. */}
            <div
              className="px-5 py-4 rounded-2xl mb-6 space-y-3"
              style={{
                borderRadius: '20px',
                background: 'rgba(255, 255, 255, 0.22)',
                backdropFilter: 'blur(16px) saturate(1.5) brightness(1.1)',
                WebkitBackdropFilter: 'blur(36px) saturate(1.8) brightness(1.15) contrast(1.05)',
                border: '1px solid rgba(255, 255, 255, 0.45)',
                boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.2), inset 1.5px 1.5px 0 rgba(255, 255, 255, 0.5), inset 0 0 12px rgba(255, 255, 255, 0.25), 0 8px 32px rgba(0, 0, 0, 0.15)',
              }}
            >
              <div className="flex items-center justify-between flex-wrap gap-3">
                <span className="text-sm font-bold text-white tracking-wide">
                  {language === "ar" ? "طريقة الفهرسة:" : "Catalogue in:"}
                </span>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-black/25 border border-white/10 w-full sm:w-auto" role="tablist" aria-label={language === "ar" ? "طريقة الفهرسة" : "How to catalogue"}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={true}
                    onClick={() => setActiveTab("editor")}
                    className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      'bg-blue-600 text-white shadow-lg'
                    }`}
                  >
                    <Layers className="h-4 w-4" />
                    <span>{language === "ar" ? "حقول BIBFRAME" : "BIBFRAME fields"}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={false}
                    onClick={() => setActiveTab("marc-editor")}
                    className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      'text-white/75 hover:text-white hover:bg-white/10'
                    }`}
                    title={language === "ar" ? "فهرسة بمارك 21 مع تحويل فوري إلى BIBFRAME" : "Catalogue in MARC 21, converted to BIBFRAME as you type"}
                  >
                    <Code className="h-4 w-4" />
                    <span>{language === "ar" ? "مارك 21 ← BIBFRAME فوراً" : "MARC 21 → BIBFRAME live"}</span>
                  </button>
                </div>
              </div>

              {fieldViewMode !== 'marc' && (
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2.5">
                    <Sliders className="h-4 w-4 text-sky-400" />
                    <span className="text-xs font-bold text-white/80 tracking-wide">
                      {language === "ar" ? "نمط عرض الحقول:" : "Field layout:"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/25 border border-white/10">
                    <button
                      type="button"
                      onClick={() => setFieldViewMode('categories')}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        fieldViewMode === 'categories'
                          ? 'bg-blue-600 text-white shadow-lg scale-105'
                          : 'text-white/70 hover:text-white hover:bg-white/10'
                      }`}
                      title="عرض تسجيلات الحقول المصنفة"
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                      <span>{language === "ar" ? "أقسام التسجيلات" : "Category Cards"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFieldViewMode('standard')}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        fieldViewMode === 'standard'
                          ? 'bg-blue-600 text-white shadow-lg scale-105'
                          : 'text-white/70 hover:text-white hover:bg-white/10'
                      }`}
                      title="عرض الحقول المعيارية مع رموز مارك"
                    >
                      <List className="h-3.5 w-3.5" />
                      <span>{language === "ar" ? "حقول مارك المعيارية" : "Standard MARC Fields"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFieldViewMode('both')}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        fieldViewMode === 'both'
                          ? 'bg-blue-600 text-white shadow-lg scale-105'
                          : 'text-white/70 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>{language === "ar" ? "عرض الكل" : "Show Both"}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>


            {fieldViewMode !== 'marc' && <div className={
              loadType === "work-only" || loadType === "instance-only"
                ? "flex flex-col gap-6"
                : marvaPreferences.layoutMode === "split"
                ? "grid grid-cols-1 lg:grid-cols-2 gap-6 items-start"
                : "flex flex-col gap-6"
            }>
              {/* WORK (shown for work-instance and work-only) */}
              {(loadType === "work-instance" || loadType === "work-only") && (
              <BMEntitySection
                title={t("work")}
                subtitle={language === "ar" ? "bf:Work (العمل)" : "bf:Work"}
                color={marvaPreferences.workColor || BM.accent}
                icon={<BookOpen className="h-5 w-5" style={{ color: marvaPreferences.workColor || BM.accent }} />}
                uri={uriSet.work} expanded={expandedEntities.has("Work")} onToggle={() => toggleEntity("Work")}
                requiredCount={workRequiredProps.length} groupCount={templateWorkGroups.length}>
                
                {(fieldViewMode === "both" || fieldViewMode === "categories") && (
                  <OntologyDrivenFormRenderer entityType="Work" nodeUri={uriSet.work} graphStore={graphStore} data={workData} onChange={handlePropertyChange}
                    hiddenFields={hiddenFields} onHideField={hideField} isLight={isLight} onlyFields={simpleMode ? SIMPLE_FIELDS.Work : undefined} />
                )}
                {(fieldViewMode === "both" || fieldViewMode === "standard") && (
                  <div className={(fieldViewMode === "both" ? "mt-6 pt-4 " : "")} style={fieldViewMode === "both" ? { borderTop: `1px solid ${BM.cardBorder}` } : undefined}>
                    <h4 className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: BM.textDim }}>
                      <FileText className="h-3.5 w-3.5" /> {language === "ar" ? "حقول الإنطولوجيا المعيارية (MARC LOD)" : t("ontologyDrivenFields")}
                    </h4>
                    <div className="space-y-3">
                      {workProperties.filter(p => !hiddenFields.has(`ontology:${p.uri}`)).map(property => (
                        <BMFieldWrapper key={property.uri} fieldKey={`ontology:${property.uri}`} onHide={hideField}>
                          <OntologyField property={property} value={getPropertyValue(workData, property.uri)}
                            onChange={(value) => updateWorkProperty(property.uri, value)} language={language} />
                        </BMFieldWrapper>
                      ))}
                    </div>
                  </div>
                )}
                {normalizedContributions.length > 0 && (
                  <div className="mt-4 p-4 rounded-xl" style={{ background: "rgba(59,130,246,0.06)", border: `1px solid ${BM.accentBorder}` }}>
                    <h4 className="text-xs font-bold mb-2 flex items-center gap-2" style={{ color: BM.accent }}>
                      <User className="h-3.5 w-3.5" /> {language === "ar" ? "المؤلفون والمساهمون" : t("contributors")} ({normalizedContributions.length})
                    </h4>
                    <div className="space-y-1.5">
                      {normalizedContributions.map((c: any, i: number) => (
                        <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg text-sm" style={{ background: isClassic ? "#f9fafb" : isLegacy ? "rgba(255,255,255,0.5)" : "rgba(30,41,59,0.6)", border: isClassic ? "1px solid #e5e7eb" : isLegacy ? "1px solid rgba(255,255,255,0.4)" : "1px solid rgba(59,130,246,0.12)", backdropFilter: hasGlass ? "blur(8px)" : undefined }}>
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black"
                            style={{ background: "rgba(59,130,246,0.15)", color: BM.accent }}>
                            {(c["bf:agent"]?.["rdfs:label"] || "?").charAt(0).toUpperCase()}
                          </div>
                          <span className="font-semibold" style={{ color: BM.text }}>{c["bf:agent"]?.["rdfs:label"] || "Unknown"}</span>
                          <span className="text-xs" style={{ color: BM.textDim }}>{c["bf:role"]?.["rdfs:label"] || "Contributor"}</span>
                          {c["bf:agent"]?.["@id"] && <span className="text-[10px] font-mono truncate ml-auto" style={{ color: BM.textDim }}>{c["bf:agent"]["@id"]}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </BMEntitySection>
              )}

              {/* INSTANCE (shown for work-instance and instance-only) */}
              {(loadType === "work-instance" || loadType === "instance-only") && (
              <BMEntitySection
                title={t("instance")}
                subtitle={language === "ar" ? "bf:Instance (التجسيدة)" : "bf:Instance"}
                color={marvaPreferences.instanceColor || BM.accentDim}
                icon={<Package className="h-5 w-5" style={{ color: marvaPreferences.instanceColor || BM.accentDim }} />}
                uri={uriSet.instance} expanded={expandedEntities.has("Instance")} onToggle={() => toggleEntity("Instance")}
                requiredCount={instanceRequiredProps.length} groupCount={templateInstanceGroups.length}>
                
                {(fieldViewMode === "both" || fieldViewMode === "categories") && (
                  <>
                    <IsbnAutofillBar language={language} isLight={isLight} onResult={handleCategoryIsbn} />
                    <OntologyDrivenFormRenderer entityType="Instance" nodeUri={uriSet.instance} graphStore={graphStore} data={instanceData} onChange={handlePropertyChange}
                      hiddenFields={hiddenFields} onHideField={hideField} isLight={isLight} onlyFields={simpleMode ? SIMPLE_FIELDS.Instance : undefined} />
                  </>
                )}
                {(fieldViewMode === "both" || fieldViewMode === "standard") && (
                  <div className={(fieldViewMode === "both" ? "mt-6 pt-4 " : "")} style={fieldViewMode === "both" ? { borderTop: `1px solid ${BM.cardBorder}` } : undefined}>
                    <h4 className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: BM.textDim }}>
                      <FileText className="h-3.5 w-3.5" /> {language === "ar" ? "حقول الإنطولوجيا المعيارية (bf:Instance)" : t("ontologyDrivenFields")}
                    </h4>
                    <div className="space-y-3">
                      {instanceProperties.filter(p => !hiddenFields.has(`ontology:${p.uri}`)).map(property => (
                        <BMFieldWrapper key={property.uri} fieldKey={`ontology:${property.uri}`} onHide={hideField}>
                          <OntologyField property={property} value={getPropertyValue(instanceData, property.uri)}
                            onChange={(value) => updateInstanceProperty(property.uri, value)} language={language} />
                      </BMFieldWrapper>
                    ))}
                  </div>
                  </div>
                )}
              </BMEntitySection>
              )}
            </div>}
            </>
            )}

            {/* EXPRESSION (optional) — full width below */}
            {enableExpression && (
              <BMEntitySection title={t("expression")} subtitle={t("realizationOfWork")} color={BM.secondary}
                icon={<Layers className="h-5 w-5" style={{ color: BM.secondary }} />}
                uri={uriSet.expression} expanded={expandedEntities.has("Expression")} onToggle={() => toggleEntity("Expression")}>
                <OntologyDrivenFormRenderer entityType="Expression" nodeUri={uriSet.expression} graphStore={graphStore} onChange={handlePropertyChange}
                  hiddenFields={hiddenFields} onHideField={hideField} isLight={isLight} />
              </BMEntitySection>
            )}

            {/* ITEM */}
            <BMEntitySection title={t("item")} subtitle={t("specificCopy")} color="#f59e0b"
              icon={<Archive className="h-5 w-5" style={{ color: "#f59e0b" }} />}
              uri={uriSet.item} expanded={expandedEntities.has("Item")} onToggle={() => toggleEntity("Item")}
              groupCount={templateItemGroups.length}>
              <OntologyDrivenFormRenderer entityType="Item" nodeUri={uriSet.item} graphStore={graphStore} onChange={handlePropertyChange}
                hiddenFields={hiddenFields} onHideField={hideField} isLight={isLight} />
            </BMEntitySection>

            {/* ADMIN METADATA */}
            <BMEntitySection title={t("adminMetadata")} subtitle={t("recordProvenance")} color={BM.textDim}
              icon={<Settings className="h-5 w-5" style={{ color: BM.textDim }} />}
              uri={uriSet.admin} expanded={expandedEntities.has("Admin")} onToggle={() => toggleEntity("Admin")}>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: t("recordId"), value: recordId, mono: true },
                  { label: t("created"), value: new Date().toISOString().split("T")[0] },
                  { label: t("cataloger"), value: username || "anonymous" },
                  { label: t("templateLabel"), value: template.name },
                  { label: t("conventions"), value: "RDA" },
                  { label: t("ontology"), value: `BIBFRAME ${BF_ONTOLOGY_VERSION}` },
                  { label: t("source"), value: "Moon Library System — Blue Moon" },
                  { label: t("language"), value: language === "en" ? "English" : "العربية" },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: isClassic ? "#f9fafb" : isLegacy ? "rgba(255,255,255,0.5)" : "rgba(30,41,59,0.5)", border: isClassic ? "1px solid #e5e7eb" : isLegacy ? "1px solid rgba(255,255,255,0.4)" : "1px solid rgba(59,130,246,0.1)", backdropFilter: hasGlass ? "blur(8px)" : undefined }}>
                    <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: BM.textDim }}>{row.label}</span>
                    <span className={`text-xs ${row.mono ? "font-mono" : "font-semibold"}`} style={{ color: BM.text }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </BMEntitySection>
          </div>
        )}

        {/* ===== SERIALIZATIONS (W3C JSON-LD, raw JSON-LD, RDF/XML, Turtle, N-Triples) ===== */}
        <OutputTabs activeTab={activeTab} BM={BM} w3cValidation={w3cValidation} w3cJsonLd={w3cJsonLd} graphJsonld={graphJsonld} graph={graph}
          graphRdfXml={graphRdfXml} w3cTurtle={w3cTurtle} w3cNTriples={w3cNTriples} workData={workData} instanceData={instanceData}
          recordId={recordId} copyToClipboard={copyToClipboard} downloadFile={downloadFile} />

        {/* ===== MARC ===== */}
        {activeTab === "marc-editor" && (
          <div className="moon-enter px-6 py-4 max-w-7xl mx-auto">
            <React.Suspense fallback={<LazyPanelFallback />}>
              <MarcEditor workData={workData} instanceData={instanceData} uriSet={uriSet} language={language}
                onApply={(work, instance) => { setWorkData(work); setInstanceData(instance); setSaveStatus("unsaved"); }} />
            </React.Suspense>
          </div>
        )}
        {activeTab === "marc" && <MarcView data={{ work: workData, instance: instanceData, admin: {} }} />}

        {/* ===== MARC 21 VIEWER ===== */}
        {activeTab === "marc21-viewer" && (
          <>
            {/* This tab shows the record as MARC; cataloguing in MARC happens in the editor's MARC 21 mode. */}
            <div className="flex justify-end mb-3">
              <button
                type="button"
                onClick={() => setActiveTab("marc-editor")}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600 text-white text-sm font-bold hover:bg-blue-700"
              >
                <Code className="h-4 w-4" /> {language === "ar" ? "حرّر بمارك 21" : "Edit in MARC 21"}
              </button>
            </div>
            <React.Suspense fallback={<LazyPanelFallback />}><Marc21Viewer workData={workData} instanceData={instanceData} theme={BM} isLegacy={isLegacy} w3cJsonLd={w3cJsonLd} recordId={recordId} /></React.Suspense>
          </>
        )}

        {/* ===== TRIPLES ===== */}
        {activeTab === "triples" && (
          <BMCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black flex items-center gap-2" style={{ color: BM.text }}>
                <Hash className="h-5 w-5" style={{ color: "#f59e0b" }} /> RDF Triples ({tripleCount})
              </h3>
              <BMSmallBtn onClick={() => copyToClipboard(graphTriples.map(t => `<${t.subject}> <${t.predicate}> ${typeof t.object === 'string' ? `<${t.object}>` : `"${t.object.value}"`} .`).join("\n"))} icon={<Copy className="h-3.5 w-3.5" />} label="N-Triples" />
            </div>
            <div className="overflow-auto max-h-[calc(100vh-350px)] rounded-xl" style={{ border: `1px solid ${BM.cardBorder}` }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BM.cardBorder}` }}>
                    <th className="text-left p-2.5 w-8" style={{ color: BM.textDim }}>#</th>
                    <th className="text-left p-2.5" style={{ color: BM.textDim }}>Subject</th>
                    <th className="text-left p-2.5" style={{ color: BM.textDim }}>Predicate</th>
                    <th className="text-left p-2.5" style={{ color: BM.textDim }}>Object</th>
                    <th className="text-left p-2.5 w-16" style={{ color: BM.textDim }}>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {graphTriples.map((triple, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid rgba(120,130,180,0.06)" }}
                      onMouseOver={(e) => (e.currentTarget.style.background = "rgba(0,122,255,0.03)")}
                      onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}>
                      <td className="p-2.5" style={{ color: BM.textDim }}>{idx + 1}</td>
                      <td className="p-2.5 font-mono truncate max-w-[200px]" style={{ color: BM.accent }}>{shortenUri(triple.subject)}</td>
                      <td className="p-2.5 font-mono truncate max-w-[200px]" style={{ color: BM.secondary }}>{shortenUri(triple.predicate)}</td>
                      <td className="p-2.5 font-mono truncate max-w-[250px]">
                        {typeof triple.object === 'string'
                          ? <span style={{ color: BM.accent }}>{shortenUri(triple.object)}</span>
                          : triple.object.type === 'uri'
                            ? <span style={{ color: BM.accent }}>{shortenUri(triple.object.value)}</span>
                            : <span style={{ color: BM.success }}>"{triple.object.value}"</span>}
                      </td>
                      <td className="p-2.5">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black"
                          style={{
                            background: (typeof triple.object === 'object' && triple.object.type === 'literal') ? "rgba(5,150,105,0.08)" : "rgba(79,70,229,0.08)",
                            color: (typeof triple.object === 'object' && triple.object.type === 'literal') ? BM.success : BM.accent,
                          }}>
                          {typeof triple.object === 'string' ? 'URI' : triple.object.type?.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {graphTriples.length === 0 && <div className="text-center py-12" style={{ color: BM.textDim }}>Fill in the form to extract triples...</div>}
            </div>
          </BMCard>
        )}

        {/* ===== OPAC ===== */}
        {activeTab === "opac" && (
          <div className="moon-enter space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20">
              <div>
                <h4 className="text-sm font-bold text-white">WOF MOON Public Discovery OPAC</h4>
                <p className="text-xs text-white/70">Connected to the shared catalog database (Share-VDE & Libris standard)</p>
              </div>
              <a
                href="/opac.html"
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-lg cursor-pointer shrink-0"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Open Full Standalone OPAC (/opac.html)</span>
              </a>
            </div>
            <React.Suspense fallback={<LazyPanelFallback />}><WolfMoonStandaloneOpac onOpenEditor={() => setActiveTab('editor')} /></React.Suspense>
          </div>
        )}

        {/* ===== MIND MAP ===== */}
        {activeTab === "mindmap" && (
          <BMCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black flex items-center gap-2" style={{ color: BM.text }}>
                <Sparkles className="h-5 w-5" style={{ color: "#fb923c" }} /> Knowledge Graph
              </h3>
              <div className="flex items-center gap-1 p-0.5 rounded-xl" style={{ background: isClassic ? "#f1f5f9" : "rgba(30,41,59,0.6)", border: `1px solid ${BM.cardBorder}` }}>
                {([
                  { key: "solar" as const, label: "Solar System", icon: <Orbit className="h-3 w-3" /> },
                  { key: "classic" as const, label: "Classic Map", icon: <Network className="h-3 w-3" /> },
                ] as const).map(v => (
                  <button
                    key={v.key}
                    onClick={() => setMindmapView(v.key)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                    style={{
                      background: mindmapView === v.key ? (isClassic ? "#3b82f6" : "rgba(59,130,246,0.2)") : "transparent",
                      color: mindmapView === v.key ? (isClassic ? "#fff" : BM.accent) : BM.textMuted,
                      border: mindmapView === v.key ? `1px solid ${BM.accent}44` : "1px solid transparent",
                    }}
                  >
                    {v.icon} {v.label}
                  </button>
                ))}
              </div>
            </div>
            {mindmapView === "solar" ? (
              <React.Suspense fallback={<LazyPanelFallback />}><SolarSystemMindMap workData={workData} instanceData={instanceData} theme={BM} /></React.Suspense>
            ) : (
              <React.Suspense fallback={<LazyPanelFallback />}><MindMapPreview workData={workData} instanceData={instanceData} itemUri={uriSet.item} theme={isLight ? "light" : "dark"} /></React.Suspense>
            )}
          </BMCard>
        )}

        {/* ===== VALIDATION ===== */}
        {activeTab === "history" && storageIdRef.current && (
          <React.Suspense fallback={<LazyPanelFallback />}>
            <RecordHistoryPanel
              recordId={storageIdRef.current}
              theme={BM}
              language={language}
              hasUnsavedChanges={saveStatus === "unsaved"}
              onReverted={async () => {
                // Reload the editor on the reverted record; unsaved edits were confirmed away.
                const saved = await getRecordById(storageIdRef.current!);
                if (!saved) return;
                clearDraft();
                onReloadRecord?.(saved.record);
              }}
            />
          </React.Suspense>
        )}

        {activeTab === "validation" && (
          <div className="moon-enter space-y-4">
            {graphValidation && (
              <ValidationPanel validation={graphValidation} theme={isLight ? "light" : "dark"} />
            )}
            {institutionalValidation && (
              <BMCard>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-black flex items-center gap-2" style={{ color: BM.text }}>
                    <Shield className="h-5 w-5" style={{ color: BM.accent }} /> Institutional Validation (LOC/PCC)
                  </h3>
                  <div className="px-4 py-2 rounded-xl text-sm font-black" style={{
                    background: institutionalValidation.score >= 85 ? "rgba(52,211,153,0.1)" : institutionalValidation.score >= 50 ? "rgba(251,191,36,0.1)" : "rgba(248,113,113,0.1)",
                    color: institutionalValidation.score >= 85 ? BM.success : institutionalValidation.score >= 50 ? BM.warning : BM.danger,
                  }}>
                    {getValidationBadge(institutionalValidation)} — {institutionalValidation.score}/100
                  </div>
                </div>
                <p className="text-sm mb-4" style={{ color: BM.textMuted }}>{institutionalValidation.summary}</p>
                {institutionalValidation.errors.length > 0 && (
                  <div className="mb-4 space-y-1">
                    <h4 className="text-xs font-bold mb-1.5" style={{ color: BM.danger }}>Errors ({institutionalValidation.errors.length})</h4>
                    {institutionalValidation.errors.map((e, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded-lg text-xs" style={{ background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.1)" }}>
                        <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" style={{ color: BM.danger }} />
                        <div>
                          <span className="font-bold" style={{ color: BM.danger }}>{e.entity}{e.property ? ` / ${e.property}` : ""}</span>
                          <span className="ml-2" style={{ color: BM.textMuted }}>{e.message}</span>
                          {e.fix && <p className="mt-0.5" style={{ color: BM.accent }}>Fix: {e.fix}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {institutionalValidation.warnings.length > 0 && (
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold mb-1.5" style={{ color: BM.warning }}>Warnings ({institutionalValidation.warnings.length})</h4>
                    {institutionalValidation.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded-lg text-xs" style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.1)" }}>
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" style={{ color: BM.warning }} />
                        <div>
                          <span className="font-bold" style={{ color: BM.warning }}>{w.entity}{w.property ? ` / ${w.property}` : ""}</span>
                          <span className="ml-2" style={{ color: BM.textMuted }}>{w.message}</span>
                          {w.fix && <p className="mt-0.5" style={{ color: BM.accent }}>Fix: {w.fix}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </BMCard>
            )}
            {bfValidation && (
              <BMCard>
                <h3 className="text-lg font-black mb-4 flex items-center gap-2" style={{ color: BM.text }}>
                  <Database className="h-5 w-5" style={{ color: BM.accent }} /> BIBFRAME Semantic Validation
                </h3>
                <div className="p-4 rounded-xl mb-4" style={{
                  background: bfValidation.valid ? "rgba(52,211,153,0.06)" : "rgba(248,113,113,0.06)",
                  border: `1px solid ${bfValidation.valid ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)"}`,
                }}>
                  <div className="flex items-center gap-2 font-bold" style={{ color: bfValidation.valid ? BM.success : BM.danger }}>
                    {bfValidation.valid ? <><CheckCircle2 className="h-5 w-5" /> Valid BIBFRAME Record</> : <><AlertCircle className="h-5 w-5" /> {bfValidation.errors.length} Error(s)</>}
                  </div>
                </div>
                {bfValidation.errors.length > 0 && <div className="space-y-1">{bfValidation.errors.map((err, i) => (
                  <div key={i} className="text-xs p-2 rounded-lg flex items-start gap-2" style={{ background: "rgba(248,113,113,0.05)" }}>
                    <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" style={{ color: BM.danger }} />
                    <span style={{ color: BM.textMuted }}>[{err.code}] {err.entity}: {err.message}</span>
                  </div>
                ))}</div>}
                {bfValidation.warnings.length > 0 && <div className="mt-3 space-y-1">{bfValidation.warnings.map((w, i) => (
                  <div key={i} className="text-xs p-2 rounded-lg flex items-start gap-2" style={{ background: "rgba(251,191,36,0.05)" }}>
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" style={{ color: BM.warning }} />
                    <span style={{ color: BM.textMuted }}>[{w.code}] {w.entity}: {w.message}</span>
                  </div>
                ))}</div>}
              </BMCard>
            )}
            <BMCard>
              <h3 className="text-lg font-black mb-4 flex items-center gap-2" style={{ color: BM.text }}>
                <Network className="h-5 w-5" style={{ color: BM.secondary }} /> Graph Connectivity
              </h3>
              <div className="p-4 rounded-xl" style={{
                background: connectivity.connected ? "rgba(52,211,153,0.06)" : "rgba(251,191,36,0.06)",
                border: `1px solid ${connectivity.connected ? "rgba(52,211,153,0.15)" : "rgba(251,191,36,0.15)"}`,
              }}>
                {connectivity.connected
                  ? <span className="font-bold flex items-center gap-2" style={{ color: BM.success }}><CheckCircle2 className="h-5 w-5" /> All nodes connected</span>
                  : <div>
                      <span className="font-bold flex items-center gap-2" style={{ color: BM.warning }}><AlertTriangle className="h-5 w-5" /> {connectivity.orphans.length} orphan node(s)</span>
                      <ul className="mt-2 space-y-1">{connectivity.orphans.map((o, i) => <li key={i} className="text-xs font-mono" style={{ color: BM.textDim }}>{o}</li>)}</ul>
                    </div>}
              </div>
            </BMCard>
          </div>
        )}

        {/* ===== RELATIONSHIPS ===== */}
        {activeTab === "relationships" && (
          <BMCard>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-black flex items-center gap-2" style={{ color: BM.text }}>
                <Network className="h-5 w-5" style={{ color: BM.accent }} /> {t("semanticRelationships")}
              </h3>
              <div className="flex gap-2">
                <BMSmallBtn onClick={() => addRelationship("Work")} icon={<Plus className="h-3.5 w-3.5" />} label={t("workRel")} />
                <BMSmallBtn onClick={() => addRelationship("Instance")} icon={<Plus className="h-3.5 w-3.5" />} label={t("instanceRel")} />
              </div>
            </div>
            {relationships.length === 0 && <div className="text-center py-12" style={{ color: BM.textDim }}>{t("noRelationships")}</div>}
            <div className="space-y-3">
              {relationships.map(rel => (
                <div key={rel.id} className="p-4 rounded-xl" style={{ background: glassElBg, border: `1px solid ${BM.cardBorder}`, backdropFilter: hasGlass ? "blur(10px)" : undefined }}>
                  <div className="flex items-start gap-4">
                    <div className="flex-1 space-y-2.5">
                      <div className="flex gap-3">
                        <select value={rel.type} onChange={(e) => updateRelationship(rel.id, "type", e.target.value)}
                          className="flex-1 px-3 py-2 rounded-lg text-sm" style={{ background: BM.inputBg, border: `1px solid ${BM.inputBorder}`, color: BM.text }}>
                          {Object.entries(RELATIONSHIP_DEFINITIONS).map(([type, def]) => (
                            <option key={type} value={type}>{(def as any).label} ({(def as any).domain})</option>
                          ))}
                        </select>
                        <input type="text" value={rel.targetUri} onChange={(e) => updateRelationship(rel.id, "targetUri", e.target.value)}
                          placeholder={t("targetUri")} className="flex-1 px-3 py-2 rounded-lg text-sm"
                          style={{ background: BM.inputBg, border: `1px solid ${BM.inputBorder}`, color: BM.text }} />
                      </div>
                      <input type="text" value={rel.label || ""} onChange={(e) => updateRelationship(rel.id, "label", e.target.value)}
                        placeholder="Label (optional)" className="w-full px-3 py-2 rounded-lg text-sm"
                        style={{ background: BM.inputBg, border: `1px solid ${BM.inputBorder}`, color: BM.text }} />
                    </div>
                    <button onClick={() => removeRelationship(rel.id)} className="p-2 rounded-lg"
                      style={{ background: "rgba(248,113,113,0.1)", color: BM.danger }}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </BMCard>
        )}

        {/* ===== AUTHORITY GRAPH ===== */}
        {activeTab === "authority-graph" && (
          <BMCard>
            <h3 className="text-lg font-black mb-4 flex items-center gap-2" style={{ color: BM.text }}>
              <Globe className="h-5 w-5" style={{ color: BM.secondary }} /> Authority Graph
            </h3>
            <React.Suspense fallback={<LazyPanelFallback />}><AuthorityGraph nodes={authorityNodes} /></React.Suspense>
          </BMCard>
        )}

        {/* ===== DISCOVERY LAYER ===== */}
        {activeTab === "discovery" && (
          <div className="moon-enter -mx-4" style={{ minHeight: "80vh" }}>
            <React.Suspense fallback={<LazyPanelFallback />}><LinkedDataDiscovery
              glassTheme={glassTheme}
              onThemeToggle={() => setGlassTheme(glassTheme === "dark" ? "legacy" : "dark")}
              onImportToForm={handleDiscoveryImport}
            /></React.Suspense>
          </div>
        )}

        {/* ===== SCRIPTSHIFTER ===== */}
        {activeTab === "scriptshifter" && (
          <ScriptShifterPanel theme={BM} isLegacy={isLegacy} isClassic={isClassic} />
        )}

        {/* ===== LC CUTTER ===== */}
        {activeTab === "lc-cutter" && (
          <LCCutterPanel theme={BM} isLegacy={isLegacy} isClassic={isClassic} />
        )}


        {/* ===== BIBFRAME HUBS & EXPRESSIONS ===== */}
        {activeTab === "hubs" && (
          <React.Suspense fallback={<LazyPanelFallback />}><MarvaHubEditor
            currentHub={activeHub}
            onSelectHub={(h) => {
              setActiveHub(h);
              updateWorkProperty("bf:expressionOf", h.uri);
            }}
            onSaveHub={(h) => setActiveHub(h)}
            isDark={!isLight}
          /></React.Suspense>
        )}

        {/* ===== REMERGE MODERN MARC ===== */}
        {activeTab === "remerge-marc" && (
          <React.Suspense fallback={<LazyPanelFallback />}><MarvaRemergeMarc
            workData={workData}
            instanceData={instanceData}
            itemData={uriSet.item}
            adminData={uriSet.admin}
            hubData={activeHub}
            isDark={!isLight}
          /></React.Suspense>
        )}
        {/* ===== AI ENGINE ===== */}
        {activeTab === "ai-engine" && (
          <React.Suspense fallback={<LazyPanelFallback />}><BlueMoonAIPanel
            theme={BM}
            isLegacy={isLegacy}
            isClassic={isClassic}
            currentTitle={recordTitle !== "Untitled Record" ? recordTitle : (workData?.["bf:title"]?.["bf:mainTitle"] || workData?.["bf:title"]?.mainTitle || "")}
            currentAuthor={(() => {
              const contrib = workData?.["bf:contribution"];
              if (Array.isArray(contrib) && contrib[0]) {
                const agent = contrib[0]?.["bf:agent"];
                return agent?.["rdfs:label"] || agent?.label || "";
              }
              return "";
            })()}
            currentIsbn={(() => {
              const ids = instanceData?.["bf:identifiedBy"];
              if (Array.isArray(ids)) {
                const isbn = ids.find((id: any) => id?.["@type"] === "bf:Isbn");
                return isbn?.["rdf:value"] || "";
              }
              return ids?.["rdf:value"] || "";
            })()}
          /></React.Suspense>
        )}
      </div>


      {/* ===== MARVA PREFERENCES MODAL ===== */}
      <MarvaPreferencesModal
        isOpen={showPreferencesModal}
        onClose={() => setShowPreferencesModal(false)}
        preferences={marvaPreferences}
        onSavePreferences={(prefs) => {
          setMarvaPreferences(prefs);
          toast.success("Marva preferences updated!");
        }}
        isDark={!isLight}
      />

      {/* ===== MARVA TOOLS MODAL ===== */}
      <React.Suspense fallback={<LazyPanelFallback />}><MarvaToolsModal
        isOpen={showToolsModal}
        onClose={() => setShowToolsModal(false)}
        workData={workData}
        instanceData={instanceData}
        itemData={uriSet.item}
        hubData={activeHub}
        onUpdateData={(updated) => {
          if (updated.work) setWorkData(updated.work);
          if (updated.instance) setInstanceData(updated.instance);
          setSaveStatus("unsaved");
        }}
        historyEntries={historyEntries}
        onRevertHistory={(entry) => {
          if (entry.entity === "Work") {
            setWorkData((prev: any) => ({ ...prev, [entry.field]: entry.previousValue }));
          } else if (entry.entity === "Instance") {
            setInstanceData((prev: any) => ({ ...prev, [entry.field]: entry.previousValue }));
          }
          toast.info(`Reverted ${entry.field}`);
        }}
        isDark={!isLight}
      /></React.Suspense>

      {/* ===== FIELD MANAGER PANEL ===== */}
      <AnimatePresence>
        {showFieldManager && isSuperAdmin && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed bottom-6 z-50 overflow-hidden flex flex-col"
            style={{
              width: "420px",
              height: "280px",
              borderRadius: "120px",
              background: "rgba(255, 255, 255, 0.94)",
              backdropFilter: "blur(4.5px) url(#lg-filter) blur(9px) saturate(1.5) brightness(1.1)",
              WebkitBackdropFilter: "blur(36px) saturate(1.8) brightness(1.15) contrast(1.05)",
              boxShadow:
                "inset 0 0 0 1px rgba(255, 255, 255, 0.8), inset 1.5px 1.5px 0 rgba(255, 255, 255, 0.95), inset 0 0 12px rgba(255, 255, 255, 0.6), 0 8px 32px rgba(0, 0, 0, 0.18)",
              border: "1.5px solid rgba(255, 255, 255, 0.95)",
              color: "#0f172a",
              insetInlineEnd: "1.5rem",
            }}>
            {/* Header */}
            <div className="flex items-center justify-between px-10 pt-4 pb-2 border-b border-slate-200/70">
              <h3 className="text-xs font-black flex items-center gap-2 text-slate-900">
                <Settings className="h-3.5 w-3.5 text-blue-600" />
                <span>{t("fieldCustomization")}</span>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold">Super Admin (Isaac)</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowFieldManager(false)}
                className="p-1 rounded-full bg-slate-100 hover:bg-slate-200 transition-all text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-8 py-2 scrollbar-thin">
              {/* Summary bar */}
              <div className="px-2 py-2 flex items-center gap-2 flex-wrap border-b border-slate-200/70">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800">
                  {allFieldKeys.length - hiddenFields.size} {t("fieldsKept")}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 border border-rose-300 text-rose-800">
                  {hiddenFields.size} {t("fieldsRemoved")}
                </span>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => setShowSaveTemplateDialog(true)}
                  className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-sm cursor-pointer"
                >
                  <Save className="h-3 w-3" /> {t("saveTemplate")}
                </button>
                {hiddenFields.size > 0 && (
                  <button
                    type="button"
                    onClick={restoreAllFields}
                    className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-sm cursor-pointer"
                  >
                    <RefreshCw className="h-3 w-3" /> {t("restoreAll")}
                  </button>
                )}
              </div>

              {/* Saved templates */}
              {savedFieldTemplates.length > 0 && (
                <div className="px-2 py-2 border-b border-slate-200/70">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 text-slate-600">
                    <Layers className="h-3 w-3 text-blue-600" /> {t("savedTemplates")} ({savedFieldTemplates.length})
                  </h4>
                  <div className="space-y-1.5">
                    {savedFieldTemplates.map(tmpl => (
                      <div
                        key={tmpl.id}
                        className="flex items-center gap-2 p-2 rounded-xl bg-white/80 border border-slate-200 text-slate-800 shadow-sm"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold truncate text-slate-900">{tmpl.name}</div>
                          <div className="text-[10px] flex items-center gap-2 text-slate-500">
                            <span>{t("basedOn")}: {tmpl.baseTemplate}</span>
                            <span>•</span>
                            <span>{tmpl.hiddenFields.length} {t("fieldsRemoved")}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleLoadFieldTemplate(tmpl)}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold bg-blue-100 hover:bg-blue-200 text-blue-800 cursor-pointer"
                        >
                          {t("apply")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteFieldTemplate(tmpl.id)}
                          className="p-1 rounded-lg text-rose-600 hover:bg-rose-100 cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Instructions */}
              <div className="px-2 py-3 text-center">
                <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                  {t("fieldCustomizationHelp")}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== SAVE TEMPLATE DIALOG ===== */}
      <AnimatePresence>
        {showSaveTemplateDialog && (
          <BMSaveTemplateDialog
            allFieldKeys={allFieldKeys}
            hiddenFields={hiddenFields}
            baseTemplateName={template.name}
            onSave={handleSaveFieldTemplate}
            onClose={() => setShowSaveTemplateDialog(false)}
          />
        )}
      </AnimatePresence>

      {/* ===== DIALOGS ===== */}
      <AuthoritySearchDialog isOpen={showAuthoritySearch} onClose={() => setShowAuthoritySearch(false)} onSelect={handleAuthoritySelect} initialQuery="" />
      
      {/* Iraqi Authority Finder Modal */}
      {showIraqiAuthorityModal && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/90 backdrop-blur-xl">
          <div className="flex-1 overflow-auto">
            <React.Suspense fallback={<LazyPanelFallback />}><AuthorFinder 
              onBack={() => setShowIraqiAuthorityModal(false)} 
              onSelectAuthor={handleInsertIraqiAuthor} 
            /></React.Suspense>
          </div>
        </div>
      )}

      <React.Suspense fallback={<LazyPanelFallback />}><ImportRecordDialog isOpen={showImportDialog} onClose={() => setShowImportDialog(false)} onImport={handleImport} /></React.Suspense>
      <React.Suspense fallback={<LazyPanelFallback />}><RecordViewerDialog open={showRecordViewer} onOpenChange={setShowRecordViewer} jsonldData={graphJsonld || { "@graph": [] }} title={recordTitle} /></React.Suspense>
    </div>
    </RecordCommentsContext.Provider>
    </PrefilledDefaultsContext.Provider>
    </BMThemeContext.Provider>
  );
}

























export { WolfMoon };
