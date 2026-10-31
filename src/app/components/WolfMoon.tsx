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
import { Toaster } from "./ui/sonner";
import {
  Save, Download, Upload, ChevronLeft, ChevronDown, ChevronRight,
  Search, BookOpen, Package, Layers, Database, FileText, Code, Braces,
  Sparkles, Book, Network, CheckCircle2, AlertCircle, AlertTriangle,
  BarChart3, Clock, Loader2, Eye, Music, Map, FileJson, Globe, User,
  Building, MapPin, Tag, Newspaper, Archive, Shield, Hash, Activity,
  Copy, ExternalLink, Zap, Settings, RefreshCw, Plus, X, Info, Home,
  Moon, Star, Orbit, Waves, Fingerprint, Terminal, Languages, Scissors, Sun, Brain,
  Sliders, ArrowRightLeft, QrCode, UserCheck, Replace, Columns, Maximize2, LayoutGrid, List
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import moonLogoWhite from "../../assets/white.png";
import moonLogoBlack from "../../assets/black.png";

// ===== OFFICIAL BIBFRAME 3.0.1 ONTOLOGY (from bibframe.rdf) =====
import { 
  getOfficialPropertiesForDomain, 
  OFFICIAL_BIBFRAME_CLASSES, 
  OFFICIAL_BIBFRAME_PROPERTIES 
} from "../../services/officialBibframeVocabulary";

// ===== CORE SERVICES =====
import { GraphStore } from "../../services/graphStore";
import { generateUri, toTurtle, toJsonLd, toRdfXml, extractTriples, validateGraphConnectivity } from "../../services/rdfGraphBuilder";
import {
  RelationshipGraph, Relationship, generateRelationshipId,
  RELATIONSHIP_DEFINITIONS, getRelationshipTypesForDomain
} from "../../services/relationshipManager";
import { validateBibframeRecord, ValidationResult as BFValidationResult } from "../../services/bibframeValidator";
import { validateInstitutionalBibframe, getValidationBadge, InstitutionalValidationResult } from "../../services/institutionalValidator";
import {
  ONTOLOGY_REGISTRY, OntologyProperty,
  getPropertiesByDomain, getCategoriesForDomain, getPropertiesByCategory
} from "../../services/ontologyRegistry";
import {
  BIBFRAME_PROPERTY_REGISTRY, getPropertiesByDomain as getRegProperties,
  getGroupsForDomain, getPropertiesByGroup, getRequiredPropertiesByDomain,
  BibframePropertyDefinition
} from "../../services/bibframePropertyRegistry";
import {
  MONOGRAPH_COMPLETE_TEMPLATE, SERIAL_TEMPLATE, MANUSCRIPT_TEMPLATE,
  MUSIC_TEMPLATE, MAP_TEMPLATE, TEMPLATE_REGISTRY,
  getAllTemplates, getTemplate, CatalogingTemplate
} from "../../services/templateEngine";
import {
  generateRecordId, mintUriSet, mintUri, mintAgentUri,
  mintContributionUri, mintProvisionUri, mintIdentifierUri,
  mintTitleUri, UriSet
} from "../../services/uriMintingService";
import {
  BIBFRAME_CORE_CLASSES, BIBFRAME_PROPERTIES, ONTOLOGY_VERSION,
  getPropertiesForClass, getRequiredProperties
} from "../../services/bibframeOntology";
import {
  AuthorityResult, ISBNData,
  searchAllAuthorities, searchLanguages, searchCarriers,
  searchMediaTypes, searchCountries, searchRelators,
  COMMON_RELATORS, lookupISBN
} from "../../services/authoritySearch";

// ===== APP SERVICES =====
import { getPropertiesForDomain } from "../services/bibframeOntologyEngine";
import { buildBibframeGraph, generateUri as genUri } from "../services/graphBuilder";
import { generateMARC } from "../services/marcGenerator";
import {
  buildW3CJsonLd, validateW3CJsonLd, jsonLdToTurtle, jsonLdToNTriples,
  BIBFRAME_JSONLD_CONTEXT, JsonLdValidationResult
} from "../../services/w3cJsonLdBuilder";

// ===== APP UTILS =====
import { realLocExamples } from "../utils/realLocExamples";
import { saveRecord } from "../utils/recordStorageBackend";

// ===== COMPONENTS =====
import { OntologyField } from "./ontology/OntologyField";
import { OPACPreview } from "./ontology/OPACPreview";
import WolfMoonStandaloneOpac from "./WolfMoonStandaloneOpac";
import { MindMapPreview } from "./ontology/MindMapPreview";
import { SolarSystemMindMap } from "./SolarSystemMindMap";
import { ImportRecordDialog } from "./ontology/ImportRecordDialog";
import AuthorFinder from "./AuthorFinder";
import { OntologyDrivenFormRenderer } from "./cataloging/OntologyDrivenFormRenderer";
import { ValidationPanel, validateGraph, ValidationResult } from "./cataloging/ValidationPanel";
import { RecordViewerDialog } from "./cataloging/RecordViewerDialog";
import { CatalogingWizard, WizardStep } from "./cataloging/CatalogingWizard";
import { AuthoritySelect, AuthorityMultiSelect } from "./cataloging/AuthoritySelect";
import { AuthoritySearchDialog } from "./AuthoritySearchDialog";
import { AuthorityGraph } from "./AuthorityGraph";
import { LinkedDataDiscovery } from "./LinkedDataDiscovery";
import { MarcView } from "./RecordView/MarcView";
import { RdfView } from "./RecordView/RdfView";
import { Marc21Viewer } from "./Marc21Viewer";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { BlueMoonAIPanel } from "./BlueMoonAIPanel";

// ===== CONTEXTS =====
import { useAuth } from "../contexts/AuthContext";
import { useThemeSafe } from "../hooks/useThemeSafe";
import { BIBFRAMERecord } from "../types/bibframe";

// ===== ASSETS & CONFIG =====
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import {
  generateCutter, parseCallNumber, formatCallNumber,
  EXAMPLE_CALL_NUMBERS, EXAMPLE_NAMES,
  type CutterResult, type CallNumberParts,
} from "./LCCutterEngine";
import {
  fetchLanguageIndex, transliterate as ssTransliterateLocal,
  type SSLanguageIndex,
} from "./ScriptShifterEngine";
import moonLogo from "figma:asset/448923f9298ec547f27dd322785433298cd5ac34.png";
import "../../styles/glassmorphism.css";

// ===== MARVA & BIBFRAME PRIMER EXTENSIONS =====
import {
  MarvaPreferencesModal, DEFAULT_MARVA_PREFERENCES, MarvaPreferences
} from "./marva/MarvaPreferencesModal";
import { MarvaToolsModal } from "./marva/MarvaToolsModal";
import { MarvaHubEditor } from "./marva/MarvaHubEditor";
import { MarvaRemergeMarc } from "./marva/MarvaRemergeMarc";
import { toBibframeJsonLdString } from '../../services/bibframeNormalizer';
import {
  BibframeHub, generateHubAAP, normalizeAAP, createQuickHubStub, SAMPLE_LC_HUBS
} from "../../services/hubService";
import {
  MARVA_DIACRITICS, MARVA_TEXT_MACROS, MarvaHistoryLog, MarvaHistoryEntry,
  normalizeBCP47
} from "../../services/marvaService";


// ============================== TYPES ==============================

type OutputTab = "editor" | "jsonld" | "w3c-jsonld" | "rdf-xml" | "turtle" | "ntriples" | "marc" | "marc21-viewer" | "triples" | "opac" | "mindmap" | "validation" | "relationships" | "authority-graph" | "discovery" | "scriptshifter" | "lc-cutter" | "ai-engine" | "hubs" | "remerge-marc" | "marva-tools";
type MarvaLoadType = "work-instance" | "work-only" | "instance-only" | "hub-only" | "item-only";
type SaveStatus = "saved" | "unsaved" | "saving" | "error";

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
  onRecordSaved?: () => void;
}

// ============================== THEME CONSTANTS ==============================

type GlassTheme = "dark" | "legacy" | "classic";

const BM_DARK = {
  bg: "radial-gradient(circle at 50% 0%, rgba(30, 58, 138, 0.35) 0%, rgba(10, 15, 30, 0.95) 45%, #030408 100%)",
  navBg: "rgba(255, 255, 255, 0.12)",
  navBorder: "rgba(255, 255, 255, 0.20)",
  cardBg: "rgba(255, 255, 255, 0.12)",
  cardBorder: "rgba(255, 255, 255, 0.20)",
  cardHover: "rgba(255, 255, 255, 0.18)",
  accent: "#38bdf8",
  accentDim: "#60a5fa",
  accentGlow: "rgba(56, 189, 248, 0.25)",
  accentBorder: "rgba(255, 255, 255, 0.25)",
  secondary: "#c084fc",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
  text: "#ffffff",
  textMuted: "rgba(255, 255, 255, 0.85)",
  textDim: "rgba(255, 255, 255, 0.60)",
  inputBg: "rgba(0, 0, 0, 0.35)",
  inputBorder: "rgba(255, 255, 255, 0.20)",
};

const BM_LEGACY = {
  bg: "transparent",
  navBg: "rgba(255,255,255,0.8)",
  navBorder: "rgba(255,255,255,0.5)",
  cardBg: "rgba(255,255,255,0.75)",
  cardBorder: "rgba(255,255,255,0.4)",
  cardHover: "rgba(0,0,0,0.05)",
  accent: "#3b82f6",
  accentDim: "#2563eb",
  accentGlow: "rgba(59,130,246,0.12)",
  accentBorder: "rgba(59,130,246,0.3)",
  secondary: "#1e40af",
  success: "#059669",
  warning: "#d97706",
  danger: "#dc2626",
  text: "#000000",
  textMuted: "#374151",
  textDim: "#6b7280",
  inputBg: "rgba(255,255,255,0.5)",
  inputBorder: "rgba(255,255,255,0.4)",
};

const BM_CLASSIC = {
  bg: "#ffffff",
  navBg: "#ffffff",
  navBorder: "#e5e7eb",
  cardBg: "#ffffff",
  cardBorder: "#e5e7eb",
  cardHover: "#f9fafb",
  accent: "#2563eb",
  accentDim: "#3b82f6",
  accentGlow: "rgba(37,99,235,0.08)",
  accentBorder: "#bfdbfe",
  secondary: "#1d4ed8",
  success: "#16a34a",
  warning: "#ca8a04",
  danger: "#dc2626",
  text: "#111827",
  textMuted: "#4b5563",
  textDim: "#9ca3af",
  inputBg: "#f9fafb",
  inputBorder: "#d1d5db",
};

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  "monograph-complete": <BookOpen className="h-4 w-4" />,
  serial: <Newspaper className="h-4 w-4" />,
  manuscript: <Archive className="h-4 w-4" />,
  music: <Music className="h-4 w-4" />,
  map: <Map className="h-4 w-4" />,
};

type BMTheme = typeof BM_DARK;
const BMThemeContext = React.createContext<BMTheme>(BM_DARK);
function useBMTheme() { return React.useContext(BMThemeContext); }

function getPropertyValue(data: any, uri: string): any {
  if (!data) return '';
  const key = uri.split("/").pop() || "";
  if (data[key] !== undefined && data[key] !== null && data[key] !== '') return data[key];
  if (data[`bf:${key}`] !== undefined && data[`bf:${key}`] !== null && data[`bf:${key}`] !== '') return data[`bf:${key}`];
  if (data[uri] !== undefined && data[uri] !== null && data[uri] !== '') return data[uri];

  if (uri.includes('classificationLcc')) return data['bf:classification'] || data['classification'] || '';
  if (uri.includes('classificationDdc')) return data['classificationDdc'] || '181.07';
  if (uri.includes('subject/topical')) return data['subjectTopical'] || data['bf:subject'] || data['subject'] || '';
  if (uri.includes('subject/geographic')) return data['subjectGeographic'] || data['geographicCoverage'] || '';
  if (uri.includes('subject/name')) return data['subjectName'] || data['creator'] || '';
  if (uri.includes('geographicAreaCode')) return data['geographicAreaCode'] || '';
  if (uri.includes('geographicCoverage')) return data['geographicCoverage'] || '';
  if (uri.includes('intendedAudience')) return data['intendedAudience'] || '';
  if (uri.includes('contribution/primary')) return data['creator'] || data['contribution'] || '';
  if (uri.includes('contribution/additional')) return data['additionalContributors'] || '';
  if (uri.includes('seriesStatement')) return data['seriesStatement'] || data['hasSeries'] || '';
  if (uri.includes('illustrativeContent')) return data['illustrativeContent'] || '';
  if (uri.includes('supplementaryContent')) return data['supplementaryContent'] || '';
  if (uri.includes('issuance')) return data['issuance'] || data['bf:issuance'] || '';

  if (key === 'title') return data['bf:title'] || data['mainTitle'] || data['title'] || '';
  if (key === 'contribution') return data['bf:contribution'] || data['creator'] || data['contribution'] || '';
  if (key === 'subject') return data['bf:subject'] || data['subject'] || '';
  if (key === 'classification') return data['bf:classification'] || data['classification'] || '';
  if (key === 'language') return data['bf:language'] || data['language'] || '';
  if (key === 'provisionActivity' || key === 'publication') return data['bf:provisionActivity'] || data['publicationDate'] || data['provisionActivity'] || '';
  if (key === 'extent') return data['bf:extent'] || data['extent'] || '';
  if (key === 'summary') return data['bf:summary'] || data['summary'] || '';
  if (key === 'note') return data['bf:note'] || data['note'] || '';
  if (key === 'originDate') return data['bf:originDate'] || data['originDate'] || data['date'] || '';
  if (key === 'originPlace') return data['bf:originPlace'] || data['originPlace'] || data['place'] || '';
  if (key === 'genreForm') return data['bf:genreForm'] || data['genreForm'] || '';
  if (key === 'identifiedBy') return data['bf:identifiedBy'] || data['identifiedBy'] || data['identifier'] || data['lccn'] || '';
  if (key === 'dimensions') return data['bf:dimensions'] || data['dimensions'] || '';
  if (key === 'media') return data['bf:media'] || data['media'] || data['mediaType'] || '';
  if (key === 'carrier') return data['bf:carrier'] || data['carrier'] || data['carrierType'] || '';
  if (key === 'content') return data['bf:content'] || data['content'] || data['contentType'] || '';
  if (key === 'editionStatement') return data['bf:editionStatement'] || data['editionStatement'] || data['edition'] || '';
  if (key === 'responsibilityStatement') return data['bf:responsibilityStatement'] || data['responsibilityStatement'] || data['statementOfResponsibility'] || '';
  if (key === 'tableOfContents') return data['bf:tableOfContents'] || data['tableOfContents'] || '';
  if (key === 'hasSeries') return data['bf:hasSeries'] || data['hasSeries'] || '';
  if (key === 'copyrightDate') return data['bf:copyrightDate'] || data['copyrightDate'] || '';
  if (key === 'accessibilityContent') return data['bf:accessibilityContent'] || data['accessibilityContent'] || '';
  if (key === 'notation') return data['bf:notation'] || data['notation'] || '';
  if (key === 'governmentPublication') return data['bf:governmentPublication'] || data['governmentPublication'] || '';
  if (key === 'dissertation') return data['bf:dissertation'] || data['dissertation'] || '';
  if (key === 'acquisitionSource') return data['bf:acquisitionSource'] || data['acquisitionSource'] || '';
  if (key === 'immediateAcquisition') return data['bf:immediateAcquisition'] || data['immediateAcquisition'] || '';
  if (key === 'heldBy') return data['bf:heldBy'] || data['heldBy'] || '';
  if (key === 'shelfMark') return data['bf:shelfMark'] || data['shelfMark'] || '';
  if (key === 'expressionOf') return data['bf:expressionOf'] || data['expressionOf'] || '';
  if (key === 'hasExpression') return data['bf:hasExpression'] || data['hasExpression'] || '';
  if (key === 'hasInstance') return data['bf:hasInstance'] || data['hasInstance'] || '';
  if (key === 'instanceOf') return data['bf:instanceOf'] || data['instanceOf'] || '';
  if (key === 'partOf') return data['bf:partOf'] || data['partOf'] || '';
  if (key === 'hasPart') return data['bf:hasPart'] || data['hasPart'] || '';
  if (key === 'relatedTo') return data['bf:relatedTo'] || data['relatedTo'] || '';
  if (key === 'translationOf') return data['bf:translationOf'] || data['translationOf'] || '';
  if (key === 'originalVersion') return data['bf:originalVersion'] || data['originalVersion'] || '';
  if (key === 'hasDerivative') return data['bf:hasDerivative'] || data['hasDerivative'] || '';
  if (key === 'adminMetadata') return data['bf:adminMetadata'] || data['adminMetadata'] || '';
  return '';
}

// ============================== MAIN COMPONENT ==============================

export default function WolfMoon({
  onBack, initialWork, initialInstance, onRecordSaved
}: WolfMoonProps) {
  const { t, i18n } = useTranslation();
  const { username, user } = useAuth();
  const isSuperAdmin = username?.toLowerCase() === 'isaac' || user?.role === 'admin';
  const [language, setLanguage] = useState<"en" | "ar">(i18n.language as "en" | "ar");

  // ===== GLASS THEME =====
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
  const [selectedTemplate, setSelectedTemplate] = useState<string>("monograph-complete");
  const template = useMemo(() => getTemplate(selectedTemplate) || MONOGRAPH_COMPLETE_TEMPLATE, [selectedTemplate]);

  // ===== ACTIVE TAB =====
  const [activeTab, setActiveTab] = useState<OutputTab>("editor");

  // ===== URI MINTING =====
  const [recordId] = useState(() => generateRecordId());
  const [uriSet] = useState<UriSet>(() => {
    const defaultSet = mintUriSet(recordId);
    if (initialWork?.['@id']) defaultSet.work = initialWork['@id'];
    if (initialInstance?.['@id']) defaultSet.instance = initialInstance['@id'];
    return defaultSet;
  });

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
  const [fieldViewMode, setFieldViewMode] = useState<'both' | 'categories' | 'standard'>('both');
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

  // ===== DIALOGS =====
  const [showAuthoritySearch, setShowAuthoritySearch] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showIraqiAuthorityModal, setShowIraqiAuthorityModal] = useState(false);

  const handleInsertIraqiAuthor = (author: any, targetType: 'author' | 'contributor' | 'subject' = 'author') => {
    const authorName = author.name || author.primaryName || author.preferredName || "Unknown Author";
    const authorUri = author.moonUri || `http://moon.local/author/${encodeURIComponent(authorName)}`;

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
  const [activeHub, setActiveHub] = useState<BibframeHub | null>(SAMPLE_LC_HUBS[0]);
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
            localStorage.setItem(FIELD_TEMPLATES_KEY, JSON.stringify(data.templates));
          } else if (data.success && data.templates.length === 0) {
            // Backend is empty — seed it with any localStorage templates
            const localTemplates = (() => { try { return JSON.parse(localStorage.getItem(FIELD_TEMPLATES_KEY) || "[]"); } catch { return []; } })();
            if (localTemplates.length > 0) {
              fetch(TEMPLATES_API, {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${publicAnonKey}` },
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

  const persistFieldTemplates = useCallback((templates: FieldTemplate[]) => {
    setSavedFieldTemplates(templates);
    localStorage.setItem(FIELD_TEMPLATES_KEY, JSON.stringify(templates));
    // Persist to backend (fire-and-forget with error logging)
    fetch(TEMPLATES_API, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${publicAnonKey}` },
      body: JSON.stringify({ templates }),
    }).then(res => {
      if (!res.ok) console.log("Backend field template save failed:", res.status);
    }).catch(err => console.log("Backend field template save error:", err));
  }, []);

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
    setTimeout(() => regenerateRDF(), 100);
  }, [uriSet, graphStore, enableExpression, t]);

  // ===== TEMPLATE-AWARE PROPERTIES =====
  const templateWorkGroups = useMemo(() => getGroupsForDomain("Work"), []);
  const templateInstanceGroups = useMemo(() => getGroupsForDomain("Instance"), []);
  const templateItemGroups = useMemo(() => getGroupsForDomain("Item"), []);
  const workRequiredProps = useMemo(() => getRequiredPropertiesByDomain("Work"), []);
  const instanceRequiredProps = useMemo(() => getRequiredPropertiesByDomain("Instance"), []);

  // ============================== INITIALIZATION ==============================

  useEffect(() => {
    graphStore.setNode(uriSet.work, { "@id": uriSet.work, "@type": "bf:Work" });
    graphStore.setNode(uriSet.instance, { "@id": uriSet.instance, "@type": "bf:Instance" });
    graphStore.setNode(uriSet.item, { "@id": uriSet.item, "@type": "bf:Item" });

    if (template.enableExpression) {
      setEnableExpression(true);
      graphStore.setNode(uriSet.expression, { "@id": uriSet.expression, "@type": "bf:Expression" });
      graphStore.createWEMILinks(uriSet.work, uriSet.expression, uriSet.instance, uriSet.item);
    } else {
      graphStore.createWEMILinks(uriSet.work, undefined, uriSet.instance, uriSet.item);
    }

    const adminUri = uriSet.admin;
    graphStore.setNode(adminUri, {
      "@id": adminUri, "@type": "bf:AdminMetadata",
      "bf:creationDate": new Date().toISOString().split("T")[0],
      "bf:source": { "@id": "https://moonlib.org", "rdfs:label": "Moon Library System — Blue Moon" },
      "bf:descriptionConventions": { "@id": "http://id.loc.gov/vocabulary/descriptionConventions/rda", "rdfs:label": "RDA" },
      "bf:descriptionLanguage": { "@id": "http://id.loc.gov/vocabulary/languages/eng", "rdfs:label": "English" },
      "bf:generationProcess": `Blue Moon v1.0 (${template.name})`,
      "bf:catalogerId": username || "anonymous",
    });
    regenerateRDF();
  }, []);

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
      setWorkData(initialWork);
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
      setInstanceData(initialInstance);
    }
  }, [initialInstance]);

  useEffect(() => {
    const currentWork = graphStore.getNode(uriSet.work) || {};
    graphStore.setNode(uriSet.work, { ...currentWork, ...workData, "@id": uriSet.work, "@type": "bf:Work" });
    const currentInstance = graphStore.getNode(uriSet.instance) || {};
    graphStore.setNode(uriSet.instance, { ...currentInstance, ...instanceData, "@id": uriSet.instance, "@type": "bf:Instance" });
    const timer = setTimeout(() => regenerateRDF(), 300);
    return () => clearTimeout(timer);
  }, [workData, instanceData]);

  // ============================== GRAPH ENGINE ==============================

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
      setTimeout(() => regenerateRDF(), 500);
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
    setTimeout(() => regenerateRDF(), 500);
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
        try { setGraphRdfXml(toRdfXml(w3cDoc || jsonld)); } catch { setGraphRdfXml(""); }
      } catch (e) { console.error("W3C JSON-LD build error:", e); }
    } catch (error) { console.error("Graph RDF generation error:", error); }
  };

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
      setInstanceData((prev: any) => {
        const updated = {
          ...prev,
          [propertyName]: cleanValue,
          [bfKey]: cleanValue,
          [unprefixed]: cleanValue,
        };
        if (data.numberOfPages) updated["bf:extent"] = { value: `${data.numberOfPages} pages`, "@type": "bf:Extent" };
        if (data.publishers?.length) {
          updated["bf:provisionActivity"] = {
            "@type": "bf:Publication",
            "bf:agent": { "@type": "bf:Organization", "rdfs:label": data.publishers[0] },
            ...(data.publishDate ? { "bf:date": data.publishDate.match(/\d{4}/)?.[0] || data.publishDate } : {}),
          };
        }
        return updated;
      });
      setWorkData((prev: any) => {
        const updated = { ...prev };
        if (data.title) {
          updated["bf:title"] = {
            "@type": "bf:Title", "bf:mainTitle": data.title, mainTitle: data.title,
            ...(data.subtitle ? { "bf:subtitle": data.subtitle, subtitle: data.subtitle } : {}),
          };
        }
        return updated;
      });
      return;
    }
    setInstanceData((prev: any) => ({
      ...prev,
      [propertyName]: value,
      [bfKey]: value,
      [unprefixed]: value,
    }));
    setSaveStatus("unsaved");
  }, []);

  // ============================== RELATIONSHIPS ==============================

  const addRelationship = (domain: "Work" | "Instance" = "Work") => {
    const types = getRelationshipTypesForDomain(domain);
    setRelationships(prev => [...prev, { id: generateRelationshipId(), type: types[0] || "relatedTo", sourceUri: domain === "Work" ? uriSet.work : uriSet.instance, targetUri: "", label: "" }]);
    setSaveStatus("unsaved");
  };
  const updateRelationship = (id: string, field: string, value: any) => {
    setRelationships(prev => prev.map(rel => rel.id === id ? { ...rel, [field]: value } : rel));
    setSaveStatus("unsaved");
    setTimeout(() => regenerateRDF(), 500);
  };
  const removeRelationship = (id: string) => {
    setRelationships(prev => prev.filter(rel => rel.id !== id));
    setSaveStatus("unsaved");
    setTimeout(() => regenerateRDF(), 500);
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
    const contribution = { "@type": "bf:Contribution", "bf:agent": { "@id": entity.identifiers?.loc ? `http://id.loc.gov/authorities/names/${entity.identifiers.loc}` : entity.id, "@type": "bf:Person", "rdfs:label": entity.label }, "bf:role": { "@id": "http://id.loc.gov/vocabulary/relators/aut", "rdfs:label": "Author" } };
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
  const handleImport = (importedWorkData: any, importedInstanceData: any) => {
    setWorkData({ ...importedWorkData, "@id": uriSet.work });
    setInstanceData({ ...importedInstanceData, "@id": uriSet.instance, "bf:instanceOf": { "@id": uriSet.work } });
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

  const handleSave = async () => {
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
        metadata: {
          catalogingLanguage: language, descriptionConventions: "rda",
          catalogingInterface: "Blue Moon",
          resourceType: `Blue Moon (${template.name})`,
          templateId: selectedTemplate, recordId, uriSet,
          ontologyVersion: ONTOLOGY_VERSION.version,
          createdAt: new Date().toISOString(),
          catalogerId: username || "anonymous",
          hiddenFields: Array.from(hiddenFields),
          status: (username?.toLowerCase() === "isaac" || username?.toLowerCase() === "admin") ? "complete" : "pending-review",
          catalogerRole: (username?.toLowerCase() === "isaac" || username?.toLowerCase() === "admin") ? "super-admin" : "cataloger"
        },
      };
      const initialStatus = (username?.toLowerCase() === "isaac" || username?.toLowerCase() === "admin") ? "complete" : "pending-review";
      await saveRecord(record, username || "Anonymous");
      setSaveStatus("saved");
      if (initialStatus === "pending-review") {
        toast.info(language === "ar" ? "تم حفظ التسجيلة وهي قيد المراجعة بانتظار اعتماد المشرف العام (isaac)" : "Record saved! Status: Pending review by Super Admin (isaac)", { description: title });
      } else {
        toast.success(language === "ar" ? "تم حفظ التسجيلة واعتمادها في الفهرس العام!" : "Record saved and approved into catalog!", { description: title });
      }
      if (onRecordSaved) onRecordSaved();
    } catch (error) {
      console.error("Save error:", error);
      setSaveStatus("error");
      toast.error("Save failed", { description: error instanceof Error ? error.message : "Unknown error" });
    }
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
    <div
      className={`h-screen flex flex-col overflow-hidden relative ${gradientClass} ${!isClassic ? "dark" : ""}`}
      dir={language === "ar" ? "rtl" : "ltr"}
      style={{
        background: isClassic ? "#ffffff" : "#060913",
        color: isClassic ? "#111827" : "#ffffff",
      }}
    >
      {/* ===== 1. INTERACTIVE 3D SPLINE SCENE BACKGROUND ===== */}
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

      {/* ===== 2. FROSTED GLASS BACKDROP OVERLAY ===== */}
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background: 'rgba(255, 255, 255, 0.40)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      />

      <Toaster position={language === "ar" ? "top-left" : "top-right"} />

      {/* ===== HERO NAVBAR ===== */}
      <header
        className="relative z-20 px-6 py-4 glass-luxury-panel m-3 mb-0 rounded-2xl"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="hover:scale-105 active:scale-95 transition-all flex items-center gap-2 px-4 py-2 text-xs font-bold text-white cursor-pointer shadow-xl"
                style={{
                  background: 'rgba(255, 255, 255, 0.21)',
                  backdropFilter: 'blur(9px) saturate(1.5) brightness(1.1)',
                  WebkitBackdropFilter: 'blur(36px) saturate(1.8) brightness(1.15) contrast(1.05)',
                  borderRadius: '120px',
                  boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.15), inset 1.5px 1.5px 0 rgba(255, 255, 255, 0.5), inset 0 0 12px rgba(255, 255, 255, 0.2), 0 8px 32px rgba(0, 0, 0, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.4)',
                }}
                title="Return to Dashboard"
              >
                <Home className="h-4 w-4 text-white drop-shadow" />
                <span className="text-xs font-bold">{t("back") || "Dashboard"}</span>
              </button>
            )}
            <div className="flex items-center gap-3.5">
              <div className="relative flex items-center justify-center">
                <img src={isLight ? moonLogoBlack : moonLogoWhite} alt="Moon Logo" className="h-10 w-auto object-contain drop-shadow-lg" />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight flex items-center gap-2 text-white">
                  <span>MOON</span>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-white/20 border border-white/30 text-white font-bold uppercase tracking-wider">
                    Studio
                  </span>
                </h1>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap justify-end">
            {/* Language Toggle */}
            <button
              type="button"
              onClick={toggleLanguage}
              className="glass-bubble-pill flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold cursor-pointer"
            >
              <Globe className="h-3.5 w-3.5 text-cyan-300" />
              <span>{language === "en" ? "عربي" : "EN"}</span>
            </button>

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
              className="glass-bubble-pill flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold cursor-pointer transition-all"
              style={{
                borderColor: hiddenFields.size > 0 ? "rgba(251,191,36,0.8)" : undefined,
                color: hiddenFields.size > 0 ? "#fbbf24" : undefined,
                opacity: isSuperAdmin ? 1 : 0.85,
              }}
              title={!isSuperAdmin ? (language === "ar" ? "مخصص للمشرف العام إسحاق فقط" : "Super Admin Isaac only") : undefined}
            >
              <Settings className="h-3.5 w-3.5" />
              <span>{hiddenFields.size > 0 ? `${hiddenFields.size} ${t("fieldsHidden")}` : t("customTemplates")}</span>
              {!isSuperAdmin && <Lock className="h-2.5 w-2.5 text-white/50" />}
            </button>

            

            {/* Institutional Score Badge */}
            {institutionalValidation && (
              <div
                className="glass-bubble-pill flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold"
                style={{
                  color: institutionalValidation.score >= 85 ? "#34d399" : institutionalValidation.score >= 50 ? "#fbbf24" : "#f87171",
                }}
              >
                <Shield className="h-3.5 w-3.5" />
                <span>{getValidationBadge(institutionalValidation)} ({institutionalValidation.score}/100)</span>
              </div>
            )}

            <BMSaveStatus status={saveStatus} />
            <input
              type="text"
              value={recordTitle}
              onChange={(e) => { setRecordTitle(e.target.value); setSaveStatus("unsaved"); }}
              className="glass-bubble-pill px-4 py-1.5 text-xs font-semibold focus:outline-none placeholder-white/50 text-white"
              style={{ width: "190px" }}
              placeholder={t("recordTitle")}
            />
          </div>
        </div>

        {/* Template Bar & Quick Stats */}
        <div className="max-w-7xl mx-auto mt-3 pt-3 border-t border-white/15 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {getAllTemplates().map(tmpl => (
              <button
                type="button"
                key={tmpl.id}
                onClick={() => setSelectedTemplate(tmpl.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${selectedTemplate === tmpl.id ? "glass-bubble-pill bg-white/30 text-white shadow-md" : "glass-card text-white/80 hover:text-white"}`}
              >
                {TEMPLATE_ICONS[tmpl.id]}
                <span>{tmpl.name}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {[
              { icon: <Database className="h-3.5 w-3.5" />, label: `${graphStats.nodeCount} ${t("nodes")}`, color: "#38bdf8" },
              { icon: <Network className="h-3.5 w-3.5" />, label: `${tripleCount} ${t("triples")}`, color: "#c084fc" },
              { icon: <Activity className="h-3.5 w-3.5" />, label: `${completionScore}%`, color: "#34d399" },
              {
                icon: connectivity.connected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />,
                label: connectivity.connected ? t("connectedLabel") : `${connectivity.orphans.length} ${t("orphans")}`,
                color: connectivity.connected ? "#34d399" : "#fbbf24"
              },
            ].map((stat, i) => (
              <span
                key={i}
                className="glass-bubble-pill flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-white"
              >
                {stat.icon}
                <span>{stat.label}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="max-w-7xl mx-auto mt-3 flex items-center gap-2 flex-wrap">
          {/* Glass Save Button */}
          <button
            type="button"
            onClick={handleSave}
            className="hover:scale-105 active:scale-95 transition-all flex items-center gap-2 px-5 py-2 text-xs font-black text-white cursor-pointer shadow-xl"
            style={{
              background: 'rgba(255, 255, 255, 0.21)',
              backdropFilter: 'blur(9px) saturate(1.5) brightness(1.1)',
              WebkitBackdropFilter: 'blur(36px) saturate(1.8) brightness(1.15) contrast(1.05)',
              borderRadius: '120px',
              boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.15), inset 1.5px 1.5px 0 rgba(255, 255, 255, 0.5), inset 0 0 12px rgba(255, 255, 255, 0.2), 0 8px 32px rgba(0, 0, 0, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.4)',
            }}
          >
            <Save className="h-3.5 w-3.5 text-white drop-shadow" />
            <span>{t("save")}</span>
          </button>

          {/* Iraqi Authority Finder Button */}
          <button
            type="button"
            onClick={() => setShowIraqiAuthorityModal(true)}
            className="hover:scale-105 active:scale-95 transition-all flex items-center gap-2 px-5 py-2 text-xs font-black text-white cursor-pointer shadow-xl"
            style={{
              background: 'rgba(255, 255, 255, 0.21)',
              backdropFilter: 'blur(9px) saturate(1.5) brightness(1.1)',
              WebkitBackdropFilter: 'blur(36px) saturate(1.8) brightness(1.15) contrast(1.05)',
              borderRadius: '120px',
              boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.15), inset 1.5px 1.5px 0 rgba(255, 255, 255, 0.5), inset 0 0 12px rgba(255, 255, 255, 0.2), 0 8px 32px rgba(0, 0, 0, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.4)',
            }}
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-300 drop-shadow" />
            <span>🇮🇶 Iraqi Authority Finder</span>
          </button>


          {[
            { onClick: handleResetAll, icon: <RefreshCw className="h-3.5 w-3.5" />, label: t("reset") || "Reset", danger: true },
            { onClick: () => setShowImportDialog(true), icon: <Upload className="h-3.5 w-3.5" />, label: t("import") },
            { onClick: () => downloadFile(toBibframeJsonLdString(w3cJsonLd || graphJsonld || graph), `${recordId}-w3c.jsonld`, "application/ld+json"), icon: <Download className="h-3.5 w-3.5" />, label: t("w3cJsonLd") },
          ].map((btn, i) => (
            <button
              type="button"
              key={i}
              onClick={btn.onClick}
              className="glass-bubble-pill flex items-center gap-1.5 px-4 py-2 text-xs font-bold transition-all cursor-pointer text-white"
              style={btn.danger ? { borderColor: 'rgba(248,113,113,0.5)', color: '#fca5a5' } : undefined}
            >
              {btn.icon}
              <span>{btn.label}</span>
            </button>
          ))}
          
          <button
            type="button"
            onClick={() => downloadFile(graphRdfXml || toRdfXml({ "@graph": [workData, instanceData] }), `${recordId}.rdf`, "application/rdf+xml")}
            className="glass-bubble-pill flex items-center gap-1.5 px-4 py-2 text-xs font-bold cursor-pointer text-emerald-300 border-emerald-500/30 hover:border-emerald-400"
          >
            <Download className="h-3.5 w-3.5 text-emerald-400" />
            <span>RDF/XML</span>
          </button>

          {w3cTurtle && (
            <button
              type="button"
              onClick={() => downloadFile(w3cTurtle, `${recordId}.ttl`, "text/turtle")}
              className="glass-bubble-pill flex items-center gap-1.5 px-4 py-2 text-xs font-bold cursor-pointer text-white"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{t("turtle")}</span>
            </button>
          )}
          {w3cNTriples && (
            <button
              type="button"
              onClick={() => downloadFile(w3cNTriples, `${recordId}.nt`, "application/n-triples")}
              className="glass-bubble-pill flex items-center gap-1.5 px-4 py-2 text-xs font-bold cursor-pointer text-white"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{t("nTriples")}</span>
            </button>
          )}
        </div>

        </header>

      {/* ===== SEGMENTED OUTPUT TABS (Frosted Pill System) ===== */}
      <nav
        className="relative z-10 px-6 py-2"
      >
        <div className="max-w-7xl mx-auto flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {([
            { key: "editor" as OutputTab, icon: <Layers className="h-3.5 w-3.5" />, label: t("bibframeEditor"), color: "#38bdf8" },
            { key: "w3c-jsonld" as OutputTab, icon: <Shield className="h-3.5 w-3.5" />, label: `${t("w3cJsonLd")} ${w3cValidation?.valid ? "✓" : ""}`, color: "#34d399" },
            { key: "jsonld" as OutputTab, icon: <Braces className="h-3.5 w-3.5" />, label: t("rawJsonLd"), color: "#22d3ee" },
            
            { key: "rdf-xml" as OutputTab, icon: <Code className="h-3.5 w-3.5" />, label: "RDF/XML", color: "#10b981" },
            { key: "turtle" as OutputTab, icon: <Code className="h-3.5 w-3.5" />, label: t("turtle"), color: "#a78bfa" },
            { key: "ntriples" as OutputTab, icon: <FileText className="h-3.5 w-3.5" />, label: t("nTriples"), color: "#fb923c" },
            { key: "marc21-viewer" as OutputTab, icon: <BookOpen className="h-3.5 w-3.5" />, label: "MARC 21 View", color: "#f43f5e" }
          ] as const).map(tab => (
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
              className={`glass-bubble-pill cursor-pointer px-4 py-1.5 text-xs font-bold flex items-center gap-1.5 shrink-0 ${activeTab === tab.key ? "bg-white/30 border-white text-white shadow-lg" : "text-white/70 hover:text-white"}`}
            >
              <span style={{ color: tab.color }}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* ===== MAIN CONTENT ===== */}
      <div className="flex-1 overflow-auto p-6 relative"
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

        {/* ===== BIBFRAME EDITOR ===== */}
        {activeTab === "editor" && (
          <div className="space-y-4">

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
              <MarvaHubEditor
                currentHub={activeHub}
                onSelectHub={(h) => {
                  setActiveHub(h);
                  updateWorkProperty("bf:expressionOf", h.uri);
                }}
                onSaveHub={(h) => setActiveHub(h)}
                isDark={!isLight}
              />
            ) : (
            <>
            {/* Field Display Mode Selector: Category Cards (Img 2) vs Standard MARC (Img 1) */}
            <div 
              className="flex items-center justify-between px-5 py-3 rounded-2xl mb-6 flex-wrap gap-3"
              style={{
                borderRadius: '20px',
                background: 'rgba(255, 255, 255, 0.22)',
                backdropFilter: 'blur(16px) saturate(1.5) brightness(1.1)',
                WebkitBackdropFilter: 'blur(36px) saturate(1.8) brightness(1.15) contrast(1.05)',
                border: '1px solid rgba(255, 255, 255, 0.45)',
                boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.2), inset 1.5px 1.5px 0 rgba(255, 255, 255, 0.5), inset 0 0 12px rgba(255, 255, 255, 0.25), 0 8px 32px rgba(0, 0, 0, 0.15)',
              }}
            >
              <div className="flex items-center gap-2.5">
                <Sliders className="h-4 w-4 text-sky-400" />
                <span className="text-xs font-bold text-white tracking-wide">
                  {language === "ar" ? "نوع ونمط عرض الحقول:" : "Field Layout Style:"}
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
                  title="عرض بطاقات الحقول المصنفة"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>{language === "ar" ? "أقسام البطاقات" : "Category Cards"}</span>
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

            <div className={
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
                    hiddenFields={hiddenFields} onHideField={hideField} isLight={isLight} />
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
                  <OntologyDrivenFormRenderer entityType="Instance" nodeUri={uriSet.instance} graphStore={graphStore} data={instanceData} onChange={handlePropertyChange}
                    hiddenFields={hiddenFields} onHideField={hideField} isLight={isLight} />
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
            </div>
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
                  { label: t("ontology"), value: `BIBFRAME ${ONTOLOGY_VERSION.version}` },
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

        {/* ===== W3C JSON-LD ===== */}
        {activeTab === "w3c-jsonld" && (
          <div className="space-y-4">
            {w3cValidation && <BMValidationBanner validation={w3cValidation} />}
            <BMCard>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-black flex items-center gap-2" style={{ color: BM.text }}>
                  <Shield className="h-5 w-5" style={{ color: BM.success }} /> W3C-Compliant JSON-LD
                </h3>
                <div className="flex gap-2">
                  <BMSmallBtn onClick={() => copyToClipboard(JSON.stringify(w3cJsonLd, null, 2))} icon={<Copy className="h-3.5 w-3.5" />} label="Copy" />
                  <BMSmallBtn onClick={() => downloadFile(toBibframeJsonLdString(w3cJsonLd), `${recordId}-w3c.jsonld`, "application/ld+json")} icon={<Download className="h-3.5 w-3.5" />} label="Download" />
                </div>
              </div>
              <pre className="p-5 rounded-xl overflow-auto text-sm max-h-[calc(100vh-420px)] font-mono leading-relaxed"
                style={{ background: "#1e1e2e", border: "1px solid rgba(120,130,180,0.12)", color: "#a3e635" }}>
                {w3cJsonLd ? JSON.stringify(w3cJsonLd, null, 2) : "Fill in the form to generate W3C-compliant JSON-LD..."}
              </pre>
            </BMCard>
          </div>
        )}

        {/* ===== RAW JSON-LD ===== */}
        {activeTab === "jsonld" && (
          <BMCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black flex items-center gap-2" style={{ color: BM.text }}>
                <Braces className="h-5 w-5" style={{ color: "#0891b2" }} /> Raw JSON-LD (GraphStore)
              </h3>
              <div className="flex gap-2">
                <BMSmallBtn onClick={() => copyToClipboard(JSON.stringify(graphJsonld || graph, null, 2))} icon={<Copy className="h-3.5 w-3.5" />} label="Copy" />
                <BMSmallBtn onClick={() => downloadFile(toBibframeJsonLdString(graphJsonld || graph), `${recordId}.jsonld`, "application/ld+json")} icon={<Download className="h-3.5 w-3.5" />} label="Download" />
              </div>
            </div>
            <div className="mb-3 p-3 rounded-lg text-xs flex items-center gap-2" style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)", color: BM.warning }}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Raw GraphStore output. For W3C-compliant JSON-LD, use the <strong className="ml-1">W3C JSON-LD</strong> tab.
            </div>
            <pre className="p-5 rounded-xl overflow-auto text-sm max-h-[calc(100vh-400px)] font-mono leading-relaxed"
              style={{ background: "#1e1e2e", border: "1px solid rgba(120,130,180,0.12)", color: "#67e8f9" }}>
              {JSON.stringify(graphJsonld || graph, null, 2)}
            </pre>
          </BMCard>
        )}

        {/* ===== RDF/XML VIEW ===== */}
        {activeTab === "rdf-xml" && (
          <BMCard>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Code className="h-5 w-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">W3C RDF/XML Serialization</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  application/rdf+xml
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const xml = graphRdfXml || toRdfXml({ "@graph": [workData, instanceData] });
                    navigator.clipboard.writeText(xml);
                    toast.success("Copied RDF/XML to clipboard!");
                  }}
                  className="glass-bubble-pill flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white cursor-pointer hover:bg-white/20"
                >
                  <Copy className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Copy XML</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const xml = graphRdfXml || toRdfXml({ "@graph": [workData, instanceData] });
                    downloadFile(xml, `${recordId}.rdf`, "application/rdf+xml");
                  }}
                  className="glass-bubble-pill flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-emerald-300 border-emerald-500/30 cursor-pointer hover:bg-emerald-500/20"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Download .rdf</span>
                </button>
              </div>
            </div>
            <pre className="p-4 rounded-2xl bg-black/60 border border-white/10 text-xs font-mono text-emerald-300/90 overflow-x-auto max-h-[600px] overflow-y-auto whitespace-pre select-all">
              {graphRdfXml || toRdfXml({ "@graph": [workData, instanceData] })}
            </pre>
          </BMCard>
        )}

        {/* ===== TURTLE ===== */}
        {activeTab === "turtle" && (
          <BMCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black flex items-center gap-2" style={{ color: BM.text }}>
                <Code className="h-5 w-5" style={{ color: BM.secondary }} /> Turtle RDF (W3C-Compliant)
              </h3>
              <div className="flex gap-2">
                {w3cTurtle && <BMSmallBtn onClick={() => copyToClipboard(w3cTurtle)} icon={<Copy className="h-3.5 w-3.5" />} label="Copy" />}
                {w3cTurtle && <BMSmallBtn onClick={() => downloadFile(w3cTurtle, `${recordId}.ttl`, "text/turtle")} icon={<Download className="h-3.5 w-3.5" />} label=".ttl" />}
              </div>
            </div>
            <pre className="p-5 rounded-xl overflow-auto text-sm max-h-[calc(100vh-350px)] font-mono leading-relaxed"
              style={{ background: "#1e1e2e", border: "1px solid rgba(120,130,180,0.12)", color: "#c4b5fd" }}>
              {w3cTurtle || "Fill in the form to generate Turtle RDF..."}
            </pre>
          </BMCard>
        )}

        {/* ===== N-TRIPLES ===== */}
        {activeTab === "ntriples" && (
          <BMCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black flex items-center gap-2" style={{ color: BM.text }}>
                <FileText className="h-5 w-5" style={{ color: "#fb923c" }} /> N-Triples (Triple Store Ready)
              </h3>
              <div className="flex gap-2">
                {w3cNTriples && <BMSmallBtn onClick={() => copyToClipboard(w3cNTriples)} icon={<Copy className="h-3.5 w-3.5" />} label="Copy" />}
                {w3cNTriples && <BMSmallBtn onClick={() => downloadFile(w3cNTriples, `${recordId}.nt`, "application/n-triples")} icon={<Download className="h-3.5 w-3.5" />} label=".nt" />}
              </div>
            </div>
            <div className="mb-3 p-3 rounded-lg text-xs flex items-center gap-2" style={{ background: "rgba(0,122,255,0.05)", border: `1px solid rgba(0,122,255,0.12)`, color: BM.accent }}>
              <Info className="h-3.5 w-3.5 shrink-0" /> Directly loadable into Apache Jena/Fuseki, Blazegraph, GraphDB, Virtuoso, or any SPARQL endpoint.
            </div>
            <pre className="p-5 rounded-xl overflow-auto text-xs max-h-[calc(100vh-400px)] font-mono leading-relaxed"
              style={{ background: "#1e1e2e", border: "1px solid rgba(120,130,180,0.12)", color: "#fdba74" }}>
              {w3cNTriples || "Fill in the form to generate N-Triples..."}
            </pre>
            {w3cNTriples && <div className="mt-2 text-xs font-mono" style={{ color: BM.textDim }}>{w3cNTriples.split("\n").filter(Boolean).length} triples</div>}
          </BMCard>
        )}

        {/* ===== MARC ===== */}
        {activeTab === "marc" && <MarcView data={{ work: workData, instance: instanceData, admin: {} }} />}

        {/* ===== MARC 21 VIEWER ===== */}
        {activeTab === "marc21-viewer" && (
          <Marc21Viewer workData={workData} instanceData={instanceData} theme={BM} isLegacy={isLegacy} />
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
          <div className="space-y-4">
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
            <WolfMoonStandaloneOpac onOpenEditor={() => setActiveTab('editor')} />
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
              <SolarSystemMindMap workData={workData} instanceData={instanceData} theme={BM} />
            ) : (
              <MindMapPreview workData={workData} instanceData={instanceData} theme={isLight ? "light" : "dark"} />
            )}
          </BMCard>
        )}

        {/* ===== VALIDATION ===== */}
        {activeTab === "validation" && (
          <div className="space-y-4">
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
            <AuthorityGraph nodes={authorityNodes} />
          </BMCard>
        )}

        {/* ===== DISCOVERY LAYER ===== */}
        {activeTab === "discovery" && (
          <div className="-mx-4" style={{ minHeight: "80vh" }}>
            <LinkedDataDiscovery
              glassTheme={glassTheme}
              onThemeToggle={() => setGlassTheme(glassTheme === "dark" ? "legacy" : "dark")}
              onImportToForm={handleDiscoveryImport}
            />
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
          <MarvaHubEditor
            currentHub={activeHub}
            onSelectHub={(h) => {
              setActiveHub(h);
              updateWorkProperty("bf:expressionOf", h.uri);
            }}
            onSaveHub={(h) => setActiveHub(h)}
            isDark={!isLight}
          />
        )}

        {/* ===== REMERGE MODERN MARC ===== */}
        {activeTab === "remerge-marc" && (
          <MarvaRemergeMarc
            workData={workData}
            instanceData={instanceData}
            itemData={uriSet.item}
            adminData={uriSet.admin}
            hubData={activeHub}
            isDark={!isLight}
          />
        )}
        {/* ===== AI ENGINE ===== */}
        {activeTab === "ai-engine" && (
          <BlueMoonAIPanel
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
          />
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
      <MarvaToolsModal
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
      />

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
            <AuthorFinder 
              onBack={() => setShowIraqiAuthorityModal(false)} 
              onSelectAuthor={handleInsertIraqiAuthor} 
            />
          </div>
        </div>
      )}

      <ImportRecordDialog isOpen={showImportDialog} onClose={() => setShowImportDialog(false)} onImport={handleImport} />
      <RecordViewerDialog open={showRecordViewer} onOpenChange={setShowRecordViewer} jsonldData={graphJsonld || { "@graph": [] }} title={recordTitle} />
    </div>
    </BMThemeContext.Provider>
  );
}

// ============================== BLUE MOON SUB-COMPONENTS ==============================

// ============================== LC CUTTER PANEL ==============================
// Cutter number generator + LC Call Number parser/formatter

function LCCutterPanel({ theme, isLegacy, isClassic = false }: { theme: typeof BM_DARK; isLegacy: boolean; isClassic?: boolean }) {
  const isLight = isLegacy || isClassic;
  const [mode, setMode] = React.useState<"cutter" | "parser">("cutter");
  // Cutter generator state
  const [cutterInput, setCutterInput] = React.useState("");
  const [cutterDigits, setCutterDigits] = React.useState(3);
  const [cutterResult, setCutterResult] = React.useState<CutterResult | null>(null);
  // Call number parser state
  const [callNumInput, setCallNumInput] = React.useState("");
  const [parsedResult, setParsedResult] = React.useState<CallNumberParts | null>(null);
  const [formattedResult, setFormattedResult] = React.useState("");
  // Cutter history
  const [history, setHistory] = React.useState<CutterResult[]>([]);

  const handleGenerateCutter = React.useCallback(() => {
    if (!cutterInput.trim()) return;
    const result = generateCutter(cutterInput.trim(), cutterDigits);
    setCutterResult(result);
    if (result.cutterNumber) {
      setHistory(prev => {
        const next = [result, ...prev.filter(h => h.input.toLowerCase() !== result.input.toLowerCase())];
        return next.slice(0, 20);
      });
      toast.success(`Cutter: ${result.formatted}`);
    }
  }, [cutterInput, cutterDigits]);

  const handleParseCallNumber = React.useCallback(() => {
    if (!callNumInput.trim()) return;
    const parts = parseCallNumber(callNumInput.trim());
    setParsedResult(parts);
    if (parts.valid) {
      setFormattedResult(formatCallNumber(parts));
      toast.success("Call number parsed");
    } else {
      setFormattedResult("");
    }
  }, [callNumInput]);

  // Live preview for cutter
  const livePreview = React.useMemo(() => {
    if (!cutterInput.trim()) return null;
    try { return generateCutter(cutterInput.trim(), cutterDigits); } catch { return null; }
  }, [cutterInput, cutterDigits]);

  const copyText = (text: string) => { navigator.clipboard.writeText(text); toast.success("Copied!"); };
  const downloadText = (text: string, filename: string) => {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded");
  };

  const cardStyle: React.CSSProperties = {
    background: isClassic ? "#ffffff" : isLegacy ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.6)",
    border: `1px solid ${theme.cardBorder}`,
    backdropFilter: isClassic ? undefined : "blur(20px)",
    boxShadow: isClassic ? "0 1px 3px rgba(0,0,0,0.08)" : undefined,
  };

  const inputStyle: React.CSSProperties = {
    background: isClassic ? "#f9fafb" : isLegacy ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)",
    border: `1px solid ${theme.cardBorder}`, color: theme.text,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl p-5" style={cardStyle}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black flex items-center gap-2" style={{ color: theme.text }}>
            <Scissors className="h-5 w-5" style={{ color: "#f472b6" }} />
            LC Cutter Tool
          </h3>
          <a href="https://www.loc.gov/aba/pcc/053/table.html" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[10px] font-bold rounded-lg px-2.5 py-1 transition-all hover:opacity-80"
            style={{ color: theme.textDim, background: "#f472b610", border: "1px solid #f472b620" }}>
            <ExternalLink className="h-3 w-3" /> LC Cutter Table
          </a>
        </div>
        <p className="text-xs mb-4" style={{ color: theme.textDim }}>
          Generate LC Cutter numbers from names/words using the Library of Congress Cutter Table, or parse and format LC Call Numbers into their component parts.
        </p>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-4">
          {([
            { key: "cutter" as const, label: "Cutter Generator", icon: <Scissors className="h-3.5 w-3.5" />, color: "#f472b6" },
            { key: "parser" as const, label: "Call Number Parser", icon: <BookOpen className="h-3.5 w-3.5" />, color: "#06b6d4" },
          ]).map(m => (
            <button key={m.key} onClick={() => setMode(m.key)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all flex-1"
              style={{
                background: mode === m.key ? `${m.color}20` : "transparent",
                border: `1px solid ${mode === m.key ? `${m.color}40` : theme.cardBorder}`,
                color: mode === m.key ? m.color : theme.textDim,
              }}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>

        {/* ========== CUTTER GENERATOR ========== */}
        {mode === "cutter" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: theme.textDim }}>
                  Name / Word
                </label>
                <input
                  type="text" value={cutterInput}
                  onChange={e => setCutterInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleGenerateCutter(); }}
                  placeholder="e.g., Johnson, Shakespeare, Qureshi..."
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={inputStyle}
                />
                {/* Example names */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {EXAMPLE_NAMES.map(ex => (
                    <button key={ex.value} onClick={() => { setCutterInput(ex.value); }}
                      className="text-[9px] font-bold px-2 py-0.5 rounded-full transition-all hover:opacity-80"
                      style={{ background: "#f472b608", color: theme.textDim, border: `1px solid ${theme.cardBorder}` }}>
                      {ex.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: theme.textDim }}>
                  Digits
                </label>
                <div className="flex gap-1.5">
                  {[2, 3, 4].map(n => (
                    <button key={n} onClick={() => setCutterDigits(n)}
                      className="flex-1 px-3 py-2.5 rounded-xl text-sm font-bold transition-all"
                      style={{
                        background: cutterDigits === n ? "#f472b620" : "transparent",
                        border: `1px solid ${cutterDigits === n ? "#f472b640" : theme.cardBorder}`,
                        color: cutterDigits === n ? "#f472b6" : theme.textDim,
                      }}>
                      {n}
                    </button>
                  ))}
                </div>
                {/* Live preview */}
                {livePreview && livePreview.cutterNumber && (
                  <div className="mt-3 p-2.5 rounded-xl text-center" style={{ background: "#f472b608", border: "1px solid #f472b615" }}>
                    <span className="text-[9px] font-bold uppercase tracking-wider block mb-1" style={{ color: theme.textDim }}>Preview</span>
                    <span className="text-lg font-black font-mono" style={{ color: "#f472b6" }}>{livePreview.formatted}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Generate button */}
            <button onClick={handleGenerateCutter} disabled={!cutterInput.trim()}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-black transition-all disabled:opacity-30"
              style={{ background: "linear-gradient(135deg, #f472b6, #ec4899, #db2777)", color: "#fff", boxShadow: "0 4px 15px rgba(244,114,182,0.3)" }}>
              <Scissors className="h-4 w-4" /> Generate Cutter Number
            </button>

            {/* Result */}
            {cutterResult && cutterResult.cutterNumber && (
              <div className="rounded-xl p-4 space-y-3" style={{ background: isClassic ? "#f9fafb" : isLegacy ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)", border: `1px solid ${theme.cardBorder}` }}>
                {/* Main result */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: theme.textDim }}>Cutter Number</span>
                    <span className="text-2xl font-black font-mono" style={{ color: "#f472b6" }}>{cutterResult.formatted}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => copyText(cutterResult.formatted)}
                      className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all hover:opacity-80"
                      style={{ background: "#f472b610", color: "#f472b6", border: "1px solid #f472b620" }}>
                      <Copy className="h-3 w-3" /> Copy
                    </button>
                    <button onClick={() => downloadText(
                      `LC Cutter Number\nInput: ${cutterResult.input}\nCutter: ${cutterResult.formatted}\nFull: ${cutterResult.cutterNumber}\nRule: ${cutterResult.breakdown.rule}\n`,
                      `LC-Cutter-${cutterResult.input}.txt`
                    )}
                      className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all hover:opacity-80"
                      style={{ background: "#06b6d410", color: "#06b6d4", border: "1px solid #06b6d420" }}>
                      <Download className="h-3 w-3" /> Download
                    </button>
                  </div>
                </div>

                {/* Breakdown */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: theme.textDim }}>Breakdown</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold" style={{ background: "#f472b615", color: "#f472b6", border: "1px solid #f472b625" }}>
                      {cutterResult.breakdown.initialLetter} <span style={{ color: theme.textDim }}>(initial)</span>
                    </span>
                    {cutterResult.breakdown.digits.map((d, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-lg text-xs font-bold" style={{ background: "#a855f710", color: "#a855f7", border: "1px solid #a855f720" }}>
                        {d.letter} → {d.digit} <span className="text-[9px]" style={{ color: theme.textDim }}>({d.rule})</span>
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] mt-1" style={{ color: theme.textDim }}>
                    Rule applied: {cutterResult.breakdown.rule}
                  </p>
                </div>
              </div>
            )}

            {cutterResult && !cutterResult.cutterNumber && (
              <div className="p-3 rounded-xl text-center" style={{ background: "#ef444410", border: "1px solid #ef444425" }}>
                <AlertTriangle className="h-4 w-4 mx-auto mb-1" style={{ color: "#ef4444" }} />
                <p className="text-xs font-bold" style={{ color: "#ef4444" }}>
                  Invalid input. Enter a name or word containing only letters.
                </p>
              </div>
            )}

            {/* History */}
            {history.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.textDim }}>Recent ({history.length})</span>
                  <button onClick={() => setHistory([])} className="text-[9px] font-bold px-2 py-0.5 rounded transition-all hover:opacity-80" style={{ color: theme.textDim }}>
                    Clear
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {history.map((h, i) => (
                    <button key={i} onClick={() => { setCutterInput(h.input); setCutterResult(h); }}
                      className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all hover:opacity-80"
                      style={{ background: isClassic ? "#f3f4f6" : isLegacy ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)", border: `1px solid ${theme.cardBorder}`, color: theme.text }}>
                      <span style={{ color: theme.textDim }}>{h.input}</span>
                      <span className="font-mono" style={{ color: "#f472b6" }}>{h.formatted}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========== CALL NUMBER PARSER ========== */}
        {mode === "parser" && (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: theme.textDim }}>
                LC Call Number
              </label>
              <input
                type="text" value={callNumInput}
                onChange={e => setCallNumInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleParseCallNumber(); }}
                placeholder="e.g., QA76.73.J38 2018"
                className="w-full px-3 py-2.5 rounded-xl text-sm font-mono outline-none"
                style={inputStyle}
              />
              {/* Example call numbers */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {EXAMPLE_CALL_NUMBERS.map(ex => (
                  <button key={ex.value} onClick={() => { setCallNumInput(ex.value); }}
                    className="text-[9px] font-bold px-2 py-0.5 rounded-full transition-all hover:opacity-80"
                    style={{ background: "#06b6d408", color: theme.textDim, border: `1px solid ${theme.cardBorder}` }}>
                    {ex.label}: <span className="font-mono">{ex.value}</span>
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleParseCallNumber} disabled={!callNumInput.trim()}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-black transition-all disabled:opacity-30"
              style={{ background: "linear-gradient(135deg, #06b6d4, #0891b2, #0e7490)", color: "#fff", boxShadow: "0 4px 15px rgba(6,182,212,0.3)" }}>
              <BookOpen className="h-4 w-4" /> Parse Call Number
            </button>

            {parsedResult && (
              <div className="rounded-xl p-4 space-y-3" style={{ background: isClassic ? "#f9fafb" : isLegacy ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)", border: `1px solid ${theme.cardBorder}` }}>
                {parsedResult.valid ? (
                  <>
                    {/* Formatted result */}
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: theme.textDim }}>Formatted</span>
                        <span className="text-xl font-black font-mono" style={{ color: "#06b6d4" }}>{formattedResult}</span>
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => copyText(formattedResult)}
                          className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all hover:opacity-80"
                          style={{ background: "#06b6d410", color: "#06b6d4", border: "1px solid #06b6d420" }}>
                          <Copy className="h-3 w-3" /> Copy
                        </button>
                        <button onClick={() => downloadText(
                          `LC Call Number\nRaw: ${callNumInput}\nFormatted: ${formattedResult}\n\nClass Letters: ${parsedResult.classLetters}\nClass Number: ${parsedResult.classNumber}\nDecimal: ${parsedResult.decimalPart || "(none)"}\nCutters: ${parsedResult.cutters.map(c => "." + c.letter + c.number).join(" ") || "(none)"}\nDate: ${parsedResult.date || "(none)"}\n`,
                          "LC-CallNumber.txt"
                        )}
                          className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all hover:opacity-80"
                          style={{ background: "#f472b610", color: "#f472b6", border: "1px solid #f472b620" }}>
                          <Download className="h-3 w-3" /> Download
                        </button>
                      </div>
                    </div>

                    {/* Component breakdown */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: theme.textDim }}>Component Breakdown</span>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <div className="p-2.5 rounded-lg" style={{ background: "#3b82f610", border: "1px solid #3b82f620" }}>
                          <span className="text-[9px] font-bold uppercase block" style={{ color: "#3b82f6" }}>Class Letters</span>
                          <span className="text-sm font-black font-mono" style={{ color: theme.text }}>{parsedResult.classLetters || "\u2014"}</span>
                        </div>
                        <div className="p-2.5 rounded-lg" style={{ background: "#8b5cf610", border: "1px solid #8b5cf620" }}>
                          <span className="text-[9px] font-bold uppercase block" style={{ color: "#8b5cf6" }}>Class Number</span>
                          <span className="text-sm font-black font-mono" style={{ color: theme.text }}>{parsedResult.classNumber || "\u2014"}</span>
                        </div>
                        {parsedResult.decimalPart && (
                          <div className="p-2.5 rounded-lg" style={{ background: "#f59e0b10", border: "1px solid #f59e0b20" }}>
                            <span className="text-[9px] font-bold uppercase block" style={{ color: "#f59e0b" }}>Decimal</span>
                            <span className="text-sm font-black font-mono" style={{ color: theme.text }}>.{parsedResult.decimalPart}</span>
                          </div>
                        )}
                        {parsedResult.cutters.map((c, i) => (
                          <div key={i} className="p-2.5 rounded-lg" style={{ background: "#f472b610", border: "1px solid #f472b620" }}>
                            <span className="text-[9px] font-bold uppercase block" style={{ color: "#f472b6" }}>Cutter {i + 1}</span>
                            <span className="text-sm font-black font-mono" style={{ color: theme.text }}>.{c.letter}{c.number}</span>
                          </div>
                        ))}
                        {parsedResult.date && (
                          <div className="p-2.5 rounded-lg" style={{ background: "#10b98110", border: "1px solid #10b98120" }}>
                            <span className="text-[9px] font-bold uppercase block" style={{ color: "#10b981" }}>Date</span>
                            <span className="text-sm font-black font-mono" style={{ color: theme.text }}>{parsedResult.date}</span>
                          </div>
                        )}
                        {parsedResult.remainder && (
                          <div className="p-2.5 rounded-lg" style={{ background: "#06b6d410", border: "1px solid #06b6d420" }}>
                            <span className="text-[9px] font-bold uppercase block" style={{ color: "#06b6d4" }}>Remainder</span>
                            <span className="text-sm font-black font-mono" style={{ color: theme.text }}>{parsedResult.remainder}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-2">
                    <AlertTriangle className="h-5 w-5 mx-auto mb-2" style={{ color: "#ef4444" }} />
                    {parsedResult.errors.map((e, i) => (
                      <p key={i} className="text-xs font-bold" style={{ color: "#ef4444" }}>{e}</p>
                    ))}
                    <p className="text-[10px] mt-2" style={{ color: theme.textDim }}>
                      Expected format: <span className="font-mono">QA76.73.J38 2018</span> or <span className="font-mono">PS3515.U274 A6 1998</span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Quick info footer */}
        <div className="flex flex-wrap gap-2 pt-3 mt-3" style={{ borderTop: `1px solid ${theme.cardBorder}` }}>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#f472b610", color: "#f472b6", border: "1px solid #f472b620" }}>
            LC Cutter Table
          </span>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#06b6d410", color: "#06b6d4", border: "1px solid #06b6d420" }}>
            Call Number Formatter
          </span>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#a855f710", color: "#a855f7", border: "1px solid #a855f720" }}>
            Live Preview
          </span>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#10b98110", color: "#10b981", border: "1px solid #10b98120" }}>
            Copy & Download
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================== SCRIPTSHIFTER PANEL ==============================
// LC ScriptShifter — dual-mode transliteration
// Primary: Server proxy → bibframe.org/scriptshifter (full Python engine, Arabic S2R works)
// Fallback: Client-side YAML engine from GitHub (character maps only)

const SS_PROXY = `https://${projectId}.supabase.co/functions/v1/make-server-49c0e13c/scriptshifter`;

interface SSLangAPI { label: string; has_r2s?: boolean; has_s2r?: boolean; }

function ScriptShifterPanel({ theme, isLegacy, isClassic = false }: { theme: typeof BM_DARK; isLegacy: boolean; isClassic?: boolean }) {
  const [languages, setLanguages] = React.useState<Record<string, SSLangAPI>>({});
  const [selectedLang, setSelectedLang] = React.useState("");
  const [inputText, setInputText] = React.useState("");
  const [outputText, setOutputText] = React.useState("");
  const [direction, setDirection] = React.useState<"s2r" | "r2s">("s2r");
  const [capitalize, setCapitalize] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isLoadingLangs, setIsLoadingLangs] = React.useState(true);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [langSearch, setLangSearch] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [engineMode, setEngineMode] = React.useState<"proxy" | "local" | "offline">("proxy");

  // Fetch languages: try proxy (bibframe.org) first, fall back to GitHub YAML index
  React.useEffect(() => {
    setIsLoadingLangs(true);
    let cancelled = false;

    (async () => {
      // Strategy 1: Server proxy to bibframe.org/scriptshifter
      try {
        const resp = await fetch(`${SS_PROXY}/languages`, {
          headers: { "Authorization": `Bearer ${publicAnonKey}` },
          signal: AbortSignal.timeout(8000),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setLanguages(data);
        if (data.arabic) setSelectedLang("arabic");
        else { const k = Object.keys(data); if (k.length) setSelectedLang(k[0]); }
        setEngineMode("proxy");
        setError(null);
        console.log(`[ScriptShifter] Proxy OK: ${Object.keys(data).length} languages from bibframe.org`);
        return;
      } catch (proxyErr: any) {
        console.warn("[ScriptShifter] Proxy failed:", proxyErr.message, "— trying GitHub fallback...");
      }

      // Strategy 2: Client-side engine from GitHub YAML
      try {
        const idx = await fetchLanguageIndex();
        if (cancelled) return;
        // Convert SSLanguageIndex to SSLangAPI format
        const apiFormat: Record<string, SSLangAPI> = {};
        for (const [k, v] of Object.entries(idx)) {
          apiFormat[k] = { label: v.name, has_r2s: true, has_s2r: true };
        }
        setLanguages(apiFormat);
        if (apiFormat.arabic) setSelectedLang("arabic");
        else { const k = Object.keys(apiFormat); if (k.length) setSelectedLang(k[0]); }
        setEngineMode("local");
        setError(null);
        console.log(`[ScriptShifter] GitHub fallback OK: ${Object.keys(apiFormat).length} languages`);
      } catch (githubErr: any) {
        console.error("[ScriptShifter] Both sources failed:", githubErr.message);
        if (!cancelled) {
          setEngineMode("offline");
          setError(`Could not connect to ScriptShifter. Proxy: bibframe.org unreachable. GitHub fallback also failed: ${githubErr.message}`);
        }
      }
    })().finally(() => { if (!cancelled) setIsLoadingLangs(false); });

    return () => { cancelled = true; };
  }, []);

  const handleTransliterate = React.useCallback(async () => {
    if (!inputText.trim() || !selectedLang) return;
    setIsLoading(true);
    setWarnings([]);
    setOutputText("");

    if (engineMode === "proxy") {
      // Use server proxy → bibframe.org full Python engine
      try {
        const resp = await fetch(`${SS_PROXY}/trans`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${publicAnonKey}` },
          body: JSON.stringify({ lang: selectedLang, text: inputText, t_dir: direction, capitalize, options: {} }),
        });
        const data = await resp.json();
        if (!resp.ok) {
          setWarnings(data.warnings || [`Server error: ${resp.status}`]);
          setOutputText(data.output || "");
        } else {
          setOutputText(data.output || "");
          if (data.warnings?.length) setWarnings(data.warnings);
          if (data.output) toast.success("Transliterated via bibframe.org");
        }
      } catch (err: any) {
        console.error("[ScriptShifter] Proxy trans failed:", err);
        toast.error(`Proxy error: ${err.message}`);
        setWarnings([`Proxy error: ${err.message}. Try switching to local engine.`]);
      } finally {
        setIsLoading(false);
      }
    } else {
      // Use client-side YAML engine
      try {
        const result = await ssTransliterateLocal(inputText, selectedLang, direction, capitalize);
        setOutputText(result.output);
        if (result.warnings.length) setWarnings(result.warnings);
        if (result.output) toast.success("Transliterated (local engine)");
      } catch (err: any) {
        console.error("[ScriptShifter] Local engine error:", err);
        toast.error(`Local engine error: ${err.message}`);
        setWarnings([`Engine error: ${err.message}`]);
      } finally {
        setIsLoading(false);
      }
    }
  }, [inputText, selectedLang, direction, capitalize, engineMode]);

  const currentLang = languages[selectedLang];
  const supportsS2R = currentLang?.has_s2r !== false;
  const supportsR2S = currentLang?.has_r2s !== false;

  const filteredLangs = React.useMemo(() => {
    const entries = Object.entries(languages);
    if (!langSearch.trim()) return entries.sort((a, b) => a[1].label.localeCompare(b[1].label));
    const q = langSearch.toLowerCase();
    return entries.filter(([k, v]) =>
      v.label.toLowerCase().includes(q) || k.toLowerCase().includes(q)
    ).sort((a, b) => a[1].label.localeCompare(b[1].label));
  }, [languages, langSearch]);

  const engineBadge = engineMode === "proxy"
    ? { bg: "#10b98110", color: "#10b981", border: "#10b98120", text: "bibframe.org (Full Engine)" }
    : engineMode === "local"
    ? { bg: "#f59e0b10", color: "#f59e0b", border: "#f59e0b20", text: "Local Engine (Character Maps Only)" }
    : { bg: "#ef444410", color: "#ef4444", border: "#ef444420", text: "Offline" };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-5" style={{
        background: isClassic ? "#ffffff" : isLegacy ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.6)",
        border: `1px solid ${theme.cardBorder}`,
        backdropFilter: isClassic ? undefined : "blur(20px)",
        boxShadow: isClassic ? "0 1px 3px rgba(0,0,0,0.08)" : undefined,
      }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black flex items-center gap-2" style={{ color: theme.text }}>
            <Languages className="h-5 w-5" style={{ color: "#a855f7" }} />
            LC ScriptShifter
          </h3>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: engineBadge.bg, color: engineBadge.color, border: `1px solid ${engineBadge.border}` }}>
              {engineBadge.text}
            </span>
            <a href="https://bibframe.org/scriptshifter/" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[10px] font-bold rounded-lg px-2.5 py-1 transition-all hover:opacity-80"
              style={{ color: theme.textDim, background: `${theme.accent}10`, border: `1px solid ${theme.accent}20` }}>
              <ExternalLink className="h-3 w-3" /> bibframe.org
            </a>
          </div>
        </div>
        <p className="text-xs mb-4" style={{ color: theme.textDim }}>
          {engineMode === "proxy"
            ? "Connected to bibframe.org/scriptshifter \u2014 full Python transliteration engine with Arabic (ArabicTransliterator), Chinese, Korean, Hebrew, and 90+ scripts. Identical to the LC online tool."
            : "Using local character-mapping engine from GitHub YAML tables. Arabic Script\u2192Roman and some complex scripts may have limited support. Proxy to bibframe.org is unavailable."
          }
        </p>

        {error ? (
          <div className="p-4 rounded-xl text-center" style={{ background: "#ef444410", border: "1px solid #ef444430" }}>
            <AlertTriangle className="h-5 w-5 mx-auto mb-2" style={{ color: "#ef4444" }} />
            <p className="text-xs font-bold" style={{ color: "#ef4444" }}>{error}</p>
            <p className="text-[10px] mt-1" style={{ color: theme.textDim }}>
              Use it directly at{" "}
              <a href="https://bibframe.org/scriptshifter/" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "#a855f7" }}>bibframe.org/scriptshifter</a>
            </p>
          </div>
        ) : isLoadingLangs ? (
          <div className="flex items-center justify-center py-8 gap-2">
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#a855f7" }} />
            <span className="text-xs font-bold" style={{ color: theme.textDim }}>Connecting to ScriptShifter...</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: theme.textDim }}>
                  Script / Language ({Object.keys(languages).length})
                </label>
                <input
                  type="text" placeholder="Search scripts..." value={langSearch}
                  onChange={e => setLangSearch(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg text-xs mb-1.5 outline-none"
                  style={{
                    background: isClassic ? "#f9fafb" : isLegacy ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)",
                    border: `1px solid ${theme.cardBorder}`, color: theme.text,
                  }}
                />
                <select
                  value={selectedLang} onChange={e => { setSelectedLang(e.target.value); setOutputText(""); setWarnings([]); }}
                  className="w-full px-3 py-2 rounded-lg text-xs font-bold outline-none"
                  style={{
                    background: isClassic ? "#f9fafb" : isLegacy ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.06)",
                    border: `1px solid ${theme.cardBorder}`, color: theme.text,
                  }}
                  size={Math.min(8, filteredLangs.length)}
                >
                  {filteredLangs.map(([key, lang]) => (
                    <option key={key} value={key} style={{ color: "#000" }}>
                      {lang.label}
                      {lang.has_s2r === false && lang.has_r2s !== false ? " (R\u2192S only)" : ""}
                      {lang.has_r2s === false && lang.has_s2r !== false ? " (S\u2192R only)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: theme.textDim }}>
                  Direction
                </label>
                <div className="space-y-2">
                  <button
                    onClick={() => setDirection("s2r")} disabled={!supportsS2R}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-30"
                    style={{
                      background: direction === "s2r" ? "#a855f720" : "transparent",
                      border: `1px solid ${direction === "s2r" ? "#a855f740" : theme.cardBorder}`,
                      color: direction === "s2r" ? "#a855f7" : theme.textDim,
                    }}>
                    Script \u2192 Roman
                  </button>
                  <button
                    onClick={() => setDirection("r2s")} disabled={!supportsR2S}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-30"
                    style={{
                      background: direction === "r2s" ? "#06b6d420" : "transparent",
                      border: `1px solid ${direction === "r2s" ? "#06b6d440" : theme.cardBorder}`,
                      color: direction === "r2s" ? "#06b6d4" : theme.textDim,
                    }}>
                    Roman \u2192 Script
                  </button>
                  <label className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold cursor-pointer" style={{ color: theme.textDim }}>
                    <input type="checkbox" checked={capitalize} onChange={e => setCapitalize(e.target.checked)}
                      className="rounded" style={{ accentColor: "#a855f7" }} />
                    Capitalize output
                  </label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: theme.textDim }}>
                  Input ({direction === "s2r" ? "Non-Latin Script" : "Romanized Latin"})
                </label>
                <textarea
                  value={inputText} onChange={e => setInputText(e.target.value)}
                  placeholder={direction === "s2r" ? "\u0623\u062F\u062E\u0644 \u0627\u0644\u0646\u0635 \u0647\u0646\u0627..." : "Enter romanized text (e.g. maktabah, Moskva)..."}
                  rows={6}
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-mono outline-none resize-none"
                  style={{
                    background: isClassic ? "#f9fafb" : isLegacy ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${theme.cardBorder}`, color: theme.text,
                    direction: direction === "s2r" ? "rtl" : "ltr",
                  }}
                  dir={direction === "s2r" ? "rtl" : "ltr"}
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 flex items-center justify-between" style={{ color: theme.textDim }}>
                  <span>Output ({direction === "s2r" ? "Romanized Latin" : "Non-Latin Script"})</span>
                  {outputText && (
                    <button onClick={() => { navigator.clipboard.writeText(outputText); toast.success("Copied!"); }}
                      className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded transition-all hover:opacity-80"
                      style={{ background: `${theme.accent}15`, color: theme.accent }}>
                      <Copy className="h-2.5 w-2.5" /> Copy
                    </button>
                  )}
                </label>
                <textarea
                  value={outputText} readOnly rows={6}
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-mono outline-none resize-none"
                  style={{
                    background: isClassic ? "#ffffff" : isLegacy ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${outputText ? "#a855f730" : theme.cardBorder}`, color: theme.text,
                    direction: direction === "r2s" ? "rtl" : "ltr",
                  }}
                  dir={direction === "r2s" ? "rtl" : "ltr"}
                  placeholder="Transliterated output will appear here..."
                />
              </div>
            </div>

            {warnings.length > 0 && (
              <div className="p-3 rounded-xl" style={{ background: "#f59e0b10", border: "1px solid #f59e0b25" }}>
                {warnings.map((w, i) => (
                  <p key={i} className="text-[11px] flex items-start gap-1.5" style={{ color: "#f59e0b" }}>
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {w}
                  </p>
                ))}
              </div>
            )}

            <button
              onClick={handleTransliterate}
              disabled={isLoading || !inputText.trim() || !selectedLang}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-black transition-all disabled:opacity-30"
              style={{
                background: "linear-gradient(135deg, #a855f7, #7c3aed, #6d28d9)",
                color: "#fff", boxShadow: "0 4px 15px rgba(168,85,247,0.3)",
              }}>
              {isLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Transliterating...</>
              ) : (
                <><Languages className="h-4 w-4" />Transliterate {currentLang?.label || ""}</>
              )}
            </button>

            <div className="flex flex-wrap gap-2 pt-1">
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#a855f710", color: "#a855f7", border: "1px solid #a855f720" }}>
                {Object.keys(languages).length} scripts
              </span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: engineBadge.bg, color: engineBadge.color, border: `1px solid ${engineBadge.border}` }}>
                {engineMode === "proxy" ? "Proxied via bibframe.org" : "Local YAML engine"}
              </span>
              {selectedLang && currentLang && (
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#10b98110", color: "#10b981", border: "1px solid #10b98120" }}>
                  {currentLang.label}: {supportsS2R ? "S\u2192R" : ""}{supportsS2R && supportsR2S ? " + " : ""}{supportsR2S ? "R\u2192S" : ""}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BMCard({ children }: { children: React.ReactNode }) {
  const t = useBMTheme();
  const isClassic = t === BM_CLASSIC;
  return (
    <div className={isClassic ? "rounded-2xl p-6 bg-white border border-gray-200 shadow-sm" : "glass-card p-6"}>
      {children}
    </div>
  );
}

function BMEntitySection({ title, subtitle, color, icon, uri, expanded, onToggle, children, requiredCount, groupCount }: {
  title: string; subtitle?: string; color: string; icon: React.ReactNode; uri: string;
  expanded: boolean; onToggle: () => void; children: React.ReactNode;
  requiredCount?: number; groupCount?: number;
}) {
  const t = useBMTheme();
  const isClassicSec = t === BM_CLASSIC;
  return (
    <div
      className={isClassicSec ? "rounded-2xl bg-white border border-gray-200 shadow-sm" : "glass-luxury-panel"}
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between transition-all cursor-pointer rounded-t-2xl hover:bg-white/10"
      >
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center text-white shrink-0">
            {icon}
          </div>
          <div className="text-start">
            {subtitle && (
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                {subtitle}
              </p>
            )}
            <h2 className="text-lg font-black text-white">{title}</h2>
            <div className="flex items-center gap-2 text-[10px] text-white/60 font-mono">
              <span>{uri.split("/").pop()}</span>
              {requiredCount !== undefined && (
                <span className="glass-bubble-pill px-2 py-0.5 text-[9px] font-bold text-white">
                  {requiredCount} req.
                </span>
              )}
              {groupCount !== undefined && <span>• {groupCount} groups</span>}
            </div>
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 text-white/70 transition-transform ${expanded ? "" : "-rotate-90"}`} />
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1, overflow: "visible" }}
            exit={{ height: 0, opacity: 0, overflow: "hidden" }}
            transition={{ duration: 0.2 }}>
            <div className="px-6 pb-6 bg-[#ffffff00]">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ===== FIELD WRAPPER WITH DELETE BUTTON =====
function BMFieldWrapper({ children, fieldKey, onHide }: { children: React.ReactNode; fieldKey: string; onHide: (key: string) => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div className="relative group" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {children}
      {hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onHide(fieldKey); }}
          className="absolute -top-1 z-10 w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-lg"
          style={{
            background: "rgba(255,59,48,0.9)",
            border: "2px solid rgba(255,255,255,0.8)",
            insetInlineEnd: "-4px",
          }}
          title="Hide field"
          type="button"
        >
          <X className="h-3 w-3 text-white" />
        </button>
      )}
    </div>
  );
}

function BMSaveStatus({ status }: { status: SaveStatus }) {
  const t = useBMTheme();
  const { t: tr } = useTranslation();
  const meta = {
    saved: { bg: "rgba(52,199,89,0.1)", border: "rgba(52,199,89,0.25)", color: t.success, icon: <CheckCircle2 className="h-3 w-3" />, label: tr("saved") },
    unsaved: { bg: "rgba(255,149,0,0.1)", border: "rgba(255,149,0,0.25)", color: t.warning, icon: <Clock className="h-3 w-3" />, label: tr("unsaved") },
    saving: { bg: "rgba(0,122,255,0.1)", border: "rgba(0,122,255,0.25)", color: t.accent, icon: <Loader2 className="h-3 w-3 animate-spin" />, label: tr("savingDots") },
    error: { bg: "rgba(255,59,48,0.1)", border: "rgba(255,59,48,0.25)", color: t.danger, icon: <AlertCircle className="h-3 w-3" />, label: tr("error") },
  }[status];
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold"
      style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color }}>
      {meta.icon} {meta.label}
    </div>
  );
}

function BMSmallBtn({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  const t = useBMTheme();
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all hover:shadow-md"
      style={{ background: "rgba(59,130,246,0.12)", border: `1px solid ${t.accentBorder}`, color: t.accentDim }}>
      {icon} {label}
    </button>
  );
}

function BMValidationBanner({ validation }: { validation: JsonLdValidationResult }) {
  const t = useBMTheme();
  const isLegacy = t === BM_LEGACY;
  const isClassicVal = t === BM_CLASSIC;
  return (
    <div className="rounded-2xl p-5" style={{
      background: isClassicVal
        ? (validation.valid ? "#f0fdf4" : "#fef2f2")
        : (validation.valid ? "rgba(52,199,89,0.04)" : "rgba(255,59,48,0.04)"),
      border: `1px solid ${validation.valid ? "rgba(52,199,89,0.12)" : "rgba(255,59,48,0.12)"}`,
      borderLeft: `3px solid ${validation.valid ? t.success : t.danger}`,
      backdropFilter: isClassicVal ? undefined : "blur(30px) saturate(180%)",
      boxShadow: isClassicVal
        ? "0 1px 3px rgba(0,0,0,0.08)"
        : isLegacy
        ? "0 8px 32px rgba(31,38,135,0.15), inset 0 1px 0 rgba(255,255,255,0.6)"
        : "0 2px 8px rgba(0,0,0,0.2), 0 8px 24px rgba(59,130,246,0.06), inset 0 1px 0 rgba(255,255,255,0.03)",
    }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 font-black" style={{ color: validation.valid ? t.success : t.danger }}>
          {validation.valid ? <><CheckCircle2 className="h-6 w-6" /> W3C-Compliant JSON-LD</> : <><AlertCircle className="h-6 w-6" /> {validation.errors.length} Compliance Error(s)</>}
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono" style={{ color: t.textDim }}>
          <span>{validation.stats.nodeCount} nodes</span>
          <span>~{validation.stats.tripleEstimate} triples</span>
          <span>{validation.stats.prefixesUsed.length} prefixes</span>
          <span style={{ color: validation.stats.contextComplete ? t.success : t.danger }}>
            Context: {validation.stats.contextComplete ? "Complete" : "Incomplete"}
          </span>
        </div>
      </div>
      <div className="text-[10px] mb-2" style={{ color: t.textDim }}>
        Passes: <span style={{ color: t.accent }}>json-ld.org/playground</span> | <span style={{ color: t.accent }}>W3C RDF Validator</span> | <span style={{ color: t.accent }}>Apache Jena/Fuseki</span> | <span style={{ color: t.accent }}>Blazegraph</span> | <span style={{ color: t.accent }}>GraphDB</span>
      </div>
      {validation.errors.length > 0 && <div className="mt-2 space-y-1">{validation.errors.map((e, i) => (
        <div key={i} className="text-xs p-2 rounded-lg flex items-start gap-1.5" style={{ background: "rgba(255,59,48,0.05)" }}>
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" style={{ color: t.danger }} /> <span style={{ color: t.danger }}>{e}</span>
        </div>
      ))}</div>}
      {validation.warnings.length > 0 && <div className="mt-2 space-y-1">{validation.warnings.map((w, i) => (
        <div key={i} className="text-xs p-2 rounded-lg flex items-start gap-1.5" style={{ background: "rgba(255,149,0,0.05)" }}>
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" style={{ color: t.warning }} /> <span style={{ color: t.warning }}>{w}</span>
        </div>
      ))}</div>}
      {validation.info.length > 0 && <div className="mt-2 space-y-1">{validation.info.map((inf, i) => (
        <div key={i} className="text-xs p-2 rounded-lg flex items-start gap-1.5" style={{ background: "rgba(0,122,255,0.05)" }}>
          <Info className="h-3 w-3 mt-0.5 shrink-0" style={{ color: t.accent }} /> <span style={{ color: t.accent }}>{inf}</span>
        </div>
      ))}</div>}
      <div className="mt-3 flex gap-2">
        <a href={`https://json-ld.org/playground/#startTab=tab-expanded&json-ld=${encodeURIComponent(JSON.stringify(validation))}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all"
          style={{ background: "rgba(59,130,246,0.12)", border: `1px solid ${t.accentBorder}`, color: t.accentDim }}>
          <ExternalLink className="h-3 w-3" /> JSON-LD Playground
        </a>
        <a href="https://www.w3.org/RDF/Validator/" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all"
          style={{ background: "rgba(59,130,246,0.12)", border: `1px solid ${t.accentBorder}`, color: t.accentDim }}>
          <ExternalLink className="h-3 w-3" /> W3C RDF Validator
        </a>
      </div>
    </div>
  );
}

// ===== SAVE TEMPLATE DIALOG =====
function BMSaveTemplateDialog({ allFieldKeys, hiddenFields, baseTemplateName, onSave, onClose }: {
  allFieldKeys: string[];
  hiddenFields: Set<string>;
  baseTemplateName: string;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const th = useBMTheme();
  const { t } = useTranslation();
  const isLeg = th === BM_LEGACY;
  const isClsc = th === BM_CLASSIC;
  const [name, setName] = useState("");
  const [showKept, setShowKept] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);

  const keptFields = allFieldKeys.filter(k => !hiddenFields.has(k));
  const removedFields = allFieldKeys.filter(k => hiddenFields.has(k));

  const formatFieldName = (key: string) => key.replace("ontology:", "").replace("registry:", "").split("/").pop() || key;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: isClsc ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.5)", backdropFilter: isClsc ? undefined : "blur(8px)" }}
      onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="w-[520px] max-h-[80vh] rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: isClsc ? "#ffffff" : isLeg ? "rgba(255,255,255,0.98)" : "rgba(15,23,42,0.98)",
          border: `1px solid ${th.cardBorder}`,
          backdropFilter: isClsc ? undefined : "blur(30px) saturate(180%)",
          boxShadow: isClsc ? "0 8px 30px rgba(0,0,0,0.15)" : "0 25px 80px rgba(0,0,0,0.4)",
        }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${th.cardBorder}` }}>
          <div>
            <h2 className="text-lg font-black flex items-center gap-2" style={{ color: th.text }}>
              <Save className="h-5 w-5" style={{ color: th.accent }} />
              {t("saveTemplate")}
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: th.textDim }}>
              {t("basedOn")}: <strong>{baseTemplateName}</strong>
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70 transition-all">
            <X className="h-5 w-5" style={{ color: th.textDim }} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Template name input */}
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: th.textDim }}>{t("templateName")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("templateNamePlaceholder")}
              className="w-full px-4 py-3 rounded-xl text-sm font-semibold focus:outline-none transition-all"
              style={{
                background: th.inputBg, border: `2px solid ${name ? th.accentBorder : th.inputBorder}`,
                color: th.text, caretColor: th.accent,
              }}
              autoFocus
            />
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl text-center"
              style={{ background: "rgba(52,199,89,0.08)", border: "1px solid rgba(52,199,89,0.2)" }}>
              <div className="text-2xl font-black" style={{ color: th.success }}>{keptFields.length}</div>
              <div className="text-[11px] font-bold mt-0.5" style={{ color: th.success }}>{t("keptFields")}</div>
            </div>
            <div className="p-4 rounded-xl text-center"
              style={{ background: "rgba(255,59,48,0.08)", border: "1px solid rgba(255,59,48,0.2)" }}>
              <div className="text-2xl font-black" style={{ color: th.danger }}>{removedFields.length}</div>
              <div className="text-[11px] font-bold mt-0.5" style={{ color: th.danger }}>{t("removedFields")}</div>
            </div>
          </div>

          {/* Kept fields accordion */}
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${th.cardBorder}` }}>
            <button onClick={() => setShowKept(!showKept)} className="w-full px-4 py-2.5 flex items-center justify-between transition-all"
              style={{ background: isLeg ? "rgba(255,255,255,0.5)" : "rgba(30,41,59,0.5)" }} type="button">
              <span className="text-xs font-bold flex items-center gap-2" style={{ color: th.success }}>
                <CheckCircle2 className="h-3.5 w-3.5" /> {t("keptFields")} ({keptFields.length})
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showKept ? "" : "-rotate-90"}`} style={{ color: th.textDim }} />
            </button>
            {showKept && (
              <div className="px-4 py-2 max-h-40 overflow-y-auto space-y-0.5">
                {keptFields.map(k => (
                  <div key={k} className="text-[11px] font-mono py-0.5 flex items-center gap-1.5" style={{ color: th.textMuted }}>
                    <CheckCircle2 className="h-2.5 w-2.5 shrink-0" style={{ color: th.success }} />
                    {formatFieldName(k)}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Removed fields accordion */}
          {removedFields.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${th.cardBorder}` }}>
              <button onClick={() => setShowRemoved(!showRemoved)} className="w-full px-4 py-2.5 flex items-center justify-between transition-all"
                style={{ background: isLeg ? "rgba(255,255,255,0.5)" : "rgba(30,41,59,0.5)" }} type="button">
                <span className="text-xs font-bold flex items-center gap-2" style={{ color: th.danger }}>
                  <X className="h-3.5 w-3.5" /> {t("removedFields")} ({removedFields.length})
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${showRemoved ? "" : "-rotate-90"}`} style={{ color: th.textDim }} />
              </button>
              {showRemoved && (
                <div className="px-4 py-2 max-h-40 overflow-y-auto space-y-0.5">
                  {removedFields.map(k => (
                    <div key={k} className="text-[11px] font-mono py-0.5 flex items-center gap-1.5" style={{ color: th.textMuted }}>
                      <X className="h-2.5 w-2.5 shrink-0" style={{ color: th.danger }} />
                      {formatFieldName(k)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-end gap-3" style={{ borderTop: `1px solid ${th.cardBorder}` }}>
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{ color: th.textDim }}>
            {t("cancel")}
          </button>
          <button onClick={() => name.trim() && onSave(name.trim())}
            disabled={!name.trim()}
            className="px-5 py-2.5 rounded-xl text-sm font-black transition-all flex items-center gap-2"
            style={{
              background: name.trim() ? "linear-gradient(135deg, #3b82f6, #60a5fa)" : (isLeg ? "rgba(0,0,0,0.05)" : "rgba(59,130,246,0.08)"),
              color: name.trim() ? "#ffffff" : th.textDim,
              boxShadow: name.trim() ? "0 4px 16px rgba(59,130,246,0.3)" : "none",
              opacity: name.trim() ? 1 : 0.5,
            }}>
            <Save className="h-4 w-4" /> {t("saveTemplate")}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function shortenUri(uri: string): string {
  if (!uri) return "";
  return uri
    .replace("http://id.loc.gov/ontologies/bibframe/", "bf:")
    .replace("http://id.loc.gov/vocabulary/relators/", "rel:")
    .replace("http://id.loc.gov/vocabulary/languages/", "lang:")
    .replace("http://id.loc.gov/vocabulary/carriers/", "carrier:")
    .replace("http://id.loc.gov/vocabulary/mediaTypes/", "media:")
    .replace("http://id.loc.gov/vocabulary/countries/", "country:")
    .replace("http://id.loc.gov/authorities/names/", "naf:")
    .replace("http://id.loc.gov/authorities/subjects/", "lcsh:")
    .replace("http://id.loc.gov/authorities/genreForms/", "lcgft:")
    .replace("http://www.w3.org/2000/01/rdf-schema#", "rdfs:")
    .replace("http://www.w3.org/1999/02/22-rdf-syntax-ns#", "rdf:")
    .replace("http://www.w3.org/2001/XMLSchema#", "xsd:")
    .replace("https://moonlib.org/resource/", "moon:")
    .replace("https://moonlib.org/", "moon:");
}

export { WolfMoon };
