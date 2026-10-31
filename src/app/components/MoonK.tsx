/**
 * MOON K - Classic BIBFRAME Cataloging Engine (3-Tab Layout)
 * Separate: Ontology Form + Wizard + Graph Engine as individual tabs
 * 
 * Features:
 * - Graph-centric state management (GraphStore / WEMI entities)
 * - Three cataloging modes: Ontology Form + Wizard (step-by-step) + Graph Engine
 * - Authority search (LOC, VIAF, Wikidata, AfIqa, ISBNdb)
 * - Glassmorphism / iOS blur UI
 * - MARC, RDF/Turtle, JSON-LD, OPAC Preview, Mind Map, Authority Graph
 * - Record persistence, validation, relationships, export/import
 * - ISBN auto-fill
 * - Designed and developed by isaac faleh
 */

"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Toaster } from "./ui/sonner";
import {
  Save, Download, Upload, ChevronLeft, ChevronDown, Search,
  User, Building, MapPin, Tag, Globe, BookOpen, Package,
  Eye, Network, Database, FileText, Code, Braces, Sparkles, Book,
  Layers, FileJson, CheckCircle2, AlertCircle, BarChart3,
  Clock, Loader2
} from "lucide-react";

// === Services from /src/services/ ===
import { GraphStore } from "../../services/graphStore";
import { generateUri, toTurtle, toJsonLd } from "../../services/rdfGraphBuilder";
import {
  RelationshipGraph, Relationship, generateRelationshipId, RELATIONSHIP_DEFINITIONS
} from "../../services/relationshipManager";
import * as recordAPI from "../../services/recordPersistence";
import { validateBibframeRecord, ValidationResult as BFValidationResult } from "../../services/bibframeValidator";
import {
  AuthorityResult,
  ISBNData,
  searchAllAuthorities,
  searchLanguages,
  searchCarriers,
  searchMediaTypes,
  searchCountries,
  searchRelators,
  COMMON_RELATORS,
  lookupISBN,
} from "../../services/authoritySearch";

// === Services from /src/app/services/ ===
import { getPropertiesForDomain } from "../services/bibframeOntologyEngine";
import { buildBibframeGraph, generateUri as genUri } from "../services/graphBuilder";
import { generateMARCFromBibframe } from "../services/marcGenerator";
import { authorityHub } from "../services/authorityHub/authorityHubService";
import type { AuthoritySearchResult, UnifiedPerson } from "../services/authorityHub/types";

// === Utils from /src/app/utils/ ===
import { realLocExamples } from "../utils/realLocExamples";
import { saveRecord } from "../utils/recordStorageBackend";
import { getThemeGradients } from "../utils/themeGradients";

// === App Components ===
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

// === Contexts ===
import { useAuth } from "../contexts/AuthContext";
import { useThemeSafe } from "../hooks/useThemeSafe";
import { BIBFRAMERecord } from "../types/bibframe";

// === Assets & Styles ===
import moonLogo from "figma:asset/448923f9298ec547f27dd322785433298cd5ac34.png";
import "../../styles/glassmorphism.css";
import { toBibframeJsonLdString } from '../../services/bibframeNormalizer';

// ============================== TYPES ==============================

type PreviewTab = "form" | "wizard" | "graph-engine" | "authority-graph" | "relationships" | "validation" | "marc" | "rdf" | "json" | "turtle" | "opac" | "mindmap";
type SaveStatus = "saved" | "unsaved" | "saving" | "error";
type AuthorityTab = "names" | "personal" | "corporate" | "conference" | "geographic" | "all" | "wikidata" | "books" | "publishers" | "subjects";

interface Contribution {
  agent: AuthorityResult | null;
  role: string;
}

interface Identifier {
  type: "Isbn" | "Issn" | "Lccn" | "Local";
  value: string;
}

interface MoonKProps {
  onBack?: () => void;
  initialWork?: any;
  initialInstance?: any;
  onRecordSaved?: () => void;
}

// Helper
const getLabelString = (value: any): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value["rdfs:label"]) return getLabelString(value["rdfs:label"]);
  if (typeof value === "object" && value["@value"]) return value["@value"];
  return String(value);
};

// ============================== MAIN COMPONENT ==============================

export default function MoonK({ onBack, initialWork, initialInstance, onRecordSaved }: MoonKProps) {
  const { t, i18n } = useTranslation();
  const { username } = useAuth();
  const { moonEngineTheme } = useThemeSafe();
  const gradients = getThemeGradients(moonEngineTheme);
  const [language, setLanguage] = useState<"en" | "ar">(i18n.language as "en" | "ar");

  // ===== CATALOG MODE =====
  const [activeTab, setActiveTab] = useState<PreviewTab>("form");

  // ===== GRAPH-CENTRIC STATE =====
  const [graphStore] = useState(new GraphStore());
  const [enableExpression, setEnableExpression] = useState(false);
  const [workUri] = useState(generateUri("work"));
  const [expressionUri] = useState(generateUri("expression"));
  const [instanceUri] = useState(generateUri("instance"));
  const [itemUri] = useState(generateUri("item"));
  const [relationshipGraph] = useState(new RelationshipGraph());
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [graphJsonld, setGraphJsonld] = useState<any>(null);
  const [graphTurtle, setGraphTurtle] = useState("");
  const [graphValidation, setGraphValidation] = useState<ValidationResult | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [recordTitle, setRecordTitle] = useState("Untitled Record");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("unsaved");
  const [showRecordViewer, setShowRecordViewer] = useState(false);

  // ===== ONTOLOGY-DRIVEN STATE =====
  const [workData, setWorkData] = useState<any>(
    initialWork || {
      "@type": "bf:Work",
      "@id": genUri("work"),
      "bf:contribution": [],
    }
  );
  const [instanceData, setInstanceData] = useState<any>(
    initialInstance || {
      "@type": "bf:Instance",
      "@id": genUri("instance"),
    }
  );

  // ===== WIZARD STATE =====
  const [currentStep, setCurrentStep] = useState<WizardStep>("work");
  const [wizWorkTitle, setWizWorkTitle] = useState("");
  const [wizSubtitle, setWizSubtitle] = useState("");
  const [wizLanguage, setWizLanguage] = useState<AuthorityResult | null>({
    label: "English", uri: "http://id.loc.gov/vocabulary/languages/eng", source: "LOC"
  });
  const [wizGenre, setWizGenre] = useState<AuthorityResult | null>(null);
  const [wizSubjects, setWizSubjects] = useState<AuthorityResult[]>([]);
  const [wizContributors, setWizContributors] = useState<Contribution[]>([{ agent: null, role: "aut" }]);
  const [wizIdentifiers, setWizIdentifiers] = useState<Identifier[]>([{ type: "Isbn", value: "" }]);
  const [wizExtent, setWizExtent] = useState("");
  const [wizCarrier, setWizCarrier] = useState<AuthorityResult | null>({
    label: "volume (print)", uri: "http://id.loc.gov/vocabulary/carriers/nc", source: "LOC"
  });
  const [wizMedia, setWizMedia] = useState<AuthorityResult | null>({
    label: "unmediated", uri: "http://id.loc.gov/vocabulary/mediaTypes/n", source: "LOC"
  });
  const [wizPubPlace, setWizPubPlace] = useState<AuthorityResult | null>({
    label: "United States", uri: "http://id.loc.gov/vocabulary/countries/xxu", source: "LOC"
  });
  const [wizPublisher, setWizPublisher] = useState<AuthorityResult | null>(null);
  const [wizPubDate, setWizPubDate] = useState(new Date().getFullYear().toString());
  const [wizHeldBy, setWizHeldBy] = useState("https://moonlib.org/library/main");
  const [wizShelfMark, setWizShelfMark] = useState("");
  const [wizBarcode, setWizBarcode] = useState("");
  const [wizJsonld, setWizJsonld] = useState<any>(null);
  const [wizTurtle, setWizTurtle] = useState("");
  const [wizValidation, setWizValidation] = useState<BFValidationResult | null>(null);
  const [isbnLookupLoading, setIsbnLookupLoading] = useState(false);

  // ===== AUTHORITY SEARCH =====
  const [showAuthoritySearch, setShowAuthoritySearch] = useState(false);
  const [currentAuthorityTab, setCurrentAuthorityTab] = useState<AuthorityTab>("names");

  // ===== DIALOGS =====
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExampleMenu, setShowExampleMenu] = useState(false);

  // ===== ONTOLOGY PROPERTIES =====
  const workProperties = getPropertiesForDomain("bf:Work");
  const instanceProperties = getPropertiesForDomain("bf:Instance");

  // ============================== INITIALIZATION ==============================

  useEffect(() => {
    graphStore.setNode(workUri, { "@id": workUri, "@type": "bf:Work" });
    graphStore.setNode(instanceUri, { "@id": instanceUri, "@type": "bf:Instance" });
    graphStore.setNode(itemUri, { "@id": itemUri, "@type": "bf:Item" });
    if (enableExpression) {
      graphStore.setNode(expressionUri, { "@id": expressionUri, "@type": "bf:Expression" });
    }
    graphStore.createWEMILinks(workUri, enableExpression ? expressionUri : undefined, instanceUri, itemUri);
    generateGraphRDF();
  }, []);

  useEffect(() => {
    if (initialWork) setWorkData(initialWork);
  }, [initialWork]);

  useEffect(() => {
    if (initialInstance) setInstanceData(initialInstance);
  }, [initialInstance]);

  // ============================== GRAPH ENGINE HANDLERS ==============================

  const handlePropertyChange = (nodeUri: string, property: string, value: any) => {
    graphStore.setProperty(nodeUri, property, value);
    setSaveStatus("unsaved");
    setTimeout(() => generateGraphRDF(), 500);
  };

  const toggleExpression = () => {
    const newValue = !enableExpression;
    setEnableExpression(newValue);
    setSaveStatus("unsaved");
    if (newValue) {
      graphStore.setNode(expressionUri, { "@id": expressionUri, "@type": "bf:Expression" });
    } else {
      const work = graphStore.getNode(workUri);
      if (work) delete work["bf:hasExpression"];
      const inst = graphStore.getNode(instanceUri);
      if (inst) inst["bf:instanceOf"] = { "@id": workUri };
    }
    graphStore.createWEMILinks(workUri, newValue ? expressionUri : undefined, instanceUri, itemUri);
    generateGraphRDF();
  };

  const generateGraphRDF = () => {
    try {
      const graphData = graphStore.toJsonLd();
      relationshipGraph.addToJsonLdGraph(graphData["@graph"] || [], relationships);
      const validationResult = validateGraph(graphStore, enableExpression);
      setGraphValidation(validationResult);
      setGraphJsonld(graphData);
      if (validationResult.valid) {
        const turtleOutput = toTurtle(graphData);
        setGraphTurtle(turtleOutput);
      } else {
        setGraphTurtle("");
      }
    } catch (error) {
      console.error("Graph RDF generation error:", error);
    }
  };

  // ============================== RELATIONSHIPS ==============================

  const addRelationship = () => {
    const newRel: Relationship = {
      id: generateRelationshipId(), type: "relatedTo",
      sourceUri: workUri, targetUri: "", label: ""
    };
    setRelationships([...relationships, newRel]);
  };

  const updateRelationship = (id: string, field: string, value: any) => {
    setRelationships(prev => prev.map(rel => (rel.id === id ? { ...rel, [field]: value } : rel)));
    setSaveStatus("unsaved");
    setTimeout(() => generateGraphRDF(), 500);
  };

  const removeRelationship = (id: string) => {
    setRelationships(prev => prev.filter(rel => rel.id !== id));
    setSaveStatus("unsaved");
    setTimeout(() => generateGraphRDF(), 500);
  };

  // ============================== ONTOLOGY FORM HANDLERS ==============================

  const updateWorkProperty = useCallback((uri: string, value: any) => {
    const propertyName = uri.split("/").pop() || uri;
    setWorkData((prev: any) => ({ ...prev, [propertyName]: value }));
    setSaveStatus("unsaved");
  }, []);

  const updateInstanceProperty = useCallback((uri: string, value: any) => {
    const propertyName = uri.split("/").pop() || uri;

    // Check if this contains ISBN auto-fill lookup data from EntityField
    if (value && value._isbnLookupData) {
      const data: ISBNData = value._isbnLookupData;
      const cleanValue = { ...value };
      delete cleanValue._isbnLookupData;

      setInstanceData((prev: any) => {
        const updated = { ...prev, [propertyName]: cleanValue };
        if (data.numberOfPages) {
          updated["bf:extent"] = { value: `${data.numberOfPages} pages`, '@type': 'bf:Extent' };
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

      // Sync to wizard fields
      if (data.title) setWizWorkTitle(data.title);
      if (data.subtitle) setWizSubtitle(data.subtitle);
      if (data.authors && data.authors.length > 0) {
        setWizContributors(data.authors.map((a: string) => ({
          agent: { label: a, uri: generateUri("agent"), source: "Local" as const }, role: "aut"
        })));
      }
      if (data.publishers && data.publishers.length > 0) {
        setWizPublisher({ label: data.publishers[0], uri: generateUri("organization"), source: "Local" });
      }
      if (data.publishDate) {
        const year = data.publishDate.match(/\d{4}/)?.[0];
        if (year) setWizPubDate(year);
      }
      if (data.numberOfPages) setWizExtent(`${data.numberOfPages} pages`);

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

  const graph = buildBibframeGraph(workData, instanceData);

  // ============================== AUTHORITY SEARCH ==============================

  const handleAuthoritySelect = (entity: any) => {
    if (entity.type === "book") {
      const newInstance = {
        ...instanceData,
        "bf:title": { "@type": "bf:Title", "bf:mainTitle": entity.title_long || entity.title || entity.label },
        "bf:identifiedBy": [{ "@type": "bf:Isbn", "rdf:value": entity.isbn13 || entity.isbn || entity.id }]
      };
      setInstanceData(newInstance);
      if (entity.authors) {
        const authors = Array.isArray(entity.authors) ? entity.authors : [entity.authors];
        const contributions = authors.map((author: string) => ({
          "@type": "bf:Contribution",
          "bf:agent": { "@type": "bf:Person", "rdfs:label": author },
          "bf:role": { "@id": "http://id.loc.gov/vocabulary/relators/aut", "rdfs:label": "Author" }
        }));
        setWorkData((prev: any) => ({
          ...prev, "bf:contribution": [...(prev["bf:contribution"] || []), ...contributions]
        }));
      }
      toast.success("Book Data Imported!", { description: `Imported "${entity.title || entity.label}"` });
      return;
    }

    if (entity.type === "publisher") {
      setInstanceData((prev: any) => ({
        ...prev,
        "bf:provisionActivity": {
          "@type": "bf:Publication",
          "bf:agent": { "@type": "bf:Agent", "rdfs:label": entity.name || entity.label },
          "bf:date": new Date().getFullYear().toString()
        }
      }));
      toast.success("Publisher Added!", { description: `Set publisher to ${entity.name || entity.label}` });
      return;
    }

    if (entity.type === "subject") {
      setWorkData((prev: any) => ({
        ...prev,
        "bf:subject": [...(prev["bf:subject"] || []), { "@type": "bf:Topic", "rdfs:label": entity.subject || entity.label }]
      }));
      toast.success("Subject Added!", { description: `Added "${entity.subject || entity.label}"` });
      return;
    }

    // Default: Person/Authority
    const person = entity as UnifiedPerson;
    const contribution = {
      "@type": "bf:Contribution",
      "bf:agent": {
        "@id": person.identifiers?.loc
          ? `http://id.loc.gov/authorities/names/${person.identifiers.loc}`
          : person.identifiers?.wikidata
            ? `https://www.wikidata.org/entity/${person.identifiers.wikidata}`
            : person.id,
        "@type": "bf:Person",
        "rdfs:label": person.label,
      },
      "bf:role": { "@id": "http://id.loc.gov/vocabulary/relators/aut", "rdfs:label": "Author" },
    };

    setWorkData((prev: any) => ({
      ...prev, "bf:contribution": [...(prev["bf:contribution"] || []), contribution]
    }));
    toast.success("Contributor added!", { description: `${person.label} added with LOC URI.` });
  };

  const openAuthoritySearch = (tab: AuthorityTab) => {
    setCurrentAuthorityTab(tab);
    setShowAuthoritySearch(true);
  };

  // ============================== WIZARD GRAPH BUILDER ==============================

  const buildWizardGraph = (): any => {
    const g: any[] = [];
    const work: any = {
      "@id": workUri, "@type": "bf:Work",
      "bf:title": { "@type": "bf:Title", "bf:mainTitle": [{ "@value": wizWorkTitle }] }
    };
    if (wizSubtitle) work["bf:title"]["bf:subtitle"] = [{ "@value": wizSubtitle }];
    if (wizLanguage) work["bf:language"] = { "@id": wizLanguage.uri };
    if (wizGenre) work["bf:genreForm"] = { "@id": wizGenre.uri };
    if (wizSubjects.length > 0) work["bf:subject"] = wizSubjects.map(s => ({ "@id": s.uri }));
    work["bf:contribution"] = wizContributors.filter(c => c.agent).map(c => ({
      "@type": "bf:Contribution",
      "bf:agent": { "@id": c.agent!.uri },
      "bf:role": { "@id": `http://id.loc.gov/vocabulary/relators/${c.role}` }
    }));
    work["bf:hasInstance"] = { "@id": instanceUri };
    g.push(work);

    wizContributors.forEach(c => {
      if (c.agent && c.agent.source === "Local") {
        g.push({ "@id": c.agent.uri, "@type": "bf:Person", "rdfs:label": c.agent.label });
      }
    });

    const instance: any = {
      "@id": instanceUri, "@type": "bf:Instance",
      "bf:instanceOf": { "@id": workUri },
      "bf:title": { "@type": "bf:Title", "bf:mainTitle": [{ "@value": wizWorkTitle }] }
    };
    if (wizSubtitle) instance["bf:title"]["bf:subtitle"] = [{ "@value": wizSubtitle }];
    instance["bf:identifiedBy"] = wizIdentifiers.filter(id => id.value.trim()).map(id => ({
      "@type": `bf:${id.type}`, "rdf:value": id.value
    }));
    if (wizExtent) instance["bf:extent"] = { "@type": "bf:Extent", "rdfs:label": wizExtent };
    if (wizCarrier) instance["bf:carrier"] = { "@id": wizCarrier.uri };
    if (wizMedia) instance["bf:media"] = { "@id": wizMedia.uri };
    const pubAgent = wizPublisher ? wizPublisher.uri : generateUri("organization");
    instance["bf:provisionActivity"] = {
      "@type": "bf:Publication",
      "bf:place": { "@id": wizPubPlace!.uri },
      "bf:agent": { "@id": pubAgent },
      "bf:date": { "@value": wizPubDate, "@type": "xsd:gYear" }
    };
    if (wizPublisher && wizPublisher.source === "Local") {
      g.push({ "@id": wizPublisher.uri, "@type": "bf:Organization", "rdfs:label": wizPublisher.label });
    }
    instance["bf:hasItem"] = { "@id": itemUri };
    g.push(instance);

    const item: any = { "@id": itemUri, "@type": "bf:Item", "bf:itemOf": { "@id": instanceUri } };
    if (wizHeldBy) item["bf:heldBy"] = { "@id": wizHeldBy };
    if (wizShelfMark) item["bf:shelfMark"] = wizShelfMark;
    if (wizBarcode) item["bf:identifiedBy"] = { "@type": "bf:Barcode", "rdf:value": wizBarcode };
    g.push(item);

    return toJsonLd(g);
  };

  const generateWizardRDF = () => {
    try {
      const g = buildWizardGraph();
      const vr = validateBibframeRecord(g);
      setWizValidation(vr);
      setWizJsonld(g);
      if (vr.valid) setWizTurtle(toTurtle(g));
      else setWizTurtle("");
    } catch (error) {
      console.error("Wizard RDF generation error:", error);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => { if (wizWorkTitle) generateWizardRDF(); }, 500);
    return () => clearTimeout(timer);
  }, [wizWorkTitle, wizSubtitle, wizLanguage, wizGenre, wizSubjects, wizContributors, wizIdentifiers, wizExtent, wizCarrier, wizMedia, wizPubPlace, wizPublisher, wizPubDate, wizHeldBy, wizShelfMark, wizBarcode]);

  const wizStepValidation = {
    work: !!(wizWorkTitle.trim() && wizContributors.length > 0 && wizContributors.every(c => c.agent !== null && c.role)),
    instance: !!(wizCarrier && wizMedia),
    publication: !!(wizPubPlace && wizPublisher && wizPubDate),
    item: true
  };

  // ============================== ISBN LOOKUP ==============================

  const handleISBNLookup = async () => {
    const isbn = wizIdentifiers.find(id => id.type === "Isbn" && id.value.trim());
    if (!isbn) return;
    setIsbnLookupLoading(true);
    try {
      const data = await lookupISBN(isbn.value);
      if (data) {
        if (data.title) setWizWorkTitle(data.title);
        if (data.subtitle) setWizSubtitle(data.subtitle);
        if (data.authors && data.authors.length > 0) {
          setWizContributors(data.authors.map(a => ({
            agent: { label: a, uri: generateUri("agent"), source: "Local" as const }, role: "aut"
          })));
        }
        if (data.publishers && data.publishers.length > 0) {
          setWizPublisher({ label: data.publishers[0], uri: generateUri("organization"), source: "Local" });
        }
        if (data.publishDate) {
          const year = data.publishDate.match(/\d{4}/)?.[0];
          if (year) setWizPubDate(year);
        }
        if (data.numberOfPages) setWizExtent(`${data.numberOfPages} pages`);
        toast.success("ISBN auto-fill complete!");
      }
    } catch (error) {
      console.error("ISBN lookup error:", error);
      toast.error("ISBN lookup failed");
    } finally {
      setIsbnLookupLoading(false);
    }
  };

  // ============================== EXAMPLES & IMPORT ==============================

  const handleLoadExample = (exampleData: any) => {
    setWorkData({ ...exampleData.work, "@id": exampleData.work["@id"] || genUri("work") });
    setInstanceData({ ...exampleData.instance, "@id": exampleData.instance["@id"] || genUri("instance") });
    setShowExampleMenu(false);
    setSaveStatus("unsaved");
    toast.success("Loaded Real LOC Example", { description: "Complete bibliographic record with proper authority URIs.", duration: 4000 });
  };

  const handleImport = (importedWorkData: any, importedInstanceData: any) => {
    setWorkData({ ...importedWorkData, "@id": importedWorkData["@id"] || genUri("work") });
    setInstanceData({ ...importedInstanceData, "@id": importedInstanceData["@id"] || genUri("instance") });
    setSaveStatus("unsaved");
    toast.success("Record imported successfully!");
  };

  // ============================== SAVE ==============================

  const handleSave = async () => {
    try {
      setSaveStatus("saving");
      let title = "Untitled Record";
      const instTitle = instanceData["bf:title"];
      if (instTitle) {
        if (typeof instTitle === "string") title = instTitle;
        else if (instTitle["bf:mainTitle"]) title = instTitle["bf:mainTitle"];
        else if (instTitle["rdfs:label"]) title = instTitle["rdfs:label"];
      }
      if (title === "Untitled Record") {
        const wTitle = workData["bf:title"];
        if (wTitle) {
          if (typeof wTitle === "string") title = wTitle;
          else if (wTitle["bf:mainTitle"]) title = wTitle["bf:mainTitle"];
          else if (wTitle["rdfs:label"]) title = wTitle["rdfs:label"];
        }
      }
      if (title === "Untitled Record" && wizWorkTitle) title = wizWorkTitle;
      if (title === "Untitled Record" && recordTitle !== "Untitled Record") title = recordTitle;

      const record: BIBFRAMERecord = {
        "@context": {
          bf: "http://id.loc.gov/ontologies/bibframe/",
          rdfs: "http://www.w3.org/2000/01/rdf-schema#",
          rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
        },
        work: workData,
        instance: instanceData,
        metadata: {
          catalogingLanguage: language,
          descriptionConventions: "rda",
          resourceType: "Moon K - designed and developed by isaac faleh",
        },
      };

      const savedRecord = await saveRecord(record, username || "Anonymous");
      setSaveStatus("saved");
      toast.success("Record saved to database permanently!", { description: title });
      if (onRecordSaved) onRecordSaved();
      console.log("Record saved:", savedRecord);
    } catch (error) {
      console.error("Save error:", error);
      setSaveStatus("error");
      toast.error("Failed to save record", { description: error instanceof Error ? error.message : "Unknown error" });
    }
  };

  const handleGraphSave = async () => {
    try {
      setSaveStatus("saving");
      if (!graphJsonld) throw new Error("No graph to save");
      if (recordId) {
        await recordAPI.updateRecord(recordId, graphJsonld, recordTitle);
      } else {
        const created = await recordAPI.createRecord(graphJsonld, recordTitle, "Work");
        setRecordId(created.id);
      }
      setSaveStatus("saved");
      toast.success("Graph record saved!");
    } catch (error) {
      console.error("Graph save failed:", error);
      setSaveStatus("error");
      toast.error("Failed to save graph record");
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

  // Authority nodes for graph
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

  const graphStats = graphStore.getStats();

  // ============================== RENDER ==============================

  return (
    <div className="h-screen flex flex-col animated-gradient-bg">
      <Toaster position="top-right" />

      {/* ===== GLASS NAVBAR ===== */}
      <div className="glass-navbar">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              {onBack && (
                <button onClick={onBack} className="glass-button px-4 py-2 flex items-center gap-2">
                  <ChevronLeft className="h-4 w-4" /> Back
                </button>
              )}
              <img src={moonLogo} alt="Moon Logo" className="h-14 w-auto" />
              <div>
                <h1 className="text-2xl font-bold text-white drop-shadow-lg" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
                  Moon K
                </h1>
                <p className="text-xs text-white/80" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
                  Classic 3-Tab BIBFRAME Engine - designed and developed by isaac faleh
                </p>
              </div>
            </div>

            {/* Save Status Badge */}
            <div className="flex items-center gap-3">
              <SaveStatusBadge status={saveStatus} />
              <input
                type="text"
                value={recordTitle}
                onChange={(e) => { setRecordTitle(e.target.value); setSaveStatus("unsaved"); }}
                className="px-3 py-1.5 bg-white/20 backdrop-blur-sm border border-white/30 rounded-lg text-white text-sm placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/40"
                placeholder="Record Title"
              />
            </div>
          </div>

          {/* Authority Search Bar */}
          <div className="glass-tab-bar flex items-center gap-2 overflow-x-auto pb-2">
            <AuthTabBtn active={currentAuthorityTab === "names"} onClick={() => openAuthoritySearch("names")} icon={<User className="h-3.5 w-3.5" />} label="NAF Names" />
            <AuthTabBtn active={currentAuthorityTab === "corporate"} onClick={() => openAuthoritySearch("corporate")} icon={<Building className="h-3.5 w-3.5" />} label="Corporate" />
            <AuthTabBtn active={currentAuthorityTab === "geographic"} onClick={() => openAuthoritySearch("geographic")} icon={<MapPin className="h-3.5 w-3.5" />} label="Geographic" />
            <AuthTabBtn active={currentAuthorityTab === "all"} onClick={() => openAuthoritySearch("all")} icon={<Tag className="h-3.5 w-3.5" />} label="All NAF" />
            <AuthTabBtn active={currentAuthorityTab === "wikidata"} onClick={() => openAuthoritySearch("wikidata")} icon={<Globe className="h-3.5 w-3.5" />} label="Wikidata" />
            <AuthTabBtn active={currentAuthorityTab === "books"} onClick={() => openAuthoritySearch("books")} icon={<Book className="h-3.5 w-3.5" />} label="Books" />
            <AuthTabBtn active={currentAuthorityTab === "publishers"} onClick={() => openAuthoritySearch("publishers")} icon={<Building className="h-3.5 w-3.5" />} label="Publishers" />
            <AuthTabBtn active={currentAuthorityTab === "subjects"} onClick={() => openAuthoritySearch("subjects")} icon={<Tag className="h-3.5 w-3.5" />} label="Subjects" />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button onClick={handleSave} className="glass-button px-4 py-2 flex items-center gap-2 text-sm">
              <Save className="h-4 w-4" /> Save Record
            </button>

            {/* Load Example Dropdown */}
            <div className="relative">
              <button onClick={() => setShowExampleMenu(!showExampleMenu)} className="glass-button px-4 py-2 flex items-center gap-2 text-sm">
                <Database className="h-4 w-4" /> Load Example
              </button>
              {showExampleMenu && (
                <div className="absolute top-full left-0 mt-2 w-80 glass-card z-50 max-h-96 overflow-y-auto p-2">
                  <div className="px-3 py-2 text-xs font-semibold text-white border-b border-white/30" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
                    Real LOC Examples
                  </div>
                  {realLocExamples.map((example) => (
                    <button
                      key={example.id}
                      className="w-full text-left px-3 py-2 rounded transition-all hover:bg-black/30"
                      onClick={() => handleLoadExample(example.data)}
                    >
                      <div className="font-medium text-sm text-white" style={{ textShadow: "0 2px 6px rgba(0,0,0,0.8)" }}>
                        {example.name}
                      </div>
                      <div className="text-xs text-gray-300 mt-0.5" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
                        {example.description}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => setShowImportDialog(true)} className="glass-button px-4 py-2 flex items-center gap-2 text-sm">
              <Upload className="h-4 w-4" /> Import
            </button>
            <button
              onClick={() => downloadFile(toBibframeJsonLdString(graph), "bibframe-record.jsonld", "application/ld+json")}
              className="glass-button px-4 py-2 flex items-center gap-2 text-sm"
            >
              <Download className="h-4 w-4" /> Export JSON-LD
            </button>
            {graphValidation?.valid && (
              <button onClick={() => setShowRecordViewer(true)} className="glass-button px-4 py-2 flex items-center gap-2 text-sm">
                <BookOpen className="h-4 w-4" /> OPAC/MARC
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ===== VIEW TABS (3-Tab Classic Layout) ===== */}
      <div className="glass-navbar border-t border-white/20">
        <div className="px-6 py-2">
          <div className="glass-tab-bar flex items-center gap-1.5 overflow-x-auto">
            <TabBtn active={activeTab === "form"} onClick={() => setActiveTab("form")} icon={<FileText className="h-3.5 w-3.5" />} label="Ontology Form" color="blue" />
            <TabBtn active={activeTab === "wizard"} onClick={() => setActiveTab("wizard")} icon={<Sparkles className="h-3.5 w-3.5" />} label="Wizard" color="purple" />
            <TabBtn active={activeTab === "graph-engine"} onClick={() => setActiveTab("graph-engine")} icon={<Layers className="h-3.5 w-3.5" />} label="Graph Engine" color="orange" />
            <span className="w-px h-5 bg-white/20 mx-1" />
            <TabBtn active={activeTab === "authority-graph"} onClick={() => setActiveTab("authority-graph")} icon={<Network className="h-3.5 w-3.5" />} label="Authority Graph" color="blue" />
            <TabBtn active={activeTab === "relationships"} onClick={() => setActiveTab("relationships")} icon={<Network className="h-3.5 w-3.5" />} label="Relationships" color="green" />
            <TabBtn active={activeTab === "validation"} onClick={() => setActiveTab("validation")} icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Validation" color="green" />
            <TabBtn active={activeTab === "marc"} onClick={() => setActiveTab("marc")} icon={<Database className="h-3.5 w-3.5" />} label="MARC" color="red" />
            <TabBtn active={activeTab === "rdf"} onClick={() => setActiveTab("rdf")} icon={<Code className="h-3.5 w-3.5" />} label="RDF" color="purple" />
            <TabBtn active={activeTab === "json"} onClick={() => setActiveTab("json")} icon={<Braces className="h-3.5 w-3.5" />} label="JSON" color="blue" />
            <TabBtn active={activeTab === "turtle"} onClick={() => setActiveTab("turtle")} icon={<Code className="h-3.5 w-3.5" />} label="Turtle" color="green" />
            <TabBtn active={activeTab === "opac"} onClick={() => setActiveTab("opac")} icon={<Eye className="h-3.5 w-3.5" />} label="OPAC" color="purple" />
            <TabBtn active={activeTab === "mindmap"} onClick={() => setActiveTab("mindmap")} icon={<Sparkles className="h-3.5 w-3.5" />} label="Mind Map" color="orange" />
          </div>
        </div>
      </div>

      {/* ===== MAIN CONTENT ===== */}
      <div
        className="flex-1 overflow-auto p-6"
        style={{
          background: "linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(20, 20, 30, 0.5) 100%)",
          backdropFilter: "blur(40px) saturate(150%)",
          WebkitBackdropFilter: "blur(40px) saturate(150%)",
        }}
      >
        {/* ===== ONTOLOGY FORM TAB ===== */}
        {activeTab === "form" && (
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1">
              <div className="glass-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <BookOpen className="h-5 w-5 text-blue-400" />
                  <h3 className="text-xl font-semibold text-white">Work</h3>
                </div>
                <div className="space-y-4 max-h-[calc(100vh-380px)] overflow-y-auto">
                  {workProperties.map((property) => (
                    <OntologyField
                      key={property.uri}
                      property={property}
                      value={workData[property.uri.split("/").pop() || ""]}
                      onChange={(value) => updateWorkProperty(property.uri, value)}
                      language={language}
                    />
                  ))}
                  {/* Contributors */}
                  {workData["bf:contribution"]?.length > 0 && (
                    <div className="glass-panel p-4 rounded-lg">
                      <h4 className="text-sm font-semibold mb-2 text-white">Contributors ({workData["bf:contribution"].length})</h4>
                      {workData["bf:contribution"].map((contrib: any, idx: number) => (
                        <div key={idx} className="text-sm p-2 bg-white/20 rounded mb-2">
                          <div className="font-medium text-white">{getLabelString(contrib["bf:agent"]?.["rdfs:label"] || "Unknown")}</div>
                          <div className="text-xs text-gray-300">{getLabelString(contrib["bf:role"]?.["rdfs:label"] || "Contributor")}</div>
                          <div className="text-xs text-blue-300 truncate">{contrib["bf:agent"]?.["@id"]}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex-1">
              <div className="glass-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Package className="h-5 w-5 text-purple-400" />
                  <h3 className="text-xl font-semibold text-white">Instance</h3>
                </div>
                <div className="space-y-4 max-h-[calc(100vh-380px)] overflow-y-auto">
                  {instanceProperties.map((property) => (
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
            </div>
          </div>
        )}

        {/* ===== WIZARD TAB ===== */}
        {activeTab === "wizard" && (
          <div className="glass-card p-6">
            <CatalogingWizard currentStep={currentStep} onStepChange={setCurrentStep} validation={wizStepValidation}>
              {currentStep === "work" && (
                <WorkStep
                  workTitle={wizWorkTitle} setWorkTitle={setWizWorkTitle}
                  subtitle={wizSubtitle} setSubtitle={setWizSubtitle}
                  language={wizLanguage} setLanguage={setWizLanguage}
                  genre={wizGenre} setGenre={setWizGenre}
                  subjects={wizSubjects} setSubjects={setWizSubjects}
                  contributors={wizContributors} setContributors={setWizContributors}
                />
              )}
              {currentStep === "instance" && (
                <InstanceStep
                  identifiers={wizIdentifiers} setIdentifiers={setWizIdentifiers}
                  extent={wizExtent} setExtent={setWizExtent}
                  carrier={wizCarrier} setCarrier={setWizCarrier}
                  media={wizMedia} setMedia={setWizMedia}
                  onISBNLookup={handleISBNLookup} isbnLookupLoading={isbnLookupLoading}
                />
              )}
              {currentStep === "publication" && (
                <PublicationStep
                  publicationPlace={wizPubPlace} setPublicationPlace={setWizPubPlace}
                  publisher={wizPublisher} setPublisher={setWizPublisher}
                  publicationDate={wizPubDate} setPublicationDate={setWizPubDate}
                />
              )}
              {currentStep === "item" && (
                <ItemStep
                  heldBy={wizHeldBy} setHeldBy={setWizHeldBy}
                  shelfMark={wizShelfMark} setShelfMark={setWizShelfMark}
                  barcode={wizBarcode} setBarcode={setWizBarcode}
                />
              )}
            </CatalogingWizard>
            {/* Wizard Validation Summary */}
            {wizValidation && (
              <div className={`mt-4 p-4 rounded-lg ${wizValidation.valid ? "bg-green-500/20 border border-green-500/40" : "bg-yellow-500/20 border border-yellow-500/40"}`}>
                <div className="flex items-center gap-2">
                  {wizValidation.valid ? (
                    <><CheckCircle2 className="h-5 w-5 text-green-400" /><span className="font-semibold text-green-300">Valid BIBFRAME Record</span></>
                  ) : (
                    <><AlertCircle className="h-5 w-5 text-yellow-400" /><span className="font-semibold text-yellow-300">{wizValidation.errors.length} validation issue(s)</span></>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== GRAPH ENGINE TAB ===== */}
        {activeTab === "graph-engine" && (
          <div className="space-y-6">
            {/* Graph Stats */}
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Layers className="h-6 w-6 text-orange-400" /> Graph Engine
                  </h3>
                  <p className="text-sm text-gray-300">Registry-Powered Graph-Based SHACL-Validatable</p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={handleGraphSave} disabled={saveStatus === "saving" || saveStatus === "saved"}
                    className="glass-button px-4 py-2 flex items-center gap-2 text-sm">
                    <Save className="h-4 w-4" /> Save Graph
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-6 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <Database className="h-4 w-4" /><span className="font-semibold">{graphStats.nodeCount} Nodes</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <Network className="h-4 w-4" /><span className="font-semibold">{graphStats.tripleCount} Triples</span>
                </div>
                {Object.entries(graphStats.types).map(([type, count]) => (
                  <div key={type} className="flex items-center gap-2 text-sm text-gray-300">
                    <BarChart3 className="h-4 w-4" /><span>{type.replace("bf:", "")}: {count as number}</span>
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={enableExpression} onChange={toggleExpression}
                  className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500" />
                <span className="text-sm font-semibold text-gray-300">Enable Expression Layer (FRBR Work-Expression-Instance-Item)</span>
              </label>
              {graphValidation && <div className="mt-4"><ValidationPanel validation={graphValidation} compact /></div>}
            </div>

            {/* WEMI Entity Sections */}
            <EntitySection title="Work" icon={<Database className="h-6 w-6 text-blue-400" />} uri={workUri}>
              <OntologyDrivenFormRenderer entityType="Work" nodeUri={workUri} graphStore={graphStore} onChange={handlePropertyChange} />
            </EntitySection>
            {enableExpression && (
              <EntitySection title="Expression" icon={<Sparkles className="h-6 w-6 text-purple-400" />} uri={expressionUri}>
                <OntologyDrivenFormRenderer entityType="Expression" nodeUri={expressionUri} graphStore={graphStore} onChange={handlePropertyChange} />
              </EntitySection>
            )}
            <EntitySection title="Instance" icon={<Database className="h-6 w-6 text-green-400" />} uri={instanceUri}>
              <OntologyDrivenFormRenderer entityType="Instance" nodeUri={instanceUri} graphStore={graphStore} onChange={handlePropertyChange} />
            </EntitySection>
            <EntitySection title="Item" icon={<Database className="h-6 w-6 text-orange-400" />} uri={itemUri}>
              <OntologyDrivenFormRenderer entityType="Item" nodeUri={itemUri} graphStore={graphStore} onChange={handlePropertyChange} />
            </EntitySection>
          </div>
        )}

        {/* ===== AUTHORITY GRAPH ===== */}
        {activeTab === "authority-graph" && (
          <div className="glass-card p-6">
            <h3 className="text-xl font-semibold mb-4 text-white">Authority Graph</h3>
            <AuthorityGraph nodes={authorityNodes} />
          </div>
        )}

        {/* ===== RELATIONSHIPS ===== */}
        {activeTab === "relationships" && (
          <RelationshipsView relationships={relationships} onAdd={addRelationship} onUpdate={updateRelationship} onRemove={removeRelationship} />
        )}

        {/* ===== VALIDATION ===== */}
        {activeTab === "validation" && (
          <div className="glass-card p-6">
            <h3 className="text-xl font-bold text-white mb-4">Validation</h3>
            {graphValidation && <ValidationPanel validation={graphValidation} />}
            {wizValidation && (
              <div className="mt-6">
                <h4 className="text-lg font-semibold text-white mb-3">Wizard Record Validation</h4>
                <div className={`p-4 rounded-lg ${wizValidation.valid ? "bg-green-500/20 border border-green-500/40" : "bg-red-500/20 border border-red-500/40"}`}>
                  <div className="flex items-center gap-2">
                    {wizValidation.valid ? (
                      <><CheckCircle2 className="h-5 w-5 text-green-400" /><span className="text-green-300 font-semibold">Valid</span></>
                    ) : (
                      <><AlertCircle className="h-5 w-5 text-red-400" /><span className="text-red-300 font-semibold">{wizValidation.errors.length} Error(s)</span></>
                    )}
                  </div>
                  {wizValidation.errors.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {wizValidation.errors.map((err, idx) => (
                        <li key={idx} className="text-sm text-red-300">- {err.message}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== MARC ===== */}
        {activeTab === "marc" && <MarcView data={{ work: workData, instance: instanceData, admin: {} }} />}

        {/* ===== RDF ===== */}
        {activeTab === "rdf" && <RdfView data={{ work: workData, instance: instanceData, admin: {} }} />}

        {/* ===== JSON ===== */}
        {activeTab === "json" && (
          <div className="glass-card p-6">
            <h3 className="text-xl font-semibold mb-4 text-white">JSON Structure</h3>
            <pre className="bg-gray-900 text-green-400 p-6 rounded-lg overflow-auto text-sm max-h-[600px]">
              <code>{JSON.stringify({ work: workData, instance: instanceData }, null, 2)}</code>
            </pre>
          </div>
        )}

        {/* ===== TURTLE ===== */}
        {activeTab === "turtle" && (
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Turtle RDF</h3>
              {graphTurtle && (
                <button onClick={() => downloadFile(graphTurtle, "bibframe-graph.ttl", "text/turtle")}
                  className="glass-button px-4 py-2 flex items-center gap-2 text-sm">
                  <Download className="h-4 w-4" /> Download .ttl
                </button>
              )}
            </div>
            <pre className="bg-gray-900 text-green-400 p-6 rounded-lg overflow-auto text-sm max-h-[600px]">
              {graphTurtle || wizTurtle || "Configure the record to generate Turtle RDF..."}
            </pre>
          </div>
        )}

        {/* ===== OPAC ===== */}
        {activeTab === "opac" && (
          <div className="glass-card p-6">
            <h3 className="text-xl font-semibold mb-4 text-white">OPAC Preview</h3>
            <OPACPreview workData={workData} instanceData={instanceData} />
          </div>
        )}

        {/* ===== MIND MAP ===== */}
        {activeTab === "mindmap" && (
          <div className="glass-card p-6">
            <h3 className="text-xl font-semibold mb-4 text-white">Mind Map</h3>
            <MindMapPreview workData={workData} instanceData={instanceData} />
          </div>
        )}
      </div>

      {/* ===== DIALOGS ===== */}
      <AuthoritySearchDialog
        isOpen={showAuthoritySearch}
        onClose={() => setShowAuthoritySearch(false)}
        onSelect={handleAuthoritySelect}
        initialQuery=""
      />
      <ImportRecordDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImport={handleImport}
      />
      <RecordViewerDialog
        open={showRecordViewer}
        onOpenChange={setShowRecordViewer}
        jsonldData={graphJsonld || { "@graph": [] }}
        title={recordTitle}
      />
    </div>
  );
}

// ============================== SUB-COMPONENTS ==============================

function SaveStatusBadge({ status }: { status: SaveStatus }) {
  const config = {
    saved: { bg: "bg-green-500/30 border-green-500/50", text: "text-green-300", icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Saved" },
    unsaved: { bg: "bg-yellow-500/30 border-yellow-500/50", text: "text-yellow-300", icon: <Clock className="h-3.5 w-3.5" />, label: "Unsaved" },
    saving: { bg: "bg-blue-500/30 border-blue-500/50", text: "text-blue-300", icon: <Save className="h-3.5 w-3.5 animate-spin" />, label: "Saving..." },
    error: { bg: "bg-red-500/30 border-red-500/50", text: "text-red-300", icon: <AlertCircle className="h-3.5 w-3.5" />, label: "Error" },
  };
  const c = config[status];
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${c.bg} ${c.text} font-semibold text-xs`}>
      {c.icon} {c.label}
    </div>
  );
}

function AuthTabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl whitespace-nowrap transition-all text-xs font-medium ${
        active ? "glass-tab-active text-blue-400 shadow-lg" : "hover:bg-white/20 text-gray-300"
      }`}
    >
      {icon} {label}
    </button>
  );
}

function TabBtn({ active, onClick, icon, label, color }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; color: string }) {
  const activeColors: Record<string, string> = {
    blue: "text-blue-400", purple: "text-purple-400", orange: "text-orange-400",
    green: "text-green-400", red: "text-red-400"
  };
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl whitespace-nowrap transition-all text-xs font-medium ${
        active ? `glass-tab-active ${activeColors[color] || "text-blue-400"} shadow-lg` : "hover:bg-white/20 text-gray-400"
      }`}
    >
      {icon} {label}
    </button>
  );
}

function EntitySection({ title, icon, uri, children }: { title: string; icon: React.ReactNode; uri: string; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="glass-card overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 bg-white/5 hover:bg-white/10 flex items-center justify-between transition-all" type="button">
        <div className="flex items-center gap-3">
          {icon}
          <div className="text-left">
            <h2 className="text-xl font-bold text-white">{title}</h2>
            <p className="text-xs text-gray-400 font-mono">{uri}</p>
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${expanded ? "" : "rotate-180"}`} />
      </button>
      {expanded && <div className="p-6">{children}</div>}
    </div>
  );
}

function RelationshipsView({ relationships, onAdd, onUpdate, onRemove }: any) {
  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Semantic Relationships</h2>
        <button onClick={onAdd} className="glass-button px-4 py-2 text-sm">+ Add Relationship</button>
      </div>
      {relationships.length === 0 && (
        <div className="text-center text-gray-400 py-8">No relationships defined yet</div>
      )}
      <div className="space-y-4">
        {relationships.map((rel: Relationship) => (
          <div key={rel.id} className="p-4 bg-white/10 border border-white/20 rounded-lg">
            <div className="flex items-start gap-4">
              <div className="flex-1 space-y-3">
                <select value={rel.type} onChange={(e) => onUpdate(rel.id, "type", e.target.value)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/30 rounded-lg text-white">
                  {Object.entries(RELATIONSHIP_DEFINITIONS).map(([type, def]) => (
                    <option key={type} value={type}>{(def as any).label}</option>
                  ))}
                </select>
                <input type="text" value={rel.targetUri} onChange={(e) => onUpdate(rel.id, "targetUri", e.target.value)}
                  placeholder="Target URI" className="w-full px-3 py-2 bg-white/10 border border-white/30 rounded-lg text-white placeholder-gray-400" />
              </div>
              <button onClick={() => onRemove(rel.id)}
                className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-sm">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================== WIZARD STEP COMPONENTS ==============================

function WorkStep({ workTitle, setWorkTitle, subtitle, setSubtitle, language, setLanguage, genre, setGenre, subjects, setSubjects, contributors, setContributors }: any) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Work: Intellectual Content</h2>
        <p className="text-gray-600">Describe the conceptual essence of this resource</p>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Main Title <span className="text-red-500">*</span></label>
          <input type="text" value={workTitle} onChange={(e) => setWorkTitle(e.target.value)} placeholder="Enter the main title"
            className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Subtitle</label>
          <input type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Enter subtitle if applicable"
            className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <AuthoritySelect label="Language" value={language} onChange={setLanguage} onSearch={searchLanguages} placeholder="Search languages..." required />
      <AuthoritySelect label="Genre/Form" value={genre} onChange={setGenre} onSearch={(q: string) => searchAllAuthorities(q, "genre")} placeholder="Search genre forms..." />
      <AuthorityMultiSelect label="Subjects" values={subjects} onChange={setSubjects} onSearch={(q: string) => searchAllAuthorities(q, "subject")} placeholder="Search and add subjects..." />
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-gray-700">Contributors <span className="text-red-500">*</span></label>
          <button onClick={() => setContributors([...contributors, { agent: null, role: "aut" }])}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold" type="button">
            + Add Contributor
          </button>
        </div>
        {contributors.map((contrib: any, index: number) => (
          <div key={index} className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-700">Contributor {index + 1}</span>
              {contributors.length > 1 && (
                <button onClick={() => setContributors(contributors.filter((_: any, i: number) => i !== index))}
                  className="text-sm text-red-600 hover:text-red-700 font-semibold" type="button">Remove</button>
              )}
            </div>
            <AuthoritySelect label="Agent" value={contrib.agent}
              onChange={(value: any) => { const u = [...contributors]; u[index].agent = value; setContributors(u); }}
              onSearch={(q: string) => searchAllAuthorities(q, "person")} placeholder="Search for person or organization..." required allowCustom />
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Role <span className="text-red-500">*</span></label>
              <select value={contrib.role}
                onChange={(e) => { const u = [...contributors]; u[index].role = e.target.value; setContributors(u); }}
                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {COMMON_RELATORS.map(r => (<option key={r.code} value={r.code}>{r.label} ({r.code})</option>))}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InstanceStep({ identifiers, setIdentifiers, extent, setExtent, carrier, setCarrier, media, setMedia, onISBNLookup, isbnLookupLoading }: any) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Instance: Physical Manifestation</h2>
        <p className="text-gray-600">Describe how this work is embodied</p>
      </div>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-gray-700">Identifiers</label>
          <button onClick={() => setIdentifiers([...identifiers, { type: "Isbn", value: "" }])}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold" type="button">+ Add Identifier</button>
        </div>
        {identifiers.map((id: Identifier, index: number) => (
          <div key={index} className="flex gap-3">
            <select value={id.type}
              onChange={(e) => { const u = [...identifiers]; u[index].type = e.target.value as any; setIdentifiers(u); }}
              className="px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="Isbn">ISBN</option><option value="Issn">ISSN</option><option value="Lccn">LCCN</option><option value="Local">Local</option>
            </select>
            <input type="text" value={id.value}
              onChange={(e) => { const u = [...identifiers]; u[index].value = e.target.value; setIdentifiers(u); }}
              placeholder="Enter identifier" className="flex-1 px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={() => setIdentifiers(identifiers.filter((_: any, i: number) => i !== index))}
              className="px-4 py-3 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-semibold" type="button">Remove</button>
          </div>
        ))}
        {identifiers.some((id: Identifier) => id.type === "Isbn" && id.value.trim()) && (
          <button onClick={onISBNLookup} disabled={isbnLookupLoading}
            className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50" type="button">
            {isbnLookupLoading ? (<><Loader2 className="h-5 w-5 animate-spin" /> Loading from Open Library...</>) : (<><Search className="h-5 w-5" /> Auto-fill from ISBN</>)}
          </button>
        )}
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Extent</label>
        <input type="text" value={extent} onChange={(e) => setExtent(e.target.value)} placeholder="e.g., xviii, 256 pages"
          className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <AuthoritySelect label="Carrier" value={carrier} onChange={setCarrier} onSearch={searchCarriers} placeholder="Select carrier type..." required />
      <AuthoritySelect label="Media Type" value={media} onChange={setMedia} onSearch={searchMediaTypes} placeholder="Select media type..." required />
    </div>
  );
}

function PublicationStep({ publicationPlace, setPublicationPlace, publisher, setPublisher, publicationDate, setPublicationDate }: any) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Publication Information</h2>
        <p className="text-gray-600">Describe how and where this instance was published</p>
      </div>
      <AuthoritySelect label="Place of Publication" value={publicationPlace} onChange={setPublicationPlace} onSearch={searchCountries} placeholder="Search countries..." required />
      <AuthoritySelect label="Publisher" value={publisher} onChange={setPublisher}
        onSearch={(q: string) => searchAllAuthorities(q, "organization")} placeholder="Search publishers..." required allowCustom />
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Publication Year <span className="text-red-500">*</span></label>
        <input type="text" value={publicationDate} onChange={(e) => setPublicationDate(e.target.value)} placeholder="YYYY" pattern="\d{4}"
          className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
    </div>
  );
}

function ItemStep({ heldBy, setHeldBy, shelfMark, setShelfMark, barcode, setBarcode }: any) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Item: Holdings (Optional)</h2>
        <p className="text-gray-600">Describe physical holdings and location</p>
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Held By (Institution URI)</label>
        <input type="text" value={heldBy} onChange={(e) => setHeldBy(e.target.value)} placeholder="https://moonlib.org/library/main"
          className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Shelf Mark / Call Number</label>
        <input type="text" value={shelfMark} onChange={(e) => setShelfMark(e.target.value)} placeholder="QA76.9.D3 S46 2026"
          className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Barcode</label>
        <input type="text" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="31234567890123"
          className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
    </div>
  );
}
