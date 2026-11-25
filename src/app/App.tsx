import React, { useState, useEffect } from 'react';
import { practiceCopy } from './utils/editorModes';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { JCricketProvider } from './contexts/JCricketContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { useThemeSafe } from './hooks/useThemeSafe';
import { BIBFRAMEWork, BIBFRAMEInstance, BIBFRAMERecord } from './types/bibframe';
import { LoginPage } from './components/LoginPage';
import { TopNavBar } from './components/TopNavBar';
import { SECTIONS, SectionPage, SectionPath, runTask, sectionById, type SectionId, type Task } from './components/StudioSections';
import { toast } from 'sonner';
import { CirculationDesk, ExternalLoanSystem } from './components/CirculationDesk';
import { AcquisitionsDesk } from './components/AcquisitionsDesk';
import { ListsPage } from './components/ListsPage';
import { Toaster } from './components/ui/sonner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BASE_URI } from '../services/uriMintingService';
import { getRecordById, getAllRecords } from './utils/recordStorageBackend';
import { usePresenceHeartbeat } from './utils/usePresenceHeartbeat';
import { materialStart, materialMetadata, type Material, type CarrierKind } from './utils/materialTypes';
import './i18n/config';

// Every screen loads on demand, so the login page doesn't download the editor.
const Dashboard = React.lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const WolfMoon = React.lazy(() => import('./components/WolfMoon'));
const AuthorFinder = React.lazy(() => import('./components/AuthorFinder'));
const RecordsGallery = React.lazy(() => import('./components/RecordsGallery').then(m => ({ default: m.RecordsGallery })));
const SearchPage = React.lazy(() => import('./components/SearchPage').then(m => ({ default: m.SearchPage })));
const ActivityLog = React.lazy(() => import('./components/ActivityLog').then(m => ({ default: m.ActivityLog })));
const OpacVisitsCard = React.lazy(() => import('./components/OpacVisitsCard').then(m => ({ default: m.OpacVisitsCard })));
const OpacInsightsCard = React.lazy(() => import('./components/OpacInsightsCard').then(m => ({ default: m.OpacInsightsCard })));
const NewRecordChooser = React.lazy(() => import('./components/NewRecordChooser').then(m => ({ default: m.NewRecordChooser })));
const EntitiesPage = React.lazy(() => import('./components/EntitiesPage').then(m => ({ default: m.EntitiesPage })));
const ManuscriptsPage = React.lazy(() => import('./components/ManuscriptsPage').then(m => ({ default: m.ManuscriptsPage })));

// Moon Studio (Wolf Moon) is the one editor. The tools around it: dashboard, author finder, record
// list, search and audit log. The public OPAC is served by main.tsx / opac.html.
type ViewMode = 'dashboard' | 'wolf-moon' | 'author-finder' | 'all-records' | 'search' | 'activity-log' | 'entities'
  | SectionId | 'new-record' | 'desk' | 'acq' | 'manuscripts' | 'lists';
const VIEW_MODES: ViewMode[] = ['dashboard', 'wolf-moon', 'author-finder', 'all-records', 'search', 'activity-log', 'entities', 'new-record',
  'acquisitions', 'technical', 'circulation', 'catalogue', 'desk', 'acq', 'manuscripts', 'lists'];

// Each screen has its own address, so a refresh or a shared link opens the same screen:
// /dashboard/, /moon/ (Moon Studio), /records/, /search/, /authors/, /activity/, /entities/.
const VIEW_PATHS: Record<ViewMode, string> = {
  'dashboard': 'dashboard',
  'wolf-moon': 'moon',
  'all-records': 'records',
  'search': 'search',
  'author-finder': 'authors',
  'activity-log': 'activity',
  'entities': 'entities',
  // The four library sections (StudioSections.tsx), each with its own page.
  'acquisitions': 'acquisitions',
  'technical': 'technical',
  'circulation': 'circulation',
  'catalogue': 'catalogue',
  // Technical services > New record: choose the kind of material, then print or electronic.
  'new-record': 'new',
  // Circulation > the loan desk (?tab=patrons|loans|holds|rules).
  'desk': 'desk',
  // Acquisitions (?tab=orders|subscriptions|invoices|vendors|funds).
  'acq': 'acq',
  // The Al-Qamar manuscripts catalogue: the Super Admin and Manuscripts accounts only.
  'manuscripts': 'manuscripts',
  // Lists of books, copies, loans, borrowers, orders and more (?tab=the kind of row).
  'lists': 'lists',
};
export const ROUTED_PATHS = Object.values(VIEW_PATHS);

/** The site's root ("/" on mooon.site): everything before the screen's folder in the current path. */
function siteRoot(): string {
  const parts = window.location.pathname.split('/');
  const i = parts.findIndex((p) => ROUTED_PATHS.includes(p));
  return i >= 0 ? parts.slice(0, i).join('/') + '/' : window.location.pathname.replace(/[^/]*$/, '');
}

function viewFromLocation(): ViewMode {
  if (typeof window === 'undefined') return 'dashboard';
  // Old links (?view=wolf-moon, ...) still work; retired editors (?view=blue-moon, ...) open the dashboard.
  const v = new URLSearchParams(window.location.search).get('view') as ViewMode | null;
  if (v && VIEW_MODES.includes(v)) return v;
  const folder = window.location.pathname.split('/').filter(Boolean).reverse().find((p) => ROUTED_PATHS.includes(p));
  const match = (Object.keys(VIEW_PATHS) as ViewMode[]).find((m) => VIEW_PATHS[m] === folder);
  return match || 'dashboard';
}

function urlFor(view: ViewMode, recordId?: string, tab?: string): string {
  const q = new URLSearchParams();
  if (recordId) q.set('record', recordId);
  if (tab) q.set('tab', tab);
  const qs = q.toString();
  return `${siteRoot()}${VIEW_PATHS[view]}/${qs ? `?${qs}` : ''}`;
}

function getMainTitle(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return getMainTitle(node[0]);
  return node['bf:mainTitle'] || node.mainTitle || node['rdfs:label'] || node.label || node['@value'] || '';
}

const isWorkNode = (n: any) => ([] as any[]).concat(n?.['@type'] || []).some((t) => typeof t === 'string' && t.includes('Work'));
const isInstanceNode = (n: any) => ([] as any[]).concat(n?.['@type'] || []).some((t) => typeof t === 'string' && t.includes('Instance'));

function ScreenLoading() {
  return (
    <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-lg text-slate-600 font-medium">Loading MOON...</p>
      </div>
    </div>
  );
}

function CatalogApp() {
  const { darkMode, setDarkMode } = useTheme();
  const { user, isSuperAdmin } = useAuth();
  const { i18n } = useTranslation();
  const isAr = i18n.language !== 'en';
  // Lets the Super Admin see who is online and when each user was last here.
  usePresenceHeartbeat(user?.username);
  const [viewMode, setViewMode] = useState<ViewMode>(viewFromLocation);

  // Shows a screen and puts its address in the browser (Back/Forward and refresh follow it).
  const navigate = (view: ViewMode, recordId?: string, replace = false, tab?: string) => {
    setViewMode(view);
    const url = urlFor(view, recordId, tab);
    if (url !== window.location.pathname + window.location.search) {
      window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
    }
  };
  useEffect(() => {
    const onPop = () => setViewMode(viewFromLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Fresh, clean BIBFRAME record with no pre-entered data
  const [work, setWork] = useState<Partial<BIBFRAMEWork>>(() => ({
    '@type': 'bf:Work',
    '@id': `${BASE_URI}/work/${Date.now()}`,
  }));
  const [instance, setInstance] = useState<Partial<BIBFRAMEInstance>>(() => ({
    '@type': 'bf:Instance',
    '@id': `${BASE_URI}/instance/${Date.now()}`,
  }));
  // The record open in the editor, with its Item, Expression, AdminMetadata and storage id.
  const [currentRecord, setCurrentRecord] = useState<BIBFRAMERecord | null>(null);
  // Bumped when Wolf Moon restores a draft, so the editor remounts even for the same record.
  const [draftRestores, setDraftRestores] = useState(0);

  // Keep instance linked to work
  useEffect(() => {
    if (work && work['@id']) {
      setInstance((prev) => ({ ...prev, 'bf:instanceOf': { '@id': work['@id'] } } as Partial<BIBFRAMEInstance>));
    }
  }, [work]);

  // Sync currentRecord when work or instance changes
  useEffect(() => {
    if (work && instance) {
      // A record that was just loaded holds this Work plus its Item, Expression, AdminMetadata and
      // storage id; rebuilding it here would throw those away. (Compared by @id: the effect above
      // replaces the Instance object right after a load.)
      setCurrentRecord(prev => prev?.work?.['@id'] && prev.work['@id'] === work['@id']
        ? { ...prev, work: work as BIBFRAMEWork, instance: instance as BIBFRAMEInstance }
        : {
          '@context': 'http://id.loc.gov/ontologies/bibframe/',
          work: work as BIBFRAMEWork,
          instance: instance as BIBFRAMEInstance,
          metadata: { createdAt: new Date().toISOString() },
        });
    }
  }, [work, instance]);

  const openInEditor = (record: any, title: string, replaceUrl = false) => {
    setWork(record.work);
    setInstance(record.instance);
    // Keep the loaded record's Item, Expression, AdminMetadata and storage id for the editor.
    setCurrentRecord({ ...record, work: record.work, instance: record.instance });
    // A saved record's address (/moon/?record=…) reopens it after a refresh.
    navigate('wolf-moon', record.metadata?.storageId, replaceUrl);
    toast.success(`Loaded into Moon Studio: ${title}`);
  };

  // A saved record from the record list (SavedRecord with .record in work/instance form).
  const handleLoadRecordFromGallery = (savedRecord: any, replaceUrl = false) => {
    try {
      const record = savedRecord?.record;
      if (!record) throw new Error('No record data found');
      const withId = (r: any) => ({ ...r, metadata: { ...(r.metadata || {}), storageId: r.metadata?.storageId || savedRecord.id } });
      if (record.work && record.instance) {
        openInEditor(withId(record), savedRecord.title, replaceUrl);
        return;
      }
      const graph = record['@graph'];
      const workNode = Array.isArray(graph) ? graph.find(isWorkNode) : null;
      const instanceNode = Array.isArray(graph) ? graph.find(isInstanceNode) : null;
      if (!workNode || !instanceNode) throw new Error('Invalid BIBFRAME graph: missing Work or Instance');
      openInEditor(withId({ ...record, work: workNode, instance: instanceNode }), savedRecord.title, replaceUrl);
    } catch (error) {
      console.error('Failed to load record:', error);
      toast.error(`Failed to load record: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // A record named in a notification.
  const openRecordById = async (recordId: string) => {
    const saved = await getRecordById(recordId);
    if (saved) handleLoadRecordFromGallery(saved);
    else toast.error('This record no longer exists');
  };

  // A record from the dashboard or search: a BIBFRAMERecord, a SavedRecord, JSON text or a bare @graph.
  const handleLoadRecord = (importedData: any) => {
    let raw = importedData;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch {}
    }
    const data = raw?.record?.data || raw?.record || raw?.data || raw || {};

    let workData: any = data?.work || data?.data?.work;
    let instanceData: any = data?.instance || data?.data?.instance;
    const graph = data?.['@graph'] || raw?.['@graph'] || raw?.record?.['@graph'];
    if ((!workData || !instanceData) && Array.isArray(graph)) {
      workData = workData || graph.find(isWorkNode);
      instanceData = instanceData || graph.find(isInstanceNode);
    }
    workData = workData || { '@type': 'bf:Work' };
    instanceData = instanceData || { '@type': 'bf:Instance' };
    if (!workData['@id']) workData['@id'] = `${BASE_URI}/work/${Date.now()}`;
    if (!instanceData['@id']) instanceData['@id'] = `${BASE_URI}/instance/${Date.now()}`;

    const title =
      getMainTitle(workData['bf:title']) || getMainTitle(workData.mainTitle) || getMainTitle(workData.title) ||
      getMainTitle(instanceData['bf:title']) || getMainTitle(instanceData.mainTitle) || getMainTitle(instanceData.title) ||
      raw?.name || raw?.title || 'Loaded Record';
    openInEditor({ ...(typeof data === 'object' ? data : {}), work: workData, instance: instanceData }, title);
  };

  // A new, empty record; with a material choice, its template and content, media and carrier are filled in.
  const [newChoice, setNewChoice] = useState<{ template?: string; meta: ReturnType<typeof materialMetadata> } | null>(null);
  const handleNewRecord = (material?: Material, carrier: CarrierKind = 'print') => {
    const newWorkId = `${BASE_URI}/work/${Date.now()}`;
    const start = material ? materialStart(material, carrier) : { work: {}, instance: {} };
    setWork({ '@type': 'bf:Work', '@id': newWorkId, ...start.work });
    setInstance({ '@type': 'bf:Instance', '@id': `${BASE_URI}/instance/${Date.now()}`, 'bf:instanceOf': { '@id': newWorkId }, ...start.instance });
    setCurrentRecord(null);
    setNewChoice(material ? { template: material.templateId, meta: materialMetadata(material, carrier) } : null);
    navigate('wolf-moon');
  };
  // The top bar's New record and the Technical services task open the chooser (?marc=1: then the MARC tab).
  const chooseNewRecord = (marc = false) => {
    setViewMode('new-record');
    window.history.pushState(null, '', `${urlFor('new-record')}${marc ? '?marc=1' : ''}`);
  };

  // Practice (S22): /moon/?practice=<id> opens a copy of that published record (=1: one chosen at random);
  // saves stay in this browser.
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get('practice');
    if (viewMode !== 'wolf-moon' || !want) return;
    (async () => {
      let saved = want === '1' ? null : await getRecordById(want);
      if (!saved) {
        const all = await getAllRecords({ published: true }).catch(() => []);
        saved = all.length ? all[Math.floor(Math.random() * all.length)] : null;
      }
      const record = (saved as any)?.record;
      if (!record) { toast.error('No published record to practise on.'); return; }
      const graph = record['@graph'];
      const full = record.work && record.instance ? record : {
        ...record, work: Array.isArray(graph) ? graph.find(isWorkNode) : null, instance: Array.isArray(graph) ? graph.find(isInstanceNode) : null,
      };
      if (!full.work || !full.instance) { toast.error('That record cannot be opened for practice.'); return; }
      const copy = practiceCopy(full, (saved as any).id);
      setWork(copy.work);
      setInstance(copy.instance);
      setCurrentRecord(copy);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Opening /moon/?record=… (a refresh or a shared link) reopens that saved record.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('record');
    if (viewMode !== 'wolf-moon' || !id) return;
    getRecordById(id).then((saved) => {
      if (saved) handleLoadRecordFromGallery(saved, true);
      else toast.error('That record could not be found; starting a new record.');
    });
    // Only on first load: later navigation sets the record itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toDashboard = () => navigate('dashboard');
  const runSectionTask = (task: Task) => runTask(task, {
    view: (v, tab) => {
      navigate(VIEW_MODES.includes(v as ViewMode) ? (v as ViewMode) : 'dashboard', undefined, false, tab);
      // The desk reads its tab from the address; tell an open desk it changed.
      if (v === 'desk' || v === 'acq' || v === 'lists') window.dispatchEvent(new PopStateEvent('popstate'));
    },
    newRecord: () => chooseNewRecord(false),
    marcEditor: () => chooseNewRecord(true),
  });
  const currentSection = (SECTIONS.find((sec) => sec.id === viewMode)?.id
    ?? (['wolf-moon', 'new-record', 'all-records', 'search', 'entities', 'author-finder', 'activity-log'].includes(viewMode) ? 'technical'
      : viewMode === 'desk' ? 'circulation' : viewMode === 'acq' ? 'acquisitions' : undefined)) as SectionId | undefined;

  const withNav = (content: React.ReactNode, className = '') => (
    <div className={`${darkMode ? 'dark' : ''} ${className}`}>
      <TopNavBar
        onDashboard={toDashboard}
        onNewRecord={() => chooseNewRecord(false)}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
        onOpenRecord={openRecordById}
        currentSection={currentSection}
        onOpenSection={(id) => navigate(id)}
        onRunTask={runSectionTask}
      />
      {currentSection && currentSection !== viewMode && (
        <SectionPath isAr={isAr} sectionId={currentSection} taskView={viewMode} onOpenSection={(id) => navigate(id)} />
      )}
      {/* Each screen rises in when opened (styles/motion.css). */}
      <div key={viewMode} className="moon-enter">{content}</div>
    </div>
  );

  let screen: React.ReactNode;
  switch (viewMode) {
    case 'wolf-moon':
      screen = (
        <ErrorBoundary fallbackTitle="Moon Studio Error" onReset={toDashboard}>
          <WolfMoon
            key={`${work?.['@id'] || 'work'}-${instance?.['@id'] || 'inst'}-${draftRestores}`}
            onBack={toDashboard}
            initialWork={work}
            initialInstance={instance}
            initialRecord={currentRecord}
            initialTemplate={newChoice?.template}
            materialChoice={currentRecord ? null : newChoice?.meta}
            onRecordSaved={(storageId) => {
              // From now on a refresh reopens this record instead of an empty one.
              if (storageId) window.history.replaceState(null, '', urlFor('wolf-moon', storageId));
            }}
            onDerive={(derived) => {
              // A new, unsaved record: the editor remounts on it (its key is the new Work URI).
              setWork(derived.work);
              setInstance(derived.instance);
              setCurrentRecord(null);
              window.history.pushState(null, '', urlFor('wolf-moon'));
            }}
            onRestoreDraft={(draft) => {
              setDraftRestores(n => n + 1);
              setWork(draft.work);
              setInstance(draft.instance);
              setCurrentRecord(draft);
            }}
            onReloadRecord={(record) => {
              setDraftRestores(n => n + 1);
              setWork(record.work);
              setInstance(record.instance);
              setCurrentRecord(record);
            }}
          />
        </ErrorBoundary>
      );
      break;
    case 'author-finder':
      screen = (
        <ErrorBoundary fallbackTitle="Author Finder Error" onReset={toDashboard}>
          <AuthorFinder onBack={toDashboard} />
        </ErrorBoundary>
      );
      break;
    case 'all-records':
      screen = withNav(<RecordsGallery onLoadRecord={handleLoadRecordFromGallery} onEditRecord={handleLoadRecordFromGallery} />);
      break;
    case 'search':
      screen = withNav(<SearchPage onLoadRecord={handleLoadRecord} onNewRecord={() => chooseNewRecord(false)} />);
      break;
    case 'activity-log':
      screen = withNav(<ActivityLog onClose={toDashboard} />);
      break;
    case 'entities':
      screen = withNav(
        <ErrorBoundary fallbackTitle="Entities Error" onReset={toDashboard}>
          <EntitiesPage onBack={toDashboard} />
        </ErrorBoundary>,
        'liquid-glass-spatial-canvas min-h-screen'
      );
      break;
    case 'new-record':
      screen = withNav(
        <NewRecordChooser
          isAr={isAr}
          marc={new URLSearchParams(window.location.search).get('marc') === '1'}
          onStart={(material, carrier) => {
            if (new URLSearchParams(window.location.search).get('marc') === '1') {
              try { localStorage.setItem('moon-open-tab', 'marc-editor'); } catch { /* private window */ }
            }
            handleNewRecord(material, carrier);
          }}
        />,
        'liquid-glass-spatial-canvas min-h-screen py-2'
      );
      break;
    case 'desk':
      screen = withNav(
        <ErrorBoundary fallbackTitle="Loan desk" onReset={toDashboard}>
          <CirculationDesk isAr={isAr} onOpenRecord={openRecordById} />
        </ErrorBoundary>,
        'liquid-glass-spatial-canvas min-h-screen py-2'
      );
      break;
    case 'acq':
      screen = withNav(
        <ErrorBoundary fallbackTitle="Acquisitions" onReset={toDashboard}>
          <AcquisitionsDesk isAr={isAr} onOpenRecord={openRecordById} onNewRecord={() => chooseNewRecord(false)} />
        </ErrorBoundary>,
        'liquid-glass-spatial-canvas min-h-screen py-2'
      );
      break;
    case 'lists':
      screen = withNav(
        <ErrorBoundary fallbackTitle="Lists" onReset={toDashboard}>
          <ListsPage isAr={isAr} onOpenRecord={openRecordById} />
        </ErrorBoundary>,
        'liquid-glass-spatial-canvas min-h-screen py-2'
      );
      break;
    case 'manuscripts':
      screen = withNav(
        <ErrorBoundary fallbackTitle="Manuscripts" onReset={toDashboard}>
          <ManuscriptsPage isAr={isAr} />
        </ErrorBoundary>,
        'liquid-glass-spatial-canvas min-h-screen py-2'
      );
      break;
    case 'acquisitions':
    case 'technical':
    case 'circulation':
    case 'catalogue':
      screen = withNav(
        <SectionPage section={sectionById(viewMode)} isAr={isAr} isSuperAdmin={isSuperAdmin} onRun={runSectionTask}>
          {viewMode === 'circulation' ? <ExternalLoanSystem isAr={isAr} /> : null}
          {viewMode === 'catalogue' && isSuperAdmin ? (
            <>
              <OpacVisitsCard isAr={isAr} />
              <OpacInsightsCard isAr={isAr} />
            </>
          ) : null}
        </SectionPage>,
        'liquid-glass-spatial-canvas min-h-screen py-2'
      );
      break;
    default:
      screen = withNav(
        <Dashboard
          onNavigate={(view) => {
            // Opening Moon Studio from the dashboard always starts a new record, never the last one opened.
            if (view === 'wolf-moon') chooseNewRecord(false);
            else navigate(VIEW_MODES.includes(view as ViewMode) ? (view as ViewMode) : 'dashboard');
          }}
          onLoadRecord={handleLoadRecord}
        />,
        'liquid-glass-spatial-canvas min-h-screen py-2'
      );
  }

  return <React.Suspense fallback={<ScreenLoading />}>{screen}</React.Suspense>;
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

  // Everything except the public OPAC (routed in main.tsx) needs a signed-in user.
  if (!isAuthenticated) {
    return (
      <LoginPage
        onLanguageChange={onLanguageChange}
        currentLanguage={currentLanguage}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
      />
    );
  }

  return <CatalogApp />;
}

export default function App() {
  const { i18n } = useTranslation();
  const [language, setLanguage] = useState(() => {
    try {
      const saved = localStorage.getItem('moon-language');
      return saved === 'en' ? 'en' : 'ar';
    } catch {
      return 'ar';
    }
  });

  useEffect(() => {
    if (i18n.language !== language) i18n.changeLanguage(language);
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    try {
      localStorage.setItem('moon-language', language);
    } catch {}
  }, [language, i18n]);

  // Language switches made inside the app (e.g. the editor's toggle) keep direction and storage in step.
  useEffect(() => {
    const onChange = (lng: string) => setLanguage(lng === 'en' ? 'en' : 'ar');
    i18n.on('languageChanged', onChange);
    return () => { i18n.off('languageChanged', onChange); };
  }, [i18n]);

  return (
    <ThemeProvider>
      <AuthProvider>
        <JCricketProvider>
          <AppContent onLanguageChange={setLanguage} currentLanguage={language} />
          <Toaster position={language === 'ar' ? 'top-left' : 'top-right'} />
        </JCricketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
