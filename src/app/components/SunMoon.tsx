/**
 * SUN MOON - Light Theme Ontology-Driven BIBFRAME Template Processor
 * 
 * Identical functionality to Moon BIBFRAME Template but with the classic
 * light glassmorphism theme (moon-bibframe-light). All records are tagged
 * with catalogingInterface: 'Sun Moon' for routing.
 * 
 * Designed and developed by Isaac Faleh
 */

"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Toaster } from "./ui/sonner";
import {
  Save, Download, Upload, ChevronLeft, ChevronDown, ChevronRight,
  Search, BookOpen, Package, Layers, Database, FileText, Code, Braces,
  Sparkles, Book, Network, CheckCircle2, AlertCircle, AlertTriangle,
  BarChart3, Clock, Loader2, Eye, Music, Map, FileJson, Globe, User,
  Building, MapPin, Tag, Newspaper, Archive, Shield, Hash, Activity,
  Copy, ExternalLink, Zap, Settings, RefreshCw, Plus, X, Info, Sun
} from "lucide-react";

// ===== CORE SERVICES (src/services/) =====
import { GraphStore } from "../../services/graphStore";
import { generateUri, toTurtle, toJsonLd, extractTriples, validateGraphConnectivity } from "../../services/rdfGraphBuilder";
import {
  RelationshipGraph, Relationship, generateRelationshipId,
  RELATIONSHIP_DEFINITIONS, getRelationshipTypesForDomain
} from "../../services/relationshipManager";
import { validateBibframeRecord, ValidationResult as BFValidationResult } from "../../services/bibframeValidator";
import { validateInstitutionalBibframe, getValidationBadge, InstitutionalValidationResult } from "../../services/institutionalValidator";
import {
  ONTOLOGY_REGISTRY, OntologyProperty,
  getPropertiesByDomain, getCategoriesForDomain
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

// ===== APP SERVICES (src/app/services/) =====
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
import { getThemeGradients } from "../utils/themeGradients";

// ===== COMPONENTS =====
import { OntologyField } from "./ontology/OntologyField";
import { OPACPreview } from "./ontology/OPACPreview";
import { MindMapPreview } from "./ontology/MindMapPreview";
import { ImportRecordDialog } from "./ontology/ImportRecordDialog";
import { OntologyDrivenFormRenderer } from "./cataloging/OntologyDrivenFormRenderer";
import { ValidationPanel, validateGraph, ValidationResult } from "./cataloging/ValidationPanel";
import { RecordViewerDialog } from "./cataloging/RecordViewerDialog";
import { CatalogingWizard, WizardStep } from "./cataloging/CatalogingWizard";
import { AuthoritySelect, AuthorityMultiSelect } from "./cataloging/AuthoritySelect";
import { AuthoritySearchDialog } from "./AuthoritySearchDialog";
import { AuthorityGraph } from "./AuthorityGraph";
import { MarcView } from "./RecordView/MarcView";
import { RdfView } from "./RecordView/RdfView";

// ===== CONTEXTS =====
import { useAuth } from "../contexts/AuthContext";
import { useThemeSafe } from "../hooks/useThemeSafe";
import { BIBFRAMERecord } from "../types/bibframe";

// ===== ASSETS =====
import moonLogo from "figma:asset/448923f9298ec547f27dd322785433298cd5ac34.png";
import "../../styles/glassmorphism.css";
import { toBibframeJsonLdString } from '../../services/bibframeNormalizer';

// Background image for the blur view effect (expo-ios-visual-blur style)
const BG_IMAGE = "https://images.unsplash.com/photo-1771803426175-f412a2de69b0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzb2Z0JTIwZ29sZGVuJTIwc3VucmlzZSUyMGFic3RyYWN0JTIwZ3JhZGllbnQlMjBsaWdodHxlbnwxfHx8fDE3NzIyODcwMzZ8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral";

// ============================== TYPES ==============================

type OutputTab = "editor" | "jsonld" | "w3c-jsonld" | "turtle" | "ntriples" | "marc" | "triples" | "opac" | "mindmap" | "validation" | "relationships" | "authority-graph";
type SaveStatus = "saved" | "unsaved" | "saving" | "error";

interface SunMoonProps {
  onBack?: () => void;
  initialWork?: any;
  initialInstance?: any;
  onRecordSaved?: () => void;
}

// ============================== TEMPLATE ICONS ==============================

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  "monograph-complete": <BookOpen className="h-5 w-5" />,
  "serial": <Newspaper className="h-5 w-5" />,
  "manuscript": <Archive className="h-5 w-5" />,
  "music": <Music className="h-5 w-5" />,
  "map": <Map className="h-5 w-5" />,
};

const TEMPLATE_COLORS: Record<string, string> = {
  "monograph-complete": "from-blue-500 to-indigo-600",
  "serial": "from-green-500 to-emerald-600",
  "manuscript": "from-amber-500 to-orange-600",
  "music": "from-purple-500 to-pink-600",
  "map": "from-teal-500 to-cyan-600",
};

// ============================== MAIN COMPONENT ==============================

export default function SunMoon({
  onBack, initialWork, initialInstance, onRecordSaved
}: SunMoonProps) {
  const { t, i18n } = useTranslation();
  const { username } = useAuth();
  const { moonEngineTheme } = useThemeSafe();
  const gradients = getThemeGradients(moonEngineTheme);
  const [language, setLanguage] = useState<"en" | "ar">(i18n.language as "en" | "ar");

  // ===== TEMPLATE SELECTION =====
  const [selectedTemplate, setSelectedTemplate] = useState<string>("monograph-complete");
  const template = useMemo(() => getTemplate(selectedTemplate) || MONOGRAPH_COMPLETE_TEMPLATE, [selectedTemplate]);

  // ===== ACTIVE TAB =====
  const [activeTab, setActiveTab] = useState<OutputTab>("editor");

  // ===== URI MINTING =====
  const [recordId] = useState(() => generateRecordId());
  const [uriSet] = useState<UriSet>(() => mintUriSet(recordId));

  // ===== GRAPH STORE =====
  const [graphStore] = useState(new GraphStore());
  const [enableExpression, setEnableExpression] = useState(false);
  const [relationshipGraph] = useState(new RelationshipGraph());
  const [relationships, setRelationships] = useState<Relationship[]>([]);

  // ===== SERIALIZATION STATE =====
  const [graphJsonld, setGraphJsonld] = useState<any>(null);
  const [graphTurtle, setGraphTurtle] = useState("");
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
  const [showExampleMenu, setShowExampleMenu] = useState(false);

  // ===== EXPANDED SECTIONS =====
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set(["Work", "Instance"]));

  // ===== ONTOLOGY PROPERTIES =====
  const workProperties = getPropertiesForDomain("bf:Work");
  const instanceProperties = getPropertiesForDomain("bf:Instance");

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
      "@id": adminUri,
      "@type": "bf:AdminMetadata",
      "bf:creationDate": new Date().toISOString().split("T")[0],
      "bf:source": { "@id": "https://moonlib.org", "rdfs:label": "Moon Library System" },
      "bf:descriptionConventions": { "@id": "http://id.loc.gov/vocabulary/descriptionConventions/rda", "rdfs:label": "RDA" },
      "bf:descriptionLanguage": { "@id": "http://id.loc.gov/vocabulary/languages/eng", "rdfs:label": "English" },
      "bf:generationProcess": `Sun Moon v1.0 (${template.name})`,
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

  useEffect(() => { if (initialWork) setWorkData(initialWork); }, [initialWork]);
  useEffect(() => { if (initialInstance) setInstanceData(initialInstance); }, [initialInstance]);

  useEffect(() => {
    const currentWork = graphStore.getNode(uriSet.work);
    if (currentWork) {
      graphStore.setNode(uriSet.work, { ...currentWork, ...workData, "@id": uriSet.work, "@type": "bf:Work" });
    }
    const currentInstance = graphStore.getNode(uriSet.instance);
    if (currentInstance) {
      graphStore.setNode(uriSet.instance, { ...currentInstance, ...instanceData, "@id": uriSet.instance, "@type": "bf:Instance" });
    }
    const timer = setTimeout(() => regenerateRDF(), 300);
    return () => clearTimeout(timer);
  }, [workData, instanceData]);

  // ============================== GRAPH ENGINE ==============================

  const handlePropertyChange = useCallback((nodeUri: string, property: string, value: any) => {
    graphStore.setProperty(nodeUri, property, value);
    if (nodeUri === uriSet.work) {
      setWorkData((prev: any) => ({ ...prev, [property]: value }));
    } else if (nodeUri === uriSet.instance) {
      setInstanceData((prev: any) => ({ ...prev, [property]: value }));
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

      try {
        const turtleOutput = toTurtle(graphData);
        setGraphTurtle(turtleOutput);
      } catch { setGraphTurtle(""); }

      try {
        const itemNode = graphStore.getNode(uriSet.item);
        const exprNode = graphStore.getNode(uriSet.expression);
        const adminNode = graphStore.getNode(uriSet.admin);
        const w3cDoc = buildW3CJsonLd({
          workData, instanceData,
          itemData: itemNode || {},
          expressionData: exprNode || {},
          adminData: adminNode || {},
          uriSet, enableExpression
        });
        setW3cJsonLd(w3cDoc);

        const w3cVal = validateW3CJsonLd(w3cDoc);
        setW3cValidation(w3cVal);

        try { setW3cTurtle(jsonLdToTurtle(w3cDoc)); } catch { setW3cTurtle(""); }
        try { setW3cNTriples(jsonLdToNTriples(w3cDoc)); } catch { setW3cNTriples(""); }
      } catch (e) {
        console.error("W3C JSON-LD build error:", e);
      }
    } catch (error) {
      console.error("Graph RDF generation error:", error);
    }
  };

  // ============================== ONTOLOGY FORM ==============================

  const updateWorkProperty = useCallback((uri: string, value: any) => {
    const propertyName = uri.split("/").pop() || uri;
    setWorkData((prev: any) => ({ ...prev, [propertyName]: value }));
    setSaveStatus("unsaved");
  }, []);

  const updateInstanceProperty = useCallback((uri: string, value: any) => {
    const propertyName = uri.split("/").pop() || uri;

    if (value && value._isbnLookupData) {
      const data: ISBNData = value._isbnLookupData;
      const cleanValue = { ...value };
      delete cleanValue._isbnLookupData;

      setInstanceData((prev: any) => {
        const updated = { ...prev, [propertyName]: cleanValue };
        if (data.numberOfPages) {
          updated["bf:extent"] = { value: `${data.numberOfPages} pages`, "@type": "bf:Extent" };
        }
        if (data.publishers && data.publishers.length > 0) {
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
        if (data.authors && data.authors.length > 0) {
          updated["bf:contribution"] = data.authors.map((author: string) => ({
            "bf:agent": { "@type": "bf:Person", "rdfs:label": author },
            "bf:role": { "@id": "http://id.loc.gov/vocabulary/relators/aut", "rdfs:label": "Author" },
          }));
        }
        return updated;
      });

      setSaveStatus("unsaved");
      toast.success("ISBN auto-fill complete!", {
        description: `Filled: ${[data.title, data.authors?.join(", "), data.publishers?.[0], data.publishDate].filter(Boolean).join(" - ")}`,
        duration: 5000,
      });
      return;
    }

    setInstanceData((prev: any) => ({ ...prev, [propertyName]: value }));
    setSaveStatus("unsaved");
  }, []);

  // ============================== RELATIONSHIPS ==============================

  const addRelationship = (domain: "Work" | "Instance" = "Work") => {
    const types = getRelationshipTypesForDomain(domain);
    const newRel: Relationship = {
      id: generateRelationshipId(),
      type: types[0] || "relatedTo",
      sourceUri: domain === "Work" ? uriSet.work : uriSet.instance,
      targetUri: "",
      label: "",
    };
    setRelationships(prev => [...prev, newRel]);
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
      setInstanceData((prev: any) => ({
        ...prev,
        "bf:title": { "@type": "bf:Title", "bf:mainTitle": entity.title_long || entity.title || entity.label },
        "bf:identifiedBy": [{ "@type": "bf:Isbn", "rdf:value": entity.isbn13 || entity.isbn || entity.id }],
      }));
      if (entity.authors) {
        const authors = Array.isArray(entity.authors) ? entity.authors : [entity.authors];
        setWorkData((prev: any) => ({
          ...prev,
          "bf:contribution": [
            ...(prev["bf:contribution"] || []),
            ...authors.map((a: string) => ({
              "@type": "bf:Contribution",
              "bf:agent": { "@type": "bf:Person", "rdfs:label": a },
              "bf:role": { "@id": "http://id.loc.gov/vocabulary/relators/aut", "rdfs:label": "Author" },
            })),
          ],
        }));
      }
      toast.success("Book imported!", { description: entity.title || entity.label });
      return;
    }
    if (entity.type === "subject") {
      setWorkData((prev: any) => ({
        ...prev,
        "bf:subject": [...(prev["bf:subject"] || []), { "@type": "bf:Topic", "rdfs:label": entity.subject || entity.label }],
      }));
      toast.success("Subject added!");
      return;
    }
    const contribution = {
      "@type": "bf:Contribution",
      "bf:agent": {
        "@id": entity.identifiers?.loc ? `http://id.loc.gov/authorities/names/${entity.identifiers.loc}` : entity.id,
        "@type": "bf:Person",
        "rdfs:label": entity.label,
      },
      "bf:role": { "@id": "http://id.loc.gov/vocabulary/relators/aut", "rdfs:label": "Author" },
    };
    setWorkData((prev: any) => ({
      ...prev, "bf:contribution": [...(prev["bf:contribution"] || []), contribution],
    }));
    toast.success(`${entity.label} added!`);
  };

  // ============================== EXAMPLES & IMPORT ==============================

  const handleLoadExample = (exampleData: any) => {
    setWorkData({ ...exampleData.work, "@id": uriSet.work });
    setInstanceData({ ...exampleData.instance, "@id": uriSet.instance, "bf:instanceOf": { "@id": uriSet.work } });
    setShowExampleMenu(false);
    setSaveStatus("unsaved");
    toast.success("Loaded Real LOC Example", { description: "Complete bibliographic record with proper authority URIs.", duration: 4000 });
  };

  const handleImport = (importedWorkData: any, importedInstanceData: any) => {
    setWorkData({ ...importedWorkData, "@id": uriSet.work });
    setInstanceData({ ...importedInstanceData, "@id": uriSet.instance, "bf:instanceOf": { "@id": uriSet.work } });
    setSaveStatus("unsaved");
    toast.success("Record imported!");
  };

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
        "@context": {
          bf: "http://id.loc.gov/ontologies/bibframe/",
          bflc: "http://id.loc.gov/ontologies/bflc/",
          rdfs: "http://www.w3.org/2000/01/rdf-schema#",
          rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
          xsd: "http://www.w3.org/2001/XMLSchema#",
          madsrdf: "http://www.loc.gov/mads/rdf/v1#",
        },
        work: workData,
        instance: instanceData,
        metadata: {
          catalogingLanguage: language,
          descriptionConventions: "rda",
          catalogingInterface: "Sun Moon",
          resourceType: `Sun Moon (${template.name})`,
          templateId: selectedTemplate,
          recordId,
          uriSet,
          ontologyVersion: ONTOLOGY_VERSION.version,
          createdAt: new Date().toISOString(),
          catalogerId: username || "anonymous",
        },
      };

      const savedRecord = await saveRecord(record, username || "Anonymous");
      setSaveStatus("saved");
      toast.success("Record saved!", { description: title });
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
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  // ============================== COMPUTED VALUES ==============================

  const graph = buildBibframeGraph(workData, instanceData);
  const graphStats = graphStore.getStats();

  const authorityNodes = (workData["bf:contribution"] || [])
    .filter((c: any) => c["bf:agent"])
    .map((c: any, i: number) => ({
      id: c["bf:agent"]["@id"] || `agent-${i}`,
      label: c["bf:agent"]["rdfs:label"] || "Unknown",
      source: c["bf:agent"]["@id"]?.includes("loc.gov") ? ("LOC" as const) : ("AfIqa" as const),
      uri: c["bf:agent"]["@id"] || "",
      type: "person" as const,
      connections: [],
    }));

  const completionScore = useMemo(() => {
    let filled = 0;
    let total = 0;
    const sections = template.entities.work || [];
    sections.forEach(s => {
      s.fields.forEach(f => {
        total++;
        const prop = f.property.replace("bf:", "");
        if (workData[f.property] || workData[`bf:${prop}`] || workData[prop]) filled++;
      });
    });
    const instSections = template.entities.instance || [];
    instSections.forEach(s => {
      s.fields.forEach(f => {
        total++;
        const prop = f.property.replace("bf:", "");
        if (instanceData[f.property] || instanceData[`bf:${prop}`] || instanceData[prop]) filled++;
      });
    });
    return total > 0 ? Math.round((filled / total) * 100) : 0;
  }, [workData, instanceData, template]);

  const tripleCount = graphTriples.length;
  const connectivity = useMemo(() => graphJsonld ? validateGraphConnectivity(graphJsonld) : { connected: false, orphans: [] }, [graphJsonld]);

  // ============================== RENDER ==============================

  return (
    <div className="moon-bibframe-light h-screen flex flex-col relative overflow-hidden">
      {/* ===== BACKGROUND IMAGE (expo-ios-visual-blur style) ===== */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `url(${BG_IMAGE})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      {/* Directional gradient blur overlay: clear at top, blurred at bottom (BlurredBottomClearTop) */}
      <div
        className="absolute inset-0 z-[1]"
        style={{
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.4) 20%, rgba(255,255,255,0.65) 50%, rgba(255,255,255,0.85) 80%, rgba(255,255,255,0.95) 100%)',
        }}
      />
      {/* Secondary blur layer that increases downward (simulating maxBlurRadius: 25, startOffset: 0.2) */}
      <div
        className="absolute inset-0 z-[2]"
        style={{
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          maskImage: 'linear-gradient(to bottom, transparent 0%, transparent 15%, black 60%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, transparent 15%, black 60%)',
        }}
      />

      <Toaster position="top-right" />

      {/* ===== TOP BAR (frosted glass over background) ===== */}
      <div className="glass-navbar-dark relative z-10" style={{
        background: 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.6)',
        boxShadow: '0 4px 30px rgba(0,0,0,0.06)',
      }}>
        <div className="px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {onBack && (
                <button onClick={onBack} className="glass-button-dark px-3 py-2 flex items-center gap-2">
                  <ChevronLeft className="h-4 w-4" /> Back
                </button>
              )}
              <img src={moonLogo} alt="Moon" className="h-12 w-auto" />
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                  <Sun className="h-5 w-5 text-amber-500" style={{ color: '#f59e0b' }} />
                  Sun Moon
                </h1>
                <p className="text-xs" style={{ color: '#666' }}>
                  Ontology v{ONTOLOGY_VERSION.version} - {template.name} - Record: {recordId.slice(0, 8)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {institutionalValidation && (
                <div className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                  institutionalValidation.score >= 85 ? "bg-green-500/30 border-green-500/50" :
                  institutionalValidation.score >= 50 ? "bg-yellow-500/30 border-yellow-500/50" :
                  "bg-red-500/30 border-red-500/50"
                }`} style={{ color: institutionalValidation.score >= 85 ? '#16a34a' : institutionalValidation.score >= 50 ? '#ca8a04' : '#dc2626' }}>
                  {getValidationBadge(institutionalValidation)} ({institutionalValidation.score}/100)
                </div>
              )}
              <SaveStatusBadge status={saveStatus} />
              <input
                type="text" value={recordTitle}
                onChange={(e) => { setRecordTitle(e.target.value); setSaveStatus("unsaved"); }}
                className="px-3 py-1.5 glass-input-dark rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                placeholder="Record Title" style={{ width: "200px" }}
              />
            </div>
          </div>

          {/* ===== TEMPLATE SELECTOR + STATS BAR ===== */}
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            {getAllTemplates().map(tmpl => (
              <button
                key={tmpl.id}
                onClick={() => setSelectedTemplate(tmpl.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  selectedTemplate === tmpl.id
                    ? `bg-gradient-to-r ${TEMPLATE_COLORS[tmpl.id] || "from-blue-500 to-indigo-600"} !text-white shadow-lg scale-105`
                    : "glass-button-dark"
                }`}
                style={selectedTemplate === tmpl.id ? { color: '#fff' } : {}}
              >
                {TEMPLATE_ICONS[tmpl.id]} {tmpl.name}
              </button>
            ))}

            <span className="w-px h-6 bg-gray-300" />

            {/* Live Stats */}
            <div className="flex items-center gap-4 text-xs" style={{ color: '#555' }}>
              <span className="flex items-center gap-1"><Database className="h-3.5 w-3.5" style={{ color: '#0891b2' }} /> {graphStats.nodeCount} Nodes</span>
              <span className="flex items-center gap-1"><Network className="h-3.5 w-3.5" style={{ color: '#9333ea' }} /> {tripleCount} Triples</span>
              <span className="flex items-center gap-1"><Activity className="h-3.5 w-3.5" style={{ color: '#16a34a' }} /> {completionScore}% Complete</span>
              <span className="flex items-center gap-1">
                {connectivity.connected
                  ? <><CheckCircle2 className="h-3.5 w-3.5" style={{ color: '#16a34a' }} /> Connected</>
                  : <><AlertTriangle className="h-3.5 w-3.5" style={{ color: '#ca8a04' }} /> {connectivity.orphans.length} Orphans</>
                }
              </span>
              {Object.entries(graphStats.types).map(([type, count]) => (
                <span key={type} style={{ color: '#888' }}>{type.replace("bf:", "")}: {count as number}</span>
              ))}
            </div>
          </div>

          {/* ===== ACTION BUTTONS ===== */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button onClick={handleSave} className="glass-button-dark px-4 py-2 flex items-center gap-2 text-sm">
              <Save className="h-4 w-4" /> Save
            </button>
            <div className="relative">
              <button onClick={() => setShowExampleMenu(!showExampleMenu)} className="glass-button-dark px-4 py-2 flex items-center gap-2 text-sm">
                <Database className="h-4 w-4" /> Load Example
              </button>
              {showExampleMenu && (
                <div className="absolute top-full left-0 mt-2 w-80 glass-card-dark z-50 max-h-96 overflow-y-auto p-2">
                  <div className="px-3 py-2 text-xs font-semibold border-b" style={{ borderColor: '#ddd', color: '#666' }}>Real LOC Examples</div>
                  {realLocExamples.map((example) => (
                    <button key={example.id} className="w-full text-left px-3 py-2 rounded hover:bg-black/5"
                      onClick={() => handleLoadExample(example.data)}>
                      <div className="font-medium text-sm">{example.name}</div>
                      <div className="text-xs" style={{ color: '#888' }}>{example.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setShowAuthoritySearch(true)} className="glass-button-dark px-4 py-2 flex items-center gap-2 text-sm">
              <Search className="h-4 w-4" /> Authority Search
            </button>
            <button onClick={() => setShowImportDialog(true)} className="glass-button-dark px-4 py-2 flex items-center gap-2 text-sm">
              <Upload className="h-4 w-4" /> Import
            </button>
            <button onClick={() => downloadFile(toBibframeJsonLdString(w3cJsonLd || graphJsonld || graph), `${recordId}-w3c.jsonld`, "application/ld+json")}
              className="glass-button-dark px-4 py-2 flex items-center gap-2 text-sm">
              <Download className="h-4 w-4" /> W3C JSON-LD
            </button>
            {w3cTurtle && (
              <button onClick={() => downloadFile(w3cTurtle, `${recordId}.ttl`, "text/turtle")}
                className="glass-button-dark px-4 py-2 flex items-center gap-2 text-sm">
                <Download className="h-4 w-4" /> Turtle
              </button>
            )}
            {w3cNTriples && (
              <button onClick={() => downloadFile(w3cNTriples, `${recordId}.nt`, "application/n-triples")}
                className="glass-button-dark px-4 py-2 flex items-center gap-2 text-sm">
                <Download className="h-4 w-4" /> N-Triples
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ===== OUTPUT TABS (frosted glass) ===== */}
      <div className="glass-navbar-dark relative z-10" style={{
        background: 'rgba(255,255,255,0.45)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        borderTop: '1px solid rgba(255,255,255,0.5)',
        borderBottom: '1px solid rgba(255,255,255,0.4)',
      }}>
        <div className="px-6 py-2">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <SunTab active={activeTab === "editor"} onClick={() => setActiveTab("editor")} icon={<Layers className="h-3.5 w-3.5" />} label="BIBFRAME Editor" color="blue" />
            <SunTab active={activeTab === "w3c-jsonld"} onClick={() => setActiveTab("w3c-jsonld")} icon={<Shield className="h-3.5 w-3.5" />} label={`W3C JSON-LD ${w3cValidation?.valid ? "\u2713" : ""}`} color="green" />
            <SunTab active={activeTab === "jsonld"} onClick={() => setActiveTab("jsonld")} icon={<Braces className="h-3.5 w-3.5" />} label="Raw JSON-LD" color="green" />
            <SunTab active={activeTab === "turtle"} onClick={() => setActiveTab("turtle")} icon={<Code className="h-3.5 w-3.5" />} label="Turtle" color="purple" />
            <SunTab active={activeTab === "ntriples"} onClick={() => setActiveTab("ntriples")} icon={<FileText className="h-3.5 w-3.5" />} label="N-Triples" color="orange" />
            <SunTab active={activeTab === "marc"} onClick={() => setActiveTab("marc")} icon={<Database className="h-3.5 w-3.5" />} label="MARC" color="red" />
            <SunTab active={activeTab === "triples"} onClick={() => setActiveTab("triples")} icon={<Hash className="h-3.5 w-3.5" />} label={`Triples (${tripleCount})`} color="orange" />
            <SunTab active={activeTab === "opac"} onClick={() => setActiveTab("opac")} icon={<Eye className="h-3.5 w-3.5" />} label="OPAC" color="purple" />
            <SunTab active={activeTab === "mindmap"} onClick={() => setActiveTab("mindmap")} icon={<Sparkles className="h-3.5 w-3.5" />} label="Mind Map" color="orange" />
            <SunTab active={activeTab === "validation"} onClick={() => setActiveTab("validation")} icon={<Shield className="h-3.5 w-3.5" />} label="Validation" color="green" />
            <SunTab active={activeTab === "relationships"} onClick={() => setActiveTab("relationships")} icon={<Network className="h-3.5 w-3.5" />} label="Relationships" color="blue" />
            <SunTab active={activeTab === "authority-graph"} onClick={() => setActiveTab("authority-graph")} icon={<Globe className="h-3.5 w-3.5" />} label="Authority Graph" color="purple" />
          </div>
        </div>
      </div>

      {/* ===== MAIN CONTENT (blur view - content inside blur container) ===== */}
      <div className="flex-1 overflow-auto p-6 relative z-10" style={{
        background: 'transparent',
      }}>
        {/* ===== BIBFRAME EDITOR ===== */}
        {activeTab === "editor" && (
          <div className="space-y-4">
            {/* Template Info Card */}
            <div className="glass-card-dark p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl bg-gradient-to-r ${TEMPLATE_COLORS[selectedTemplate] || "from-blue-500 to-indigo-600"}`}>
                    {TEMPLATE_ICONS[selectedTemplate] || <BookOpen className="h-6 w-6" style={{ color: '#fff' }} />}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">{template.name} Template</h2>
                    <p className="text-xs" style={{ color: '#888' }}>{template.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={enableExpression} onChange={toggleExpression}
                      className="w-4 h-4 rounded text-purple-500 focus:ring-purple-500" />
                    Expression Layer
                  </label>
                  <div className="text-xs" style={{ color: '#888' }}>
                    URI: <span className="font-mono" style={{ color: '#0891b2' }}>{uriSet.work.split("/").pop()}</span>
                  </div>
                </div>
              </div>
              {graphValidation && (
                <div className={`mt-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${
                  graphValidation.valid ? "bg-green-500/20" : "bg-yellow-500/20"
                }`} style={{ color: graphValidation.valid ? '#16a34a' : '#ca8a04' }}>
                  {graphValidation.valid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                  {graphValidation.valid
                    ? `Graph valid - ${graphStats.nodeCount} nodes, ${tripleCount} triples`
                    : `${graphValidation.errors.length} errors, ${graphValidation.warnings.length} warnings`
                  }
                </div>
              )}
            </div>

            {/* ===== WORK ENTITY ===== */}
            <SunEntitySection
              title="Work" subtitle="Intellectual Content" color="blue"
              icon={<BookOpen className="h-6 w-6" style={{ color: '#3b82f6' }} />}
              uri={uriSet.work}
              expanded={expandedEntities.has("Work")}
              onToggle={() => toggleEntity("Work")}
              requiredCount={workRequiredProps.length}
              groups={templateWorkGroups}
            >
              <OntologyDrivenFormRenderer
                entityType="Work" nodeUri={uriSet.work}
                graphStore={graphStore} onChange={handlePropertyChange}
              />
              <div className="mt-6 pt-4" style={{ borderTop: '1px solid #ddd' }}>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Ontology-Driven Fields (OntologyField)
                </h4>
                <div className="space-y-3">
                  {workProperties.map(property => (
                    <OntologyField
                      key={property.uri}
                      property={property}
                      value={workData[property.uri.split("/").pop() || ""]}
                      onChange={(value) => updateWorkProperty(property.uri, value)}
                      language={language}
                    />
                  ))}
                </div>
              </div>
              {workData["bf:contribution"]?.length > 0 && (
                <div className="mt-4 p-4 rounded-lg" style={{ background: 'rgba(255,255,255,0.4)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.5)' }}>
                  <h4 className="text-sm font-semibold mb-2">Contributors ({workData["bf:contribution"].length})</h4>
                  <div className="space-y-2">
                    {workData["bf:contribution"].map((c: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 p-2 rounded text-sm" style={{ background: 'rgba(255,255,255,0.35)' }}>
                        <User className="h-4 w-4" style={{ color: '#3b82f6' }} />
                        <span className="font-medium">{c["bf:agent"]?.["rdfs:label"] || "Unknown"}</span>
                        <span className="text-xs" style={{ color: '#888' }}>{c["bf:role"]?.["rdfs:label"] || "Contributor"}</span>
                        {c["bf:agent"]?.["@id"] && (
                          <span className="text-xs font-mono truncate ml-auto" style={{ color: '#aaa' }}>{c["bf:agent"]["@id"]}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </SunEntitySection>

            {/* ===== EXPRESSION (optional) ===== */}
            {enableExpression && (
              <SunEntitySection
                title="Expression" subtitle="Realization of Work" color="purple"
                icon={<Sparkles className="h-6 w-6" style={{ color: '#9333ea' }} />}
                uri={uriSet.expression}
                expanded={expandedEntities.has("Expression")}
                onToggle={() => toggleEntity("Expression")}
              >
                <OntologyDrivenFormRenderer
                  entityType="Expression" nodeUri={uriSet.expression}
                  graphStore={graphStore} onChange={handlePropertyChange}
                />
              </SunEntitySection>
            )}

            {/* ===== INSTANCE ENTITY ===== */}
            <SunEntitySection
              title="Instance" subtitle="Physical Manifestation" color="green"
              icon={<Package className="h-6 w-6" style={{ color: '#16a34a' }} />}
              uri={uriSet.instance}
              expanded={expandedEntities.has("Instance")}
              onToggle={() => toggleEntity("Instance")}
              requiredCount={instanceRequiredProps.length}
              groups={templateInstanceGroups}
            >
              <OntologyDrivenFormRenderer
                entityType="Instance" nodeUri={uriSet.instance}
                graphStore={graphStore} onChange={handlePropertyChange}
              />
              <div className="mt-6 pt-4" style={{ borderTop: '1px solid #ddd' }}>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Ontology-Driven Fields (OntologyField)
                </h4>
                <div className="space-y-3">
                  {instanceProperties.map(property => (
                    <OntologyField
                      key={property.uri}
                      property={property}
                      value={instanceData[property.uri.split("/").pop() || ""]}
                      onChange={(value) => updateInstanceProperty(property.uri, value)}
                      language={language}
                    />
                  ))}
                </div>
              </div>
            </SunEntitySection>

            {/* ===== ITEM ENTITY ===== */}
            <SunEntitySection
              title="Item" subtitle="Specific Copy / Holdings" color="orange"
              icon={<Archive className="h-6 w-6" style={{ color: '#ea580c' }} />}
              uri={uriSet.item}
              expanded={expandedEntities.has("Item")}
              onToggle={() => toggleEntity("Item")}
              groups={templateItemGroups}
            >
              <OntologyDrivenFormRenderer
                entityType="Item" nodeUri={uriSet.item}
                graphStore={graphStore} onChange={handlePropertyChange}
              />
            </SunEntitySection>

            {/* ===== ADMIN METADATA ===== */}
            <SunEntitySection
              title="Administrative Metadata" subtitle="Record Provenance" color="gray"
              icon={<Settings className="h-6 w-6" style={{ color: '#6b7280' }} />}
              uri={uriSet.admin}
              expanded={expandedEntities.has("Admin")}
              onToggle={() => toggleEntity("Admin")}
            >
              <div className="grid grid-cols-2 gap-4 text-sm">
                <SunInfoRow label="Record ID" value={recordId} mono />
                <SunInfoRow label="Created" value={new Date().toISOString().split("T")[0]} />
                <SunInfoRow label="Cataloger" value={username || "anonymous"} />
                <SunInfoRow label="Template" value={template.name} />
                <SunInfoRow label="Conventions" value="RDA" />
                <SunInfoRow label="Ontology" value={`BIBFRAME ${ONTOLOGY_VERSION.version}`} />
                <SunInfoRow label="Source" value="Moon Library System" />
                <SunInfoRow label="Language" value={language === "en" ? "English" : "Arabic"} />
              </div>
            </SunEntitySection>
          </div>
        )}

        {/* ===== W3C-COMPLIANT JSON-LD ===== */}
        {activeTab === "w3c-jsonld" && (
          <div className="space-y-4">
            {w3cValidation && (
              <div className={`glass-card-dark p-4 border-l-4 ${w3cValidation.valid ? "border-green-500" : "border-red-500"}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {w3cValidation.valid
                      ? <><CheckCircle2 className="h-6 w-6" style={{ color: '#16a34a' }} /><span className="font-bold text-lg" style={{ color: '#16a34a' }}>W3C-Compliant JSON-LD</span></>
                      : <><AlertCircle className="h-6 w-6" style={{ color: '#dc2626' }} /><span className="font-bold text-lg" style={{ color: '#dc2626' }}>{w3cValidation.errors.length} Compliance Error(s)</span></>
                    }
                  </div>
                  <div className="flex items-center gap-3 text-xs" style={{ color: '#888' }}>
                    <span>{w3cValidation.stats.nodeCount} nodes</span>
                    <span>~{w3cValidation.stats.tripleEstimate} triples</span>
                    <span>{w3cValidation.stats.prefixesUsed.length} prefixes</span>
                    <span style={{ color: w3cValidation.stats.contextComplete ? '#16a34a' : '#dc2626' }}>
                      Context: {w3cValidation.stats.contextComplete ? "Complete" : "Incomplete"}
                    </span>
                  </div>
                </div>
                <div className="text-xs mb-2" style={{ color: '#888' }}>
                  This output passes: <span style={{ color: '#0891b2' }}>json-ld.org/playground</span> | <span style={{ color: '#0891b2' }}>W3C RDF Validator</span> | <span style={{ color: '#0891b2' }}>Apache Jena/Fuseki</span> | <span style={{ color: '#0891b2' }}>Blazegraph</span> | <span style={{ color: '#0891b2' }}>GraphDB</span>
                </div>
                {w3cValidation.errors.length > 0 && (
                  <div className="mt-2 space-y-1">{w3cValidation.errors.map((e, i) => (
                    <div key={i} className="text-xs p-1.5 bg-red-500/10 rounded flex items-start gap-1.5">
                      <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" style={{ color: '#dc2626' }} />
                      <span style={{ color: '#dc2626' }}>{e}</span>
                    </div>
                  ))}</div>
                )}
                {w3cValidation.warnings.length > 0 && (
                  <div className="mt-2 space-y-1">{w3cValidation.warnings.map((w, i) => (
                    <div key={i} className="text-xs p-1.5 bg-yellow-500/10 rounded flex items-start gap-1.5">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" style={{ color: '#ca8a04' }} />
                      <span style={{ color: '#ca8a04' }}>{w}</span>
                    </div>
                  ))}</div>
                )}
                {w3cValidation.info.length > 0 && (
                  <div className="mt-2 space-y-1">{w3cValidation.info.map((inf, i) => (
                    <div key={i} className="text-xs p-1.5 bg-blue-500/10 rounded flex items-start gap-1.5">
                      <Info className="h-3 w-3 mt-0.5 shrink-0" style={{ color: '#3b82f6' }} />
                      <span style={{ color: '#3b82f6' }}>{inf}</span>
                    </div>
                  ))}</div>
                )}
                <div className="mt-3 flex gap-2">
                  <a href={`https://json-ld.org/playground/#startTab=tab-expanded&json-ld=${encodeURIComponent(JSON.stringify(w3cJsonLd))}`}
                    target="_blank" rel="noopener noreferrer"
                    className="glass-button-dark px-3 py-1.5 text-xs flex items-center gap-1.5">
                    <ExternalLink className="h-3 w-3" /> Open in JSON-LD Playground
                  </a>
                  <a href="https://www.w3.org/RDF/Validator/" target="_blank" rel="noopener noreferrer"
                    className="glass-button-dark px-3 py-1.5 text-xs flex items-center gap-1.5">
                    <ExternalLink className="h-3 w-3" /> W3C RDF Validator
                  </a>
                </div>
              </div>
            )}
            <div className="glass-card-dark p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Shield className="h-5 w-5" style={{ color: '#16a34a' }} /> W3C-Compliant JSON-LD
                </h3>
                <div className="flex gap-2">
                  <button onClick={() => copyToClipboard(JSON.stringify(w3cJsonLd, null, 2))} className="glass-button-dark px-3 py-1.5 text-xs flex items-center gap-1.5"><Copy className="h-3.5 w-3.5" /> Copy</button>
                  <button onClick={() => downloadFile(toBibframeJsonLdString(w3cJsonLd), `${recordId}-w3c.jsonld`, "application/ld+json")} className="glass-button-dark px-3 py-1.5 text-xs flex items-center gap-1.5"><Download className="h-3.5 w-3.5" /> Download</button>
                </div>
              </div>
              <pre className="p-6 rounded-lg overflow-auto text-sm max-h-[calc(100vh-450px)] font-mono" style={{ background: 'rgba(240,240,248,0.7)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', color: '#1a1a2e', border: '1px solid rgba(200,200,220,0.5)' }}>
                {w3cJsonLd ? JSON.stringify(w3cJsonLd, null, 2) : "Fill in the form to generate W3C-compliant JSON-LD..."}
              </pre>
            </div>
          </div>
        )}

        {/* ===== RAW JSON-LD ===== */}
        {activeTab === "jsonld" && (
          <div className="glass-card-dark p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold flex items-center gap-2"><Braces className="h-5 w-5" style={{ color: '#16a34a' }} /> Raw JSON-LD (GraphStore output)</h3>
              <div className="flex gap-2">
                <button onClick={() => copyToClipboard(JSON.stringify(graphJsonld || graph, null, 2))} className="glass-button-dark px-3 py-1.5 text-xs"><Copy className="h-3.5 w-3.5" /></button>
                <button onClick={() => downloadFile(toBibframeJsonLdString(graphJsonld || graph), `${recordId}.jsonld`, "application/ld+json")} className="glass-button-dark px-3 py-1.5 text-xs"><Download className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <div className="mb-3 p-3 bg-yellow-500/10 rounded-lg text-xs" style={{ border: '1px solid #e5c07b', color: '#92600a' }}>
              <AlertTriangle className="h-3.5 w-3.5 inline mr-1.5" />
              This is the raw GraphStore output. For W3C-compliant JSON-LD that works with validators and triple stores, use the <strong>W3C JSON-LD</strong> tab.
            </div>
            <pre className="p-6 rounded-lg overflow-auto text-sm max-h-[calc(100vh-400px)] font-mono" style={{ background: 'rgba(240,240,248,0.7)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', color: '#1a1a2e', border: '1px solid rgba(200,200,220,0.5)' }}>
              {JSON.stringify(graphJsonld || graph, null, 2)}
            </pre>
          </div>
        )}

        {/* ===== TURTLE ===== */}
        {activeTab === "turtle" && (
          <div className="glass-card-dark p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold flex items-center gap-2"><Code className="h-5 w-5" style={{ color: '#9333ea' }} /> Turtle RDF (W3C-Compliant)</h3>
              <div className="flex gap-2">
                {w3cTurtle && <button onClick={() => copyToClipboard(w3cTurtle)} className="glass-button-dark px-3 py-1.5 text-xs flex items-center gap-1.5"><Copy className="h-3.5 w-3.5" /> Copy</button>}
                {w3cTurtle && <button onClick={() => downloadFile(w3cTurtle, `${recordId}.ttl`, "text/turtle")} className="glass-button-dark px-3 py-1.5 text-xs flex items-center gap-1.5"><Download className="h-3.5 w-3.5" /> Download .ttl</button>}
              </div>
            </div>
            <pre className="p-6 rounded-lg overflow-auto text-sm max-h-[calc(100vh-350px)] font-mono" style={{ background: 'rgba(240,240,248,0.7)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', color: '#0891b2', border: '1px solid rgba(200,200,220,0.5)' }}>
              {w3cTurtle || "Fill in the form to generate Turtle RDF..."}
            </pre>
          </div>
        )}

        {/* ===== N-TRIPLES ===== */}
        {activeTab === "ntriples" && (
          <div className="glass-card-dark p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold flex items-center gap-2"><FileText className="h-5 w-5" style={{ color: '#ea580c' }} /> N-Triples (Triple Store Ready)</h3>
              <div className="flex gap-2">
                {w3cNTriples && <button onClick={() => copyToClipboard(w3cNTriples)} className="glass-button-dark px-3 py-1.5 text-xs flex items-center gap-1.5"><Copy className="h-3.5 w-3.5" /> Copy</button>}
                {w3cNTriples && <button onClick={() => downloadFile(w3cNTriples, `${recordId}.nt`, "application/n-triples")} className="glass-button-dark px-3 py-1.5 text-xs flex items-center gap-1.5"><Download className="h-3.5 w-3.5" /> Download .nt</button>}
              </div>
            </div>
            <div className="mb-3 p-3 bg-blue-500/10 rounded-lg text-xs" style={{ border: '1px solid #93c5fd', color: '#1d4ed8' }}>
              <Info className="h-3.5 w-3.5 inline mr-1.5" />
              N-Triples format can be directly loaded into Apache Jena/Fuseki, Blazegraph, GraphDB, Virtuoso, or any SPARQL endpoint.
              Each line is one triple: <code style={{ color: '#0891b2' }}>&lt;subject&gt; &lt;predicate&gt; &lt;object&gt; .</code>
            </div>
            <pre className="p-6 rounded-lg overflow-auto text-xs max-h-[calc(100vh-400px)] font-mono leading-relaxed" style={{ background: 'rgba(240,240,248,0.7)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', color: '#ea580c', border: '1px solid rgba(200,200,220,0.5)' }}>
              {w3cNTriples || "Fill in the form to generate N-Triples..."}
            </pre>
            {w3cNTriples && (
              <div className="mt-3 text-xs" style={{ color: '#888' }}>
                {w3cNTriples.split("\n").filter(Boolean).length} triples generated
              </div>
            )}
          </div>
        )}

        {/* ===== MARC ===== */}
        {activeTab === "marc" && <MarcView data={{ work: workData, instance: instanceData, admin: {} }} />}

        {/* ===== TRIPLES ===== */}
        {activeTab === "triples" && (
          <div className="glass-card-dark p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Hash className="h-5 w-5" style={{ color: '#ea580c' }} /> RDF Triples ({tripleCount})
              </h3>
              <button onClick={() => copyToClipboard(graphTriples.map(t => `<${t.subject}> <${t.predicate}> ${typeof t.object === 'string' ? `<${t.object}>` : `"${t.object.value}"`} .`).join("\n"))}
                className="glass-button-dark px-3 py-1.5 text-xs"><Copy className="h-3.5 w-3.5" /> N-Triples</button>
            </div>
            <div className="overflow-auto max-h-[calc(100vh-350px)]">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid #ddd', color: '#666' }}>
                    <th className="text-left p-2 w-8">#</th>
                    <th className="text-left p-2">Subject</th>
                    <th className="text-left p-2">Predicate</th>
                    <th className="text-left p-2">Object</th>
                    <th className="text-left p-2 w-16">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {graphTriples.map((triple, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #eee' }} className="hover:bg-black/5">
                      <td className="p-2" style={{ color: '#aaa' }}>{idx + 1}</td>
                      <td className="p-2 font-mono truncate max-w-[200px]" style={{ color: '#0891b2' }}>{shortenUri(triple.subject)}</td>
                      <td className="p-2 font-mono truncate max-w-[200px]" style={{ color: '#9333ea' }}>{shortenUri(triple.predicate)}</td>
                      <td className="p-2 font-mono truncate max-w-[250px]">
                        {typeof triple.object === 'string'
                          ? <span style={{ color: '#0891b2' }}>{shortenUri(triple.object)}</span>
                          : triple.object.type === 'uri'
                            ? <span style={{ color: '#0891b2' }}>{shortenUri(triple.object.value)}</span>
                            : <span style={{ color: '#16a34a' }}>"{triple.object.value}"</span>
                        }
                      </td>
                      <td className="p-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          (typeof triple.object === 'object' && triple.object.type === 'literal') ? "bg-green-500/20" : "bg-cyan-500/20"
                        }`} style={{ color: (typeof triple.object === 'object' && triple.object.type === 'literal') ? '#16a34a' : '#0891b2' }}>
                          {typeof triple.object === 'string' ? 'URI' : triple.object.type?.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {graphTriples.length === 0 && (
                <div className="text-center py-12" style={{ color: '#888' }}>Fill in the form to extract triples...</div>
              )}
            </div>
          </div>
        )}

        {/* ===== OPAC ===== */}
        {activeTab === "opac" && (
          <div className="glass-card-light p-6">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900"><Eye className="h-5 w-5 text-blue-600" /> OPAC Preview</h3>
            <OPACPreview workData={workData} instanceData={instanceData} theme="light" />
          </div>
        )}

        {/* ===== MIND MAP ===== */}
        {activeTab === "mindmap" && (
          <div className="glass-card-light p-6">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900"><Sparkles className="h-5 w-5 text-orange-500" /> Knowledge Graph</h3>
            <MindMapPreview workData={workData} instanceData={instanceData} theme="light" />
          </div>
        )}

        {/* ===== VALIDATION ===== */}
        {activeTab === "validation" && (
          <div className="space-y-6">
            {institutionalValidation && (
              <div className="glass-card-light p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold flex items-center gap-2 text-gray-900">
                    <Shield className="h-5 w-5 text-blue-600" /> Institutional Validation (LOC/PCC Standards)
                  </h3>
                  <div className={`px-4 py-2 rounded-xl text-sm font-bold backdrop-blur-sm ${
                    institutionalValidation.score >= 85 ? "bg-green-500/20 text-green-700 border border-green-300" :
                    institutionalValidation.score >= 50 ? "bg-yellow-500/20 text-yellow-700 border border-yellow-300" :
                    "bg-red-500/20 text-red-700 border border-red-300"
                  }`}>
                    {getValidationBadge(institutionalValidation)} - {institutionalValidation.score}/100
                  </div>
                </div>
                <p className="text-sm mb-4 text-gray-700">{institutionalValidation.summary}</p>
                {institutionalValidation.errors.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold mb-2 text-red-700">Errors ({institutionalValidation.errors.length})</h4>
                    {institutionalValidation.errors.map((e, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 bg-red-500/10 rounded mb-1 text-xs border border-red-300/30">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-600" />
                        <div>
                          <span className="font-semibold text-red-800">{e.entity}{e.property ? ` / ${e.property}` : ""}</span>
                          <span className="ml-2 text-gray-700">{e.message}</span>
                          {e.fix && <p className="mt-0.5 text-blue-600">Fix: {e.fix}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {institutionalValidation.warnings.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 text-yellow-700">Warnings ({institutionalValidation.warnings.length})</h4>
                    {institutionalValidation.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 bg-yellow-500/10 rounded mb-1 text-xs border border-yellow-300/30">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-yellow-600" />
                        <div>
                          <span className="font-semibold text-yellow-800">{w.entity}{w.property ? ` / ${w.property}` : ""}</span>
                          <span className="ml-2 text-gray-700">{w.message}</span>
                          {w.fix && <p className="mt-0.5 text-blue-600">Fix: {w.fix}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {graphValidation && (
              <div className="glass-card-light p-6">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
                  <CheckCircle2 className="h-5 w-5 text-green-600" /> SHACL Graph Validation
                </h3>
                <ValidationPanel validation={graphValidation} />
              </div>
            )}
            {bfValidation && (
              <div className="glass-card-light p-6">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
                  <Database className="h-5 w-5 text-cyan-600" /> BIBFRAME Semantic Validation
                </h3>
                <div className={`p-4 rounded-lg mb-4 backdrop-blur-sm ${bfValidation.valid ? "bg-green-500/20 border border-green-300" : "bg-red-500/20 border border-red-300"}`}>
                  <div className="flex items-center gap-2">
                    {bfValidation.valid
                      ? <><CheckCircle2 className="h-5 w-5 text-green-600" /><span className="font-semibold text-green-700">Valid BIBFRAME Record</span></>
                      : <><AlertCircle className="h-5 w-5 text-red-600" /><span className="font-semibold text-red-700">{bfValidation.errors.length} Error(s)</span></>
                    }
                  </div>
                </div>
                {bfValidation.errors.length > 0 && (
                  <div className="space-y-1">
                    {bfValidation.errors.map((err, i) => (
                      <div key={i} className="text-xs p-2 bg-red-500/10 rounded flex items-start gap-2 border border-red-300/30">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-600" />
                        <span className="text-gray-700">[{err.code}] {err.entity}: {err.message}</span>
                      </div>
                    ))}
                  </div>
                )}
                {bfValidation.warnings.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {bfValidation.warnings.map((w, i) => (
                      <div key={i} className="text-xs p-2 bg-yellow-500/10 rounded flex items-start gap-2 border border-yellow-300/30">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-yellow-600" />
                        <span className="text-gray-700">[{w.code}] {w.entity}: {w.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="glass-card-light p-6">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
                <Network className="h-5 w-5 text-purple-600" /> Graph Connectivity
              </h3>
              <div className={`p-4 rounded-lg backdrop-blur-sm ${connectivity.connected ? "bg-green-500/20 border border-green-300" : "bg-yellow-500/20 border border-yellow-300"}`}>
                {connectivity.connected
                  ? <span className="font-semibold flex items-center gap-2 text-green-700"><CheckCircle2 className="h-5 w-5" /> All nodes are connected</span>
                  : <div>
                      <span className="font-semibold flex items-center gap-2 text-yellow-700"><AlertTriangle className="h-5 w-5" /> {connectivity.orphans.length} orphan node(s)</span>
                      <ul className="mt-2 space-y-1">
                        {connectivity.orphans.map((o, i) => (
                          <li key={i} className="text-xs font-mono text-gray-600">{o}</li>
                        ))}
                      </ul>
                    </div>
                }
              </div>
            </div>
          </div>
        )}

        {/* ===== RELATIONSHIPS ===== */}
        {activeTab === "relationships" && (
          <div className="glass-card-dark p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Network className="h-5 w-5" style={{ color: '#3b82f6' }} /> Semantic Relationships
              </h3>
              <div className="flex gap-2">
                <button onClick={() => addRelationship("Work")} className="glass-button-dark px-4 py-2 text-sm">+ Work Relationship</button>
                <button onClick={() => addRelationship("Instance")} className="glass-button-dark px-4 py-2 text-sm">+ Instance Relationship</button>
              </div>
            </div>
            {relationships.length === 0 && <div className="text-center py-12" style={{ color: '#888' }}>No relationships defined yet. Add Work-to-Work or Instance-to-Instance links.</div>}
            <div className="space-y-4">
              {relationships.map(rel => (
                <div key={rel.id} className="p-4 rounded-lg" style={{ background: 'rgba(255,255,255,0.4)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.5)' }}>
                  <div className="flex items-start gap-4">
                    <div className="flex-1 space-y-3">
                      <div className="flex gap-3">
                        <select value={rel.type} onChange={(e) => updateRelationship(rel.id, "type", e.target.value)}
                          className="flex-1 px-3 py-2 rounded-lg text-sm" style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.5)' }}>
                          {Object.entries(RELATIONSHIP_DEFINITIONS).map(([type, def]) => (
                            <option key={type} value={type}>{(def as any).label} ({(def as any).domain})</option>
                          ))}
                        </select>
                        <input type="text" value={rel.targetUri} onChange={(e) => updateRelationship(rel.id, "targetUri", e.target.value)}
                          placeholder="Target URI (e.g., http://id.loc.gov/resources/works/...)"
                          className="flex-1 px-3 py-2 rounded-lg text-sm" style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.5)' }} />
                      </div>
                      <input type="text" value={rel.label || ""} onChange={(e) => updateRelationship(rel.id, "label", e.target.value)}
                        placeholder="Relationship label (optional)"
                        className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.5)' }} />
                    </div>
                    <button onClick={() => removeRelationship(rel.id)} className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-sm" style={{ color: '#dc2626' }}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== AUTHORITY GRAPH ===== */}
        {activeTab === "authority-graph" && (
          <div className="glass-card-light p-6">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
              <Globe className="h-5 w-5 text-purple-600" /> Authority Graph
            </h3>
            <AuthorityGraph nodes={authorityNodes} />
          </div>
        )}
      </div>

      {/* ===== DIALOGS ===== */}
      <AuthoritySearchDialog isOpen={showAuthoritySearch} onClose={() => setShowAuthoritySearch(false)} onSelect={handleAuthoritySelect} initialQuery="" />
      <ImportRecordDialog isOpen={showImportDialog} onClose={() => setShowImportDialog(false)} onImport={handleImport} />
      <RecordViewerDialog open={showRecordViewer} onOpenChange={setShowRecordViewer} jsonldData={graphJsonld || { "@graph": [] }} title={recordTitle} />
    </div>
  );

  function toggleEntity(entity: string) {
    const newSet = new Set(expandedEntities);
    if (newSet.has(entity)) newSet.delete(entity);
    else newSet.add(entity);
    setExpandedEntities(newSet);
  }
}

// ============================== SUB-COMPONENTS ==============================

function SaveStatusBadge({ status }: { status: SaveStatus }) {
  const configs = {
    saved: { bg: "bg-green-500/30 border-green-500/50", color: '#16a34a', icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Saved" },
    unsaved: { bg: "bg-yellow-500/30 border-yellow-500/50", color: '#ca8a04', icon: <Clock className="h-3.5 w-3.5" />, label: "Unsaved" },
    saving: { bg: "bg-blue-500/30 border-blue-500/50", color: '#2563eb', icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, label: "Saving..." },
    error: { bg: "bg-red-500/30 border-red-500/50", color: '#dc2626', icon: <AlertCircle className="h-3.5 w-3.5" />, label: "Error" },
  };
  const c = configs[status];
  return <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${c.bg} font-semibold text-xs`} style={{ color: c.color }}>{c.icon} {c.label}</div>;
}

function SunTab({ active, onClick, icon, label, color }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; color: string }) {
  const colorMap: Record<string, string> = { blue: '#3b82f6', purple: '#9333ea', orange: '#ea580c', green: '#16a34a', red: '#dc2626', gray: '#6b7280' };
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl whitespace-nowrap transition-all text-xs font-medium ${
        active ? "glass-tab-active-dark shadow-lg" : "hover:bg-black/5"
      }`}
      style={{ color: active ? (colorMap[color] || '#3b82f6') : '#888' }}>
      {icon} {label}
    </button>
  );
}

function SunEntitySection({ title, subtitle, color, icon, uri, expanded, onToggle, children, requiredCount, groups }: {
  title: string; subtitle?: string; color: string; icon: React.ReactNode; uri: string;
  expanded: boolean; onToggle: () => void; children: React.ReactNode;
  requiredCount?: number; groups?: string[];
}) {
  const borderColors: Record<string, string> = { blue: "border-blue-500/30", green: "border-green-500/30", purple: "border-purple-500/30", orange: "border-orange-500/30", gray: "border-gray-500/30" };
  return (
    <div className={`glass-card-dark overflow-hidden border-l-4 ${borderColors[color] || "border-gray-300"}`}>
      <button onClick={onToggle} className="w-full px-6 py-4 hover:bg-white/30 flex items-center justify-between transition-all" type="button" style={{ background: 'rgba(255,255,255,0.15)' }}>
        <div className="flex items-center gap-3">
          {icon}
          <div className="text-left">
            <h2 className="text-lg font-bold">{title}</h2>
            <div className="flex items-center gap-3">
              {subtitle && <p className="text-xs" style={{ color: '#888' }}>{subtitle}</p>}
              <p className="text-xs font-mono" style={{ color: '#aaa' }}>{uri}</p>
              {requiredCount !== undefined && <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.05)', color: '#888' }}>{requiredCount} required</span>}
              {groups && <span className="text-xs" style={{ color: '#aaa' }}>{groups.length} groups</span>}
            </div>
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? "" : "-rotate-90"}`} style={{ color: '#888' }} />
      </button>
      {expanded && <div className="p-6">{children}</div>}
    </div>
  );
}

function SunInfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between p-2 rounded" style={{ background: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.5)' }}>
      <span className="text-xs" style={{ color: '#888' }}>{label}</span>
      <span className={`text-xs ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
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
