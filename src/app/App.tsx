import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { JCricketProvider, useJCricket } from './contexts/JCricketContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { useThemeSafe } from './hooks/useThemeSafe';
import { BIBFRAMEWork, BIBFRAMEInstance, BIBFRAMERecord } from './types/bibframe';
import { LoginPage } from './components/LoginPage';
import { TypeSelector, ResourceType } from './components/TypeSelector';
import { Dashboard } from './components/Dashboard';
import { TopNavBar } from './components/TopNavBar';
import { BookOpen, Database, FileText, RotateCcw, LogOut, Languages, Search, Save, Eye, EyeOff, Moon, Sun, Library, Monitor, Filter, Edit, Settings, History, LayoutDashboard, Users, Network, ChevronLeft } from 'lucide-react';
import { Button } from './components/ui/button';
import { exampleWork, exampleInstance } from './utils/exampleData';
import { arabicExampleRecord, arabicExampleRecord2, arabicExampleRecord3, arabicExampleRecord4 } from './utils/arabicExamples';
import { realLocExamples } from './utils/realLocExamples';
import { saveRecord } from './utils/recordStorageBackend';
import { toast } from 'sonner';
import { Toaster } from './components/ui/sonner';
import { ErrorBoundary } from './components/ErrorBoundary';
import './i18n/config';

// ── Lazy-loaded view-specific components ──
// Converting heavy eager imports to lazy to reduce the initial module graph
// and prevent "Failed to fetch dynamically imported module" errors.
const SearchPage = React.lazy(() => import('./components/SearchPage').then(m => ({ default: m.SearchPage })));
const BibframeSearchPage = React.lazy(() => import('./components/BibframeSearchPage').then(m => ({ default: m.BibframeSearchPage })));
const OPACView = React.lazy(() => import('./components/OPACView').then(m => ({ default: m.OPACView })));
const AdvancedSearch = React.lazy(() => import('./components/AdvancedSearch').then(m => ({ default: m.AdvancedSearch })));
const BulkEdit = React.lazy(() => import('./components/BulkEdit').then(m => ({ default: m.BulkEdit })));
const SettingsPanel = React.lazy(() => import('./components/SettingsPanel').then(m => ({ default: m.SettingsPanel })));
const ActivityLog = React.lazy(() => import('./components/ActivityLog').then(m => ({ default: m.ActivityLog })));
const JCricketDashboard = React.lazy(() => import('./components/JCricketDashboard').then(m => ({ default: m.JCricketDashboard })));
const ReviewWorkflow = React.lazy(() => import('./components/ReviewWorkflow').then(m => ({ default: m.ReviewWorkflow })));
const EntityEventLog = React.lazy(() => import('./components/EntityEventLog').then(m => ({ default: m.EntityEventLog })));
const LanguagePreferences = React.lazy(() => import('./components/LanguagePreferences').then(m => ({ default: m.LanguagePreferences })));
const BibframeOntologyBrowser = React.lazy(() => import('./components/BibframeOntologyBrowserWrapper'));
const AuthorityFileManager = React.lazy(() => import('./components/AuthorityFileManager'));
const OntologyDrivenCatalogForm = React.lazy(() => import('./components/OntologyDrivenCatalogForm').then(m => ({ default: m.OntologyDrivenCatalogForm })));
const BibframeFieldExamples = React.lazy(() => import('./components/BibframeFieldExamples').then(m => ({ default: m.BibframeFieldExamples })));
const TemplateManager = React.lazy(() => import('./components/TemplateManager').then(m => ({ default: m.TemplateManager })));
const ResourceTemplateEditor = React.lazy(() => import('./components/ResourceTemplateEditor').then(m => ({ default: m.ResourceTemplateEditor })));
const SinopiaResources = React.lazy(() => import('./components/SinopiaResources').then(m => ({ default: m.SinopiaResources })));
const ActionsMenu = React.lazy(() => import('./components/ActionsMenu').then(m => ({ default: m.ActionsMenu })));
const FOLIOModuleBrowser = React.lazy(() => import('./components/FOLIOModuleBrowser').then(m => ({ default: m.FOLIOModuleBrowser })));
const FOLIOIntegration = React.lazy(() => import('./components/FOLIOIntegration').then(m => ({ default: m.FOLIOIntegration })));
const VuFindIntegration = React.lazy(() => import('./components/VuFindIntegration').then(m => ({ default: m.VuFindIntegration })));
const MoonEngineThemed = React.lazy(() => import('./components/MoonEngineThemed').then(m => ({ default: m.MoonEngineThemed })));
const MoonEngineGlass = React.lazy(() => import('./components/MoonEngineGlass').then(m => ({ default: m.MoonEngineGlass })));
const Classic1 = React.lazy(() => import('./components/Classic1').then(m => ({ default: m.Classic1 })));
const ThemeShowcase = React.lazy(() => import('./components/ThemeShowcase').then(m => ({ default: m.ThemeShowcase })));
const UpgradeStatus = React.lazy(() => import('./components/UpgradeStatus').then(m => ({ default: m.UpgradeStatus })));
const AuthorityManager = React.lazy(() => import('./components/AuthorityManager').then(m => ({ default: m.AuthorityManager })));
const SparqlInterface = React.lazy(() => import('./components/SparqlInterface').then(m => ({ default: m.SparqlInterface })));
const EnterpriseStatus = React.lazy(() => import('./components/EnterpriseStatus').then(m => ({ default: m.EnterpriseStatus })));
const RecordsGallery = React.lazy(() => import('./components/RecordsGallery').then(m => ({ default: m.RecordsGallery })));
const FileImportDialog = React.lazy(() => import('./components/FileImportDialog').then(m => ({ default: m.FileImportDialog })));
const OpacViewerDialog = React.lazy(() => import('./components/OpacViewerDialog').then(m => ({ default: m.OpacViewerDialog })));
const MoonEngine = React.lazy(() => import('./components/MoonEngine'));
const MoonOPAC = React.lazy(() => import('./components/MoonOPAC'));
import BlueMoon from './components/BlueMoon';
import WolfMoon from './components/WolfMoon';
import WolfMoonStandaloneOpac from './components/WolfMoonStandaloneOpac';
import { WolfMoonQuantum } from './components/WolfMoonQuantum';
import { Moon27Dashboard } from './components/Moon27Dashboard';
import Moon27Studio from './components/Moon27Studio';
import AuthorFinder from './components/AuthorFinder';
import { toBibframeJsonLdString } from '../services/bibframeNormalizer';
const MoonFaleh = React.lazy(() => import('./components/MoonFaleh'));
const MoonOshin = React.lazy(() => import('./components/MoonOshin'));
const MoonOshinEnterprise = React.lazy(() => import('./components/MoonOshinEnterprise'));
const MoonOshinPro = React.lazy(() => import('./components/MoonOshinPro'));
const MoonSand = React.lazy(() => import('./components/MoonSand'));
const MoonSandV2 = React.lazy(() => import('./components/MoonSandV2'));
const MoonSandV2Persistent = React.lazy(() => import('./components/MoonSandV2Persistent'));
const RecordsDashboard = React.lazy(() => import('./components/RecordsDashboard'));
const MoonWave101 = React.lazy(() => import('./components/MoonWave101'));
const MoonWaveDiagnostic = React.lazy(() => import('./components/MoonWaveDiagnostic'));
const MoonDijla = React.lazy(() => import('./components/MoonDijla'));
const DijlaPlatform = React.lazy(() => import('./components/DijlaPlatform'));
const MoonK = React.lazy(() => import('./components/MoonK'));
const MoonBibframeTemplate = React.lazy(() => import('./components/MoonBibframeTemplate'));
const MoonTesting = React.lazy(() => import('./components/MoonTesting'));
const SunMoon = React.lazy(() => import('./components/SunMoon'));
const LinkedDataDiscoveryStandalone = React.lazy(() => import('./components/LinkedDataDiscovery'));
const Bibframe2Marc = React.lazy(() => import('./components/Bibframe2Marc'));
const Marc2Bibframe = React.lazy(() => import('./components/Marc2Bibframe'));
const EnterpriseAIEngine = React.lazy(() => import('./components/EnterpriseAIEngine'));
const MoonAI = React.lazy(() => import('./components/MoonAI'));
const LD4Platform = React.lazy(() => import('./components/LD4Platform'));
const MoonNexus = React.lazy(() => import('./components/MoonNexus'));
const MoonAIOrchestrator = React.lazy(() => import('./components/MoonAIOrchestrator'));
const MoonDijlaCore = React.lazy(() => import('./components/MoonDijlaCore'));

type ViewMode = 'dashboard' | 'type-selector' | 'catalog' | 'search' | 'bibframe-search' | 'opac' | 'advanced-search' | 'bulk-edit' | 'settings' | 'activity-log' | 'jcricket-dashboard' | 'review-workflow' | 'entity-event-log' | 'language-preferences' | 'ontology-browser' | 'authority-manager' | 'mind-map' | 'all-records' | 'ontology-driven-catalog' | 'api-examples' | 'template-manager' | 'template-editor' | 'resources' | 'actions-menu' | 'folio-browser' | 'folio-integration' | 'vufind-integration' | 'moon-engine' | 'classic-1' | 'theme-showcase' | 'moon-linked-data-engine' | 'moon-opac' | 'upgrade-status' | 'moon-authority-manager' | 'sparql-interface' | 'enterprise-status' | 'moon-oshin' | 'moon-sand' | 'moon-sand-v2' | 'moon-sand-persistent' | 'records-dashboard' | 'moon-wave-101' | 'moon-wave-diagnostic' | 'moon-faleh' | 'moon-dijla' | 'moon-k' | 'moon-bibframe-template' | 'moon-testing' | 'sun-moon' | 'blue-moon' | 'wolf-moon' | 'wolf-moon-opac' | 'moon-27' | 'moon-27-dashboard' | 'moon-27-studio' | 'linked-data-discovery' | 'bibframe2marc' | 'marc2bibframe' | 'enterprise-ai' | 'moon-ai' | 'dijla-platform' | 'ld4-platform' | 'moon-nexus' | 'moon-ai-orchestrator' | 'moon-dijla-core' | 'author-finder';

function CatalogApp() {
  const { t, i18n } = useTranslation();
  const { logout, username } = useAuth();
  const { currentProvenance, userProfile } = useJCricket();
  const { darkMode, setDarkMode, themeStyle } = useTheme();
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const v = params.get('view');
      if (v) return v as ViewMode;
    }
    return 'dashboard';
  });
  const [previousViewMode, setPreviousViewMode] = useState<ViewMode | null>(null);
  const [resourceType, setResourceType] = useState<ResourceType | null>(null);
  const [showWork, setShowWork] = useState(true);
  const [showInstance, setShowInstance] = useState(true);
  const [showPreview, setShowPreview] = useState(true);
  const [showMindMap, setShowMindMap] = useState(false);
  const [showFileImport, setShowFileImport] = useState(false);
  const [showOpacViewer, setShowOpacViewer] = useState(false);
  const [arabicExamplesLoaded, setArabicExamplesLoaded] = useState(false);
  
  // Fresh, clean BIBFRAME record with no pre-entered data
  const [work, setWork] = useState<Partial<BIBFRAMEWork>>(() => ({
    '@type': 'bf:Work',
    '@id': `http://example.org/work/${Date.now()}`,
  }));

  const [instance, setInstance] = useState<Partial<BIBFRAMEInstance>>(() => ({
    '@type': 'bf:Instance',
    '@id': `http://example.org/instance/${Date.now()}`,
  }));

  // Current record starts null (fresh draft)
  const [currentRecord, setCurrentRecord] = useState<BIBFRAMERecord | null>(null);

  // Dark mode is now handled by ThemeContext

  // Apply language direction and persistence
  useEffect(() => {
    const savedLanguage = localStorage.getItem('moon-language');
    if (savedLanguage && (savedLanguage === 'ar' || savedLanguage === 'en')) {
      i18n.changeLanguage(savedLanguage);
      document.documentElement.dir = savedLanguage === 'ar' ? 'rtl' : 'ltr';
      document.documentElement.lang = savedLanguage;
    }

    // Listen for language changes and persist them
    const handleLanguageChange = (lng: string) => {
      localStorage.setItem('moon-language', lng);
      document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
      document.documentElement.lang = lng;
    };

    i18n.on('languageChanged', handleLanguageChange);
    
    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, [i18n]);

  // Keep instance linked to work
  React.useEffect(() => {
    if (work && work['@id']) {
      setInstance((prev) => ({
        ...prev,
        'bf:instanceOf': {
          '@id': work['@id'],
        },
      }));
    }
  }, [work]);

  // Sync currentRecord when work or instance changes
  React.useEffect(() => {
    if (work && instance) {
      setCurrentRecord({
        '@context': 'http://bibfra.me/vocab/lite/',
        '@type': 'Work',
        work: work as BIBFRAMEWork,
        instance: instance as BIBFRAMEInstance,
        metadata: {
          createdDate: new Date().toISOString(),
          resourceType: resourceType || undefined,
        }
      });
    }
  }, [work, instance, resourceType]);

  const handleTypeSelect = (type: ResourceType) => {
    setResourceType(type);
    setViewMode('catalog');
    toast.success('Moon Engine designed and developed by isaac faleh');
  };

  const handleLoadExample = () => {
    setWork({
      ...exampleWork,
      '@id': `http://example.org/work/${Date.now()}`,
    });
    setInstance({
      ...exampleInstance,
      '@id': `http://example.org/instance/${Date.now()}`,
    });
    toast.success(t('loadExample') + ' - ' + 'Loaded successfully!');
  };

  const handleLoadArabicExample = async () => {
    try {
      const qabasat = realLocExamples.find(e => e.id === 'al-qabasat-mir-damad') || realLocExamples[0];
      if (qabasat) {
        setWork(qabasat.data.work);
        setInstance(qabasat.data.instance);
        setCurrentRecord({
          '@context': {
            bf: 'http://id.loc.gov/ontologies/bibframe/',
            bflc: 'http://id.loc.gov/ontologies/bflc/',
            rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
            rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
          },
          work: qabasat.data.work,
          instance: qabasat.data.instance,
          metadata: {
            catalogingLanguage: 'ara',
            descriptionConventions: 'rda',
            catalogingInterface: 'Wolf Moon',
            resourceType: 'Manuscript / مخطوط'
          }
        });
        setResourceType('Manuscript / مخطوط');
        setViewMode('wolf-moon');
        toast.success('Loaded Al-Qabasat (القبسات) into Wolf Moon Studio!');
      } else {
        setViewMode('wolf-moon');
      }
    } catch (error) {
      console.error('Error loading Arabic example:', error);
      toast.error('Failed to load Arabic example');
    }
  };

  const handleReset = () => {
    const newWorkId = `http://example.org/work/${Date.now()}`;
    setWork({
      '@type': 'bf:Work',
      '@id': newWorkId,
    });
    setInstance({
      '@type': 'bf:Instance',
      '@id': `http://example.org/instance/${Date.now()}`,
      'bf:instanceOf': {
        '@id': newWorkId,
      },
    });
    toast.info(t('reset') + ' - ' + 'New record created');
  };

  const handleSave = async () => {
    try {
      // Create BIBFRAMERecord in the expected format
      const record: BIBFRAMERecord = {
        '@context': {
          bf: 'http://id.loc.gov/ontologies/bibframe/',
          rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
          rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        },
        work: work as BIBFRAMEWork,
        instance: instance as BIBFRAMEInstance,
        metadata: {
          catalogingLanguage: 'en',
          descriptionConventions: 'rda',
          resourceType: 'Moon Engine designed and developed by isaac faleh',
        }
      };
      
      // Use the saveRecord utility function
      const savedRecord = await saveRecord(record, username || 'Anonymous');
      setCurrentRecord(record);
      
      console.log('Record saved successfully:', savedRecord);

      toast.success('Record saved to database permanently! / تم حفظ التسجيلة بشكل دائم', {
        description: savedRecord.title
      });

    } catch (err) {
      console.error('Save error:', err);
      toast.error('Save failed / فشل الحفظ');
    }
  };

  const handleLoadRecordFromGallery = (savedRecord: any) => {
    console.log('Loading record from gallery:', savedRecord);
    
    try {
      // CRITICAL FIX: Properly extract Work and Instance from savedRecord
      // The record should already be in work/instance format from recordStorageBackend
      if (!savedRecord.record) {
        throw new Error('No record data found');
      }

      const record = savedRecord.record;
      
      // Check if already in work/instance format (normalized by backend)
      if (record.work && record.instance) {
        // Already normalized - use directly
        setWork(record.work);
        setInstance(record.instance);
      } else if (record['@graph']) {
        // Fallback: extract from @graph if not normalized
        const graph = record['@graph'];
        
        const work = graph.find((n: any) => {
          const type = n['@type'];
          if (Array.isArray(type)) {
            return type.some((t: string) => t?.includes?.('Work'));
          }
          return type?.includes?.('Work');
        });

        const instance = graph.find((n: any) => {
          const type = n['@type'];
          if (Array.isArray(type)) {
            return type.some((t: string) => t?.includes?.('Instance'));
          }
          return type?.includes?.('Instance');
        });

        if (!work || !instance) {
          throw new Error('Invalid BIBFRAME graph: missing Work or Instance');
        }

        setWork(work);
        setInstance(instance);
      } else {
        throw new Error('Invalid record structure: no work/instance or @graph found');
      }
      
      setResourceType(savedRecord.resourceType || 'Moon Engine');
      setCurrentRecord(record);
      
      // Always route loaded records into Wolf Moon Studio for editing
      setViewMode('wolf-moon');
      toast.success(`Loaded into Wolf Moon Studio: ${savedRecord.title}`);
      console.log('Record loaded successfully into Wolf Moon editor');
    } catch (error) {
      console.error('Failed to load record:', error);
      toast.error(`Failed to load record: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleFileImport = (record: BIBFRAMERecord) => {
    console.log('Importing record:', record);
    
    // Ensure proper structure
    if (!record.work || !record.instance) {
      toast.error('Invalid record structure. Missing Work or Instance.');
      return;
    }
    
    // Set the work and instance
    setWork(record.work);
    setInstance(record.instance);
    setCurrentRecord(record);
    
    // Set resource type from metadata or default
    const importedType = record.metadata?.resourceType || 'Wolf Moon';
    setResourceType(importedType);
    
    setPreviousViewMode(null);
    
    // Extract title for success message
    const title = record.work['bf:title']?.['bf:mainTitle'] || 
                  record.instance['bf:title']?.['bf:mainTitle'] ||
                  'Imported Record';
    
    // Route to Wolf Moon editor
    setViewMode('wolf-moon');
    toast.success(`File imported successfully! Loaded into Wolf Moon: ${title}`);
    console.log('Record imported and loaded into Wolf Moon editor');
  };

  const handleExportJSON = () => {
    const record: BIBFRAMERecord = {
      '@context': {
        bf: 'http://id.loc.gov/ontologies/bibframe/',
        rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
        rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      },
      work: work as BIBFRAMEWork,
      instance: instance as BIBFRAMEInstance,
    };
    
    const blob = new Blob([toBibframeJsonLdString(record)], { type: 'application/ld+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bibframe-record-${Date.now()}.jsonld`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported as JSON-LD');
  };

  const handleExportRDF = () => {
    toast.info('RDF/XML export coming soon');
  };

  const handleExportXML = () => {
    toast.info('MARCXML export coming soon');
  };

  const handleOpenOpacViewer = () => {
    setShowOpacViewer(true);
  };

  const handleLoadRecord = (importedData: any) => {
    console.log('Loading record into Wolf Moon:', importedData);
    let raw = importedData;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (e) {}
    }
    const data = raw?.record?.data || raw?.record || raw?.data || raw;
    
    // Normalize structure - handle work/instance or @graph format
    let workData: any = data?.work || data?.data?.work;
    let instanceData: any = data?.instance || data?.data?.instance;
    const graph = data?.['@graph'] || raw?.['@graph'] || raw?.record?.['@graph'];
    
    if ((!workData || !instanceData) && Array.isArray(graph)) {
      // Convert graph back to work/instance
      const workNode = graph.find((n: any) => {
        const type = n['@type'];
        if (Array.isArray(type)) {
          return type.some((t: string) => t?.includes('Work'));
        }
        return type === 'bf:Work' || type?.includes('Work');
      });
      
      const instanceNode = graph.find((n: any) => {
        const type = n['@type'];
        if (Array.isArray(type)) {
          return type.some((t: string) => t?.includes('Instance'));
        }
        return type === 'bf:Instance' || type?.includes('Instance');
      });
      
      if (workNode) workData = workNode;
      if (instanceNode) instanceData = instanceNode;
    }
    
    workData = workData || {
      '@type': 'bf:Work',
      '@id': `http://example.org/work/${Date.now()}`,
    };
    instanceData = instanceData || {
      '@type': 'bf:Instance',
      '@id': `http://example.org/instance/${Date.now()}`,
    };
    
    // Ensure @id exists on both
    if (!workData['@id']) {
      workData['@id'] = `http://example.org/work/${Date.now()}`;
    }
    if (!instanceData['@id']) {
      instanceData['@id'] = `http://example.org/instance/${Date.now()}`;
    }
    
    setWork(workData);
    setInstance(instanceData);
    setCurrentRecord(importedData);
    
    // Set resource type if available
    if (data.metadata?.resourceType || importedData?.resourceType) {
      setResourceType(data.metadata?.resourceType || importedData?.resourceType);
    }
    
    setPreviousViewMode(null);
    
    // Extract title for success message using helper function
    const getMainTitle = (node: any) => {
      if (!node) return '';
      if (typeof node === 'string') return node;
      if (Array.isArray(node)) {
        return getMainTitle(node[0]);
      }
      return node['bf:mainTitle'] || node.mainTitle || node['rdfs:label'] || node.label || (typeof node === 'object' && node['@value'] ? node['@value'] : '');
    };
    
    const workTitle = getMainTitle(workData['bf:title']) || getMainTitle(workData['mainTitle']) || getMainTitle(workData['title']);
    const instanceTitle = getMainTitle(instanceData['bf:title']) || getMainTitle(instanceData['mainTitle']) || getMainTitle(instanceData['title']);
    const title = workTitle || instanceTitle || raw?.name || raw?.title || 'Loaded Record';
    
    // Route directly into Wolf Moon Studio for viewing and editing
    setViewMode('wolf-moon');
    toast.success(`Loaded into Wolf Moon Studio! ${title}`);
    console.log('Record loaded into Wolf Moon editor for cataloging:', title);
  };

  const handleNewRecord = () => {
    const newWorkId = `http://example.org/work/${Date.now()}`;
    const newInstanceId = `http://example.org/instance/${Date.now()}`;
    setWork({
      '@type': 'bf:Work',
      '@id': newWorkId,
    });
    setInstance({
      '@type': 'bf:Instance',
      '@id': newInstanceId,
      'bf:instanceOf': {
        '@id': newWorkId,
      },
    });
    setCurrentRecord(null);
    setViewMode('wolf-moon');
  };

  const handleSaveRecord = async (record: BIBFRAMERecord) => {
    try {
      await saveRecord(record, username || undefined);
      setCurrentRecord(record);
      toast.success('Record saved successfully! / تم حفظ التسجيلة بنجاح');
      console.log('Record saved:', record);
    } catch (error) {
      console.error('Error saving record:', error);
      toast.error('Failed to save record');
    }
  };

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  };
  
  // Helper to navigate to tool views while saving current view
  const navigateToTool = (toolView: ViewMode) => {
    if (viewMode === 'catalog') {
      setPreviousViewMode('catalog');
    }
    setViewMode(toolView);
  };
  
  // Helper to go back to cataloging
  const backToCatalog = () => {
    if (previousViewMode === 'catalog' || resourceType !== null) {
      setViewMode('catalog');
      setPreviousViewMode(null);
    } else {
      setViewMode('dashboard');
    }
  };

  // Build complete BIBFRAME record
  const record: BIBFRAMERecord = {
    '@context': {
      bf: 'http://id.loc.gov/ontologies/bibframe/',
      rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
      rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    },
    work: work as BIBFRAMEWork,
    instance: instance as BIBFRAMEInstance,
  };

  // Type Selector View
  if (viewMode === 'type-selector') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <TopNavBar
          onDashboard={() => setViewMode('dashboard')}
          onNewRecord={handleNewRecord}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
        />
        <TypeSelector 
          onTypeSelect={handleTypeSelect} 
          onCancel={() => setViewMode('dashboard')} 
        />
      </div>
    );
  }

  // BIBFRAME Search View
  if (viewMode === 'bibframe-search') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <TopNavBar
          onDashboard={() => setViewMode('dashboard')}
          onNewRecord={handleNewRecord}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
        />
        <BibframeSearchPage 
          onLoadRecord={handleLoadRecord} 
          onNewRecord={handleNewRecord}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
        />
      </div>
    );
  }

  // All Records Gallery View
  if (viewMode === 'all-records') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <TopNavBar
          onDashboard={() => setViewMode('dashboard')}
          onNewRecord={handleNewRecord}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
        />
        <RecordsGallery 
          onLoadRecord={handleLoadRecordFromGallery}
          onEditRecord={handleLoadRecordFromGallery}
        />
      </div>
    );
  }

  // Local Search View
  if (viewMode === 'search') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <TopNavBar
          onDashboard={() => setViewMode('dashboard')}
          onNewRecord={handleNewRecord}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
        />
        <SearchPage onLoadRecord={handleLoadRecord} onNewRecord={handleNewRecord} />
      </div>
    );
  }

  // OPAC View - Consolidated to WOF MOON Standalone OPAC
  if (viewMode === 'opac') {
    return (
      <ErrorBoundary fallbackTitle="WOF MOON OPAC Error" onReset={() => setViewMode('dashboard')}>
        <WolfMoonStandaloneOpac
          onOpenEditor={() => {
            setViewMode('wolf-moon');
          }}
        />
      </ErrorBoundary>
    );
  }

  // Advanced Search View
  if (viewMode === 'advanced-search') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <TopNavBar
          onDashboard={() => setViewMode('dashboard')}
          onNewRecord={handleNewRecord}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
        />
        <AdvancedSearch
          onSearch={(criteria) => {
            console.log('Search criteria:', criteria);
            toast.success('Search executed');
            setViewMode('catalog');
          }}
          onClose={() => setViewMode('catalog')}
        />
      </div>
    );
  }

  // Bulk Edit View
  if (viewMode === 'bulk-edit') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <TopNavBar
          onDashboard={() => setViewMode('dashboard')}
          onNewRecord={handleNewRecord}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
        />
        <BulkEdit onClose={() => setViewMode('catalog')} />
      </div>
    );
  }

  // Settings View
  if (viewMode === 'settings') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <TopNavBar
          onDashboard={() => setViewMode('dashboard')}
          onNewRecord={handleNewRecord}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
        />
        <SettingsPanel onClose={() => setViewMode('dashboard')} />
      </div>
    );
  }

  // Activity Log View
  if (viewMode === 'activity-log') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <TopNavBar
          onDashboard={() => setViewMode('dashboard')}
          onNewRecord={handleNewRecord}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
        />
        <ActivityLog onClose={() => setViewMode('dashboard')} />
      </div>
    );
  }

  // JCricket Dashboard View
  if (viewMode === 'jcricket-dashboard') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <TopNavBar
          onDashboard={() => setViewMode('dashboard')}
          onNewRecord={handleNewRecord}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
        />
        <div className="p-4 bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-800">
          <Button variant="outline" onClick={backToCatalog} className="gap-2">
            <ChevronLeft className="h-4 w-4" />
            {previousViewMode === 'catalog' ? 'Back to Record / العودة للتسجيلة' : 'Back to Dashboard'}
          </Button>
        </div>
        <JCricketDashboard onNavigate={(view) => setViewMode(view as ViewMode)} />
      </div>
    );
  }

  // Review Workflow View
  if (viewMode === 'review-workflow') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <TopNavBar
          onDashboard={() => setViewMode('dashboard')}
          onNewRecord={handleNewRecord}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
        />
        <ReviewWorkflow onClose={() => setViewMode('jcricket-dashboard')} />
      </div>
    );
  }

  // Entity Event Log View
  if (viewMode === 'entity-event-log') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <TopNavBar
          onDashboard={() => setViewMode('dashboard')}
          onNewRecord={handleNewRecord}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
        />
        <EntityEventLog onClose={() => setViewMode('jcricket-dashboard')} />
      </div>
    );
  }

  // Language Preferences View
  if (viewMode === 'language-preferences') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <TopNavBar
          onDashboard={() => setViewMode('dashboard')}
          onNewRecord={handleNewRecord}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
        />
        <LanguagePreferences onClose={() => setViewMode('jcricket-dashboard')} />
      </div>
    );
  }

  // BIBFRAME 3.0.1 Ontology Browser View
  if (viewMode === 'ontology-browser') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <TopNavBar
          onDashboard={() => setViewMode('dashboard')}
          onNewRecord={handleNewRecord}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
        />
        <div className="p-4 bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-800">
          <Button variant="outline" onClick={backToCatalog} className="gap-2">
            <ChevronLeft className="h-4 w-4" />
            {previousViewMode === 'catalog' ? 'Back to Record / العودة للتسجيلة' : 'Back to Dashboard'}
          </Button>
        </div>
        <BibframeOntologyBrowser />
      </div>
    );
  }

  // Authority File Manager View
  if (viewMode === 'authority-manager') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <TopNavBar
          onDashboard={() => setViewMode('dashboard')}
          onNewRecord={handleNewRecord}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
        />
        <div className="p-4 bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-800">
          <Button variant="outline" onClick={backToCatalog} className="gap-2">
            <ChevronLeft className="h-4 w-4" />
            {previousViewMode === 'catalog' ? 'Back to Record / العودة للتسجيلة' : 'Back to Dashboard'}
          </Button>
        </div>
        <AuthorityFileManager 
          onSelect={(record) => {
            toast.success(`Selected: ${record.personalName}`);
            // Could add the selected authority to the current record
          }}
        />
      </div>
    );
  }





  // Moon Engine - Ontology-Driven BIBFRAME Template
  if (viewMode === 'moon-engine') {
    console.log('✅ Rendering Moon Engine view');
    return (
      <div className={darkMode ? 'dark' : ''}>
        <React.Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="text-lg">Loading Moon Engine...</div></div>}>
          <MoonEngineThemed onBack={() => setViewMode('dashboard')} />
        </React.Suspense>
      </div>
    );
  }

  // 🌕 MOON Linked Data Engine - Complete BIBFRAME Editor
  if (viewMode === 'moon-linked-data-engine') {
    return (
      <div>
        <div className="fixed top-4 left-4 z-50">
          <button
            onClick={() => setViewMode('dashboard')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center gap-2 transition-all shadow-lg"
          >
            <ChevronLeft className="h-5 w-5" />
            Back to Dashboard
          </button>
        </div>
        <React.Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="text-white text-xl">Loading MOON Engine...</div></div>}>
          <MoonEngine />
        </React.Suspense>
      </div>
    );
  }

  // 🌙 MOON OSHIN - Professional Cataloging Interface
  if (viewMode === 'moon-oshin') {
    return (
      <div>
        <div className="fixed top-4 left-4 z-50">
          <button
            onClick={() => setViewMode('dashboard')}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold flex items-center gap-2 transition-all shadow-lg"
          >
            <ChevronLeft className="h-5 w-5" />
            Back to Dashboard
          </button>
        </div>
        <React.Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="text-white text-xl">Loading MOON Oshin...</div></div>}>
          <MoonOshinPro />
        </React.Suspense>
      </div>
    );
  }

  // 🏖️ MOON SAND - Complete Cataloging Sandbox
  if (viewMode === 'moon-sand') {
    return (
      <div>
        <div className="fixed top-4 left-4 z-50">
          <button
            onClick={() => setViewMode('dashboard')}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold flex items-center gap-2 transition-all shadow-lg"
          >
            <ChevronLeft className="h-5 w-5" />
            Back to Dashboard
          </button>
        </div>
        <React.Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="text-white text-xl">Loading MOON Sand...</div></div>}>
          <MoonSand />
        </React.Suspense>
      </div>
    );
  }

  // 🌙 MOON FALEH - Ultimate BIBFRAME Cataloging System
  if (viewMode === 'moon-faleh') {
    return (
      <React.Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="text-purple-600 text-xl">Loading Moon Faleh...</div></div>}>
        <MoonFaleh onBack={() => setViewMode('dashboard')} />
      </React.Suspense>
    );
  }

  // 🌊 MOON DIJLA - Ultimate Unified BIBFRAME Engine
  if (viewMode === 'moon-dijla') {
    return (
      <React.Suspense fallback={<div className="flex items-center justify-center h-screen bg-gradient-to-br from-indigo-900 to-purple-900"><div className="text-cyan-400 text-xl">Loading Moon Dijla...</div></div>}>
        <MoonDijla
          onBack={() => setViewMode('dashboard')}
          initialWork={work}
          initialInstance={instance}
          onRecordSaved={() => {
            toast.success('Record saved! View it in All Records.');
          }}
        />
      </React.Suspense>
    );
  }

  // MOON NEXUS - Unified Working Cataloging Workstation
  if (viewMode === 'moon-nexus') {
    return (
      <React.Suspense fallback={<div className="flex items-center justify-center h-screen" style={{background:"linear-gradient(145deg,#faf7f2,#f0ebe0,#e8e0d4)"}}><div className="text-amber-700 text-xl font-semibold">Loading MOON NEXUS...</div></div>}>
        <MoonNexus onBack={() => setViewMode('dashboard')} />
      </React.Suspense>
    );
  }

  // MOON AI ORCHESTRATOR - Multi-AI Agent System
  if (viewMode === 'moon-ai-orchestrator') {
    return (
      <React.Suspense fallback={<div className="flex items-center justify-center h-screen" style={{background:"linear-gradient(145deg,#faf7f2,#f0ebe0,#e8e0d4)"}}><div className="text-amber-700 text-xl font-semibold">Loading AI Orchestrator...</div></div>}>
        <MoonAIOrchestrator onBack={() => setViewMode('dashboard')} />
      </React.Suspense>
    );
  }

  // MOON DIJLA CORE - Enterprise BIBFRAME Linked Data Infrastructure
  if (viewMode === 'moon-dijla-core') {
    return (
      <React.Suspense fallback={<div className="flex items-center justify-center h-screen" style={{background:"linear-gradient(145deg,#faf7f2,#f0ebe0,#e8e0d4)"}}><div className="text-amber-700 text-xl font-semibold">Loading MOON DIJLA CORE...</div></div>}>
        <MoonDijlaCore onBack={() => setViewMode('dashboard')} />
      </React.Suspense>
    );
  }

  // MOON LD4 Platform - Linked Data for Production Integration
  if (viewMode === 'ld4-platform') {
    return (
      <React.Suspense fallback={<div className="flex items-center justify-center h-screen" style={{background:"linear-gradient(145deg,#faf7f2,#f0ebe0,#e8e0d4)"}}><div className="text-amber-700 text-xl font-semibold">Loading MOON LD4 Platform...</div></div>}>
        <LD4Platform onBack={() => setViewMode('dashboard')} />
      </React.Suspense>
    );
  }

  // MOON DIJLA Platform - Enterprise Multi-AI Command Center
  if (viewMode === 'dijla-platform') {
    return (
      <React.Suspense fallback={<div className="flex items-center justify-center h-screen" style={{background:"linear-gradient(145deg,#faf7f2,#f0ebe0,#e8e0d4)"}}><div className="text-amber-700 text-xl font-semibold">Loading MOON DIJLA Platform...</div></div>}>
        <DijlaPlatform
          onBack={() => setViewMode('dashboard')}
          onOpenCatalogEngine={() => setViewMode('moon-dijla')}
        />
      </React.Suspense>
    );
  }

  // 🌊 MOON K - Ultimate Unified BIBFRAME Engine
  if (viewMode === 'moon-k') {
    return (
      <React.Suspense fallback={<div className="flex items-center justify-center h-screen bg-gradient-to-br from-indigo-900 to-purple-900"><div className="text-cyan-400 text-xl">Loading Moon K...</div></div>}>
        <MoonK
          onBack={() => setViewMode('dashboard')}
          initialWork={work}
          initialInstance={instance}
          onRecordSaved={() => {
            toast.success('Record saved! View it in All Records.');
          }}
        />
      </React.Suspense>
    );
  }

  // 📋 MOON BIBFRAME TEMPLATE - Production-Grade Ontology-Driven Template Processor
  if (viewMode === 'moon-bibframe-template') {
    return (
      <React.Suspense fallback={<div className="flex items-center justify-center h-screen bg-gradient-to-br from-indigo-900 to-purple-900"><div className="text-cyan-400 text-xl">Loading Moon BIBFRAME Template...</div></div>}>
        <MoonBibframeTemplate
          onBack={() => setViewMode('dashboard')}
          initialWork={work}
          initialInstance={instance}
          onRecordSaved={() => {
            toast.success('Record saved! View it in All Records.');
          }}
        />
      </React.Suspense>
    );
  }

  // 🧪 MOON TESTING - RDF/JSON-LD Validation & Triple Store Testing
  if (viewMode === 'moon-testing') {
    return (
      <React.Suspense fallback={<div className="flex items-center justify-center h-screen bg-gradient-to-br from-indigo-900 to-purple-900"><div className="text-cyan-400 text-xl">Loading Moon Testing...</div></div>}>
        <MoonTesting onBack={() => setViewMode('dashboard')} />
      </React.Suspense>
    );
  }

  // ☀️ SUN MOON - Light Theme BIBFRAME Template
  if (viewMode === 'sun-moon') {
    return (
      <React.Suspense fallback={<div className="flex items-center justify-center h-screen bg-gray-100"><div className="text-gray-700 text-xl">Loading Sun Moon...</div></div>}>
        <SunMoon
          onBack={() => setViewMode('dashboard')}
          initialWork={work}
          initialInstance={instance}
          onRecordSaved={() => {
            toast.success('Record saved! View it in All Records.');
          }}
        />
      </React.Suspense>
    );
  }

  // 🔧 MOON WAVE DIAGNOSTIC - Backend Connectivity Test
  if (viewMode === 'moon-wave-diagnostic') {
    return (
      <div>
        <div className="fixed top-4 left-4 z-50">
          <button
            onClick={() => setViewMode('dashboard')}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg font-semibold flex items-center gap-2 transition-all shadow-lg"
          >
            <ChevronLeft className="h-5 w-5" />
            Back to Dashboard
          </button>
        </div>
        <React.Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="text-blue-600 text-xl">Loading Diagnostic...</div></div>}>
          <MoonWaveDiagnostic />
        </React.Suspense>
      </div>
    );
  }

  // 🌊 MOON WAVE 101 - Production Features Demonstration
  if (viewMode === 'moon-wave-101') {
    return (
      <div>
        <div className="fixed top-4 left-4 z-50">
          <button
            onClick={() => setViewMode('dashboard')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold flex items-center gap-2 transition-all shadow-lg"
          >
            <ChevronLeft className="h-5 w-5" />
            Back to Dashboard
          </button>
        </div>
        <React.Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="text-purple-600 text-xl">Loading Moon Wave 101...</div></div>}>
          <MoonWave101 />
        </React.Suspense>
      </div>
    );
  }

  // 🧠 MOON SAND V2 - Ontology-Driven Semantic Engine
  if (viewMode === 'moon-sand-v2') {
    return (
      <div>
        <div className="fixed top-4 left-4 z-50">
          <button
            onClick={() => setViewMode('dashboard')}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold flex items-center gap-2 transition-all shadow-lg"
          >
            <ChevronLeft className="h-5 w-5" />
            Back to Dashboard
          </button>
        </div>
        <React.Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="text-white text-xl">Loading MOON Sand V2...</div></div>}>
          <MoonSandV2 />
        </React.Suspense>
      </div>
    );
  }

  // 💾 MOON SAND V2 PERSISTENT - With Backend Persistence
  if (viewMode === 'moon-sand-persistent') {
    return (
      <div>
        <div className="fixed top-4 left-4 z-50">
          <button
            onClick={() => setViewMode('dashboard')}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold flex items-center gap-2 transition-all shadow-lg"
          >
            <ChevronLeft className="h-5 w-5" />
            Back to Dashboard
          </button>
        </div>
        <React.Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="text-white text-xl">Loading MOON Sand Persistent...</div></div>}>
          <MoonSandV2Persistent />
        </React.Suspense>
      </div>
    );
  }

  // 📚 RECORDS DASHBOARD - Browse and Manage Records
  if (viewMode === 'records-dashboard') {
    return (
      <div>
        <div className="fixed top-4 left-4 z-50">
          <button
            onClick={() => setViewMode('dashboard')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center gap-2 transition-all shadow-lg"
          >
            <ChevronLeft className="h-5 w-5" />
            Back to Dashboard
          </button>
        </div>
        <React.Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="text-white text-xl">Loading Records Dashboard...</div></div>}>
          <RecordsDashboard 
            onEdit={(id) => {
              // TODO: Navigate to editor with record ID
              setViewMode('moon-sand-persistent');
            }}
            onCreateNew={() => setViewMode('moon-sand-persistent')}
          />
        </React.Suspense>
      </div>
    );
  }

  // 🚀 Upgrade Status - Show What's Been Upgraded
  if (viewMode === 'upgrade-status') {
    return (
      <div>
        <div className="fixed top-4 left-4 z-50">
          <button
            onClick={() => setViewMode('dashboard')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold flex items-center gap-2 transition-all shadow-lg"
          >
            <ChevronLeft className="h-5 w-5" />
            Back to Dashboard
          </button>
        </div>
        <UpgradeStatus />
      </div>
    );
  }

  // 🎯 Authority Manager
  if (viewMode === 'moon-authority-manager') {
    return (
      <div>
        <div className="fixed top-4 left-4 z-50">
          <button
            onClick={() => setViewMode('dashboard')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold flex items-center gap-2 transition-all shadow-lg"
          >
            <ChevronLeft className="h-5 w-5" />
            Back to Dashboard
          </button>
        </div>
        <AuthorityManager />
      </div>
    );
  }

  // 🔍 SPARQL Interface
  if (viewMode === 'sparql-interface') {
    return (
      <div>
        <div className="fixed top-4 left-4 z-50">
          <button
            onClick={() => setViewMode('dashboard')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold flex items-center gap-2 transition-all shadow-lg"
          >
            <ChevronLeft className="h-5 w-5" />
            Back to Dashboard
          </button>
        </div>
        <SparqlInterface />
      </div>
    );
  }

  // 🏛️ Enterprise Status
  if (viewMode === 'enterprise-status') {
    return (
      <div>
        <div className="fixed top-4 left-4 z-50">
          <button
            onClick={() => setViewMode('dashboard')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold flex items-center gap-2 transition-all shadow-lg"
          >
            <ChevronLeft className="h-5 w-5" />
            Back to Dashboard
          </button>
        </div>
        <EnterpriseStatus />
      </div>
    );
  }

  // MOON OPAC - Consolidated to WOF MOON Standalone OPAC
  if (viewMode === 'moon-opac') {
    return (
      <ErrorBoundary fallbackTitle="WOF MOON OPAC Error" onReset={() => setViewMode('dashboard')}>
        <WolfMoonStandaloneOpac
          onOpenEditor={() => {
            setViewMode('wolf-moon');
          }}
        />
      </ErrorBoundary>
    );
  }

  // 🔗 LINKED DATA DISCOVERY - Standalone Federated Discovery
  if (viewMode === 'linked-data-discovery') {
    return (
      <div>
        <div className="fixed top-4 left-4 z-50">
          <button
            onClick={() => setViewMode('dashboard')}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-semibold flex items-center gap-2 transition-all shadow-lg"
          >
            <ChevronLeft className="h-5 w-5" />
            Back to Dashboard
          </button>
        </div>
        <React.Suspense fallback={<div className="flex items-center justify-center h-screen" style={{ background: '#0a0a1a' }}><div className="text-cyan-400 text-xl font-bold">Loading Linked Data Discovery...</div></div>}>
          <LinkedDataDiscoveryStandalone
            onBack={() => setViewMode('dashboard')}
          />
        </React.Suspense>
      </div>
    );
  }

  // 🔄 BIBFRAME2MARC - LC BIBFRAME to MARC 21 Converter
  if (viewMode === 'bibframe2marc') {
    return (
      <React.Suspense fallback={<div className="flex items-center justify-center h-screen" style={{ background: '#0a0a1a' }}><div className="text-amber-400 text-xl font-bold">Loading bibframe2marc...</div></div>}>
        <Bibframe2Marc onBack={() => setViewMode('dashboard')} />
      </React.Suspense>
    );
  }

  // 🔄 MARC2BIBFRAME - MARC 21 to LC BIBFRAME Converter
  if (viewMode === 'marc2bibframe') {
    return (
      <React.Suspense fallback={<div className="flex items-center justify-center h-screen" style={{ background: '#0a0a1a' }}><div className="text-cyan-400 text-xl font-bold">Loading marc2bibframe2...</div></div>}>
        <Marc2Bibframe onBack={() => setViewMode('dashboard')} />
      </React.Suspense>
    );
  }

  // ENTERPRISE AI ENGINE - BIBFRAME AI Layer (Level 3)
  if (viewMode === 'enterprise-ai') {
    return (
      <React.Suspense fallback={<div className="flex items-center justify-center h-screen" style={{ background: '#0f172a' }}><div className="text-blue-400 text-xl font-bold">Loading Enterprise AI Engine...</div></div>}>
        <EnterpriseAIEngine onBack={() => setViewMode('dashboard')} />
      </React.Suspense>
    );
  }

  // MOON AI - AI-Assisted BIBFRAME Cataloging System
  if (viewMode === 'moon-ai') {
    return (
      <React.Suspense fallback={<div className="flex items-center justify-center h-screen" style={{ background: '#0f172a' }}><div className="text-blue-400 text-xl font-bold">Loading MOON AI...</div></div>}>
        <MoonAI onBack={() => setViewMode('dashboard')} />
      </React.Suspense>
    );
  }

  // 🔵 BLUE MOON - Premium BIBFRAME Linked Data Editor
  if (viewMode === 'blue-moon') {
    return (
      <ErrorBoundary fallbackTitle="Blue Moon Editor Error" onReset={() => setViewMode('dashboard')}>
        <BlueMoon
          onBack={() => setViewMode('dashboard')}
          initialWork={work}
          initialInstance={instance}
          onRecordSaved={() => toast.success('Record saved! View it in All Records.')}
        />
      </ErrorBoundary>
    );
  }

  // 🐺 WOLF MOON - Apple Liquid Glass & Glossy Glass BIBFRAME Studio
  if (viewMode === 'wolf-moon') {
    return (
      <ErrorBoundary fallbackTitle="Wolf Moon Studio Error" onReset={() => setViewMode('dashboard')}>
        <WolfMoon
          key={`${work?.['@id'] || 'work'}-${instance?.['@id'] || 'inst'}`}
          onBack={() => setViewMode('dashboard')}
          initialWork={work}
          initialInstance={instance}
          onRecordSaved={() => toast.success('Record saved! View it in All Records.')}
        />
      </ErrorBoundary>
    );
  }

  // 🐺 WOF MOON LINKED OPAC - Separated Standalone Public Discovery Portal (Share-VDE & Libris)
  if (viewMode === 'wolf-moon-opac') {
    return (
      <ErrorBoundary fallbackTitle="WOF MOON OPAC Error" onReset={() => setViewMode('dashboard')}>
        <WolfMoonStandaloneOpac
          onOpenEditor={() => setViewMode('wolf-moon')}
        />
      </ErrorBoundary>
    );
  }

  // 🌙 MOON 27 DASHBOARD - Next-Gen UI Theme (Dual-Layer Matte Charcoal, Prismatic Buttons, 3D Holo 27)
  if (viewMode === 'moon-27' || viewMode === 'moon-27-dashboard') {
    return (
      <ErrorBoundary fallbackTitle="Moon 27 Dashboard Error" onReset={() => setViewMode('dashboard')}>
        <Moon27Dashboard
          onNavigate={(mode) => setViewMode(mode as ViewMode)}
          onLoadRecord={handleLoadRecord}
        />
      </ErrorBoundary>
    );
  }

  // 🌙 MOON 27 STUDIO - Next-Gen Ontology Linked Data Editor
  if (viewMode === 'moon-27-studio') {
    return (
      <ErrorBoundary fallbackTitle="Moon 27 Studio Error" onReset={() => setViewMode('dashboard')}>
        <Moon27Studio
          onBack={() => setViewMode('moon-27')}
          initialWork={work}
          initialInstance={instance}
          onRecordSaved={() => toast.success('Record saved in Moon 27!')}
        />
      </ErrorBoundary>
    );
  }

  // 🔍 AI AUTHOR FINDER - Gemini Deep Search & Iraqi Authority Detector
  if (viewMode === 'author-finder') {
    return (
      <ErrorBoundary fallbackTitle="Author Finder Error" onReset={() => setViewMode('dashboard')}>
        <AuthorFinder
          onBack={() => setViewMode('dashboard')}
          onNavigate={(mode) => setViewMode(mode as ViewMode)}
        />
      </ErrorBoundary>
    );
  }

  // ⚛️ WOLF MOON QUANTUM 3D - WebGL Three.js & Multi-Provider Iraqi Author AI
  if (viewMode === 'wolf-moon-quantum') {
    return (
      <ErrorBoundary fallbackTitle="Wolf Moon Quantum 3D Error" onReset={() => setViewMode('dashboard')}>
        <WolfMoonQuantum
          onBack={() => setViewMode('dashboard')}
          initialWork={work}
          initialInstance={instance}
        />
      </ErrorBoundary>
    );
  }

  // Classic 1.0 - Traditional Three-Pane Layout
  if (viewMode === 'classic-1') {
    console.log('✅ Rendering Classic 1.0 view');
    return (
      <div className={darkMode ? 'dark' : ''}>
        <Classic1 
          onBack={() => setViewMode('dashboard')} 
          initialRecord={currentRecord}
        />
      </div>
    );
  }

  // FOLIO Live Integration
  if (viewMode === 'folio-integration') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <div className="min-h-screen bg-background">
          <TopNavBar
            onDashboard={() => setViewMode('dashboard')}
            onNewRecord={handleNewRecord}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode(!darkMode)}
          />
          <FOLIOIntegration 
            onBack={() => setViewMode('dashboard')}
            currentRecord={currentRecord}
            onRecordImport={(record) => {
              setCurrentRecord(record);
              setViewMode('catalog');
            }}
          />
        </div>
      </div>
    );
  }

  // VuFind Live Integration
  if (viewMode === 'vufind-integration') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <div className="min-h-screen bg-background">
          <TopNavBar
            onDashboard={() => setViewMode('dashboard')}
            onNewRecord={handleNewRecord}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode(!darkMode)}
          />
          <VuFindIntegration
            onBack={() => setViewMode('dashboard')}
            currentRecord={currentRecord}
            onRecordImport={(record) => {
              setCurrentRecord(record);
              setViewMode('wolf-moon');
            }}
          />
        </div>
      </div>
    );
  }

  // FOLIO Module Browser
  if (viewMode === 'folio-browser') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <div className="min-h-screen bg-background">
          <TopNavBar
            onDashboard={() => setViewMode('dashboard')}
            onNewRecord={handleNewRecord}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode(!darkMode)}
          />
          <FOLIOModuleBrowser 
            onBack={() => setViewMode('dashboard')}
          />
        </div>
      </div>
    );
  }

  // Actions Menu
  if (viewMode === 'actions-menu') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <div className="min-h-screen bg-background">
          <TopNavBar
            onDashboard={() => setViewMode('dashboard')}
            onNewRecord={handleNewRecord}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode(!darkMode)}
          />
          <ActionsMenu 
            record={currentRecord}
            onBack={() => setViewMode('dashboard')}
          />
        </div>
      </div>
    );
  }

  // Resources & Help
  if (viewMode === 'resources') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <div className="min-h-screen bg-background">
          <TopNavBar
            onDashboard={() => setViewMode('dashboard')}
            onNewRecord={handleNewRecord}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode(!darkMode)}
          />
          <SinopiaResources 
            onBack={() => setViewMode('dashboard')}
          />
        </div>
      </div>
    );
  }

  // Template Manager
  if (viewMode === 'template-manager') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <div className="min-h-screen bg-background">
          <TopNavBar
            onDashboard={() => setViewMode('dashboard')}
            onNewRecord={handleNewRecord}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode(!darkMode)}
          />
          <TemplateManager 
            onCreateNew={() => setViewMode('template-editor')}
            onEdit={() => setViewMode('template-editor')}
            onBack={() => setViewMode('dashboard')}
          />
        </div>
      </div>
    );
  }

  // Template Editor
  if (viewMode === 'template-editor') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <div className="min-h-screen bg-background">
          <TopNavBar
            onDashboard={() => setViewMode('dashboard')}
            onNewRecord={handleNewRecord}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode(!darkMode)}
          />
          <ResourceTemplateEditor 
            onSave={() => {
              setViewMode('template-manager');
            }}
            onCancel={() => setViewMode('template-manager')}
          />
        </div>
      </div>
    );
  }



  // Enhanced Bilingual Monograph View (Working APIs)


  // Ontology-Driven Catalog View (New Core Cataloging)
  if (viewMode === 'ontology-driven-catalog') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <div className="min-h-screen bg-background">
          <TopNavBar
            onDashboard={() => setViewMode('dashboard')}
            onNewRecord={handleNewRecord}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode(!darkMode)}
          />
          <OntologyDrivenCatalogForm />
        </div>
      </div>
    );
  }

  // API Examples View
  if (viewMode === 'api-examples') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <div className="min-h-screen bg-background">
          <TopNavBar
            onDashboard={() => setViewMode('dashboard')}
            onNewRecord={handleNewRecord}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode(!darkMode)}
          />
          <BibframeFieldExamples />
        </div>
      </div>
    );
  }

  // Theme Showcase View
  if (viewMode === 'theme-showcase') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <div className="min-h-screen bg-background">
          <TopNavBar
            onDashboard={() => setViewMode('dashboard')}
            onNewRecord={handleNewRecord}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode(!darkMode)}
          />
          <div className="p-4 bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-800">
            <Button variant="outline" onClick={() => setViewMode('dashboard')} className="gap-2">
              <ChevronLeft className="h-4 w-4" />
              Back to Dashboard / العودة للوحة التحكم
            </Button>
          </div>
          <ThemeShowcase />
        </div>
      </div>
    );
  }

  // Dashboard View
  if (viewMode === 'dashboard') {
    return (
      <div className={`${darkMode ? 'dark' : ''} liquid-glass-spatial-canvas min-h-screen py-2`}>
        <TopNavBar
          onDashboard={() => setViewMode('dashboard')}
          onNewRecord={handleNewRecord}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
        />
        <Dashboard 
          onNavigate={(view) => {
            console.log('Dashboard navigating to:', view);
            setViewMode(view as ViewMode);
          }} 
          onLoadRecord={handleLoadRecord}
        />
      </div>
    );
  }

  // Classic 1.0 View - Traditional Three-Pane Layout
  if (viewMode === 'classic-1') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <Classic1 
          onBack={() => setViewMode('dashboard')} 
          initialRecord={currentRecord}
        />
      </div>
    );
  }

  // Main Cataloging View - Moon Engine Glass (Default)
  console.log('📝 Rendering Moon Engine Glass cataloging view, viewMode:', viewMode);
  return (
    <div className={darkMode ? 'dark' : ''}>
      <MoonEngineGlass 
        onBack={() => setViewMode('dashboard')}
        initialWork={work}
        initialInstance={instance}
        onRecordSaved={() => {
          // Refresh data or navigate
          toast.success('Record saved! View it in All Records.');
        }}
      />
    </div>
  );
}

function AppContent({ 
  onLanguageChange, 
  currentLanguage
}: { 
  onLanguageChange: (lang: string) => void; 
  currentLanguage: string;
}) {
  const { isAuthenticated } = useAuth();
  const { darkMode, setDarkMode } = useThemeSafe();
  const isDirectView = typeof window !== 'undefined' && Boolean(new URLSearchParams(window.location.search).get('view'));

  if (!isAuthenticated && !isDirectView) {
    return (
      <LoginPage 
        onLanguageChange={onLanguageChange} 
        currentLanguage={currentLanguage}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
      />
    );
  }

  return (
    <React.Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-lg text-slate-600 font-medium">Loading MOON...</p>
        </div>
      </div>
    }>
      <CatalogApp />
    </React.Suspense>
  );
}

export default function App() {
  const [language, setLanguage] = useState(() => {
    try {
      const saved = localStorage.getItem('moon-language');
      return saved === 'en' ? 'en' : 'ar';
    } catch {
      return 'ar';
    }
  });

  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    try {
      localStorage.setItem('moon-language', language);
    } catch {}
  }, [language]);

  return (
    <ThemeProvider>
      <AuthProvider>
        <JCricketProvider>
          <AppContent 
            onLanguageChange={setLanguage} 
            currentLanguage={language}
          />
          <Toaster />
        </JCricketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}