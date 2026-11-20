/**
 * Technical services > New record: choose the kind of material first, then print or electronic; the editor
 * then opens on the matching template with its content, media and carrier filled in (utils/materialTypes.ts).
 * At /new/ (and /new/?marc=1 to open the MARC 21 editor tab).
 */
import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { BookOpen, Newspaper, Map, Archive, Stamp, Image, Gem, Printer, Globe, ArrowRight, ArrowLeft } from 'lucide-react';
import { MATERIALS, type Material, type CarrierKind } from '../utils/materialTypes';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  book: BookOpen, journal: Newspaper, map: Map, manuscript: Archive, stamp: Stamp, picture: Image,
  'rare-book': BookOpen, 'rare-journal': Newspaper, 'rare-map': Map, 'rare-picture': Image,
};

const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.6)',
  borderRadius: 16,
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.9)',
};

export function NewRecordChooser({ isAr, marc, onStart }: {
  isAr: boolean;
  /** Opened from "MARC 21 editor": the editor opens on its MARC tab. */
  marc?: boolean;
  onStart: (material: Material, carrier: CarrierKind) => void;
}) {
  const [picked, setPicked] = useState<Material | null>(null);
  // On a phone the print / electronic buttons are below the cards: bring them into view after a pick.
  const choiceRef = useRef<HTMLElement>(null);
  const pick = (m: Material) => {
    setPicked(m);
    requestAnimationFrame(() => choiceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };
  const Next = isAr ? ArrowLeft : ArrowRight;

  const card = (m: Material) => {
    const Icon = ICONS[m.id] || BookOpen;
    const on = picked?.id === m.id;
    return (
      <li key={m.id}>
        <motion.button
          whileHover={{ y: -2 }}
          onClick={() => pick(m)}
          aria-pressed={on}
          className="w-full h-full text-start p-4 flex flex-col gap-1.5 cursor-pointer"
          style={{ ...glass, ...(on ? { border: '2px solid #0f172a', background: 'rgba(255,255,255,0.85)' } : {}) }}
        >
          <span className="flex items-center gap-2 font-bold text-slate-900">
            <Icon className="h-5 w-5 text-slate-700" />
            {isAr ? m.ar : m.en}
            {m.rare && <Gem className="h-3.5 w-3.5 text-slate-500" aria-label={isAr ? 'نادر' : 'rare'} />}
          </span>
          <span className="text-xs text-slate-600">{isAr ? m.arNote : m.enNote}</span>
        </motion.button>
      </li>
    );
  };

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
      <h1 className="text-2xl font-black text-slate-900">{isAr ? 'تسجيلة جديدة' : 'New record'}</h1>
      <p className="text-sm text-slate-600 mb-6">
        {isAr ? 'اختر نوع الوعاء أولًا، ثم مطبوع أو إلكتروني.' : 'Choose the kind of material first, then print or electronic.'}
        {marc && (isAr ? ' سيفتح المحرر على تبويب مارك 21.' : ' The editor will open on the MARC 21 tab.')}
      </p>

      <h2 className="text-sm font-bold text-slate-700 mb-2">{isAr ? 'أوعية المعلومات' : 'Materials'}</h2>
      <ul className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">{MATERIALS.filter((m) => !m.rare).map(card)}</ul>

      <h2 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5"><Gem className="h-4 w-4" />{isAr ? 'المواد النادرة' : 'Rare materials'}</h2>
      <ul className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">{MATERIALS.filter((m) => m.rare).map(card)}</ul>

      <section ref={choiceRef} aria-live="polite" className="p-5 flex flex-col sm:flex-row sm:items-center gap-3" style={glass}>
        <p className="flex-1 text-sm font-bold text-slate-800">
          {picked
            ? (isAr ? `${picked.ar}: مطبوع أم إلكتروني؟` : `${picked.en}: print or electronic?`)
            : (isAr ? 'اختر نوع الوعاء أعلاه.' : 'Choose a kind of material above.')}
        </p>
        {(['print', 'electronic'] as CarrierKind[]).map((c) => {
          const Icon = c === 'print' ? Printer : Globe;
          return (
            <button
              key={c}
              disabled={!picked}
              onClick={() => picked && onStart(picked, c)}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: '#0f172a', color: '#ffffff' }}
            >
              <Icon className="h-4 w-4" />
              {c === 'print' ? (isAr ? 'مطبوع' : 'Print') : (isAr ? 'إلكتروني' : 'Electronic')}
              <Next className="h-4 w-4" />
            </button>
          );
        })}
      </section>
    </main>
  );
}
