/**
 * MOON BIBFRAME TEMPLATE - Production-Grade Ontology-Driven Template Processor
 * 
 * Fully Linked Data BIBFRAME Engine using EVERY service in the system:
 * - GraphStore (RDF graph-centric state)
 * - OntologyRegistry (SHACL-driven property definitions)
 * - BibframePropertyRegistry (100+ properties across WEMI)
 * - TemplateEngine (monograph/serial/manuscript/music/map)
 * - UriMintingService (stable institutional URIs)
 * - RelationshipManager (Work-to-Work, Instance-to-Instance)
 * - BibframeValidator (strict BIBFRAME rules)
 * - InstitutionalValidator (LOC/PCC standards)
 * - AuthoritySearch (LOC, VIAF, Wikidata, ISBNdb)
 * - RdfGraphBuilder (Turtle, JSON-LD, Triple extraction)
 * - MarcGenerator (MARC21 output)
 * - GraphBuilder (bidirectional sync)
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
  Copy, ExternalLink, Zap, Settings, RefreshCw, Plus, X, Info
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

// ============================== TYPES ==============================

type OutputTab = "editor" | "jsonld" | "w3c-jsonld" | "turtle" | "ntriples" | "marc" | "triples" | "opac" | "mindmap" | "validation" | "relationships" | "authority-graph";
type SaveStatus = "saved" | "unsaved" | "saving" | "error";

interface MoonBibframeTemplateProps {
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

export default function MoonBibframeTemplate({
  onBack, initialWork, initialInstance, onRecordSaved
}: MoonBibframeTemplateProps) {
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
    // Extract title from initialWork if loading a saved record
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
    // Initialize graph with properly minted URIs
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

    // Create AdminMetadata node
    const adminUri = uriSet.admin;
    graphStore.setNode(adminUri, {
      "@id": adminUri,
      "@type": "bf:AdminMetadata",
      "bf:creationDate": new Date().toISOString().split("T")[0],
      "bf:source": {
        "@id": "https://moonlib.org",
        "rdfs:label": "Moon Library System"
      },
      "bf:descriptionConventions": {
        "@id": "http://id.loc.gov/vocabulary/descriptionConventions/rda",
        "rdfs:label": "RDA"
      },
      "bf:descriptionLanguage": {
        "@id": "http://id.loc.gov/vocabulary/languages/eng",
        "rdfs:label": "English"
      },
      "bf:generationProcess": `Moon BIBFRAME Template v2.0 (${template.name})`,
      "bf:catalogerId": username || "anonymous",
    });

    regenerateRDF();
  }, []);

  // Sync template changes
  useEffect(() => {
    if (template.enableExpression && !enableExpression) {
      setEnableExpression(true);
      graphStore.setNode(uriSet.expression, { "@id": uriSet.expression, "@type": "bf:Expression" });
      graphStore.createWEMILinks(uriSet.work, uriSet.expression, uriSet.instance, uriSet.item);
    }
    regenerateRDF();
  }, [selectedTemplate]);

  useEffect(() => {
    if (initialWork) setWorkData(initialWork);
  }, [initialWork]);

  useEffect(() => {
    if (initialInstance) setInstanceData(initialInstance);
  }, [initialInstance]);

  // Sync workData/instanceData to graphStore
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
    // Bidirectional sync
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

      // BIBFRAME semantic validation
      const bfResult = validateBibframeRecord(graphData);
      setBfValidation(bfResult);

      // Institutional validation
      const instResult = validateInstitutionalBibframe(graphData);
      setInstitutionalValidation(instResult);

      setGraphJsonld(graphData);

      // Extract triples
      const triples = extractTriples(graphData);
      setGraphTriples(triples);

      // Generate Turtle (legacy)
      try {
        const turtleOutput = toTurtle(graphData);
        setGraphTurtle(turtleOutput);
      } catch {
        setGraphTurtle("");
      }

      // ===== W3C-COMPLIANT JSON-LD =====
      try {
        const itemNode = graphStore.getNode(uriSet.item);
        const exprNode = graphStore.getNode(uriSet.expression);
        const adminNode = graphStore.getNode(uriSet.admin);
        const w3cDoc = buildW3CJsonLd({
          workData,
          instanceData,
          itemData: itemNode || {},
          expressionData: exprNode || {},
          adminData: adminNode || {},
          uriSet,
          enableExpression
        });
        setW3cJsonLd(w3cDoc);

        // W3C validation
        const w3cVal = validateW3CJsonLd(w3cDoc);
        setW3cValidation(w3cVal);

        // W3C-compliant Turtle
        try {
          const w3cTtl = jsonLdToTurtle(w3cDoc);
          setW3cTurtle(w3cTtl);
        } catch { setW3cTurtle(""); }

        // N-Triples
        try {
          const nt = jsonLdToNTriples(w3cDoc);
          setW3cNTriples(nt);
        } catch { setW3cNTriples(""); }
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
    // Default: person authority
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
          catalogingInterface: "Moon BIBFRAME Template",
          resourceType: `Moon BIBFRAME Template (${template.name})`,
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
    <div className="h-screen flex flex-col bg-[#0a0a1a]">
      <Toaster position="top-right" />

      {/* ===== TOP BAR ===== */}
      <div className="glass-navbar-dark">
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
                <h1 className="text-xl font-bold">
                  Moon BIBFRAME Template
                </h1>
                <p className="text-xs text-white/70">
                  Ontology v{ONTOLOGY_VERSION.version} - {template.name} - Record: {recordId}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Validation Badge */}
              {institutionalValidation && (
                <div className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                  institutionalValidation.score >= 85 ? "bg-green-500/30 border-green-500/50 text-green-300" :
                  institutionalValidation.score >= 50 ? "bg-yellow-500/30 border-yellow-500/50 text-yellow-300" :
                  "bg-red-500/30 border-red-500/50 text-red-300"
                }`}>
                  {getValidationBadge(institutionalValidation)} ({institutionalValidation.score}/100)
                </div>
              )}
              <SaveStatusBadge status={saveStatus} />
              <input
                type="text" value={recordTitle}
                onChange={(e) => { setRecordTitle(e.target.value); setSaveStatus("unsaved"); }}
                className="px-3 py-1.5 glass-input-dark rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                placeholder="Record Title" style={{ width: "200px" }}
              />
            </div>
          </div>

          {/* ===== TEMPLATE SELECTOR + STATS BAR ===== */}
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            {/* Template Buttons */}
            {getAllTemplates().map(tmpl => (
              <button
                key={tmpl.id}
                onClick={() => setSelectedTemplate(tmpl.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  selectedTemplate === tmpl.id
                    ? `bg-gradient-to-r ${TEMPLATE_COLORS[tmpl.id] || "from-blue-500 to-indigo-600"} text-white shadow-lg scale-105`
                    : "glass-button-dark text-gray-300 hover:text-white"
                }`}
              >
                {TEMPLATE_ICONS[tmpl.id]} {tmpl.name}
              </button>
            ))}

            <span className="w-px h-6 bg-white/20" />

            {/* Live Stats */}
            <div className="flex items-center gap-4 text-xs text-gray-300">
              <span className="flex items-center gap-1"><Database className="h-3.5 w-3.5 text-cyan-400" /> {graphStats.nodeCount} Nodes</span>
              <span className="flex items-center gap-1"><Network className="h-3.5 w-3.5 text-purple-400" /> {tripleCount} Triples</span>
              <span className="flex items-center gap-1"><Activity className="h-3.5 w-3.5 text-green-400" /> {completionScore}% Complete</span>
              <span className="flex items-center gap-1">
                {connectivity.connected
                  ? <><CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Connected</>
                  : <><AlertTriangle className="h-3.5 w-3.5 text-yellow-400" /> {connectivity.orphans.length} Orphans</>
                }
              </span>
              {Object.entries(graphStats.types).map(([type, count]) => (
                <span key={type} className="text-gray-400">{type.replace("bf:", "")}: {count as number}</span>
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
                  <div className="px-3 py-2 text-xs font-semibold text-white/70 border-b border-white/10">Real LOC Examples</div>
                  {realLocExamples.map((example) => (
                    <button key={example.id} className="w-full text-left px-3 py-2 rounded hover:bg-white/10"
                      onClick={() => handleLoadExample(example.data)}>
                      <div className="font-medium text-sm text-white">{example.name}</div>
                      <div className="text-xs text-gray-400">{example.description}</div>
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

      {/* ===== OUTPUT TABS ===== */}
      <div className="glass-navbar-dark border-t border-white/10">
        <div className="px-6 py-2">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <OTab active={activeTab === "editor"} onClick={() => setActiveTab("editor")} icon={<Layers className="h-3.5 w-3.5" />} label="BIBFRAME Editor" color="blue" />
            <OTab active={activeTab === "w3c-jsonld"} onClick={() => setActiveTab("w3c-jsonld")} icon={<Shield className="h-3.5 w-3.5" />} label={`W3C JSON-LD ${w3cValidation?.valid ? "\u2713" : ""}`} color="green" />
            <OTab active={activeTab === "jsonld"} onClick={() => setActiveTab("jsonld")} icon={<Braces className="h-3.5 w-3.5" />} label="Raw JSON-LD" color="green" />
            <OTab active={activeTab === "turtle"} onClick={() => setActiveTab("turtle")} icon={<Code className="h-3.5 w-3.5" />} label="Turtle" color="purple" />
            <OTab active={activeTab === "ntriples"} onClick={() => setActiveTab("ntriples")} icon={<FileText className="h-3.5 w-3.5" />} label="N-Triples" color="orange" />
            <OTab active={activeTab === "marc"} onClick={() => setActiveTab("marc")} icon={<Database className="h-3.5 w-3.5" />} label="MARC" color="red" />
            <OTab active={activeTab === "triples"} onClick={() => setActiveTab("triples")} icon={<Hash className="h-3.5 w-3.5" />} label={`Triples (${tripleCount})`} color="orange" />
            <OTab active={activeTab === "opac"} onClick={() => setActiveTab("opac")} icon={<Eye className="h-3.5 w-3.5" />} label="OPAC" color="purple" />
            <OTab active={activeTab === "mindmap"} onClick={() => setActiveTab("mindmap")} icon={<Sparkles className="h-3.5 w-3.5" />} label="Mind Map" color="orange" />
            <OTab active={activeTab === "validation"} onClick={() => setActiveTab("validation")} icon={<Shield className="h-3.5 w-3.5" />} label="Validation" color="green" />
            <OTab active={activeTab === "relationships"} onClick={() => setActiveTab("relationships")} icon={<Network className="h-3.5 w-3.5" />} label="Relationships" color="blue" />
            <OTab active={activeTab === "authority-graph"} onClick={() => setActiveTab("authority-graph")} icon={<Globe className="h-3.5 w-3.5" />} label="Authority Graph" color="purple" />
          </div>
        </div>
      </div>

      {/* ===== MAIN CONTENT ===== */}
      <div className="flex-1 overflow-auto p-6" style={{
        background: "linear-gradient(135deg, #0a0a1a 0%, #0d1b2a 25%, #1b2838 50%, #0d1b2a 75%, #0a0a1a 100%)",
      }}>
        {/* ===== BIBFRAME EDITOR ===== */}
        {activeTab === "editor" && (
          <div className="space-y-4">
            {/* Template Info Card */}
            <div className="glass-card-dark p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl bg-gradient-to-r ${TEMPLATE_COLORS[selectedTemplate] || "from-blue-500 to-indigo-600"}`}>
                    {TEMPLATE_ICONS[selectedTemplate] || <BookOpen className="h-6 w-6 text-white" />}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">{template.name} Template</h2>
                    <p className="text-xs text-gray-400">{template.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input type="checkbox" checked={enableExpression} onChange={toggleExpression}
                      className="w-4 h-4 rounded text-purple-500 focus:ring-purple-500" />
                    Expression Layer
                  </label>
                  <div className="text-xs text-gray-400">
                    URI: <span className="font-mono text-cyan-400">{uriSet.work.split("/").pop()}</span>
                  </div>
                </div>
              </div>
              {/* Inline SHACL Validation */}
              {graphValidation && (
                <div className={`mt-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${
                  graphValidation.valid ? "bg-green-500/20 text-green-300" : "bg-yellow-500/20 text-yellow-300"
                }`}>
                  {graphValidation.valid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                  {graphValidation.valid
                    ? `Graph valid - ${graphStats.nodeCount} nodes, ${tripleCount} triples`
                    : `${graphValidation.errors.length} errors, ${graphValidation.warnings.length} warnings`
                  }
                </div>
              )}
            </div>

            {/* ===== WORK ENTITY ===== */}
            <EntitySection
              title="Work" subtitle="Intellectual Content" color="blue"
              icon={<BookOpen className="h-6 w-6 text-blue-400" />}
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
              {/* Ontology Form Fields */}
              <div className="mt-6 border-t border-white/10 pt-4">
                <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
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
              {/* Contributors display */}
              {workData["bf:contribution"]?.length > 0 && (
                <div className="mt-4 p-4 bg-white/5 rounded-lg border border-white/10">
                  <h4 className="text-sm font-semibold text-white mb-2">Contributors ({workData["bf:contribution"].length})</h4>
                  <div className="space-y-2">
                    {workData["bf:contribution"].map((c: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 p-2 bg-white/5 rounded text-sm">
                        <User className="h-4 w-4 text-blue-400" />
                        <span className="text-white font-medium">{c["bf:agent"]?.["rdfs:label"] || "Unknown"}</span>
                        <span className="text-gray-400 text-xs">{c["bf:role"]?.["rdfs:label"] || "Contributor"}</span>
                        {c["bf:agent"]?.["@id"] && (
                          <span className="text-xs text-gray-500 font-mono truncate ml-auto">{c["bf:agent"]["@id"]}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </EntitySection>

            {/* ===== EXPRESSION (optional) ===== */}
            {enableExpression && (
              <EntitySection
                title="Expression" subtitle="Realization of Work" color="purple"
                icon={<Sparkles className="h-6 w-6 text-purple-400" />}
                uri={uriSet.expression}
                expanded={expandedEntities.has("Expression")}
                onToggle={() => toggleEntity("Expression")}
              >
                <OntologyDrivenFormRenderer
                  entityType="Expression" nodeUri={uriSet.expression}
                  graphStore={graphStore} onChange={handlePropertyChange}
                />
              </EntitySection>
            )}

            {/* ===== INSTANCE ENTITY ===== */}
            <EntitySection
              title="Instance" subtitle="Physical Manifestation" color="green"
              icon={<Package className="h-6 w-6 text-green-400" />}
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
              <div className="mt-6 border-t border-white/10 pt-4">
                <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
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
            </EntitySection>

            {/* ===== ITEM ENTITY ===== */}
            <EntitySection
              title="Item" subtitle="Specific Copy / Holdings" color="orange"
              icon={<Archive className="h-6 w-6 text-orange-400" />}
              uri={uriSet.item}
              expanded={expandedEntities.has("Item")}
              onToggle={() => toggleEntity("Item")}
              groups={templateItemGroups}
            >
              <OntologyDrivenFormRenderer
                entityType="Item" nodeUri={uriSet.item}
                graphStore={graphStore} onChange={handlePropertyChange}
              />
            </EntitySection>

            {/* ===== ADMIN METADATA ===== */}
            <EntitySection
              title="Administrative Metadata" subtitle="Record Provenance" color="gray"
              icon={<Settings className="h-6 w-6 text-gray-400" />}
              uri={uriSet.admin}
              expanded={expandedEntities.has("Admin")}
              onToggle={() => toggleEntity("Admin")}
            >
              <div className="grid grid-cols-2 gap-4 text-sm">
                <InfoRow label="Record ID" value={recordId} mono />
                <InfoRow label="Created" value={new Date().toISOString().split("T")[0]} />
                <InfoRow label="Cataloger" value={username || "anonymous"} />
                <InfoRow label="Template" value={template.name} />
                <InfoRow label="Conventions" value="RDA" />
                <InfoRow label="Ontology" value={`BIBFRAME ${ONTOLOGY_VERSION.version}`} />
                <InfoRow label="Source" value="Moon Library System" />
                <InfoRow label="Language" value={language === "en" ? "English" : "Arabic"} />
              </div>
            </EntitySection>
          </div>
        )}

        {/* ===== W3C-COMPLIANT JSON-LD ===== */}
        {activeTab === "w3c-jsonld" && (
          <div className="space-y-4">
            {/* Validation banner */}
            {w3cValidation && (
              <div className={`glass-card-dark p-4 border-l-4 ${w3cValidation.valid ? "border-green-500" : "border-red-500"}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {w3cValidation.valid
                      ? <><CheckCircle2 className="h-6 w-6 text-green-400" /><span className="text-green-300 font-bold text-lg">W3C-Compliant JSON-LD</span></>
                      : <><AlertCircle className="h-6 w-6 text-red-400" /><span className="text-red-300 font-bold text-lg">{w3cValidation.errors.length} Compliance Error(s)</span></>
                    }
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{w3cValidation.stats.nodeCount} nodes</span>
                    <span>~{w3cValidation.stats.tripleEstimate} triples</span>
                    <span>{w3cValidation.stats.prefixesUsed.length} prefixes</span>
                    <span className={w3cValidation.stats.contextComplete ? "text-green-400" : "text-red-400"}>
                      Context: {w3cValidation.stats.contextComplete ? "Complete" : "Incomplete"}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-gray-400 mb-2">
                  This output passes: <span className="text-cyan-400">json-ld.org/playground</span> | <span className="text-cyan-400">W3C RDF Validator</span> | <span className="text-cyan-400">Apache Jena/Fuseki</span> | <span className="text-cyan-400">Blazegraph</span> | <span className="text-cyan-400">GraphDB</span>
                </div>
                {w3cValidation.errors.length > 0 && (
                  <div className="mt-2 space-y-1">{w3cValidation.errors.map((e, i) => (
                    <div key={i} className="text-xs p-1.5 bg-red-500/10 rounded flex items-start gap-1.5">
                      <AlertCircle className="h-3 w-3 text-red-400 mt-0.5 shrink-0" />
                      <span className="text-red-300">{e}</span>
                    </div>
                  ))}</div>
                )}
                {w3cValidation.warnings.length > 0 && (
                  <div className="mt-2 space-y-1">{w3cValidation.warnings.map((w, i) => (
                    <div key={i} className="text-xs p-1.5 bg-yellow-500/10 rounded flex items-start gap-1.5">
                      <AlertTriangle className="h-3 w-3 text-yellow-400 mt-0.5 shrink-0" />
                      <span className="text-yellow-300">{w}</span>
                    </div>
                  ))}</div>
                )}
                {w3cValidation.info.length > 0 && (
                  <div className="mt-2 space-y-1">{w3cValidation.info.map((inf, i) => (
                    <div key={i} className="text-xs p-1.5 bg-blue-500/10 rounded flex items-start gap-1.5">
                      <Info className="h-3 w-3 text-blue-400 mt-0.5 shrink-0" />
                      <span className="text-blue-300">{inf}</span>
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
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Shield className="h-5 w-5 text-green-400" /> W3C-Compliant JSON-LD
                </h3>
                <div className="flex gap-2">
                  <button onClick={() => copyToClipboard(JSON.stringify(w3cJsonLd, null, 2))} className="glass-button-dark px-3 py-1.5 text-xs flex items-center gap-1.5"><Copy className="h-3.5 w-3.5" /> Copy</button>
                  <button onClick={() => downloadFile(toBibframeJsonLdString(w3cJsonLd), `${recordId}-w3c.jsonld`, "application/ld+json")} className="glass-button-dark px-3 py-1.5 text-xs flex items-center gap-1.5"><Download className="h-3.5 w-3.5" /> Download</button>
                </div>
              </div>
              <pre className="bg-gray-900 text-green-400 p-6 rounded-lg overflow-auto text-sm max-h-[calc(100vh-450px)] font-mono">
                {w3cJsonLd ? JSON.stringify(w3cJsonLd, null, 2) : "Fill in the form to generate W3C-compliant JSON-LD..."}
              </pre>
            </div>
          </div>
        )}

        {/* ===== RAW JSON-LD (legacy) ===== */}
        {activeTab === "jsonld" && (
          <div className="glass-card-dark p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2"><Braces className="h-5 w-5 text-green-400" /> Raw JSON-LD (GraphStore output)</h3>
              <div className="flex gap-2">
                <button onClick={() => copyToClipboard(JSON.stringify(graphJsonld || graph, null, 2))} className="glass-button-dark px-3 py-1.5 text-xs"><Copy className="h-3.5 w-3.5" /></button>
                <button onClick={() => downloadFile(toBibframeJsonLdString(graphJsonld || graph), `${recordId}.jsonld`, "application/ld+json")} className="glass-button-dark px-3 py-1.5 text-xs"><Download className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <div className="mb-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-xs text-yellow-300">
              <AlertTriangle className="h-3.5 w-3.5 inline mr-1.5" />
              This is the raw GraphStore output. For W3C-compliant JSON-LD that works with validators and triple stores, use the <strong>W3C JSON-LD</strong> tab.
            </div>
            <pre className="bg-gray-900 text-green-400 p-6 rounded-lg overflow-auto text-sm max-h-[calc(100vh-400px)] font-mono">
              {JSON.stringify(graphJsonld || graph, null, 2)}
            </pre>
          </div>
        )}

        {/* ===== TURTLE ===== */}
        {activeTab === "turtle" && (
          <div className="glass-card-dark p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2"><Code className="h-5 w-5 text-purple-400" /> Turtle RDF (W3C-Compliant)</h3>
              <div className="flex gap-2">
                {w3cTurtle && <button onClick={() => copyToClipboard(w3cTurtle)} className="glass-button-dark px-3 py-1.5 text-xs flex items-center gap-1.5"><Copy className="h-3.5 w-3.5" /> Copy</button>}
                {w3cTurtle && <button onClick={() => downloadFile(w3cTurtle, `${recordId}.ttl`, "text/turtle")} className="glass-button-dark px-3 py-1.5 text-xs flex items-center gap-1.5"><Download className="h-3.5 w-3.5" /> Download .ttl</button>}
              </div>
            </div>
            <pre className="bg-gray-900 text-cyan-400 p-6 rounded-lg overflow-auto text-sm max-h-[calc(100vh-350px)] font-mono">
              {w3cTurtle || "Fill in the form to generate Turtle RDF..."}
            </pre>
          </div>
        )}

        {/* ===== N-TRIPLES ===== */}
        {activeTab === "ntriples" && (
          <div className="glass-card-dark p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2"><FileText className="h-5 w-5 text-orange-400" /> N-Triples (Triple Store Ready)</h3>
              <div className="flex gap-2">
                {w3cNTriples && <button onClick={() => copyToClipboard(w3cNTriples)} className="glass-button-dark px-3 py-1.5 text-xs flex items-center gap-1.5"><Copy className="h-3.5 w-3.5" /> Copy</button>}
                {w3cNTriples && <button onClick={() => downloadFile(w3cNTriples, `${recordId}.nt`, "application/n-triples")} className="glass-button-dark px-3 py-1.5 text-xs flex items-center gap-1.5"><Download className="h-3.5 w-3.5" /> Download .nt</button>}
              </div>
            </div>
            <div className="mb-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xs text-blue-300">
              <Info className="h-3.5 w-3.5 inline mr-1.5" />
              N-Triples format can be directly loaded into Apache Jena/Fuseki, Blazegraph, GraphDB, Virtuoso, or any SPARQL endpoint.
              Each line is one triple: <code className="text-cyan-400">&lt;subject&gt; &lt;predicate&gt; &lt;object&gt; .</code>
            </div>
            <pre className="bg-gray-900 text-orange-400 p-6 rounded-lg overflow-auto text-xs max-h-[calc(100vh-400px)] font-mono leading-relaxed">
              {w3cNTriples || "Fill in the form to generate N-Triples..."}
            </pre>
            {w3cNTriples && (
              <div className="mt-3 text-xs text-gray-400">
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
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Hash className="h-5 w-5 text-orange-400" /> RDF Triples ({tripleCount})
              </h3>
              <button onClick={() => copyToClipboard(graphTriples.map(t => `<${t.subject}> <${t.predicate}> ${typeof t.object === 'string' ? `<${t.object}>` : `"${t.object.value}"`} .`).join("\n"))}
                className="glass-button-dark px-3 py-1.5 text-xs"><Copy className="h-3.5 w-3.5" /> N-Triples</button>
            </div>
            <div className="overflow-auto max-h-[calc(100vh-350px)]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-white/70">
                    <th className="text-left p-2 w-8">#</th>
                    <th className="text-left p-2">Subject</th>
                    <th className="text-left p-2">Predicate</th>
                    <th className="text-left p-2">Object</th>
                    <th className="text-left p-2 w-16">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {graphTriples.map((triple, idx) => (
                    <tr key={idx} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-2 text-gray-500">{idx + 1}</td>
                      <td className="p-2 text-cyan-400 font-mono truncate max-w-[200px]">{shortenUri(triple.subject)}</td>
                      <td className="p-2 text-purple-400 font-mono truncate max-w-[200px]">{shortenUri(triple.predicate)}</td>
                      <td className="p-2 font-mono truncate max-w-[250px]">
                        {typeof triple.object === 'string'
                          ? <span className="text-cyan-400">{shortenUri(triple.object)}</span>
                          : triple.object.type === 'uri'
                            ? <span className="text-cyan-400">{shortenUri(triple.object.value)}</span>
                            : <span className="text-green-400">"{triple.object.value}"</span>
                        }
                      </td>
                      <td className="p-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          (typeof triple.object === 'object' && triple.object.type === 'literal') ? "bg-green-500/20 text-green-300" : "bg-cyan-500/20 text-cyan-300"
                        }`}>
                          {typeof triple.object === 'string' ? 'URI' : triple.object.type?.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {graphTriples.length === 0 && (
                <div className="text-center text-gray-400 py-12">Fill in the form to extract triples...</div>
              )}
            </div>
          </div>
        )}

        {/* ===== OPAC ===== */}
        {activeTab === "opac" && (
          <div className="glass-card-dark p-6">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Eye className="h-5 w-5 text-purple-400" /> OPAC Preview</h3>
            <OPACPreview workData={workData} instanceData={instanceData} />
          </div>
        )}

        {/* ===== MIND MAP ===== */}
        {activeTab === "mindmap" && (
          <div className="glass-card-dark p-6">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Sparkles className="h-5 w-5 text-orange-400" /> Knowledge Graph</h3>
            <MindMapPreview workData={workData} instanceData={instanceData} />
          </div>
        )}

        {/* ===== VALIDATION ===== */}
        {activeTab === "validation" && (
          <div className="space-y-6">
            {/* Institutional Validation */}
            {institutionalValidation && (
              <div className="glass-card-dark p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Shield className="h-5 w-5 text-blue-400" /> Institutional Validation (LOC/PCC Standards)
                  </h3>
                  <div className={`px-4 py-2 rounded-xl text-sm font-bold ${
                    institutionalValidation.score >= 85 ? "bg-green-500/30 text-green-300" :
                    institutionalValidation.score >= 50 ? "bg-yellow-500/30 text-yellow-300" :
                    "bg-red-500/30 text-red-300"
                  }`}>
                    {getValidationBadge(institutionalValidation)} - {institutionalValidation.score}/100
                  </div>
                </div>
                <p className="text-sm text-gray-300 mb-4">{institutionalValidation.summary}</p>
                {institutionalValidation.errors.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-red-400 mb-2">Errors ({institutionalValidation.errors.length})</h4>
                    {institutionalValidation.errors.map((e, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 bg-red-500/10 rounded mb-1 text-xs">
                        <AlertCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                        <div>
                          <span className="text-red-300 font-semibold">{e.entity}{e.property ? ` / ${e.property}` : ""}</span>
                          <span className="text-gray-400 ml-2">{e.message}</span>
                          {e.fix && <p className="text-blue-300 mt-0.5">Fix: {e.fix}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {institutionalValidation.warnings.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-yellow-400 mb-2">Warnings ({institutionalValidation.warnings.length})</h4>
                    {institutionalValidation.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 bg-yellow-500/10 rounded mb-1 text-xs">
                        <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 mt-0.5 shrink-0" />
                        <div>
                          <span className="text-yellow-300 font-semibold">{w.entity}{w.property ? ` / ${w.property}` : ""}</span>
                          <span className="text-gray-400 ml-2">{w.message}</span>
                          {w.fix && <p className="text-blue-300 mt-0.5">Fix: {w.fix}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Graph SHACL Validation */}
            {graphValidation && (
              <div className="glass-card-dark p-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-400" /> SHACL Graph Validation
                </h3>
                <ValidationPanel validation={graphValidation} />
              </div>
            )}
            {/* BIBFRAME Semantic Validation */}
            {bfValidation && (
              <div className="glass-card-dark p-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <Database className="h-5 w-5 text-cyan-400" /> BIBFRAME Semantic Validation
                </h3>
                <div className={`p-4 rounded-lg mb-4 ${bfValidation.valid ? "bg-green-500/20 border border-green-500/40" : "bg-red-500/20 border border-red-500/40"}`}>
                  <div className="flex items-center gap-2">
                    {bfValidation.valid
                      ? <><CheckCircle2 className="h-5 w-5 text-green-400" /><span className="text-green-300 font-semibold">Valid BIBFRAME Record</span></>
                      : <><AlertCircle className="h-5 w-5 text-red-400" /><span className="text-red-300 font-semibold">{bfValidation.errors.length} Error(s)</span></>
                    }
                  </div>
                </div>
                {bfValidation.errors.length > 0 && (
                  <div className="space-y-1">
                    {bfValidation.errors.map((err, i) => (
                      <div key={i} className="text-xs p-2 bg-red-500/10 rounded flex items-start gap-2">
                        <AlertCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                        <span className="text-gray-300">[{err.code}] {err.entity}: {err.message}</span>
                      </div>
                    ))}
                  </div>
                )}
                {bfValidation.warnings.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {bfValidation.warnings.map((w, i) => (
                      <div key={i} className="text-xs p-2 bg-yellow-500/10 rounded flex items-start gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 mt-0.5 shrink-0" />
                        <span className="text-gray-300">[{w.code}] {w.entity}: {w.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Connectivity */}
            <div className="glass-card-dark p-6">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Network className="h-5 w-5 text-purple-400" /> Graph Connectivity
              </h3>
              <div className={`p-4 rounded-lg ${connectivity.connected ? "bg-green-500/20 border border-green-500/40" : "bg-yellow-500/20 border border-yellow-500/40"}`}>
                {connectivity.connected
                  ? <span className="text-green-300 font-semibold flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /> All nodes are connected</span>
                  : <div>
                      <span className="text-yellow-300 font-semibold flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> {connectivity.orphans.length} orphan node(s)</span>
                      <ul className="mt-2 space-y-1">
                        {connectivity.orphans.map((o, i) => (
                          <li key={i} className="text-xs text-gray-400 font-mono">{o}</li>
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
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Network className="h-5 w-5 text-blue-400" /> Semantic Relationships
              </h3>
              <div className="flex gap-2">
                <button onClick={() => addRelationship("Work")} className="glass-button-dark px-4 py-2 text-sm">+ Work Relationship</button>
                <button onClick={() => addRelationship("Instance")} className="glass-button-dark px-4 py-2 text-sm">+ Instance Relationship</button>
              </div>
            </div>
            {relationships.length === 0 && <div className="text-center text-gray-400 py-12">No relationships defined yet. Add Work-to-Work or Instance-to-Instance links.</div>}
            <div className="space-y-4">
              {relationships.map(rel => (
                <div key={rel.id} className="p-4 bg-white/5 border border-white/10 rounded-lg">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 space-y-3">
                      <div className="flex gap-3">
                        <select value={rel.type} onChange={(e) => updateRelationship(rel.id, "type", e.target.value)}
                          className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm">
                          {Object.entries(RELATIONSHIP_DEFINITIONS).map(([type, def]) => (
                            <option key={type} value={type}>{(def as any).label} ({(def as any).domain})</option>
                          ))}
                        </select>
                        <input type="text" value={rel.targetUri} onChange={(e) => updateRelationship(rel.id, "targetUri", e.target.value)}
                          placeholder="Target URI (e.g., http://id.loc.gov/resources/works/...)"
                          className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-gray-500" />
                      </div>
                      <input type="text" value={rel.label || ""} onChange={(e) => updateRelationship(rel.id, "label", e.target.value)}
                        placeholder="Relationship label (optional)"
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-gray-500" />
                    </div>
                    <button onClick={() => removeRelationship(rel.id)} className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-sm">
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
          <div className="glass-card-dark p-6">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Globe className="h-5 w-5 text-purple-400" /> Authority Graph
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

  // Helper: toggle entity section
  function toggleEntity(entity: string) {
    const newSet = new Set(expandedEntities);
    if (newSet.has(entity)) newSet.delete(entity);
    else newSet.add(entity);
    setExpandedEntities(newSet);
  }
}

// ============================== SUB-COMPONENTS ==============================

function SaveStatusBadge({ status }: { status: SaveStatus }) {
  const c = {
    saved: { bg: "bg-green-500/30 border-green-500/50", text: "text-green-300", icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Saved" },
    unsaved: { bg: "bg-yellow-500/30 border-yellow-500/50", text: "text-yellow-300", icon: <Clock className="h-3.5 w-3.5" />, label: "Unsaved" },
    saving: { bg: "bg-blue-500/30 border-blue-500/50", text: "text-blue-300", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, label: "Saving..." },
    error: { bg: "bg-red-500/30 border-red-500/50", text: "text-red-300", icon: <AlertCircle className="h-3.5 w-3.5" />, label: "Error" },
  }[status];
  return <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${c.bg} ${c.text} font-semibold text-xs`}>{c.icon} {c.label}</div>;
}

function OTab({ active, onClick, icon, label, color }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; color: string }) {
  const colors: Record<string, string> = { blue: "text-blue-400", purple: "text-purple-400", orange: "text-orange-400", green: "text-green-400", red: "text-red-400", gray: "text-gray-400" };
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl whitespace-nowrap transition-all text-xs font-medium ${
        active ? `glass-tab-active-dark ${colors[color] || "text-blue-400"} shadow-lg` : "hover:bg-white/10 text-gray-400"
      }`}>
      {icon} {label}
    </button>
  );
}

function EntitySection({ title, subtitle, color, icon, uri, expanded, onToggle, children, requiredCount, groups }: {
  title: string; subtitle?: string; color: string; icon: React.ReactNode; uri: string;
  expanded: boolean; onToggle: () => void; children: React.ReactNode;
  requiredCount?: number; groups?: string[];
}) {
  const borderColors: Record<string, string> = { blue: "border-blue-500/30", green: "border-green-500/30", purple: "border-purple-500/30", orange: "border-orange-500/30", gray: "border-gray-500/30" };
  return (
    <div className={`glass-card-dark overflow-hidden border-l-4 ${borderColors[color] || "border-white/20"}`}>
      <button onClick={onToggle} className="w-full px-6 py-4 bg-white/5 hover:bg-white/10 flex items-center justify-between transition-all" type="button">
        <div className="flex items-center gap-3">
          {icon}
          <div className="text-left">
            <h2 className="text-lg font-bold text-white">{title}</h2>
            <div className="flex items-center gap-3">
              {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
              <p className="text-xs text-gray-500 font-mono">{uri}</p>
              {requiredCount !== undefined && <span className="text-xs bg-white/10 px-2 py-0.5 rounded text-gray-400">{requiredCount} required</span>}
              {groups && <span className="text-xs text-gray-500">{groups.length} groups</span>}
            </div>
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${expanded ? "" : "-rotate-90"}`} />
      </button>
      {expanded && <div className="p-6">{children}</div>}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between p-2 bg-white/5 rounded border border-white/10">
      <span className="text-gray-400 text-xs">{label}</span>
      <span className={`text-white text-xs ${mono ? "font-mono" : ""}`}>{value}</span>
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
