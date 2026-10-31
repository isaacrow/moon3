import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  SearchIcon, 
  Plus, 
  Trash2, 
  FileDown, 
  Calendar, 
  Clock, 
  BookOpen,
  User,
  Building,
  Tag,
  ArrowRight,
  Edit,
  Download
} from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { SavedRecord, searchRecords, deleteRecord, getAllRecords } from '../utils/recordStorageBackend';
import { BIBFRAMERecord } from '../types/bibframe';
import '../../styles/glassmorphism.css';
import { toBibframeJsonLdString } from '../../services/bibframeNormalizer';

interface SearchPageProps {
  onLoadRecord: (record: BIBFRAMERecord) => void;
  onNewRecord: () => void;
}

export function SearchPage({ onLoadRecord, onNewRecord }: SearchPageProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SavedRecord[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<string | null>(null);

  useEffect(() => {
    // Load all records initially
    loadRecords();
  }, []);

  const loadRecords = async () => {
    const allRecords = await searchRecords('');
    setResults(allRecords);
  };

  const handleSearch = async (searchQuery: string) => {
    setQuery(searchQuery);
    const foundRecords = await searchRecords(searchQuery);
    setResults(foundRecords);
  };

  const handleDelete = (id: string) => {
    setRecordToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (recordToDelete) {
      await deleteRecord(recordToDelete);
      const updatedRecords = await searchRecords(query);
      setResults(updatedRecords);
    }
    setDeleteDialogOpen(false);
    setRecordToDelete(null);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleDownload = (savedRecord: SavedRecord) => {
    // Check if this is a Moon Engine record (has @graph structure) or regular record (has work/instance)
    let jsonldDocument: any;
    
    // If the record has already been exported from Moon Engine, it will have the full structure
    if ((savedRecord.record as any)['@graph'] && (savedRecord.record as any)['quads']) {
      // Moon Engine format - use as is
      jsonldDocument = {
        '@context': 'http://id.loc.gov/ontologies/bibframe/',
        '@graph': (savedRecord.record as any)['@graph'],
        'quads': (savedRecord.record as any)['quads']
      };
    } else {
      // Regular BIBFRAME format - convert work/instance to JSON-LD
      const graphNodes: any[] = [];
      
      // Add Work node
      const workNode: any = {
        '@id': savedRecord.record.work['@id'] || `http://moon.local/work/${savedRecord.id}`,
        '@type': savedRecord.record.work['@type'] || ['http://id.loc.gov/ontologies/bibframe/Work', 'bf:Work'],
        ...savedRecord.record.work
      };
      graphNodes.push(workNode);
      
      // Add Instance node
      const instanceNode: any = {
        '@id': savedRecord.record.instance['@id'] || `http://moon.local/instance/${savedRecord.id}`,
        '@type': savedRecord.record.instance['@type'] || ['http://id.loc.gov/ontologies/bibframe/Instance', 'bf:Instance'],
        'instanceOf': savedRecord.record.work['@id'] || `http://moon.local/work/${savedRecord.id}`,
        ...savedRecord.record.instance
      };
      graphNodes.push(instanceNode);
      
      jsonldDocument = {
        '@context': 'http://id.loc.gov/ontologies/bibframe/',
        '@graph': graphNodes
      };
    }

    // Create blob and download
    const blob = new Blob([toBibframeJsonLdString(jsonldDocument)], { type: 'application/ld+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bibframe-${savedRecord.id}.jsonld`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Helper to get Work node from record
  const getWorkNode = (record: any): any => {
    if (!record) return null;
    if (record['@graph']) {
      return record['@graph'].find((n: any) => 
        n['@type']?.includes('Work') || n['@type']?.includes('bf:Work')
      );
    }
    return record.work;
  };

  // Helper to get Instance node from record
  const getInstanceNode = (record: any): any => {
    if (!record) return null;
    if (record['@graph']) {
      return record['@graph'].find((n: any) => 
        n['@type']?.includes('Instance') || n['@type']?.includes('bf:Instance')
      );
    }
    return record.instance;
  };

  // Extract title helper function
  const extractTitle = (record: any): string => {
    if (!record) return 'Untitled Record';
    
    // Check if this is a JSON-LD document with @graph
    if (record['@graph']) {
      // Find Title node in graph
      const titleNode = record['@graph'].find((n: any) => n['@type'] === 'bf:Title');
      if (titleNode) {
        // Combine mainTitle and subtitle
        let mainTitle = titleNode['bf:mainTitle'] || titleNode['mainTitle'] || '';
        let subtitle = titleNode['bf:subtitle'] || titleNode['subtitle'] || '';
        
        if (mainTitle) {
          return subtitle ? `${mainTitle} ${subtitle}` : mainTitle;
        }
        
        if (titleNode['rdfs:label']) return titleNode['rdfs:label'];
      }
      
      // Try Instance node with title URI reference
      const instanceNode = record['@graph'].find((n: any) => 
        n['@type']?.includes('Instance') || n['@type']?.includes('bf:Instance')
      );
      if (instanceNode) {
        const titleRef = instanceNode['title'] || instanceNode['bf:title'];
        if (titleRef) {
          if (typeof titleRef === 'string') {
            // It's a URI reference, find it in graph
            const refNode = record['@graph'].find((n: any) => n['@id'] === titleRef);
            if (refNode) {
              let mainTitle = refNode['mainTitle'] || refNode['bf:mainTitle'] || '';
              let subtitle = refNode['subtitle'] || refNode['bf:subtitle'] || '';
              
              if (mainTitle) {
                return subtitle ? `${mainTitle} ${subtitle}` : mainTitle;
              }
            }
          } else if (titleRef['bf:mainTitle'] || titleRef['mainTitle']) {
            let mainTitle = titleRef['bf:mainTitle'] || titleRef['mainTitle'] || '';
            let subtitle = titleRef['bf:subtitle'] || titleRef['subtitle'] || '';
            
            return subtitle ? `${mainTitle} ${subtitle}` : mainTitle;
          }
        }
      }
      
      // Try Work node with title URI reference
      const workNode = record['@graph'].find((n: any) => 
        n['@type']?.includes('Work') || n['@type']?.includes('bf:Work')
      );
      if (workNode) {
        const titleRef = workNode['title'] || workNode['bf:title'];
        if (titleRef) {
          if (typeof titleRef === 'string') {
            const refNode = record['@graph'].find((n: any) => n['@id'] === titleRef);
            if (refNode) {
              let mainTitle = refNode['mainTitle'] || refNode['bf:mainTitle'] || '';
              let subtitle = refNode['subtitle'] || refNode['bf:subtitle'] || '';
              
              if (mainTitle) {
                return subtitle ? `${mainTitle} ${subtitle}` : mainTitle;
              }
            }
          } else if (titleRef['bf:mainTitle'] || titleRef['mainTitle']) {
            let mainTitle = titleRef['bf:mainTitle'] || titleRef['mainTitle'] || '';
            let subtitle = titleRef['bf:subtitle'] || titleRef['subtitle'] || '';
            
            return subtitle ? `${mainTitle} ${subtitle}` : mainTitle;
          }
        }
      }
    }
    
    // Fallback to old format (work/instance structure)
    if (record.instance) {
      const instanceTitle = record.instance['bf:title'];
      if (instanceTitle) {
        if (typeof instanceTitle === 'string') return instanceTitle;
        if (instanceTitle['bf:mainTitle']) return instanceTitle['bf:mainTitle'];
        if (instanceTitle['rdfs:label']) return instanceTitle['rdfs:label'];
      }
    }

    if (record.work) {
      const workTitle = record.work['bf:title'];
      if (workTitle) {
        if (typeof workTitle === 'string') return workTitle;
        if (workTitle['bf:mainTitle']) return workTitle['bf:mainTitle'];
        if (workTitle['rdfs:label']) return workTitle['rdfs:label'];
      }
    }

    return 'Untitled Record';
  };

  return (
    <div className="min-h-screen animated-gradient-bg overflow-hidden">
      {/* Background Blur Layers */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto p-6 space-y-6">
        {/* Glass Header */}
        <div className="glass-card p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-5xl font-black tracking-tight mb-3" style={{ color: '#575757' }}>
                {t('searchRecords')}
              </h1>
              <p className="text-lg" style={{ color: '#575757' }}>
                {t('appSubtitle')}
              </p>
            </div>
            <button
              onClick={onNewRecord}
              className="glass-button px-8 py-4 flex items-center gap-3 hover:scale-105 active:scale-95 transition-all"
            >
              <Plus className="h-6 w-6" style={{ color: '#575757' }} />
              <span className="text-lg font-bold" style={{ color: '#575757' }}>{t('newRecord')}</span>
            </button>
          </div>

          {/* Search Bar - Big Glass Input */}
          <div className="relative">
            <div className="glass-panel rounded-3xl p-6">
              <div className="flex items-center gap-4">
                <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-xl">
                  <SearchIcon className="h-8 w-8 text-white" />
                </div>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="flex-1 bg-transparent text-2xl font-semibold outline-none placeholder:opacity-50"
                  style={{ color: '#575757' }}
                />
              </div>
            </div>
          </div>

          {/* Results Count */}
          <div className="mt-6 flex items-center gap-2">
            <div className="glass-panel px-4 py-2 flex items-center gap-2">
              <BookOpen className="h-4 w-4" style={{ color: '#575757' }} />
              <span className="font-bold" style={{ color: '#575757' }}>
                {results.length} {t('recordsFound')}
              </span>
            </div>
          </div>
        </div>

        {/* Results Grid */}
        {results.length === 0 ? (
          <div className="glass-card p-16 text-center">
            <div className="inline-block p-8 rounded-3xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 mb-6">
              <SearchIcon className="h-20 w-20" style={{ color: '#575757', opacity: 0.5 }} />
            </div>
            <p className="text-2xl font-bold mb-4" style={{ color: '#575757' }}>
              {t('noRecordsFound')}
            </p>
            <button
              onClick={onNewRecord}
              className="glass-button px-8 py-4 text-lg font-semibold hover:scale-105 transition-transform inline-flex items-center gap-3"
            >
              <Plus className="h-5 w-5" style={{ color: '#575757' }} />
              <span style={{ color: '#575757' }}>{t('newRecord')}</span>
            </button>
          </div>
        ) : (
          <div className="grid gap-6">
            {results.map((savedRecord, index) => {
              const workNode = getWorkNode(savedRecord.record);
              const instanceNode = getInstanceNode(savedRecord.record);
              
              const creator = workNode?.['bf:contributor']?.[0] || workNode?.['bf:creator']?.[0];
              const publisher = instanceNode?.['bf:provisionActivity']?.[0]?.['bf:agent']?.['rdfs:label'];
              const date = instanceNode?.['bf:provisionActivity']?.[0]?.['bf:date'];
              const displayTitle = extractTitle(savedRecord.record);

              return (
                <div
                  key={savedRecord.id}
                  className="glass-card p-8 hover:scale-[1.02] transition-all duration-300 group"
                  style={{
                    animationDelay: `${index * 100}ms`,
                    animation: 'fadeInUp 0.6s ease-out forwards'
                  }}
                >
                  <div className="flex items-start gap-6">
                    {/* Big Cover Image */}
                    <div className="flex-shrink-0">
                      <div className="w-32 h-44 rounded-2xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-600 flex items-center justify-center overflow-hidden shadow-2xl group-hover:shadow-3xl group-hover:scale-105 transition-all duration-300">
                        {savedRecord.coverImage ? (
                          <img
                            src={savedRecord.coverImage}
                            alt={displayTitle}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <BookOpen className="h-16 w-16 text-white opacity-50" />
                        )}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Title */}
                      <h3 className="text-3xl font-black mb-4 group-hover:text-blue-600 transition-colors" style={{ color: '#575757' }}>
                        {displayTitle}
                      </h3>

                      {/* Metadata Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        {creator && (
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
                              <User className="h-5 w-5 text-white" />
                            </div>
                            <div>
                              <div className="text-xs font-bold mb-1" style={{ color: '#575757', opacity: 0.7 }}>
                                Creator
                              </div>
                              <div className="font-semibold" style={{ color: '#575757' }}>
                                {creator.label || creator['rdfs:label'] || 'Unknown'}
                              </div>
                            </div>
                          </div>
                        )}

                        {publisher && (
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 shadow-lg">
                              <Building className="h-5 w-5 text-white" />
                            </div>
                            <div>
                              <div className="text-xs font-bold mb-1" style={{ color: '#575757', opacity: 0.7 }}>
                                Publisher
                              </div>
                              <div className="font-semibold" style={{ color: '#575757' }}>
                                {publisher} {date && `(${date})`}
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg">
                            <Calendar className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <div className="text-xs font-bold mb-1" style={{ color: '#575757', opacity: 0.7 }}>
                              {t('createdOn')}
                            </div>
                            <div className="font-semibold" style={{ color: '#575757' }}>
                              {formatDate(savedRecord.createdAt)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg">
                            <Clock className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <div className="text-xs font-bold mb-1" style={{ color: '#575757', opacity: 0.7 }}>
                              {t('lastModified')}
                            </div>
                            <div className="font-semibold" style={{ color: '#575757' }}>
                              {formatDate(savedRecord.modifiedAt)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Genre Tags */}
                      {workNode?.['bf:genreForm'] && workNode['bf:genreForm'].length > 0 && (
                        <div className="flex items-center gap-2 mb-4">
                          <Tag className="h-4 w-4" style={{ color: '#575757', opacity: 0.7 }} />
                          <div className="flex gap-2 flex-wrap">
                            {workNode['bf:genreForm'].slice(0, 5).map((genre: any, idx: number) => (
                              <div key={idx} className="glass-panel px-3 py-1 rounded-full">
                                <span className="text-xs font-bold" style={{ color: '#575757' }}>
                                  {genre.label || genre['rdfs:label'] || 'Genre'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ID Badge */}
                      <div className="glass-panel inline-block px-4 py-2 rounded-lg">
                        <span className="text-xs font-mono font-bold" style={{ color: '#575757' }}>
                          {savedRecord.id}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => onLoadRecord(savedRecord.record)}
                        className="glass-button p-4 rounded-2xl hover:scale-110 active:scale-95 transition-all group/btn"
                        title={t('loadRecord')}
                      >
                        <FileDown className="h-7 w-7" style={{ color: '#575757' }} />
                      </button>
                      <button
                        onClick={() => handleDelete(savedRecord.id)}
                        className="glass-panel p-4 rounded-2xl hover:scale-110 hover:bg-red-500/20 active:scale-95 transition-all"
                        title="Delete"
                      >
                        <Trash2 className="h-7 w-7 text-red-600" />
                      </button>
                      <button
                        onClick={() => handleDownload(savedRecord)}
                        className="glass-panel p-4 rounded-2xl hover:scale-110 hover:bg-blue-500/20 active:scale-95 transition-all"
                        title="Download JSON-LD"
                      >
                        <Download className="h-7 w-7 text-blue-600" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="glass-card">
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: '#575757' }}>{t('deleteRecord')}</AlertDialogTitle>
            <AlertDialogDescription style={{ color: '#575757', opacity: 0.8 }}>
              {t('confirmDelete')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => setDeleteDialogOpen(false)}
              className="glass-button"
            >
              <span style={{ color: '#575757' }}>{t('cancel')}</span>
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete} 
              className="bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700"
            >
              {t('deleteRecord')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
