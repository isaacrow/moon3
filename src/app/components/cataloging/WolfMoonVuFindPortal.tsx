/**
 * WolfMoon VuFind® Live Discovery Portal
 * Embedded discovery workbench that runs directly inside Moon Wolf at http://localhost:5173
 * Queries local Apache Solr (8983) and VuFind (8085) with instant search, facet filtering,
 * live record inspection, and 1-click import into Moon Wolf cataloger.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  BookOpen,
  Filter,
  ExternalLink,
  RefreshCw,
  Layers,
  ArrowRight,
  Database,
  Globe,
  Tag,
  CheckCircle,
  AlertCircle,
  SlidersHorizontal,
  Eye,
  UploadCloud,
  FileJson
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { VuFindApiClient, VuFindSolrDoc } from '../../services/vufindApiClient';
import { toast } from 'sonner';
import { BASE_URI } from '../../../services/uriMintingService';

interface WolfMoonVuFindPortalProps {
  onImportToEditor?: (record: any) => void;
  currentRecordDoc?: any;
  isDark?: boolean;
}

export function WolfMoonVuFindPortal({
  onImportToEditor,
  currentRecordDoc,
  isDark = true,
}: WolfMoonVuFindPortalProps) {
  const [searchTerm, setSearchTerm] = useState('*');
  const [activeFormat, setActiveFormat] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'iframe'>('cards');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [status, setStatus] = useState<{ solr: boolean; vufind: boolean; message: string }>({
    solr: false,
    vufind: false,
    message: 'Checking...'
  });

  const client = React.useMemo(() => new VuFindApiClient({
    baseUrl: '/vufind',
    solrUrl: '/solr/biblio',
  }), []);

  // Check health of Solr and VuFind
  const checkHealth = useCallback(async () => {
    try {
      const res = await client.checkHealth();
      setStatus({
        solr: !!res.solrOk,
        vufind: !!res.ok,
        message: res.message || 'Connected to discovery ecosystem'
      });
    } catch (e: any) {
      setStatus({ solr: false, vufind: false, message: e.message || 'Cannot reach Solr' });
    }
  }, [client]);

  // Execute search in Apache Solr + VuFind RTA API
  const runSearch = useCallback(async (query: string = searchTerm) => {
    setIsLoading(true);
    try {
      const q = query.trim() || '*:*';
      // First try VuFind enriched API (?api=search) which merges Solr + FOLIO RTA
      try {
        const vfRes = await fetch(`/vufind/?api=search&lookfor=${encodeURIComponent(q === '*' ? '*:*' : q)}`);
        if (vfRes.ok) {
          const vfData = await vfRes.json();
          if (vfData && Array.isArray(vfData.records)) {
            setResults(vfData.records);
            setTotalCount(vfData.resultCount || vfData.records.length);
            setStatus({ solr: true, vufind: true, message: 'Connected to VuFind + Solr + FOLIO RTA' });
            setIsLoading(false);
            return;
          }
        }
      } catch {}

      const res = await client.searchSolr(q === '*:*' ? '*' : q, 30);
      setResults(res.docs || []);
      setTotalCount(res.numFound || 0);
    } catch (err: any) {
      console.warn('Solr search note:', err);
    } finally {
      setIsLoading(false);
    }
  }, [client, searchTerm]);

  const handleFolioCirculation = async (doc: any, action: 'checkout' | 'checkin') => {
    const folio = doc._folio || {};
    const firstItem = folio.items?.[0] || {};
    try {
      const r = await fetch(`/folio-api/api/circulation/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: firstItem.id,
          instanceId: folio.instanceId || doc.id,
          patronName: 'مستفيد بوابة VuFind'
        })
      });
      if (r.ok) {
        const d = await r.json();
        toast.success(
          action === 'checkout'
            ? `تمت إعارة "${Array.isArray(doc.title) ? doc.title[0] : doc.title}" عبر FOLIO (الباركود: ${d.item?.barcode || ''})`
            : `تم إرجاع النسخة إلى رفوف المكتبة في نظام FOLIO بنجاح`
        );
        runSearch(searchTerm);
      }
    } catch {
      toast.error('تعذر الاتصال بمحرك الإعارة في FOLIO');
    }
  };

  useEffect(() => {
    checkHealth();
    runSearch('*');
  }, [checkHealth, runSearch]);

  const handleIndexCurrent = async () => {
    if (!currentRecordDoc) {
      toast.error('لا توجد تسجيلة نشطة في المحرر لفهرستها');
      return;
    }
    try {
      const solrPayload = client.bibframeToVuFindSolr(currentRecordDoc);
      await client.indexToSolr(solrPayload);
      toast.success(`تمت فهرسة التسجيلة بنجاح في Solr: ${solrPayload.id}`);
      runSearch('*');
    } catch (e: any) {
      toast.error(`فشلت الفهرسة: ${e.message}`);
    }
  };

  const handleImportRecord = (doc: any) => {
    if (onImportToEditor) {
      // Map Solr doc back to BIBFRAME structure
      const bibframeRecord = {
        '@graph': [
          {
            '@id': `${BASE_URI}/work/vufind-${doc.id}`,
            '@type': ['bf:Work', 'bf:Text'],
            'bf:title': {
              '@type': 'bf:Title',
              'bf:mainTitle': doc.title || doc.title_short || 'Untitled',
            },
            'bf:contribution': (doc.author || []).map((a: string) => ({
              '@type': 'bf:Contribution',
              'bf:agent': { '@type': 'bf:Person', 'rdfs:label': a },
              'bf:role': { '@type': 'bf:Role', 'rdfs:label': 'author' },
            })),
            'bf:subject': (doc.topic || []).map((t: string) => ({
              '@type': 'bf:Topic',
              'rdfs:label': t,
            })),
          },
          {
            '@id': `${BASE_URI}/instance/vufind-${doc.id}`,
            '@type': ['bf:Instance'],
            'bf:title': {
              '@type': 'bf:Title',
              'bf:mainTitle': doc.title || doc.title_short || 'Untitled',
            },
            'bf:provisionActivity': [{
              '@type': 'bf:Publication',
              'bf:agent': { 'rdfs:label': Array.isArray(doc.publisher) ? doc.publisher[0] : (doc.publisher || '') },
              'bf:date': Array.isArray(doc.publishDate) ? doc.publishDate[0] : (doc.publishDate || ''),
            }],
            'bf:identifiedBy': (doc.isbn || []).map((isbn: string) => ({
              '@type': 'bf:Isbn',
              'rdf:value': isbn,
            })),
          }
        ]
      };
      onImportToEditor(bibframeRecord);
      toast.success(`تم تحميل "${doc.title}" إلى محرر الفهرسة مون بنجاح!`);
    }
  };

  return (
    <div className="w-full flex flex-col gap-5 max-w-7xl mx-auto pb-12" dir="rtl">
      {/* Ecosystem Status Header */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-teal-950/40 via-emerald-950/30 to-blue-950/40 border border-teal-500/30 backdrop-blur-xl shadow-xl flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400 shadow-inner">
            <Search className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">بوابة اكتشاف فايفايند (VuFind® Discovery Live)</h2>
              <Badge className="bg-teal-500/20 text-teal-300 border-teal-500/30 text-[10px]">
                Apache Solr Core : biblio
              </Badge>
            </div>
            <p className="text-xs text-gray-400">
              بوابة البحث والاكتشاف المعرفي للمستفيدين والفهرس العام - تعمل محلياً داخل الرابط الموحد
            </p>
          </div>
        </div>

        {/* Live Service Indicators */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs">
            <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-semibold ${
              status.solr
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
            }`}>
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Solr Index: {status.solr ? '8983 متصل' : 'جارِ التحقق'}</span>
            </span>

            <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-semibold ${
              status.vufind
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-blue-500/15 border-blue-500/30 text-blue-300'
            }`}>
              <Globe className="w-3.5 h-3.5" />
              <span>VuFind Portal: 8085</span>
            </span>
          </div>

          <Button
            size="sm"
            onClick={handleIndexCurrent}
            className="h-8 text-xs bg-teal-600 hover:bg-teal-700 text-white cursor-pointer shadow-md flex items-center gap-1.5"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>فهرسة التسجيلة الحالية في VuFind</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              checkHealth();
              runSearch('*');
            }}
            disabled={isLoading}
            className="h-8 text-xs bg-white/5 border-white/15 text-white cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Mode Switcher & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white/5 p-3 rounded-2xl border border-white/10">
        {/* Search input */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-teal-400 absolute right-3.5 top-3" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch(searchTerm)}
            placeholder="ابحث في بوابة VuFind وفهرس Solr (العنوان، المؤلف، المخطوطات، التصنيف)..."
            className="bg-black/30 border-white/15 text-white pr-10 text-sm h-10 w-full"
          />
        </div>

        <Button
          onClick={() => runSearch(searchTerm)}
          disabled={isLoading}
          className="h-10 px-6 bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold shadow-md cursor-pointer shrink-0"
        >
          {isLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : <Search className="w-4 h-4 mr-1" />}
          <span>بحث في الفهرس ({totalCount})</span>
        </Button>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10 shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'cards' ? 'bg-teal-500 text-white shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            بطاقات الاكتشاف
          </button>
          <button
            type="button"
            onClick={() => setViewMode('iframe')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'iframe' ? 'bg-teal-500 text-white shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            بوابة VuFind الأصلية
          </button>
        </div>
      </div>

      {/* Main View Container */}
      {viewMode === 'iframe' ? (
        <div className="w-full rounded-2xl overflow-hidden border border-white/15 bg-white shadow-2xl relative" style={{ minHeight: '75vh' }}>
          <div className="p-2 bg-gray-900 border-b border-gray-800 flex items-center justify-between text-xs text-gray-300">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <span className="font-mono text-teal-300">http://localhost:5173/vufind (Embedded Proxy)</span>
            </div>
            <a
              href="http://localhost:8085"
              target="_blank"
              rel="noreferrer"
              className="text-teal-400 hover:underline flex items-center gap-1 text-[11px]"
            >
              <span>فتح في نافذة مستقلة (8085)</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <iframe
            src="/vufind"
            title="VuFind Discovery Portal"
            className="w-full h-full border-0"
            style={{ minHeight: '75vh' }}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Format pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <span className="text-gray-400 font-bold ml-1">تصفية حسب الوعاء:</span>
            {['all', 'Book', 'Manuscript', 'eBook', 'Periodical'].map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => {
                  setActiveFormat(fmt);
                  if (fmt === 'all') runSearch(searchTerm);
                  else runSearch(`format:${fmt}`);
                }}
                className={`px-3 py-1 rounded-xl text-xs font-semibold cursor-pointer border transition-all ${
                  activeFormat === fmt
                    ? 'bg-teal-500/25 border-teal-400 text-teal-200 shadow'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                }`}
              >
                {fmt === 'all' ? 'جميع الأوعية' : fmt === 'Book' ? 'كتب ومؤلفات' : fmt === 'Manuscript' ? 'مخطوطات نادرة' : fmt}
              </button>
            ))}
          </div>

          {/* Records grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {results.length === 0 ? (
              <div className="col-span-full p-12 text-center rounded-2xl bg-white/5 border border-white/10 text-gray-400">
                <BookOpen className="w-12 h-12 text-teal-400/40 mx-auto mb-3" />
                <p className="text-sm font-bold text-white mb-1">لم يتم العثور على تسجيلات في الفهرس</p>
                <p className="text-xs">اضغط على زر "فهرسة التسجيلة الحالية في VuFind" لنشر تسجيلة BIBFRAME النشطة فوراً.</p>
              </div>
            ) : (
              results.map((doc, idx) => (
                <div
                  key={doc.id || idx}
                  className="p-5 rounded-2xl bg-black/40 border border-white/10 hover:border-teal-500/50 hover:bg-black/60 transition-all flex flex-col justify-between gap-4 shadow-lg backdrop-blur-xl group"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h3 className="font-bold text-sm text-white group-hover:text-teal-300 transition-colors">
                          {doc.title || doc.title_short || 'Untitled Document'}
                        </h3>
                        {doc.id && (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] text-teal-300 border-teal-500/40 font-mono">
                              Solr ID: {doc.id}
                            </Badge>
                            {doc.format && (
                              <Badge variant="secondary" className="text-[10px] bg-white/10 text-gray-300">
                                {Array.isArray(doc.format) ? doc.format.join(', ') : doc.format}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0">
                        <BookOpen className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Metadata fields */}
                    <div className="space-y-1 text-xs text-gray-300">
                      {doc.author && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">المؤلف:</span>
                          <span className="text-white font-medium">
                            {Array.isArray(doc.author) ? doc.author.join(', ') : doc.author}
                          </span>
                        </div>
                      )}

                      {(doc.publisher || doc.publishDate) && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">النشر:</span>
                          <span>
                            {Array.isArray(doc.publisher) ? doc.publisher[0] : (doc.publisher || '')}
                            {doc.publishDate ? ` (${Array.isArray(doc.publishDate) ? doc.publishDate[0] : doc.publishDate})` : ''}
                          </span>
                        </div>
                      )}

                      {doc.topic && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                          {(Array.isArray(doc.topic) ? doc.topic : [doc.topic]).slice(0, 4).map((t: string, ti: number) => (
                            <span key={ti} className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30">
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions & Live FOLIO RTA footer */}
                  <div className="pt-3 border-t border-white/10 flex flex-col gap-2.5 text-xs">
                    {doc._folio && (
                      <div className="flex items-center justify-between gap-2 flex-wrap bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            doc._folio.availableItems > 0
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          }`}>
                            {doc._folio.availableItems > 0
                              ? `متاح في FOLIO (${doc._folio.availableItems}/${doc._folio.totalItems})`
                              : 'معار حالياً (Checked out)'}
                          </span>
                          <span className="font-mono text-[11px] text-teal-300" dir="ltr">
                            {doc._folio.callNumber}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleFolioCirculation(doc, doc._folio.availableItems > 0 ? 'checkout' : 'checkin')}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors ${
                            doc._folio.availableItems > 0
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                              : 'bg-amber-600 hover:bg-amber-500 text-white'
                          }`}
                        >
                          {doc._folio.availableItems > 0 ? 'إعارة عبر FOLIO' : 'إرجاع للمكتبة'}
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3">
                      <a
                        href={`http://localhost:8085/?id=${encodeURIComponent(doc.id)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-teal-400 hover:text-teal-300 flex items-center gap-1 text-[11px]"
                      >
                        <span>فتح التسجيلة الكاملة في VuFind (:8085)</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>

                      <Button
                        size="sm"
                        onClick={() => handleImportRecord(doc)}
                        className="h-7 text-xs bg-teal-600 hover:bg-teal-500 text-white cursor-pointer flex items-center gap-1.5 shadow"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        <span>استيراد إلى محرر مون</span>
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
