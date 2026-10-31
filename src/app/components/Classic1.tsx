import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useJCricket } from '../contexts/JCricketContext';
import { useTheme } from '../contexts/ThemeContext';
import { BIBFRAMEWork, BIBFRAMEInstance, BIBFRAMERecord } from '../types/bibframe';
import { WorkForm } from './EnhancedWorkForm';
import { InstanceForm } from './InstanceForm';
import { PreviewPane } from './PreviewPane';
import { ImportRecordDialog } from './ImportRecordDialog';
import { AdvancedToolbar } from './AdvancedToolbar';
import { OpacViewerDialog } from './OpacViewerDialog';
import { ResourceType } from './TypeSelector';
import MindMapView from './MindMapView';
import { FileImportDialog } from './FileImportDialog';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './ui/resizable';
import { 
  BookOpen, 
  FileText, 
  RotateCcw, 
  LogOut, 
  Languages, 
  Search, 
  Save, 
  Eye, 
  EyeOff, 
  Library, 
  Monitor, 
  Filter, 
  Edit, 
  Settings, 
  History, 
  Users, 
  Network, 
  ChevronLeft 
} from 'lucide-react';
import { Button } from './ui/button';
import { saveRecord } from '../utils/recordStorageBackend';
import { toast } from 'sonner';
import { exampleWork, exampleInstance } from '../utils/exampleData';
import { toBibframeJsonLdString } from '../../services/bibframeNormalizer';

interface Classic1Props {
  onBack: () => void;
  initialRecord?: BIBFRAMERecord | null;
}

export function Classic1({ onBack, initialRecord }: Classic1Props) {
  const { t, i18n } = useTranslation();
  const { logout, username } = useAuth();
  const { currentProvenance } = useJCricket();
  const { darkMode, setDarkMode } = useTheme();
  
  const [resourceType, setResourceType] = useState<ResourceType | null>(null);
  const [showWork, setShowWork] = useState(true);
  const [showInstance, setShowInstance] = useState(true);
  const [showPreview, setShowPreview] = useState(true);
  const [showMindMap, setShowMindMap] = useState(false);
  const [showFileImport, setShowFileImport] = useState(false);
  const [showOpacViewer, setShowOpacViewer] = useState(false);
  
  // Generate initial IDs
  const initialWorkId = `http://example.org/work/${Date.now()}`;
  
  const [work, setWork] = useState<Partial<BIBFRAMEWork>>(() => {
    if (initialRecord?.work) {
      return initialRecord.work;
    }
    return {
      '@type': 'bf:Work',
      '@id': initialWorkId,
    };
  });

  const [instance, setInstance] = useState<Partial<BIBFRAMEInstance>>(() => {
    if (initialRecord?.instance) {
      return initialRecord.instance;
    }
    return {
      '@type': 'bf:Instance',
      '@id': `http://example.org/instance/${Date.now()}`,
      'bf:instanceOf': {
        '@id': initialWorkId,
      },
    };
  });

  // Current record for editors
  const [currentRecord, setCurrentRecord] = useState<BIBFRAMERecord | null>(initialRecord || null);

  // Keep instance linked to work
  useEffect(() => {
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
  useEffect(() => {
    if (work && instance) {
      setCurrentRecord({
        '@context': 'http://bibfra.me/vocab/lite/',
        '@type': 'Work',
        work: work as BIBFRAMEWork,
        instance: instance as BIBFRAMEInstance,
        metadata: {
          createdDate: new Date().toISOString(),
          resourceType: 'Classic 1.0',
          catalogingInterface: 'Classic 1.0',
        }
      });
    }
  }, [work, instance]);

  const handleLoadExample = () => {
    setWork({
      ...exampleWork,
      '@id': `http://example.org/work/${Date.now()}`,
    });
    setInstance({
      ...exampleInstance,
      '@id': `http://example.org/instance/${Date.now()}`,
    });
    toast.success(t('loadExample') + ' - Loaded successfully!');
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
    toast.info(t('reset') + ' - New record created');
  };

  const handleSave = async () => {
    try {
      // Create BIBFRAMERecord with Classic 1.0 label
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
          resourceType: 'Classic 1.0',
          catalogingInterface: 'Classic 1.0',
        }
      };
      
      // Use the saveRecord utility function
      const savedRecord = await saveRecord(record, username || 'Anonymous');
      setCurrentRecord(record);
      
      console.log('✅ Classic 1.0 Record saved successfully:', savedRecord);

      toast.success('Classic 1.0: Record saved to database! / حُفظت التسجيلة', {
        description: savedRecord.title
      });

    } catch (err) {
      console.error('Save error:', err);
      toast.error('Save failed / فشل الحفظ');
    }
  };

  const handleFileImport = (record: BIBFRAMERecord) => {
    console.log('Importing record:', record);
    
    if (!record.work || !record.instance) {
      toast.error('Invalid record structure. Missing Work or Instance.');
      return;
    }
    
    setWork(record.work);
    setInstance(record.instance);
    setCurrentRecord(record);
    
    const title = record.work['bf:title']?.['bf:mainTitle'] || 
                  record.instance['bf:title']?.['bf:mainTitle'] ||
                  'Imported Record';
    
    toast.success(`Classic 1.0: File imported! ${title}`);
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
      metadata: {
        resourceType: 'Classic 1.0',
        catalogingInterface: 'Classic 1.0',
      }
    };
    
    const blob = new Blob([toBibframeJsonLdString(record)], { type: 'application/ld+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `classic-1.0-record-${Date.now()}.jsonld`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Classic 1.0: Exported as JSON-LD');
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
    console.log('Loading record from search:', importedData);
    
    let workData, instanceData;
    
    if (importedData['@graph']) {
      const workNode = importedData['@graph'].find((n: any) => {
        const type = n['@type'];
        if (Array.isArray(type)) {
          return type.some((t: string) => t.includes('Work'));
        }
        return type === 'bf:Work' || type?.includes('Work');
      });
      
      const instanceNode = importedData['@graph'].find((n: any) => {
        const type = n['@type'];
        if (Array.isArray(type)) {
          return type.some((t: string) => t.includes('Instance'));
        }
        return type === 'bf:Instance' || type?.includes('Instance');
      });
      
      workData = workNode || {
        '@type': 'bf:Work',
        '@id': `http://example.org/work/${Date.now()}`,
      };
      instanceData = instanceNode || {
        '@type': 'bf:Instance',
        '@id': `http://example.org/instance/${Date.now()}`,
      };
    } else {
      workData = importedData.work || {
        '@type': 'bf:Work',
        '@id': `http://example.org/work/${Date.now()}`,
      };
      instanceData = importedData.instance || {
        '@type': 'bf:Instance',
        '@id': `http://example.org/instance/${Date.now()}`,
      };
    }
    
    if (!workData['@id']) {
      workData['@id'] = `http://example.org/work/${Date.now()}`;
    }
    if (!instanceData['@id']) {
      instanceData['@id'] = `http://example.org/instance/${Date.now()}`;
    }
    
    setWork(workData);
    setInstance(instanceData);
    setCurrentRecord(importedData);
    
    const getMainTitle = (node: any) => {
      if (!node) return '';
      if (Array.isArray(node)) {
        return node[0]?.['bf:mainTitle'] || '';
      }
      return node['bf:mainTitle'] || '';
    };
    
    const workTitle = getMainTitle(workData['bf:title']);
    const instanceTitle = getMainTitle(instanceData['bf:title']);
    const title = workTitle || instanceTitle || 'Loaded Record';
    
    toast.success(`Classic 1.0: Record imported! ${title}`);
  };

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
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
    metadata: {
      resourceType: 'Classic 1.0',
      catalogingInterface: 'Classic 1.0',
    }
  };

  return (
    <div className={`h-screen w-screen flex flex-col ${darkMode ? 'dark bg-gray-900' : 'bg-gray-100'}`}>
      {/* Toolbar */}
      <header className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 shadow-sm">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={onBack} className="gap-2">
                <ChevronLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                <span className="text-blue-600 dark:text-blue-400 font-bold">Classic 1.0</span> - Traditional Three-Pane Layout
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <Button
                  variant={showWork ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowWork(!showWork)}
                  title="Toggle Work Pane"
                >
                  {showWork ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
                  Work
                </Button>
                <Button
                  variant={showInstance ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowInstance(!showInstance)}
                  title="Toggle Instance Pane"
                >
                  {showInstance ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
                  Instance
                </Button>
                <Button
                  variant={showPreview ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowPreview(!showPreview)}
                  title="Toggle Preview Pane"
                >
                  {showPreview ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
                  Preview
                </Button>
              </div>
            </div>
          </div>
            
          {/* Toolbar Row 1: Navigation & Views */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Button variant="outline" size="sm" onClick={() => toast.info('Authority Files - Coming soon in this view')}>
              <Users className="h-4 w-4 mr-2" />
              Authority Files / AFIQA
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowMindMap(true)}>
              <Network className="h-4 w-4 mr-2" />
              Mind Map / خريطة ذهنية
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.info('JCricket - Use Dashboard menu')}>
              <Users className="h-4 w-4 mr-2" />
              JCricket
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.info('Local Search - Coming soon')}>
              <Search className="h-4 w-4 mr-2" />
              {t('search')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.info('Advanced Search - Coming soon')}>
              <Filter className="h-4 w-4 mr-2" />
              Advanced Search
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.info('LOC Search - Use Dashboard menu')}>
              <Library className="h-4 w-4 mr-2" />
              LOC Search
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.info('Bulk Edit - Coming soon')}>
              <Edit className="h-4 w-4 mr-2" />
              Bulk Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowOpacViewer(true)}>
              <Monitor className="h-4 w-4 mr-2" />
              OPAC
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.info('Activity Log - Use Dashboard menu')}>
              <History className="h-4 w-4 mr-2" />
              {t('activityLog')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.info('Settings - Use Dashboard menu')}>
              <Settings className="h-4 w-4 mr-2" />
              {t('settings')}
            </Button>
          </div>

          {/* Toolbar Row 2: Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <ImportRecordDialog onImport={handleLoadRecord} />
            <Button variant="outline" size="sm" onClick={() => setShowFileImport(true)}>
              <FileText className="h-4 w-4 mr-2" />
              Import File
            </Button>
            <AdvancedToolbar
              onExportJSON={handleExportJSON}
              onExportRDF={handleExportRDF}
              onExportXML={handleExportXML}
              onOpenOpacViewer={handleOpenOpacViewer}
            />
            <Button variant="outline" size="sm" onClick={handleLoadExample}>
              <FileText className="h-4 w-4 mr-2" />
              {t('loadExample')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.info('Opening LOC Search for Arabic records...')}>
              <Library className="h-4 w-4 mr-2" />
              LOC Arabic Search / بحث عربي
            </Button>
            <Button variant="outline" size="sm" onClick={handleSave} className="relative bg-blue-50 dark:bg-blue-900/20">
              <Save className="h-4 w-4 mr-2" />
              {t('save')} (Classic 1.0)
              {currentProvenance && (
                <span className="ml-2 px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                  {currentProvenance.institutionCode}
                </span>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              {t('reset')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleLanguageChange(i18n.language === 'en' ? 'ar' : 'en')}
            >
              <Languages className="h-4 w-4 mr-2" />
              {i18n.language === 'en' ? 'العربية' : 'English'}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content - Three Panes */}
      <div className="flex-1 overflow-hidden">
        {!showWork && !showInstance && !showPreview ? (
          <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <BookOpen className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">All panes are hidden</p>
              <p className="text-sm mt-2">Toggle pane visibility using the buttons above</p>
            </div>
          </div>
        ) : (
          <ResizablePanelGroup direction="horizontal" className="h-full">
            {/* Left Pane - Work */}
            {showWork && (
              <>
                <ResizablePanel 
                  id="work-panel" 
                  order={1} 
                  defaultSize={
                    showInstance && showPreview ? 30 : 
                    showInstance || showPreview ? 50 : 
                    100
                  } 
                  minSize={20} 
                  maxSize={showInstance || showPreview ? 70 : 100}
                >
                  <div className="h-full bg-white dark:bg-gray-800 border-r dark:border-gray-700">
                    <WorkForm work={work} onChange={setWork} />
                  </div>
                </ResizablePanel>
                {(showInstance || showPreview) && <ResizableHandle withHandle />}
              </>
            )}

            {/* Middle Pane - Instance */}
            {showInstance && (
              <>
                <ResizablePanel 
                  id="instance-panel" 
                  order={2} 
                  defaultSize={
                    showWork && showPreview ? 30 : 
                    showWork || showPreview ? 50 : 
                    100
                  } 
                  minSize={20} 
                  maxSize={showWork || showPreview ? 70 : 100}
                >
                  <div className="h-full bg-white dark:bg-gray-800 border-r dark:border-gray-700">
                    <InstanceForm instance={instance} onChange={setInstance} />
                  </div>
                </ResizablePanel>
                {showPreview && <ResizableHandle withHandle />}
              </>
            )}

            {/* Right Pane - Preview */}
            {showPreview && (
              <ResizablePanel 
                id="preview-panel" 
                order={3} 
                defaultSize={
                  showWork && showInstance ? 40 : 
                  showWork || showInstance ? 50 : 
                  100
                } 
                minSize={25}
                maxSize={showWork || showInstance ? 70 : 100}
              >
                <div className="h-full">
                  <PreviewPane record={record} />
                </div>
              </ResizablePanel>
            )}
          </ResizablePanelGroup>
        )}
      </div>

      {/* Mind Map View Modal */}
      {showMindMap && (
        <MindMapView 
          record={record} 
          onClose={() => setShowMindMap(false)}
        />
      )}

      {/* File Import Dialog */}
      <FileImportDialog
        open={showFileImport}
        onClose={() => setShowFileImport(false)}
        onImport={handleFileImport}
      />

      {/* OPAC Viewer Dialog */}
      <OpacViewerDialog
        isOpen={showOpacViewer}
        onClose={() => setShowOpacViewer(false)}
        recordData={record}
      />

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-800 border-t dark:border-gray-700 px-6 py-3">
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            <span className="font-bold text-blue-600 dark:text-blue-400">Classic 1.0</span>
            <span>• Traditional Three-Pane Layout</span>
          </div>
          <div>
            <span className="font-medium">{t('bibframeVersion')}</span> | {t('linkedData')}
          </div>
          <div className="text-xs">
            <a 
              href="https://id.loc.gov/ontologies/bibframe.html" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              BIBFRAME Ontology Reference
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}