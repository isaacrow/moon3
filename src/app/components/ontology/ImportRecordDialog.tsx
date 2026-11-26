/**
 * Import Record Dialog
 * 
 * Allows importing BIBFRAME records from XML, RDF, JSON-LD files with Liquid Glass Design
 */

import React, { useState } from 'react';
import { Upload, FileJson, FileCode, FileText, X } from 'lucide-react';
import { importBibframe, ImportFormat } from '../../../services/bibframeImport';
import { readMarcFile } from '../../../services/marc/marcRecord';
import { marcToBibframe, ImportedMarcRecord } from '../../../services/marc/marcToBibframe';
import { importMarcBatch, BatchResult } from '../../../services/marc/marcBatch';
import { AuthorityReportPanel } from './AuthorityReportPanel';
import { searchBlueCore, importFromBlueCore, BlueCoreHit } from '../../../services/blueCore';
import { isFolioLdExport, importFolioLdExport, FolioLdRecord } from '../../../services/folioLdImport';
import { listSruTargets, searchSru, SruIndex, SruTargetInfo } from '../../../services/sruClient';
import { saveRecord, checkDuplicates } from '../../utils/recordStorageBackend';
import { useAuth } from '../../contexts/AuthContext';

interface ImportRecordDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (workData: any, instanceData: any, itemData?: any) => void;
}

export function ImportRecordDialog({ isOpen, onClose, onImport }: ImportRecordDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [fileType, setFileType] = useState<'jsonld' | 'xml' | 'rdf' | 'marc' | null>(null);
  // MARC files (.mrc, .mrk, MARCXML) can hold many records, e.g. a Koha export; the cataloger picks one.
  const [marcRecords, setMarcRecords] = useState<ImportedMarcRecord[]>([]);
  const [marcIndex, setMarcIndex] = useState(0);
  // FOLIO Data Export's linked-data file (BIBFRAME JSON Lines, one Instance a line); the cataloger picks one.
  const [folioRecords, setFolioRecords] = useState<FolioLdRecord[]>([]);
  const [folioIndex, setFolioIndex] = useState(0);
  const [error, setError] = useState<string>('');
  const { user, username } = useAuth();
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);

  // SRU copy cataloguing (other library catalogues)
  const [sruTargets, setSruTargets] = useState<SruTargetInfo[]>([{ id: 'lc', name: 'Library of Congress' }]);
  const [sruTarget, setSruTarget] = useState('lc');
  const [sruIndex, setSruIndex] = useState<SruIndex>('keyword');
  const [sruQuery, setSruQuery] = useState('');
  const [sruBusy, setSruBusy] = useState(false);
  const [sruResult, setSruResult] = useState<{ total: number; records: ImportedMarcRecord[] } | null>(null);
  React.useEffect(() => { if (isOpen) listSruTargets().then(setSruTargets).catch(() => {}); }, [isOpen]);
  const handleSruSearch = async () => {
    setSruBusy(true);
    setError('');
    try {
      setSruResult(await searchSru(sruTarget, sruIndex, sruQuery.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The catalogue could not be searched.');
    } finally {
      setSruBusy(false);
    }
  };

  // Blue Core copy cataloguing
  const [bcQuery, setBcQuery] = useState('');
  const [bcHits, setBcHits] = useState<BlueCoreHit[] | null>(null);
  const [bcBusy, setBcBusy] = useState(false);
  const handleBlueCoreSearch = async () => {
    setBcBusy(true);
    setError('');
    try {
      setBcHits((await searchBlueCore(bcQuery.trim())).hits);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Blue Core could not be searched.');
    } finally {
      setBcBusy(false);
    }
  };
  const handleBlueCoreImport = async (hit: BlueCoreHit) => {
    setBcBusy(true);
    setError('');
    try {
      const rec = await importFromBlueCore(hit);
      onImport(rec.work, rec.instance, rec.item);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This Blue Core record could not be copied.');
    } finally {
      setBcBusy(false);
    }
  };

  const handleSaveAll = async () => {
    setBatchResult(null);
    setBatchProgress({ done: 0, total: marcRecords.length });
    try {
      const result = await importMarcBatch(marcRecords, {
        cataloger: user?.username || username || 'anonymous',
        fileName: selectedFile?.name || 'MARC file',
        findDuplicates: (record) => checkDuplicates(record as any),
        save: (record) => saveRecord(record as any, user?.username || username || undefined),
        onProgress: (done, total) => setBatchProgress({ done, total }),
      });
      setBatchResult(result);
    } finally {
      setBatchProgress(null);
    }
  };

  if (!isOpen) return null;

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setError('');

    // Determine file type
    const extension = file.name.split('.').pop()?.toLowerCase();
    setMarcRecords([]);
    setBatchResult(null);
    setMarcIndex(0);
    setFolioRecords([]);
    setFolioIndex(0);
    if (extension === 'mrc' || extension === 'mrk' || extension === 'marc') {
      setFileType('marc');
    } else if (extension === 'json' || extension === 'jsonld' || extension === 'jsonl' || extension === 'ndjson') {
      setFileType('jsonld');
    } else if (extension === 'xml' || extension === 'rdf' || extension === 'marcxml') {
      setFileType('xml');
    } else if (extension === 'ttl' || extension === 'n3' || extension === 'nt') {
      setFileType('rdf');
    } else {
      setError('Unsupported file type. Please use MARC (.mrc, .mrk, MARCXML), JSON-LD (including FOLIO\'s linked-data export), Turtle or N-Triples.');
      return;
    }

    // Read file content
    const reader = new FileReader();
    reader.onload = (e) => {
      const bytes = new Uint8Array(e.target?.result as ArrayBuffer);
      const content = new TextDecoder('utf-8').decode(bytes);
      setFileContent(content);
      // MARC: binary or MarcEdit files by extension, MARCXML by its namespace.
      if (extension === 'mrc' || extension === 'mrk' || extension === 'marc' || /loc\.gov\/MARC21\/slim/.test(content.slice(0, 2000))) {
        try {
          const records = readMarcFile(bytes).map(marcToBibframe);
          if (!records.length) throw new Error('No MARC records in this file.');
          setFileType('marc');
          setMarcRecords(records);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'This MARC file could not be read.');
        }
      } else if (isFolioLdExport(content)) {
        setFileType('jsonld');
        importFolioLdExport(content)
          .then(setFolioRecords)
          .catch((err) => setError(err instanceof Error ? err.message : 'This FOLIO file could not be read.'));
      }
    };
    reader.onerror = () => {
      setError('Error reading file');
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    try {
      if (fileType === 'marc') {
        const chosen = marcRecords[marcIndex];
        if (!chosen) { setError('No MARC record to import.'); return; }
        onImport(chosen.work, chosen.instance, chosen.item);
        onClose();
        return;
      }
      if (folioRecords.length) {
        const chosen = folioRecords[folioIndex];
        if (!chosen) { setError('No FOLIO record to import.'); return; }
        onImport(chosen.work, chosen.instance, chosen.item);
        onClose();
        return;
      }
      // Any BIBFRAME description: LC's id.loc.gov records, Moon exports, RDF/XML, Turtle or N-Triples.
      const format: ImportFormat = fileType === 'xml' ? 'rdfxml' : fileType === 'jsonld' ? 'jsonld' : selectedFile?.name.toLowerCase().endsWith('.nt') ? 'ntriples' : 'turtle';
      const record = await importBibframe(fileContent, format);
      if (!record || (Object.keys(record.work).length <= 1 && Object.keys(record.instance).length <= 1)) {
        setError('No BIBFRAME Work or Instance found in file');
        return;
      }
      onImport(record.work, record.instance, record.item);
      onClose();
    } catch (err) {
      setError(`Error parsing file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div 
        className="w-full max-w-xl mx-auto rounded-3xl overflow-hidden transition-all text-white border border-white/20"
        style={{
          background: 'rgba(255, 255, 255, 0.12)',
          backdropFilter: 'blur(30px) saturate(1.8) brightness(1.1)',
          WebkitBackdropFilter: 'blur(36px) saturate(1.8) brightness(1.15) contrast(1.05)',
          boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.2), inset 1.5px 1.5px 0 rgba(255, 255, 255, 0.5), inset 0 0 20px rgba(255, 255, 255, 0.15), 0 20px 50px rgba(0, 0, 0, 0.5)'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-xl font-bold text-white drop-shadow-sm flex items-center gap-2">
            Import BIBFRAME Record
          </h2>
          <button 
            type="button" 
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/15 transition-all cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <p className="text-sm text-white/80">
            Import a MARC record (from Koha, MarcEdit or any library system) or a BIBFRAME record (RDF/XML, JSON-LD, Turtle or N-Triples, including id.loc.gov records and FOLIO's linked-data export) into MOON.
          </p>

          {/* Copy cataloguing: LC and the LD4P libraries' shared BIBFRAME store */}
          <div className="p-4 rounded-2xl border border-white/20 space-y-3" style={{ background: 'rgba(255, 255, 255, 0.06)' }}>
            <label htmlFor="bluecore-q" className="block text-xs font-semibold text-white/80 uppercase tracking-wider">
              Copy from Blue Core (Library of Congress & LD4P)
            </label>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); handleBlueCoreSearch(); }}>
              <input id="bluecore-q" value={bcQuery} onChange={(e) => setBcQuery(e.target.value)} dir="auto"
                placeholder="Title, author or LCCN (Arabic or romanized)"
                className="flex-1 min-w-0 px-3 py-2 rounded-xl text-sm bg-black/40 border border-white/20 text-white placeholder-white/40" />
              <button type="submit" disabled={bcBusy || !bcQuery.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 cursor-pointer">
                {bcBusy ? 'Searching…' : 'Search'}
              </button>
            </form>
            {bcHits && (
              <div className="max-h-56 overflow-auto space-y-1.5" role="list">
                {bcHits.length === 0 && <div className="text-xs text-white/60">Nothing found in Blue Core.</div>}
                {bcHits.map((h) => (
                  <div key={h.uri} role="listitem" className="flex items-center gap-2 p-2 rounded-xl bg-black/30 border border-white/10">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate" title={h.title}>{h.title}</div>
                      {h.titleArabic && <div className="text-xs text-white/70 truncate" dir="rtl">{h.titleArabic}</div>}
                      <div className="text-[10px] text-white/50">{h.type === 'works' ? 'Work' : 'Instance'}{h.date ? ` · ${h.date}` : ''}{h.lccn ? ` · LCCN ${h.lccn}` : ''}</div>
                    </div>
                    <button type="button" onClick={() => handleBlueCoreImport(h)} disabled={bcBusy}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 cursor-pointer">
                      Copy
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Copy cataloguing from other library catalogues over SRU (LC, and any configured on the server) */}
          <div className="p-4 rounded-2xl border border-white/20 space-y-3" style={{ background: 'rgba(255, 255, 255, 0.06)' }}>
            <label htmlFor="sru-q" className="block text-xs font-semibold text-white/80 uppercase tracking-wider">
              Copy from another library catalogue (SRU)
            </label>
            <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); handleSruSearch(); }}>
              <select aria-label="Catalogue" value={sruTarget} onChange={(e) => setSruTarget(e.target.value)}
                className="px-2 py-2 rounded-xl text-xs bg-black/40 border border-white/20 text-white">
                {sruTargets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select aria-label="Search by" value={sruIndex} onChange={(e) => setSruIndex(e.target.value as SruIndex)}
                className="px-2 py-2 rounded-xl text-xs bg-black/40 border border-white/20 text-white">
                <option value="keyword">Any word</option><option value="title">Title</option><option value="author">Author</option>
                <option value="isbn">ISBN</option><option value="lccn">LCCN</option>
              </select>
              <input id="sru-q" value={sruQuery} onChange={(e) => setSruQuery(e.target.value)} dir="auto"
                className="flex-1 min-w-[8rem] px-3 py-2 rounded-xl text-sm bg-black/40 border border-white/20 text-white" />
              <button type="submit" disabled={sruBusy || !sruQuery.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 cursor-pointer">
                {sruBusy ? 'Searching…' : 'Search'}
              </button>
            </form>
            {sruResult && (
              <div className="max-h-56 overflow-auto space-y-1.5" role="list">
                <div className="text-[11px] text-white/60">{sruResult.total} found{sruResult.total > sruResult.records.length ? `, first ${sruResult.records.length} shown` : ''}</div>
                {sruResult.records.map((r, i) => (
                  <div key={i} role="listitem" className="flex items-center gap-2 p-2 rounded-xl bg-black/30 border border-white/10">
                    <div className="flex-1 min-w-0 text-sm text-white truncate" dir="auto" title={r.title}>{r.title}</div>
                    <button type="button" onClick={() => { onImport(r.work, r.instance, r.item); onClose(); }}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 cursor-pointer">Copy</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* File Upload Drop Area */}
          <div 
            className="border-2 border-dashed border-white/30 rounded-2xl p-8 hover:border-white/60 transition-all cursor-pointer flex flex-col items-center justify-center text-center group"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
            }}
          >
            <input
              type="file"
              id="file-upload"
              className="hidden"
              accept=".mrc,.mrk,.marc,.xml,.marcxml,.json,.jsonld,.jsonl,.ndjson,.ttl,.n3,.nt,.rdf"
              onChange={handleFileSelect}
            />
            <label
              htmlFor="file-upload"
              className="flex flex-col items-center cursor-pointer w-full"
            >
              <div 
                className="w-16 h-16 rounded-full flex items-center justify-center mb-3 group-hover:scale-105 transition-all"
                style={{
                  background: 'rgba(255, 255, 255, 0.21)',
                  backdropFilter: 'blur(4.5px) blur(9px) saturate(1.5) brightness(1.1)',
                  WebkitBackdropFilter: 'blur(36px) saturate(1.8) brightness(1.15) contrast(1.05)',
                  boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.15), inset 1.5px 1.5px 0 rgba(255, 255, 255, 0.5), inset 0 0 12px rgba(255, 255, 255, 0.2), 0 8px 32px rgba(0, 0, 0, 0.25)',
                  borderRadius: '120px'
                }}
              >
                <Upload className="h-7 w-7 text-white" />
              </div>
              <span className="text-base font-semibold text-white drop-shadow">
                Click to upload or drag and drop
              </span>
              <span className="text-xs text-white/60 mt-1 font-mono">
                MARC (.mrc, .mrk, MARCXML), RDF/XML, JSON-LD, Turtle, N-Triples
              </span>
            </label>
          </div>

          {/* Selected File */}
          {selectedFile && (
            <div 
              className="p-4 rounded-2xl border border-white/20 flex items-center gap-3"
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                backdropFilter: 'blur(10px)'
              }}
            >
              {fileType === 'jsonld' && <FileJson className="h-6 w-6 text-cyan-300" />}
              {(fileType === 'xml' || fileType === 'marc') && <FileText className="h-6 w-6 text-amber-300" />}
              {fileType === 'rdf' && <FileCode className="h-6 w-6 text-purple-300" />}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white truncate">
                  {selectedFile.name}
                </div>
                <div className="text-xs text-white/70">
                  {(selectedFile.size / 1024).toFixed(2)} KB
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3.5 rounded-2xl bg-red-500/20 border border-red-500/40 text-red-200 text-xs">
              {error}
            </div>
          )}

          {/* MARC: which record to open (a Koha export can hold many) */}
          {fileType === 'marc' && marcRecords.length > 0 && !error && (
            <div>
              <label htmlFor="marc-record" className="block text-xs font-semibold text-white/80 mb-1.5 uppercase tracking-wider">
                {marcRecords.length === 1 ? 'MARC record' : `${marcRecords.length} MARC records: choose one`}
              </label>
              <select
                id="marc-record"
                value={marcIndex}
                onChange={(e) => setMarcIndex(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl text-sm bg-black/40 border border-white/20 text-white"
              >
                {marcRecords.map((r, i) => <option key={i} value={i}>{i + 1}. {r.title}</option>)}
              </select>
              {/* A whole Koha export at once: each record is checked for duplicates and saved as its own record. */}
              {marcRecords.length > 1 && !batchResult && (
                <button
                  type="button"
                  onClick={handleSaveAll}
                  disabled={batchProgress !== null}
                  className="mt-3 w-full px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-wait cursor-pointer"
                >
                  {batchProgress
                    ? `Saving ${batchProgress.done} of ${batchProgress.total}…`
                    : `Save all ${marcRecords.length} records (skipping books already in Moon)`}
                </button>
              )}
            </div>
          )}

          {/* FOLIO's linked-data export: which Instance to open */}
          {folioRecords.length > 0 && !error && (
            <div>
              <label htmlFor="folio-record" className="block text-xs font-semibold text-white/80 mb-1.5 uppercase tracking-wider">
                {folioRecords.length === 1 ? 'FOLIO record' : `${folioRecords.length} FOLIO records: choose one`}
              </label>
              <select
                id="folio-record"
                value={folioIndex}
                onChange={(e) => setFolioIndex(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl text-sm bg-black/40 border border-white/20 text-white"
              >
                {folioRecords.map((r, i) => <option key={i} value={i}>{i + 1}. {r.title}{r.hrid ? ` (${r.hrid})` : ''}</option>)}
              </select>
            </div>
          )}

          {batchResult && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-400/40 text-xs text-white/90 space-y-1.5" role="status">
              <div className="font-bold text-emerald-200">
                Saved {batchResult.saved.length} · already in Moon {batchResult.duplicates.length} · failed {batchResult.failed.length}
              </div>
              {batchResult.saved.some((s) => s.status === 'pending-review') && (
                <div>New records wait for review before they appear in the catalogue.</div>
              )}
              {batchResult.duplicates.length > 0 && (
                <details><summary className="cursor-pointer">Skipped as duplicates</summary>
                  <ul className="mt-1 list-disc ps-5">{batchResult.duplicates.map((d, i) => <li key={i}>{d.title} (matches “{d.existing}”)</li>)}</ul>
                </details>
              )}
              {batchResult.failed.length > 0 && (
                <details open><summary className="cursor-pointer text-red-200">Not saved</summary>
                  <ul className="mt-1 list-disc ps-5">{batchResult.failed.map((f, i) => <li key={i}>{f.title}: {f.error}</li>)}</ul>
                </details>
              )}
              {batchResult.saved.length > 0 && (
                <AuthorityReportPanel recordIds={batchResult.saved.map((s) => s.id)} rtl={document.documentElement.dir === 'rtl'} />
              )}
            </div>
          )}

          {/* Preview */}
          {fileContent && !error && fileType === 'jsonld' && (
            <div>
              <h3 className="text-xs font-semibold text-white/80 mb-1.5 uppercase tracking-wider">
                Preview:
              </h3>
              <pre className="bg-black/40 border border-white/10 text-emerald-300 p-3 rounded-xl overflow-auto max-h-40 text-xs font-mono">
                {fileContent.substring(0, 400)}
                {fileContent.length > 400 && '\n...(truncated)'}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-xs font-bold text-white hover:bg-white/10 transition-all cursor-pointer"
            style={{
              borderRadius: '120px',
              border: '1px solid rgba(255, 255, 255, 0.25)',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!selectedFile || !!error}
            className="px-6 py-2.5 text-xs font-black text-white transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 flex items-center gap-2"
            style={{
              borderRadius: '120px',
              background: 'rgba(255, 255, 255, 0.21)',
              backdropFilter: 'blur(4.5px) blur(9px) saturate(1.5) brightness(1.1)',
              WebkitBackdropFilter: 'blur(36px) saturate(1.8) brightness(1.15) contrast(1.05)',
              boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.15), inset 1.5px 1.5px 0 rgba(255, 255, 255, 0.5), inset 0 0 12px rgba(255, 255, 255, 0.2), 0 8px 32px rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(255, 255, 255, 0.4)'
            }}
          >
            <Upload className="h-4 w-4" />
            <span>Import Record</span>
          </button>
        </div>
      </div>
    </div>
  );
}
