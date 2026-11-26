/**
 * The record's copies in Moon Studio: one row per physical copy (library, location, shelf mark,
 * barcode, copy number, reference only, note). Saved with the record as bf:Item nodes of the Instance,
 * and shown to readers in the OPAC.
 */
import React from 'react';
import { Plus, Trash2, Library } from 'lucide-react';
import { ItemCopy, emptyCopy } from '../../services/itemCopies';
import { TransmissionPanel } from './TransmissionPanel';
import { CopyConditionPanel } from './CopyConditionPanel';

interface Props {
  copies: ItemCopy[];
  instanceId: string;
  language: 'en' | 'ar' | string;
  onChange: (copies: ItemCopy[]) => void;
}

export function CopiesPanel({ copies, instanceId, language, onChange }: Props) {
  const ar = language === 'ar';
  const L = ar
    ? { title: 'النسخ', none: 'لا نسخ مسجلة لهذه الطبعة.', add: 'إضافة نسخة', library: 'المكتبة', location: 'المكان (القاعة / الطابق)', shelfMark: 'رقم الرف', barcode: 'الباركود', accession: 'رقم التزويد', copy: 'رقم النسخة', ref: 'للاطلاع فقط', note: 'ملاحظة', remove: 'حذف النسخة' }
    : { title: 'Copies', none: 'No copies recorded for this edition.', add: 'Add copy', library: 'Library', location: 'Location (room / floor)', shelfMark: 'Shelf mark', barcode: 'Barcode', accession: 'Accession no.', copy: 'Copy no.', ref: 'Reference only', note: 'Note', remove: 'Remove copy' };

  const set = (i: number, patch: Partial<ItemCopy>) => onChange(copies.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const box: React.CSSProperties = { borderRadius: 16, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.25)' };
  const input = 'w-full min-w-0 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/50 outline-none focus:ring-1 focus:ring-white/60';
  const inputStyle: React.CSSProperties = { background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.2)' };

  return (
    <div className="p-3 space-y-3" style={box} dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Library className="h-4 w-4" /> {L.title} {copies.length > 0 && <span className="text-white/60">({copies.length})</span>}
        </div>
        <button type="button" onClick={() => onChange([...copies, emptyCopy(instanceId, copies[copies.length - 1])])}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-white hover:bg-white/20" style={box}>
          <Plus className="h-3.5 w-3.5" /> {L.add}
        </button>
      </div>
      {copies.length === 0 && <p className="text-xs text-white/70">{L.none}</p>}
      {copies.map((c, i) => (
        <div key={c.id} className="grid grid-cols-2 md:grid-cols-4 gap-2 p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <input className={input} style={inputStyle} placeholder={L.library} value={c.library} onChange={(e) => set(i, { library: e.target.value })} dir="auto" />
          <input className={input} style={inputStyle} placeholder={L.location} value={c.location} onChange={(e) => set(i, { location: e.target.value })} dir="auto" />
          <input className={input} style={inputStyle} placeholder={L.shelfMark} value={c.shelfMark} onChange={(e) => set(i, { shelfMark: e.target.value })} dir="ltr" />
          <input className={input} style={inputStyle} placeholder={L.barcode} value={c.barcode} onChange={(e) => set(i, { barcode: e.target.value })} dir="ltr" inputMode="numeric" />
          <input className={input} style={inputStyle} placeholder={L.copy} value={c.copyNumber} onChange={(e) => set(i, { copyNumber: e.target.value })} dir="ltr" />
          <input className={input} style={inputStyle} placeholder={L.accession} value={c.accession || ''} onChange={(e) => set(i, { accession: e.target.value })} dir="ltr" />
          <input className={`${input} md:col-span-2`} style={inputStyle} placeholder={L.note} value={c.note} onChange={(e) => set(i, { note: e.target.value })} dir="auto" />
          <div className="flex items-center justify-between gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-white cursor-pointer">
              <input type="checkbox" checked={c.referenceOnly} onChange={(e) => set(i, { referenceOnly: e.target.checked })} /> {L.ref}
            </label>
            <button type="button" title={L.remove} aria-label={L.remove} onClick={() => onChange(copies.filter((_, k) => k !== i))}
              className="p-1.5 rounded-full text-white/80 hover:bg-white/20">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* A manuscript's notes: ijāzāt, samāʿāt, ownership, waqf … as events of this copy. */}
          <div className="col-span-2 md:col-span-4">
            <TransmissionPanel itemId={c.id} events={c.events || []} ar={ar} onChange={(events) => set(i, { events })} />
          </div>
          {/* Binding, condition, seals and marks, and what was done to the copy (ARM 1.0, S24). */}
          <div className="col-span-2 md:col-span-4">
            <CopyConditionPanel ar={ar} value={{ binding: c.binding, condition: c.condition, marks: c.marks, actions: c.actions }} onChange={(next) => set(i, next)} />
          </div>
        </div>
      ))}
    </div>
  );
}
