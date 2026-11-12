// Server v3.1 - enterprise pattern: env-only API key, redeployed with fresh secret
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { parseJSONLD } from "./rdfParser.tsx";
import ontology from "./ontology.tsx";
import engine from "./engine.tsx";
import { loadExampleData, getExample, getAllExamples, getExampleKeys } from "./examples.tsx";
import * as locAuth from "./locAuthorityService.tsx";
import * as locSparql from "./locSparqlService.tsx";
import * as ontologyEngine from "./bibframeOntologyEngine.tsx";
import * as graphBuilder from "./graphBuilder.tsx";
import * as moonRecords from "./moonRecords.tsx";
import * as authorities from "./authorities.tsx";
import { ENTITY_KINDS, AGENT_TYPES, isEntityKind, entityPageParams } from "./entityDocument.tsx";
import * as tripleStore from "./tripleStore.tsx";
import * as versioning from "./versioning.tsx";
import * as discovery from "./discovery.tsx";
import * as multiTenant from "./multiTenant.tsx";
import { BIBFRAME_SHAPES, getSHACLShapesAsTurtle } from "./shaclShapes.tsx";
import * as authMiddleware from "./authMiddleware.tsx";
import * as dataIsolation from "./dataIsolation.tsx";
import * as shaclValidator from "./shaclValidator.tsx";
import * as authorityMergeIntegrity from "./authorityMergeIntegrity.tsx";
import * as jwtAuth from "./jwtAuth.tsx";
import * as observability from "./observability.tsx";
import * as loadTesting from "./loadTesting.tsx";
import recordRoutes from "./recordRoutes.tsx";
import accountRoutes, { getSession, isAdminSession, canReview, isReviewer, SUPER_ADMIN_USERNAME, libraryOf } from "./accountRoutes.tsx";
import { applyOwnership, withOwners, withoutOwners, blockedMessage } from "./protectedValues.tsx";
import * as recordStore from "./recordStore.tsx";
import * as linkedData from "./linkedData.tsx";
import * as sparqlStore from "./sparqlEndpoint.tsx";
import { missingForPublish, shapesFromProfile } from "./publishGate.tsx";
import { PROFILES } from "./profiles.tsx";
import { profileToDctap, dctapToProfile } from "./dctap.tsx";
import { findNewSampleBooks } from "./sampleBooks.tsx";
import { oaiResponse } from "./oaiPmh.tsx";
import { changeFeed } from "./changeFeed.tsx";
import { handleMcp } from "./mcp.tsx";
import { vocabDocument } from "./specialVocab.tsx";
import { openRecords, cleanLicence, voidDocument, voidTurtle } from "./licence.tsx";
import { askMoon, askRecordOf, dayKey, underCap, MAX_QUESTION } from "./askMoon.tsx";
import { askEnabled, planWithClaude, answerWithClaude } from "./askClaude.tsx";
import { buildIndex, suggestSubjects, finderRecordOf } from "./subjectFinder.tsx";
import { checkLinks } from "./linkChecker.tsx";
import * as labelCache from "./labelCache.tsx";

/** One run of the label cache refresh (S19): LC's change feed and Wikidata's modified times since the last run. */
async function refreshLabelCache() {
  const [records, entities, cachedRows] = await Promise.all([recordStore.listPublishedRecords(), recordStore.listAllAuthorities(), recordStore.allCachedLabels()]);
  const uris = labelCache.outsideUris([...records.map((r: any) => r.document), ...entities.map((e: any) => e.sameAs || [])]);
  const cached = new Map(cachedRows.map((r) => [r.uri, r]));
  const now = new Date();
  const since = (await recordStore.labelState("lc-feed-read")) || new Date(now.getTime() - labelCache.STALE_DAYS * 86_400_000).toISOString();
  // What went wrong, per site (the first few), so a run that could not reach LC or Wikidata says why.
  const problems: Record<string, string[]> = {};
  const fetchJson = async (url: string) => {
    const host = new URL(url).hostname;
    const note = (p: string) => { const l = (problems[host] ||= []); if (l.length < 3) l.push(p); };
    try {
      // id.loc.gov answers http with a redirect to https: ask https directly.
      const r = await fetch(url.replace(/^http:\/\/id\.loc\.gov\//, "https://id.loc.gov/"), {
        headers: { Accept: "application/json", "User-Agent": "Moon/1 (https://mooon.site; catalogue label cache)" }, signal: AbortSignal.timeout(15_000),
      });
      if (r.ok) return await r.json();
      if (r.status === 404) return [];
      note(`${r.status} ${url.slice(0, 120)}`);
      return null;
    } catch (e) { note(`${e instanceof Error ? e.message : String(e)} ${url.slice(0, 120)}`); return null; }
  };
  const result = await labelCache.refreshLabels(uris, cached, { fetchJson, now, since, sources: ["wikidata"] });
  await recordStore.storeLabels(result.rows);
  return { addresses: uris.length, cachedBefore: cachedRows.length, fetched: result.rows.length, wikidataChanged: result.wikidataChanged, at: now.toISOString(), ...(Object.keys(problems).length ? { problems } : {}) };
}
import * as webhooks from "./webhooks.tsx";

/** Tells the webhooks (S19) about a record event, in the background; a failing hook never fails the save. */
function fireHooks(event: webhooks.HookEvent, record: { id: string; title?: string; version?: number; status?: string }) {
  const job = (async () => {
    const hooks = webhooks.parseHooks(await kv.get(webhooks.HOOKS_KEY).catch(() => null));
    if (!hooks.length) return;
    const results = await webhooks.deliver(hooks, event, webhooks.hookPayload(event, record, linkedData.BASE_URI, new Date().toISOString()));
    const failed = results.filter((r) => r.status === 0 || r.status >= 400);
    if (failed.length) console.warn(`[webhooks] ${event} ${record.id}: ${failed.map((r) => `${r.id}=${r.status}`).join(', ')}`);
  })().catch((e) => console.warn('[webhooks] failed:', e));
  try { (globalThis as any).EdgeRuntime?.waitUntil?.(job); } catch { /* not on Supabase: the promise still runs */ }
}
import { isniSearchUrl, parseIsni } from "./isni.tsx";
import { sruTargets, sruUrl, sruSummary } from "./sru.tsx";
import { reconcile, manifest } from "./reconcile.tsx";
import { linkAuthorities, mirrorOutsideLinked, headingsOf, moonAuthorityId, authorityReport } from "./authorityLinking.tsx";
import { relatedFrom, resolveRelated } from "./entityRelations.tsx";
import { isBot, visitFrom, visitDay, visitorKey } from "./opacVisits.tsx";
import { bookFactsOf, bookPageHtml, booksText } from "./seoPages.tsx";
import { isRelationTerm, readWorkRelations, withoutRelation, withRelation, workNodeOf } from "./workRelations.tsx";
import { byRecord, parseCopiesTable, planImport, withCopies } from "./copiesImport.tsx";
import { applyNote, NOTE_PREFIX, parseNoteAction, queueOf } from "./reconcileQueue.tsx";
import { baghdadHour, countryFrom, MAX_SEARCHES_PER_VISITOR_DAY, parseEvent } from "./opacInsights.tsx";
import { buildFolioInstance, folioClient, loadReference, sendInstance, instanceHash, type FolioConfig, type FolioRef, type FolioLink } from "./folio.tsx";
import { marcProblems, sendMarc } from "./folioMarc.tsx";
import { applyTemplateSave, type Template } from "./templatePolicy.tsx";
import { applyDecision, parseDecisions, DECISIONS_KEY } from "./workDecisions.tsx";
import { withoutPrivateData, cleanPreferred } from "./nameForms.tsx";
import { auditNTriples } from "./ldAudit.tsx";
import { upgradeLegacyTerms } from "./publishedOutput.tsx";
import * as BF_TERMS from "./bibframeTerms.generated.tsx";
import { seal, unseal, settingsProblems, publicSettings, type FolioSettings } from "./folioSettings.tsx";
import * as aiEngine from "./aiEngine.tsx";
import * as aiRouter from "./aiRouter.tsx";
import * as ld4 from "./ld4Integration.tsx";
import { liveRoomUrl, liveTicketsEnabled, signLiveTicket } from "./liveTicket.tsx";

const app = new Hono();

// 🚀 BOOT SEQUENCE - Initialize Moon Engine with correct dependency order
let bootComplete = false;

async function bootMoonEngine() {
  console.log('='.repeat(60));
  console.log('🌙 MOON ENGINE BOOT SEQUENCE STARTING');
  console.log('='.repeat(60));
  
  try {
    // 1️⃣ Load Ontology Schema First
    console.log('[BOOT] Step 1: Loading BIBFRAME Ontology Schema...');
    await ontology.loadSchema();
    
    if (!ontology.isInitialized()) {
      throw new Error('Ontology failed to initialize');
    }
    console.log('[BOOT] ✅ Ontology loaded successfully');
    
    // 2️⃣ Initialize Engine with Ontology
    console.log('[BOOT] Step 2: Initializing Moon Engine...');
    await engine.initialize();
    
    if (!engine.isInitialized()) {
      throw new Error('Engine failed to initialize');
    }
    console.log('[BOOT] ✅ Engine initialized successfully');
    
    // 3️⃣ Load Example Data
    console.log('[BOOT] Step 3: Loading example datasets...');
    await loadExampleData();
    console.log('[BOOT] ✅ Example data loaded successfully');
    
    bootComplete = true;
    
    console.log('='.repeat(60));
    console.log('🎉 MOON ENGINE READY - All systems operational');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('='.repeat(60));
    console.error('❌ MOON ENGINE BOOT FAILED');
    console.error('='.repeat(60));
    console.error('Error:', error);
    throw error;
  }
}

// Start boot sequence immediately
bootMoonEngine().catch(err => {
  console.error('Fatal boot error:', err);
  Deno.exit(1);
});

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "X-Moon-Session"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Routes that spend paid API credit (AI providers, ISBNdb) or change stored data need a signed-in
// Moon session; changing the AI provider setup is the Super Admin's. The public key in the website
// is not a credential: anyone can read it from the page.
const API_PREFIX = "/make-server-49c0e13c";
const SESSION_ANY_METHOD = ["/ai/", "/ai-router/", "/isbndb/"];
const SESSION_WRITES = [
  "/favorites", "/moon/authorities/import", "/moon/triplestore/", "/moon/versions/", "/moon/discovery/import",
  "/ld4/", "/import-bibframe-rdf", "/authority/clear-cache",
];
const ADMIN_ONLY = ["/ai-router/config", "/ai-router/reset-circuit/"];
app.use(`${API_PREFIX}/*`, async (c, next) => {
  if (c.req.method === "OPTIONS") return next();
  const path = c.req.path.slice(API_PREFIX.length);
  const write = c.req.method !== "GET";
  if (write && ADMIN_ONLY.some(p => path.startsWith(p))) {
    if (!(await isAdminSession(c))) return c.json({ error: "Super Admin session required" }, 403);
  } else if (SESSION_ANY_METHOD.some(p => path.startsWith(p)) || (write && SESSION_WRITES.some(p => path.startsWith(p)))) {
    if (!(await getSession(c))) return c.json({ error: "Sign in to use this feature" }, 401);
  }
  return next();
});

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// Health check endpoint
app.get("/make-server-49c0e13c/health", (c) => {
  return c.json({ status: "ok" });
});

// 📚 New sample books for the Super Admin's "Add sample books": real books from Open Library that Moon does
// not have yet (no record, deleted or not, has their ISBN). ?count= how many (1–25, default 10).
app.get("/make-server-49c0e13c/samples/books", async (c) => {
  if (!(await isAdminSession(c))) return c.json({ error: "Super Admin session required" }, 403);
  try {
    const count = Math.min(Math.max(Number(c.req.query("count")) || 10, 1), 25);
    const { data, error } = await (supabase as any).from("records").select("identifier_keys");
    if (error) throw new Error(error.message);
    const known = new Set<string>((data || []).flatMap((r: any) => (r.identifier_keys || []) as string[])
      .filter((k: string) => k.startsWith("isbn:")).map((k: string) => k.slice(5)));
    return c.json({ books: await findNewSampleBooks(count, known) });
  } catch (e) {
    console.error("Sample books error:", e);
    return c.json({ error: "Could not find new books" }, 500);
  }
});

// 💾 How much of the backend's space Moon uses (database and file storage), for the Super Admin. The limits
// are the Supabase plan's: 500 MB database and 1 GB files on the free plan; set MOON_DB_LIMIT_MB and
// MOON_STORAGE_LIMIT_MB when the plan changes.
app.get("/make-server-49c0e13c/admin/storage", async (c) => {
  if (!(await isAdminSession(c))) return c.json({ error: "Super Admin session required" }, 403);
  try {
    const { data, error } = await (supabase as any).rpc("moon_storage_usage");
    if (error) throw new Error(error.message);
    const mb = (name: string, fallback: number) => Math.max(Number(Deno.env.get(name)) || fallback, 1) * 1024 * 1024;
    return c.json({ ...data, databaseLimitBytes: mb("MOON_DB_LIMIT_MB", 500), storageLimitBytes: mb("MOON_STORAGE_LIMIT_MB", 1024) });
  } catch (e) {
    console.error("Storage usage error:", e);
    return c.json({ error: "Could not read storage use" }, 500);
  }
});

// 🩺 Linked-data audit (Phase 12): the published catalogue measured against BIBFRAME 3.0.1 and linked-data rules,
// for the Super Admin's scorecard. Same code as CI and the nightly job (ldAudit.tsx).
app.get("/make-server-49c0e13c/admin/ld-audit", async (c) => {
  if (!(await isAdminSession(c))) return c.json({ error: "Super Admin session required" }, 403);
  try {
    const nt = await loadPublishedNTriples();
    const entities = await recordStore.authorityStats();
    return c.json(auditNTriples(nt, {
      bfClasses: BF_TERMS.BF_CLASSES, bfObject: BF_TERMS.BF_OBJECT_PROPERTIES, bfData: BF_TERMS.BF_DATATYPE_PROPERTIES,
      bflcClasses: BF_TERMS.BFLC_CLASSES, bflcObject: BF_TERMS.BFLC_OBJECT_PROPERTIES, bflcData: BF_TERMS.BFLC_DATATYPE_PROPERTIES,
    }, entities));
  } catch (e) {
    console.error("Linked-data audit error:", e);
    return c.json({ error: "Could not run the audit" }, 500);
  }
});


// Cataloguing profiles (LC Marva JSON) and the SHACL shapes the publish gate enforces, both public.
app.get("/make-server-49c0e13c/profiles/:id", (c) => {
  const profile = PROFILES[c.req.param("id")];
  return profile ? c.json(profile) : c.json({ error: "No such profile" }, 404);
});
app.get("/make-server-49c0e13c/profiles/:id/shapes.ttl", (c) => {
  const profile = PROFILES[c.req.param("id")];
  if (!profile) return c.json({ error: "No such profile" }, 404);
  return c.body(shapesFromProfile(profile), 200, { "Content-Type": "text/turtle; charset=utf-8" });
});
// The same profile as a DCTAP table (CSV), the form LC's profile editor Dancer (bibframe.org/dancer) uses.
// Registered before /profiles/:id so "dctap" is not read as a profile id.
app.post("/make-server-49c0e13c/profiles/dctap/convert", async (c) => {
  // A DCTAP table (edited in Dancer, or LC's own Marva table) → a profile in Marva's JSON form. Nothing is stored.
  const text = await c.req.text();
  if (!text.trim()) return c.json({ error: "Send the DCTAP table (CSV) as the request body" }, 400);
  if (text.length > 5_000_000) return c.json({ error: "The table is larger than 5 MB" }, 413);
  try {
    const id = (c.req.query("id") || "moon:Imported").slice(0, 80);
    const profile = dctapToProfile(text, { id, title: (c.req.query("title") || id).slice(0, 200) });
    return c.json(profile, 200, { "Access-Control-Allow-Origin": "*" });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
app.get("/make-server-49c0e13c/profiles/:id/dctap.csv", (c) => {
  const profile = PROFILES[c.req.param("id")];
  if (!profile) return c.json({ error: "No such profile" }, 404);
  return c.body(profileToDctap(profile), 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="moon-${c.req.param("id")}.dctap.csv"`,
    "Access-Control-Allow-Origin": "*",
  });
});

// 🌙 Moon Engine Status Endpoint
app.get("/make-server-49c0e13c/engine/status", (c) => {
  if (!bootComplete) {
    return c.json({ 
      status: 'booting',
      message: 'Moon Engine is still initializing...'
    }, 503);
  }
  
  const status = engine.getStatus();
  return c.json({
    status: 'operational',
    bootComplete,
    engine: status,
    ontology: {
      initialized: ontology.isInitialized(),
      version: ontology.getSchema()?.version
    }
  });
});

// 🔍 Get Ontology Schema
app.get("/make-server-49c0e13c/engine/ontology", (c) => {
  if (!bootComplete) {
    return c.json({ error: 'Engine not ready' }, 503);
  }
  
  const schema = ontology.getSchema();
  return c.json(schema);
});

// 📊 Get Class Information
app.get("/make-server-49c0e13c/engine/class/:className", (c) => {
  if (!bootComplete) {
    return c.json({ error: 'Engine not ready' }, 503);
  }
  
  const className = c.req.param('className');
  const classInfo = ontology.getClass(className);
  
  if (!classInfo) {
    return c.json({ error: 'Class not found' }, 404);
  }
  
  return c.json(classInfo);
});

// 🔗 Get Property Information
app.get("/make-server-49c0e13c/engine/property/:propertyName", (c) => {
  if (!bootComplete) {
    return c.json({ error: 'Engine not ready' }, 503);
  }
  
  const propertyName = c.req.param('propertyName');
  const propertyInfo = ontology.getProperty(propertyName);
  
  if (!propertyInfo) {
    return c.json({ error: 'Property not found' }, 404);
  }
  
  return c.json(propertyInfo);
});

// 📝 Process BIBFRAME Entity
app.post("/make-server-49c0e13c/engine/process", async (c) => {
  if (!bootComplete) {
    return c.json({ error: 'Engine not ready' }, 503);
  }
  
  try {
    const entity = await c.req.json();
    const result = await engine.process(entity);
    
    return c.json(result);
  } catch (error) {
    console.error('Process entity error:', error);
    return c.json({ 
      success: false,
      errors: [error instanceof Error ? error.message : String(error)]
    }, 500);
  }
});

// 📚 Get Example Data
app.get("/make-server-49c0e13c/engine/examples", (c) => {
  if (!bootComplete) {
    return c.json({ error: 'Engine not ready' }, 503);
  }
  
  const keys = getExampleKeys();
  return c.json({ 
    examples: keys,
    count: keys.length
  });
});

// 📖 Get Specific Example
app.get("/make-server-49c0e13c/engine/example/:key", (c) => {
  if (!bootComplete) {
    return c.json({ error: 'Engine not ready' }, 503);
  }
  
  const key = c.req.param('key');
  const example = getExample(key);
  
  if (!example) {
    return c.json({ error: 'Example not found' }, 404);
  }
  
  return c.json(example);
});

// ════════════════════���══════════════════════════════════════
// 🔗 LOC LINKED DATA API INTEGRATION
// ═══════════════���═══════════════════════════════════════════

// 🔍 Search LC Name Authority (LCNAF)
app.get("/make-server-49c0e13c/authority/names", async (c) => {
  try {
    const query = c.req.query('q');
    
    if (!query) {
      return c.json({ error: 'Query parameter required' }, 400);
    }
    
    const results = await locAuth.searchNames(query);
    return c.json({ results, count: results.length });
  } catch (error) {
    console.error('LCNAF search error:', error);
    return c.json({ error: 'Search failed', results: [] }, 500);
  }
});

// 📚 Search LC Subject Headings (LCSH)
app.get("/make-server-49c0e13c/authority/subjects", async (c) => {
  try {
    const query = c.req.query('q');
    
    if (!query) {
      return c.json({ error: 'Query parameter required' }, 400);
    }
    
    const results = await locAuth.searchSubjects(query);
    return c.json({ results, count: results.length });
  } catch (error) {
    console.error('LCSH search error:', error);
    return c.json({ error: 'Search failed', results: [] }, 500);
  }
});

// 🎭 Search LC Genre/Form Terms (LCGFT)
app.get("/make-server-49c0e13c/authority/genreforms", async (c) => {
  try {
    const query = c.req.query('q');
    
    if (!query) {
      return c.json({ error: 'Query parameter required' }, 400);
    }
    
    const results = await locAuth.searchGenreForms(query);
    return c.json({ results, count: results.length });
  } catch (error) {
    console.error('LCGFT search error:', error);
    return c.json({ error: 'Search failed', results: [] }, 500);
  }
});

// 📊 Search LC Classification (LCC)
app.get("/make-server-49c0e13c/authority/classification", async (c) => {
  try {
    const query = c.req.query('q');
    
    if (!query) {
      return c.json({ error: 'Query parameter required' }, 400);
    }
    
    const results = await locAuth.searchClassification(query);
    return c.json({ results, count: results.length });
  } catch (error) {
    console.error('LCC search error:', error);
    return c.json({ error: 'Search failed', results: [] }, 500);
  }
});

// 🧠 Smart Authority Lookup (Auto-detect based on property range)
app.get("/make-server-49c0e13c/authority/smart", async (c) => {
  try {
    const query = c.req.query('q');
    const propertyRange = c.req.query('range') || 'bf:Agent';
    
    if (!query) {
      return c.json({ error: 'Query parameter required' }, 400);
    }
    
    const results = await locAuth.smartAuthorityLookup(query, propertyRange);
    return c.json({ results, count: results.length });
  } catch (error) {
    console.error('Smart authority lookup error:', error);
    return c.json({ error: 'Search failed', results: [] }, 500);
  }
});

// 📖 Fetch BIBFRAME Work from LOC
app.get("/make-server-49c0e13c/bibframe/work/:workId", async (c) => {
  try {
    const workId = c.req.param('workId');
    const work = await locAuth.fetchBIBFRAMEWork(workId);
    
    if (!work) {
      return c.json({ error: 'Work not found' }, 404);
    }
    
    return c.json(work);
  } catch (error) {
    console.error('Fetch BIBFRAME work error:', error);
    return c.json({ error: 'Failed to fetch work' }, 500);
  }
});

// 📚 Fetch BIBFRAME Instance from LOC
app.get("/make-server-49c0e13c/bibframe/instance/:instanceId", async (c) => {
  try {
    const instanceId = c.req.param('instanceId');
    const instance = await locAuth.fetchBIBFRAMEInstance(instanceId);
    
    if (!instance) {
      return c.json({ error: 'Instance not found' }, 404);
    }
    
    return c.json(instance);
  } catch (error) {
    console.error('Fetch BIBFRAME instance error:', error);
    return c.json({ error: 'Failed to fetch instance' }, 500);
  }
});

// 🔎 SPARQL Query Endpoint
app.post("/make-server-49c0e13c/sparql/query", async (c) => {
  try {
    const { query } = await c.req.json();
    
    if (!query) {
      return c.json({ error: 'SPARQL query required' }, 400);
    }
    
    const results = await locAuth.runSPARQLQuery(query);
    return c.json(results);
  } catch (error) {
    console.error('SPARQL query error:', error);
    return c.json({ error: 'Query failed' }, 500);
  }
});

// 🔍 Find Related Works (SPARQL)
app.get("/make-server-49c0e13c/sparql/related/:workUri", async (c) => {
  try {
    const workUri = decodeURIComponent(c.req.param('workUri'));
    const results = await locSparql.findRelatedWorks(workUri);
    return c.json({ results, count: results.length });
  } catch (error) {
    console.error('Find related works error:', error);
    return c.json({ error: 'Search failed', results: [] }, 500);
  }
});

// 🔎 Detect Duplicates (SPARQL)
app.get("/make-server-49c0e13c/sparql/duplicates", async (c) => {
  try {
    const title = c.req.query('title');
    const creator = c.req.query('creator');
    
    if (!title) {
      return c.json({ error: 'Title parameter required' }, 400);
    }
    
    const results = await locSparql.detectDuplicates(title, creator);
    return c.json({ results, count: results.length });
  } catch (error) {
    console.error('Duplicate detection error:', error);
    return c.json({ error: 'Search failed', results: [] }, 500);
  }
});

// 📚 Work Clustering (FRBR-style)
app.get("/make-server-49c0e13c/sparql/cluster/:workUri", async (c) => {
  try {
    const workUri = decodeURIComponent(c.req.param('workUri'));
    const results = await locSparql.clusterWorks(workUri);
    return c.json({ results, count: results.length });
  } catch (error) {
    console.error('Work clustering error:', error);
    return c.json({ error: 'Clustering failed', results: [] }, 500);
  }
});

// 🌐 Advanced Discovery Search
app.post("/make-server-49c0e13c/sparql/discover", async (c) => {
  try {
    const params = await c.req.json();
    const results = await locSparql.advancedDiscovery(params);
    return c.json({ results, count: results.length });
  } catch (error) {
    console.error('Advanced discovery error:', error);
    return c.json({ error: 'Discovery failed', results: [] }, 500);
  }
});

// ═══════════════════════════════════════════════════════════
// 🧠 ONTOLOGY ENGINE INTEGRATION
// ═══════════════════════════════════════════════════════════

// 🔗 Get Authority Service for Property
app.get("/make-server-49c0e13c/ontology/authority-service/:propertyUri", (c) => {
  try {
    const propertyUri = decodeURIComponent(c.req.param('propertyUri'));
    const service = ontologyEngine.getAuthorityService(propertyUri);
    return c.json({ propertyUri, service });
  } catch (error) {
    console.error('Get authority service error:', error);
    return c.json({ error: 'Failed to get service' }, 500);
  }
});

// 📋 Get Properties with Authority Mapping
app.get("/make-server-49c0e13c/ontology/properties/:className", (c) => {
  try {
    const className = c.req.param('className');
    const properties = ontologyEngine.getPropertiesWithAuthorities(className);
    return c.json({ className, properties, count: properties.length });
  } catch (error) {
    console.error('Get properties error:', error);
    return c.json({ error: 'Failed to get properties' }, 500);
  }
});

// ✅ Validate BIBFRAME Record
app.post("/make-server-49c0e13c/ontology/validate", async (c) => {
  try {
    const { entity, className } = await c.req.json();
    
    if (!entity || !className) {
      return c.json({ error: 'Entity and className required' }, 400);
    }
    
    const validation = await ontologyEngine.validateBIBFRAMERecord(entity, className);
    return c.json(validation);
  } catch (error) {
    console.error('Validation error:', error);
    return c.json({ error: 'Validation failed' }, 500);
  }
});

// 🔄 Convert Literal to URI
app.post("/make-server-49c0e13c/ontology/literalToUri", async (c) => {
  try {
    const { propertyUri, literalValue } = await c.req.json();
    
    if (!propertyUri || !literalValue) {
      return c.json({ error: 'Property URI and literal value required' }, 400);
    }
    
    const uriRef = await ontologyEngine.convertLiteralToURI(propertyUri, literalValue);
    return c.json({ uriRef });
  } catch (error) {
    console.error('Convert literal error:', error);
    return c.json({ error: 'Conversion failed' }, 500);
  }
});

// 📈 Get Ontology Statistics
app.get("/make-server-49c0e13c/ontology/stats", (c) => {
  try {
    const stats = ontologyEngine.getOntologyStats();
    return c.json(stats);
  } catch (error) {
    console.error('Get stats error:', error);
    return c.json({ error: 'Failed to get stats' }, 500);
  }
});

// ═════════════════════════════════════���═════════════════════
// 🏗️ RDF GRAPH BUILDER
// ═══════════════════════════════════════════════════════════

// 🏗️ Build RDF Graph
app.post("/make-server-49c0e13c/graph/build", async (c) => {
  try {
    const { workData, instanceData, adminData } = await c.req.json();
    
    if (!workData || !instanceData || !adminData) {
      return c.json({ error: 'Work, instance, and admin data required' }, 400);
    }
    
    const graph = graphBuilder.buildRDFGraph(workData, instanceData, adminData);
    return c.json(graph);
  } catch (error) {
    console.error('Build graph error:', error);
    return c.json({ error: 'Graph build failed' }, 500);
  }
});

// ✅ Validate SPARQL Graph
app.post("/make-server-49c0e13c/graph/validate", async (c) => {
  try {
    const graph = await c.req.json();
    const validation = graphBuilder.validateSPARQLGraph(graph);
    return c.json(validation);
  } catch (error) {
    console.error('Validate graph error:', error);
    return c.json({ error: 'Validation failed' }, 500);
  }
});

// 🔄 Convert to Turtle
app.post("/make-server-49c0e13c/graph/to-turtle", async (c) => {
  try {
    const graph = await c.req.json();
    const turtle = graphBuilder.convertToTurtle(graph);
    return c.text(turtle, 200, { 'Content-Type': 'text/turtle' });
  } catch (error) {
    console.error('Convert to turtle error:', error);
    return c.json({ error: 'Conversion failed' }, 500);
  }
});

// 📊 Get Graph Statistics
app.post("/make-server-49c0e13c/graph/stats", async (c) => {
  try {
    const graph = await c.req.json();
    const stats = graphBuilder.getGraphStats(graph);
    return c.json(stats);
  } catch (error) {
    console.error('Get graph stats error:', error);
    return c.json({ error: 'Failed to get stats' }, 500);
  }
});

// 📈 Authority Cache Statistics
app.get("/make-server-49c0e13c/authority/cache-stats", (c) => {
  try {
    const stats = locAuth.getCacheStats();
    return c.json(stats);
  } catch (error) {
    console.error('Get cache stats error:', error);
    return c.json({ error: 'Failed to get stats' }, 500);
  }
});

// 🗑️ Clear Authority Cache
app.post("/make-server-49c0e13c/authority/clear-cache", (c) => {
  try {
    locAuth.clearCache();
    return c.json({ message: 'Cache cleared successfully' });
  } catch (error) {
    console.error('Clear cache error:', error);
    return c.json({ error: 'Failed to clear cache' }, 500);
  }
});

// ═══════════════════════════════════════════════════════════
// 💾 GRAPH RECORD STORAGE (JSON-LD Persistence)
// ═══════════════════════════════════════════════════════════

// 💾 Save BIBFRAME Record (full JSON-LD document)
app.post("/make-server-49c0e13c/records/save", async (c) => {
  try {
    // Only signed-in, approved catalogers save; the record says who saved it from the session, not the request.
    const session = await getSession(c);
    if (!session) {
      return c.json({ error: 'Sign in to save records' }, 401);
    }

    // baseVersion: the version the editor started from. A record saved by someone else meanwhile is not
    // overwritten: the reply is 409 with who saved which version, and the editor lets the cataloger choose.
    const { id, document, title, metadata, status: requestedStatus, baseVersion } = await c.req.json();

    if (!id || !document) {
      return c.json({ error: 'Record ID and document required' }, 400);
    }
    // The id becomes part of a storage key: letters, digits and . _ : - only.
    if (typeof id !== 'string' || !/^[A-Za-z0-9._:-]{1,120}$/.test(id)) {
      return c.json({ error: 'Invalid record ID' }, 400);
    }

    // Validate it's a proper JSON-LD document describing a Work and an Instance
    if (!document['@graph'] || !Array.isArray(document['@graph'])) {
      return c.json({ error: 'Invalid JSON-LD document: @graph array required' }, 400);
    }
    const graph: any[] = document['@graph'];
    if (graph.length > 500 || JSON.stringify(document).length > 2_000_000) {
      return c.json({ error: 'Record is too large' }, 413);
    }
    const typed = (suffix: string) => graph.some((n: any) =>
      ([] as any[]).concat(n?.['@type'] || []).some((t: any) => typeof t === 'string' && t.endsWith(suffix)));
    if (!typed('Work') || !typed('Instance')) {
      return c.json({ error: 'A BIBFRAME record needs a bf:Work and a bf:Instance' }, 400);
    }

    // Every name and subject points at an authority: plain-text ones are matched to (or added to) Moon's
    // authority file and linked. Never blocks the save.
    let authoritiesLinked = 0;
    try {
      // Older records' bf:creator / bf:topical / bf:classificationLcc become BIBFRAME 3.0.1 first, so they link too.
      upgradeLegacyTerms(document);
      authoritiesLinked = await linkAuthorities(document, (input) => addLinkedEntity(input, session.username), (a) => withUri(a).uri);
      // Names and subjects picked from LC, VIAF or Wikidata keep that address; Moon's entity store gets their
      // entity too (one per link), so every person, place and subject a record uses exists in Moon.
      await mirrorOutsideLinked(document, (input) => addLinkedEntity(input, session.username));
    } catch (error) {
      console.error('Authority linking failed (record saved without new links):', error);
    }

    // Review workflow: only the Super Admin can publish straight to the catalog.
    // Everyone else's saves (new records and edits) wait for approval.
    const isAdmin = session.role === 'admin';
    // A record missing a required field is still saved, but not published: it waits until it is complete.
    const missing = missingForPublish(document);
    const status = isAdmin && requestedStatus !== 'pending-review' && missing.length === 0
      ? 'complete'
      : 'pending-review';
    const publishBlocked = isAdmin && requestedStatus !== 'pending-review' && missing.length > 0 ? missing : undefined;

    const existing = await recordStore.getRecord(id);
    // A cataloger edits their own records; anyone else's are the Super Admin's to change.
    if (existing && !isAdmin && existing.cataloger && existing.cataloger !== session.username) {
      return c.json({ error: 'This record belongs to another cataloger' }, 403);
    }
    const now = new Date().toISOString();
    const cataloger = isAdmin && existing?.cataloger ? existing.cataloger : session.username;

    // Each save is a new version of the record.
    let version: number;
    try {
      version = await recordStore.saveRecord({
        id,
        title: title || existing?.title || 'Untitled',
        document,
        metadata: (() => {
          const m: Record<string, unknown> = { ...(existing?.metadata || {}), ...(metadata || {}), status };
          // The description's licence (S23): one of Moon's, else the record keeps CC0.
          const lic = cleanLicence((metadata || {}).license);
          if (lic) m.license = lic; else delete m.license;
          if (lic === undefined && existing?.metadata?.license && cleanLicence(existing.metadata.license) && (metadata || {}).license === undefined) m.license = existing.metadata.license;
          return m;
        })(),
        status,
        cataloger,
        createdAt: existing?.createdAt || existing?.saved || now,
        ...(status === 'complete'
          ? { approvedBy: isAdmin ? session!.username : existing?.approvedBy, approvedAt: now }
          : {}),
        saved: now,
      }, session.username, 'save', Number.isInteger(baseVersion) ? baseVersion : undefined);
    } catch (error) {
      if (!(error instanceof recordStore.VersionConflictError)) throw error;
      const [latest] = await recordStore.listVersions(id);
      return c.json({
        error: 'This record was saved by someone else while you were editing it',
        conflict: {
          currentVersion: error.currentVersion,
          savedBy: latest?.version === error.currentVersion ? latest.savedBy : undefined,
          savedAt: latest?.version === error.currentVersion ? latest.savedAt : undefined,
        },
      }, 409);
    }

    console.log(`[RECORDS] Saved record ${id} v${version} "${title || 'Untitled'}" (${status}) by ${cataloger} with ${document['@graph'].length} nodes`);
    fireHooks(status === 'complete' ? 'record.published' : 'record.saved', { id, title: title || existing?.title || 'Untitled', version, status });
    // The Super Admin hears about every save that now waits for their review.
    if (status === 'pending-review' && !isAdmin) {
      const waiting = { id, title: title || existing?.title || 'Untitled' };
      await recordStore.notify(SUPER_ADMIN_USERNAME, 'review', waiting, session.username);
      // The reviewer it is assigned to hears too.
      if (existing?.assignedTo && existing.assignedTo !== session.username && existing.assignedTo !== SUPER_ADMIN_USERNAME) {
        await recordStore.notify(existing.assignedTo, 'review', waiting, session.username);
      }
    }

    return c.json({
      success: true,
      id,
      title: title || 'Untitled',
      status,
      cataloger,
      version,
      // A cataloger's edit of a published record leaves the published version live until approval.
      publishedVersion: status === 'complete' ? version : existing?.publishedVersion,
      // The Super Admin's save that could not be published, and why.
      ...(publishBlocked ? { publishBlocked } : {}),
      // How many names and subjects were linked to the authority file in this save.
      authoritiesLinked,
      nodeCount: document['@graph'].length,
      saved: now,
    });
  } catch (error) {
    console.error('Save record error:', error);
    return c.json({ error: 'Failed to save record' }, 500);
  }
});

// 🌐 Resolvable URIs: https://mooon.site/resource/<kind>/<id> reaches here through the Cloudflare
// Worker in workers/resource-router. The published record describing that URI is answered as
// JSON-LD, Turtle or N-Triples (by extension, e.g. .ttl, or by the Accept header); a browser is sent
// (303 See Other) to the record's page in the OPAC. Only published versions are ever served.
// 📚 https://mooon.site/resource/ itself: a page listing every published record with its Work and Instance
// addresses and data formats (JSON with ?format=json or Accept: application/json).
// One published book as a plain page, for crawlers and AI assistants that do not run JavaScript:
// https://mooon.site/resource/?book=<id>. Made from the record every time, so it follows every change.
async function bookPage(c: any, id: string) {
  try {
    const record = /^[A-Za-z0-9._:-]{1,120}$/.test(id) ? await recordStore.getPublishedRecord(id).catch(() => null) : null;
    if (!record) return c.html('<!doctype html><meta charset="utf-8"><title>Not found</title><p>No published book has this address. <a href="/resource/">All published records</a></p>', 404);
    return c.html(bookPageHtml(bookFactsOf({ id: record.id, title: record.title, document: record.document })), 200, { 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' });
  } catch (error) {
    console.error('Book page error:', error);
    return c.json({ error: 'Failed to build the book page' }, 500);
  }
}

async function resourceIndex(c: any) {
  const bookId = c.req.query('book');
  if (bookId) return await bookPage(c, bookId);
  try {
    const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
    const nodeId = (doc: any, cls: string) => (Array.isArray(doc?.['@graph']) ? doc['@graph'] : [])
      .find((n: any) => [].concat(n?.['@type'] ?? []).some((t: any) => String(t).endsWith(cls)) && String(n?.['@id'] || '').startsWith(linkedData.BASE_URI))?.['@id'];
    const records = (await recordStore.listPublishedRecords())
      .map((r) => ({ id: r.id, title: r.title, work: nodeId(r.document, 'Work'), instance: nodeId(r.document, 'Instance'), saved: r.saved }))
      .filter((r) => r.work)
      .sort((a, b) => String(a.title).localeCompare(String(b.title)));
    const wantsJson = c.req.query('format') === 'json' || /application\/json/.test(c.req.header('Accept') || '');
    if (wantsJson) return c.json({ count: records.length, records }, 200, { 'Access-Control-Allow-Origin': '*' });
    const rows = records.map((r) => `<li><a class="t" href="${esc(r.work)}" dir="auto">${esc(r.title)}</a>
      <div class="u"><a href="${esc(r.work)}">${esc(r.work)}</a>${r.instance ? `<br><a href="${esc(r.instance)}">${esc(r.instance)}</a>` : ''}</div>
      <div class="f"><a href="${esc(r.work)}.jsonld">JSON-LD</a> · <a href="${esc(r.work)}.ttl">Turtle</a> · <a href="${esc(r.work)}.nt">N-Triples</a></div></li>`).join('\n');
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Moon — published records</title><style>
body{font-family:system-ui,"Segoe UI",Tahoma,sans-serif;max-width:860px;margin:0 auto;padding:24px 16px;background:#0b1020;color:#e5e7eb}
h1{font-size:1.5rem;margin:0 0 4px}p{color:#9ca3af;margin:0 0 20px}ul{list-style:none;padding:0;margin:0}
li{padding:14px 0;border-top:1px solid #1f2937}a{color:#93c5fd;text-decoration:none}a:hover{text-decoration:underline}
.t{font-weight:600;font-size:1.05rem;color:#f9fafb}.u{font-family:ui-monospace,monospace;font-size:.8rem;margin-top:4px;word-break:break-all}.f{font-size:.8rem;margin-top:4px;color:#9ca3af}
</style></head><body><h1>Moon — published records</h1>
<p>${records.length} BIBFRAME records. Each address opens the record's page in a browser, or its data for library systems (JSON-LD, Turtle, N-Triples). <a href="?format=json">This list as JSON</a> · <a href="/opac.html">Catalogue</a> · <a href="/api.html">API</a></p>
<p>Every record in one file: <a href="/resource/dump.jsonld">JSON-LD</a> · <a href="/resource/dump.nt">N-Triples</a> · <a href="https://github.com/isaacrow/moon3/releases/tag/data-dump">nightly copy</a> · <a href="/resource/sparql">SPARQL</a></p>
<ul>${rows}</ul></body></html>`;
    return c.html(html, 200, { 'Cache-Control': 'public, max-age=300' });
  } catch (error) {
    console.error('Resource index error:', error);
    return c.json({ error: 'Failed to list records' }, 500);
  }
}
// 🔍 Read-only SPARQL over the published records: https://mooon.site/resource/sparql
// GET ?query=… (and optional &format=json|xml|csv|tsv|ttl|nt|rdfxml), or POST with an
// application/sparql-query body or a form field "query". Without a query, browsers get a query page.
const loadPublishedNTriples = async () => {
  // Only records whose licence allows redistribution go in the bulk exports (S23).
  const records = openRecords(await recordStore.listPublishedRecords()).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const documents = records.map((r) => linkedData.publishedDocument(r));
  return await linkedData.dumpNTriples(documents, await publishedEntityDocs(documents));
};

/** The entities, as linked data, that go with the published records in the dump and SPARQL (never fails them). */
async function publishedEntityDocs(documents: any[]): Promise<any[]> {
  try {
    return linkedData.entityDocuments(await recordStore.listAllAuthorities(), documents);
  } catch (error) {
    console.error('Entities for the dump failed (records only):', error);
    return [];
  }
}

const SPARQL_EXAMPLE = `PREFIX bf: <http://id.loc.gov/ontologies/bibframe/>

SELECT ?work ?title WHERE {
  ?work a bf:Work ;
        bf:title/bf:mainTitle ?title .
}
LIMIT 25`;

function sparqlPage(): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Moon SPARQL</title><style>
body{font-family:system-ui,"Segoe UI",Tahoma,sans-serif;max-width:960px;margin:0 auto;padding:24px 16px;background:#0b1020;color:#e5e7eb}
h1{font-size:1.5rem;margin:0 0 4px}p{color:#9ca3af;margin:0 0 16px}a{color:#93c5fd}
textarea{width:100%;box-sizing:border-box;min-height:220px;font:13px/1.5 ui-monospace,monospace;background:#111827;color:#f9fafb;border:1px solid #374151;border-radius:8px;padding:12px}
.bar{display:flex;gap:8px;margin:10px 0 18px;flex-wrap:wrap}button,select{font:inherit;padding:8px 14px;border-radius:8px;border:1px solid #374151;background:#1f2937;color:#f9fafb;cursor:pointer}
button{background:#2563eb;border-color:#2563eb}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-top:1px solid #1f2937;padding:6px 8px;text-align:start;vertical-align:top;word-break:break-word}
th{color:#9ca3af;font-weight:600}pre{white-space:pre-wrap;word-break:break-word;font-size:12px;background:#111827;padding:12px;border-radius:8px}#msg{color:#fca5a5}
</style></head><body><h1>Moon SPARQL</h1>
<p>Read-only SPARQL 1.1 over every published Moon record (BIBFRAME). Endpoint: <code>https://mooon.site/resource/sparql</code> · <a href="/resource/">Records</a> · <a href="/resource/dump.nt">Data dump</a></p>
<form id="f"><textarea id="q" name="query" spellcheck="false">${esc(SPARQL_EXAMPLE)}</textarea>
<div class="bar"><button type="submit">Run query</button><select id="fmt" name="format"><option value="">Table</option><option value="json">SPARQL JSON</option><option value="xml">SPARQL XML</option><option value="csv">CSV</option><option value="ttl">Turtle (CONSTRUCT)</option><option value="nt">N-Triples (CONSTRUCT)</option></select></div></form>
<div id="msg"></div><div id="out"></div>
<script>
const f=document.getElementById('f'),q=document.getElementById('q'),fmt=document.getElementById('fmt'),out=document.getElementById('out'),msg=document.getElementById('msg');
const cell=v=>{const td=document.createElement('td');if(!v){return td}if(v.type==='uri'){const a=document.createElement('a');a.href=v.value;a.textContent=v.value;td.appendChild(a)}else{td.textContent=v.value;td.dir='auto'}return td};
f.addEventListener('submit',async e=>{e.preventDefault();msg.textContent='';out.textContent='Running…';
  const u=new URL(location.href);u.search='';u.searchParams.set('query',q.value);if(fmt.value)u.searchParams.set('format',fmt.value);
  try{const r=await fetch(u,{headers:{Accept:fmt.value?'*/*':'application/sparql-results+json, text/turtle;q=0.9'}});const t=await r.text();
    if(!r.ok){out.textContent='';msg.textContent=(()=>{try{return JSON.parse(t).error}catch{return t}})();return}
    let j=null;if(!fmt.value){try{j=JSON.parse(t)}catch{}}
    out.textContent='';
    if(j&&j.head&&j.results){const tb=document.createElement('table'),hr=document.createElement('tr');j.head.vars.forEach(v=>{const th=document.createElement('th');th.textContent=v;hr.appendChild(th)});tb.appendChild(hr);
      j.results.bindings.forEach(b=>{const tr=document.createElement('tr');j.head.vars.forEach(v=>tr.appendChild(cell(b[v])));tb.appendChild(tr)});
      const n=document.createElement('p');n.textContent=j.results.bindings.length+' results';out.append(n,tb)}
    else if(j&&'boolean' in j){out.textContent=j.boolean?'true':'false'}
    else{const pre=document.createElement('pre');pre.textContent=t;out.appendChild(pre)}
  }catch(err){out.textContent='';msg.textContent=String(err)}});
</script></body></html>`;
}

async function sparqlEndpoint(c: any) {
  const cors = { 'Access-Control-Allow-Origin': '*', Vary: 'Accept' };
  let query = c.req.query('query') || '';
  if (c.req.method === 'POST') {
    const type = (c.req.header('Content-Type') || '').toLowerCase();
    if (type.startsWith('application/sparql-query')) query = await c.req.text();
    else if (type.startsWith('application/x-www-form-urlencoded')) query = String((await c.req.parseBody()).query || '');
    else return c.json({ error: 'POST a query as application/sparql-query or a form field named query' }, 415, cors);
  }
  if (!query) {
    if (/text\/html/.test(c.req.header('Accept') || '')) return c.html(sparqlPage(), 200, { ...cors, 'Cache-Control': 'public, max-age=300' });
    return c.json({ error: 'A query is required: ?query=SELECT …', example: SPARQL_EXAMPLE }, 400, cors);
  }
  try {
    const result = await sparqlStore.runQuery(query, {
      format: c.req.query('format'), accept: c.req.header('Accept'), loadNTriples: loadPublishedNTriples,
    });
    return c.body(result.body, 200, { ...cors, 'Content-Type': `${result.contentType}; charset=utf-8`, 'Cache-Control': 'public, max-age=60' });
  } catch (error) {
    if (error instanceof sparqlStore.SparqlError) return c.json({ error: error.message }, 400, cors);
    console.error('SPARQL error:', error);
    return c.json({ error: 'The query could not be run' }, 500, cors);
  }
}
app.get("/make-server-49c0e13c/resource/sparql", sparqlEndpoint);

// Ask Moon (Phase 13 S15): readers ask; Claude answers only from Moon's published records, with links.
// Off until the ANTHROPIC_API_KEY secret is set; at most MOON_ASK_DAILY_LIMIT questions a day (default 200).
const ASK_CORS = { "Access-Control-Allow-Origin": "*" };
// Subject finder (S16): subjects from the 10 nearest published records, for the cataloguer to pick.
let finderIndex: { at: number; index: ReturnType<typeof buildIndex> } | null = null;
app.post("/make-server-49c0e13c/subjects/suggest", async (c) => {
  if (!(await getSession(c))) return c.json({ error: "Sign in to get subject suggestions" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.slice(0, 5000) : "";
  if (text.trim().length < 3) return c.json({ suggestions: [] });
  try {
    if (!finderIndex || Date.now() - finderIndex.at > 10 * 60_000) {
      finderIndex = { at: Date.now(), index: buildIndex((await recordStore.listPublishedRecords()).map((r: any) => finderRecordOf(r))) };
    }
    const have = (Array.isArray(body.have) ? body.have : []).slice(0, 100).filter((h: any) => h && typeof h.label === "string").map((h: any) => ({ label: String(h.label), ...(typeof h.uri === "string" ? { uri: h.uri } : {}) }));
    return c.json({ suggestions: suggestSubjects(finderIndex.index, text, have, typeof body.excludeId === "string" ? body.excludeId : undefined) });
  } catch (error) {
    console.error("Subject finder error:", error);
    return c.json({ error: "Subject suggestions failed" }, 500);
  }
});

// Link checker (S16): suspect links from entities to LC / VIAF / Wikidata, for a person to look at. Never blocks.
app.get("/make-server-49c0e13c/entities/link-report", async (c) => {
  if (!(await getSession(c))) return c.json({ error: "Sign in to see the link report" }, 401);
  try {
    const [entities, cached] = await Promise.all([recordStore.listAllAuthorities(), recordStore.allCachedLabels()]);
    const agents = entities.filter((e: any) => !e.mergedInto && (e.sameAs || []).length && ["agent", "place", "topic"].includes(e.kind))
      .map((e: any) => ({ id: e.id, kind: e.kind, label: e.label, variants: e.variants || [], sameAs: e.sameAs || [] }));
    const issues = checkLinks(agents, new Map(cached.map((r) => [r.uri, r])), labelCache.canonical);
    return c.json({ checked: agents.length, cachedNames: cached.length, issues });
  } catch (error) {
    console.error("Link report error:", error);
    return c.json({ error: "The link report could not be made" }, 500);
  }
});

app.get("/make-server-49c0e13c/ask", (c) => c.json({ enabled: askEnabled() }, 200, ASK_CORS));
app.post("/make-server-49c0e13c/ask", async (c) => {
  if (!askEnabled()) return c.json({ error: "Ask Moon is not switched on" }, 503, ASK_CORS);
  const body = await c.req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length < 3 || question.length > MAX_QUESTION) return c.json({ error: `A question of 3 to ${MAX_QUESTION} characters` }, 400, ASK_CORS);
  const key = dayKey(new Date());
  const count = Number(await kv.get(key).catch(() => 0)) || 0;
  const limit = Number(Deno.env.get("MOON_ASK_DAILY_LIMIT")) || 200;
  if (!underCap(count, limit)) return c.json({ error: "Ask Moon has answered all the questions it can today; please try tomorrow or ask a librarian." }, 429, ASK_CORS);
  await kv.set(key, String(count + 1)).catch(() => {});
  try {
    const reply = await askMoon(question, {
      plan: planWithClaude,
      answer: answerWithClaude,
      search: async (query) => {
        const found = await recordStore.searchRecords({ query, published: true, limit: 6 });
        return openRecords(found.records as any[]).map((r: any) => askRecordOf(r));
      },
    });
    console.log(`[ask] ${reply.noSource ? "no source" : `${reply.sources.length} sources`} (${count + 1}/${limit} today)`);
    return c.json(reply, 200, ASK_CORS);
  } catch (error) {
    console.error("Ask Moon error:", error);
    return c.json({ error: "Ask Moon could not answer just now" }, 500, ASK_CORS);
  }
});

// The dataset described in VoID (S23): https://mooon.site/resource/void (JSON-LD), void.ttl (Turtle).
async function voidStats() {
  const all = await recordStore.listPublishedRecords();
  const open = openRecords(all);
  const nt = await loadPublishedNTriples();
  const triples = nt.split("\n").filter((l) => l.trim() && !l.startsWith("#")).length;
  const subjects = new Set(nt.split("\n").map((l) => l.split(" ")[0]).filter((s) => s.startsWith("<") && s.includes("/resource/")));
  const modified = open.map((r: any) => String(r.saved || "")).sort().pop();
  return { records: open.length, triples, entities: Math.max(0, subjects.size - open.length), modified, left: all.length - open.length };
}
app.get("/make-server-49c0e13c/resource/void", async (c) => {
  try {
    const stats = await voidStats();
    if (/text\/turtle/.test(c.req.header('Accept') || '')) return c.body(voidTurtle(linkedData.BASE_URI, stats), 200, { 'Content-Type': 'text/turtle; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' });
    return c.json(voidDocument(linkedData.BASE_URI, stats), 200, { 'Content-Type': 'application/ld+json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' });
  } catch (error) {
    console.error('VoID error:', error);
    return c.json({ error: 'The dataset description could not be built' }, 500);
  }
});
app.get("/make-server-49c0e13c/resource/void.ttl", async (c) => {
  try {
    return c.body(voidTurtle(linkedData.BASE_URI, await voidStats()), 200, { 'Content-Type': 'text/turtle; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' });
  } catch (error) {
    console.error('VoID error:', error);
    return c.text('The dataset description could not be built', 500);
  }
});

// Moon's own SKOS vocabularies (Phase 13 S24): https://mooon.site/resource/vocab/maqam and …/item-action,
// and each concept at …/vocab/<scheme>/<id>, as JSON-LD.
const vocabRoute = (c: any) => {
  const scheme = c.req.param("scheme");
  if (scheme !== "maqam" && scheme !== "item-action") return c.json({ error: "Schemes: maqam, item-action" }, 404);
  const id = (c.req.param("id") || "").replace(/\.jsonld$/, "");
  const doc = vocabDocument(linkedData.BASE_URI, scheme, id || undefined);
  if (!doc) return c.json({ error: "No such concept" }, 404);
  return c.json(doc, 200, { "Content-Type": "application/ld+json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" });
};
app.get("/make-server-49c0e13c/resource/vocab/:scheme", vocabRoute);
app.get("/make-server-49c0e13c/resource/vocab/:scheme/:id", vocabRoute);

// Webhooks (Phase 13 S19): the Super Admin lists, adds and removes them; the secret is shown once, on adding.
app.get("/make-server-49c0e13c/webhooks", async (c) => {
  const session = await getSession(c);
  if (session?.role !== 'admin') return c.json({ error: 'Only the Super Admin manages webhooks' }, 403);
  return c.json({ webhooks: webhooks.parseHooks(await kv.get(webhooks.HOOKS_KEY).catch(() => null)).map(webhooks.publicHook), events: webhooks.EVENTS });
});
app.post("/make-server-49c0e13c/webhooks", async (c) => {
  const session = await getSession(c);
  if (session?.role !== 'admin') return c.json({ error: 'Only the Super Admin manages webhooks' }, 403);
  const body = await c.req.json().catch(() => ({}));
  const url = String(body.url || '').trim();
  const problem = webhooks.hookUrlProblem(url);
  if (problem) return c.json({ error: problem }, 400);
  const events = (Array.isArray(body.events) ? body.events : webhooks.EVENTS).filter((e: any) => webhooks.EVENTS.includes(e));
  if (!events.length) return c.json({ error: `events: some of ${webhooks.EVENTS.join(', ')}` }, 400);
  const hooks = webhooks.parseHooks(await kv.get(webhooks.HOOKS_KEY).catch(() => null));
  if (hooks.length >= webhooks.MAX_HOOKS) return c.json({ error: `Up to ${webhooks.MAX_HOOKS} webhooks` }, 400);
  const hook = { id: crypto.randomUUID().slice(0, 8), url, secret: webhooks.newSecret(), events, by: session.username, at: new Date().toISOString() };
  await kv.set(webhooks.HOOKS_KEY, JSON.stringify([...hooks, hook]));
  // A test message, so the Super Admin sees at once whether the address answers.
  const [tried] = await webhooks.deliver([{ ...hook, events: ['record.saved'] }], 'record.saved', { event: 'test', at: hook.at, note: 'Moon webhook added' });
  return c.json({ webhook: webhooks.publicHook(hook), secret: hook.secret, test: tried?.status ?? 0 }, 201);
});
app.delete("/make-server-49c0e13c/webhooks/:id", async (c) => {
  const session = await getSession(c);
  if (session?.role !== 'admin') return c.json({ error: 'Only the Super Admin manages webhooks' }, 403);
  const hooks = webhooks.parseHooks(await kv.get(webhooks.HOOKS_KEY).catch(() => null));
  const rest = hooks.filter((h) => h.id !== c.req.param('id'));
  if (rest.length === hooks.length) return c.json({ error: 'No such webhook' }, 404);
  await kv.set(webhooks.HOOKS_KEY, JSON.stringify(rest));
  return c.json({ success: true });
});

// Moon's MCP server (Phase 13 S20): https://mooon.site/resource/mcp, MCP Streamable HTTP with plain JSON
// replies. Read tools are open; create_draft needs a cataloguer's X-Moon-Session and only ever saves a draft.
const instanceUriOf = (r: { id: string; document?: any }) =>
  (Array.isArray(r.document?.["@graph"]) ? r.document["@graph"] : []).find((n: any) => ([] as any[]).concat(n?.["@type"] || []).some((t: any) => String(t).endsWith("Instance")))?.["@id"]
  || `${linkedData.BASE_URI}/instance/${r.id}`;
app.post("/make-server-49c0e13c/resource/mcp", async (c) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Mcp-Session-Id" };
  const msg = await c.req.json().catch(() => undefined);
  if (msg === undefined) return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400, cors);
  if (Array.isArray(msg)) return c.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Send one message per request" } }, 400, cors);
  const session = await getSession(c).catch(() => null);
  const reply = await handleMcp(msg, {
    user: session?.username || null,
    search: async (query, limit) => {
      const found = await recordStore.searchRecords({ query, published: true, limit });
      return found.records.map((r: any) => ({ id: r.id, title: r.title, uri: instanceUriOf(r) }));
    },
    record: async (id) => {
      const r = await recordStore.getPublishedRecord(id);
      return r ? { id: r.id, title: r.title, document: linkedData.publishedDocument(r as any) } : null;
    },
    sparql: async (query) => (await sparqlStore.runQuery(query, { format: "json", accept: "application/sparql-results+json", loadNTriples: loadPublishedNTriples })).body,
    validate: (document) => ({ missing: missingForPublish(document) }),
    createDraft: async ({ title, document, agent, note }) => {
      const id = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const now = new Date().toISOString();
      const version = await recordStore.saveRecord({
        id, title, document, status: "pending-review", cataloger: session!.username, createdAt: now, saved: now,
        metadata: { status: "pending-review", provenance: { via: "mcp", agent, by: session!.username, at: now, note } },
      }, session!.username, `Draft from ${agent} (MCP): ${note}`.slice(0, 500));
      return { id, version };
    },
  }, String(msg?.params?.clientInfo?.name || c.req.header("User-Agent") || "an MCP client").slice(0, 80));
  if (reply === null) return c.body(null, 202, cors);
  return c.json(reply, 200, cors);
});
app.get("/make-server-49c0e13c/resource/mcp", (c) => c.json({ error: "Moon's MCP server takes JSON-RPC as POST (Streamable HTTP, no SSE stream). See https://mooon.site/api.html#mcp" }, 405, { Allow: "POST", "Access-Control-Allow-Origin": "*" }));
app.post("/make-server-49c0e13c/resource/sparql", sparqlEndpoint);

// 📦 Data dump: every published record in one file, https://mooon.site/resource/dump.jsonld or dump.nt
// (always current; a dated copy is also saved nightly by .github/workflows/data-dump.yml).
async function resourceDump(c: any, format: 'jsonld' | 'nt') {
  try {
    const records = openRecords(await recordStore.listPublishedRecords()).sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const documents = records.map((r) => linkedData.publishedDocument(r));
    const entities = await publishedEntityDocs(documents);
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'X-Entity-Count': String(entities.length),
      'Cache-Control': 'public, max-age=3600',
      'Content-Disposition': `inline; filename="moon-published-records.${format}"`,
      'X-Record-Count': String(records.length),
    };
    if (format === 'jsonld') {
      return c.body(JSON.stringify(linkedData.dumpJsonLd(documents, entities)), 200, { ...headers, 'Content-Type': `${linkedData.MEDIA_TYPES.jsonld}; charset=utf-8` });
    }
    return c.body(await linkedData.dumpNTriples(documents, entities), 200, { ...headers, 'Content-Type': `${linkedData.MEDIA_TYPES.nt}; charset=utf-8` });
  } catch (error) {
    console.error('Data dump error:', error);
    return c.json({ error: 'Failed to build the data dump' }, 500);
  }
}
// 🗺️ Sitemap for search engines (served at https://mooon.site/sitemap.xml by the Worker): the catalogue's
// home and every published record's page, with the date it last changed.
app.get("/make-server-49c0e13c/resource/sitemap.xml", async (c) => {
  try {
    const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
    const records = (await recordStore.listPublishedRecords()).sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const urls = [
      `<url><loc>https://mooon.site/opac.html</loc><changefreq>daily</changefreq></url>`,
      ...records.map((r) => {
        const lastmod = r.saved ? new Date(r.saved) : null;
        const when = lastmod && !isNaN(lastmod.getTime()) ? `<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : '';
        return `<url><loc>${esc(`https://mooon.site/opac.html?work=${encodeURIComponent(r.id)}`)}</loc>${when}</url>`;
      }),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
    return c.body(xml, 200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' });
  } catch (error) {
    console.error('Sitemap error:', error);
    return c.json({ error: 'Failed to build the sitemap' }, 500);
  }
});

// OAI-PMH 2.0 for harvesters (union catalogues, WorldCat, BASE): https://mooon.site/resource/oai?verb=Identify
async function oaiEndpoint(c: any) {
  try {
    const params: Record<string, string> = {};
    const url = new URL(c.req.url);
    url.searchParams.forEach((v, k) => { params[k] = v; });
    if (c.req.method === 'POST') {
      const form = new URLSearchParams(await c.req.text());
      form.forEach((v, k) => { params[k] = v; });
    }
    const records = openRecords(await recordStore.listPublishedRecords()).map((r: any) => ({ id: r.id, title: r.title, document: r.document, saved: r.saved }));
    const xml = oaiResponse(params, records, {
      baseUrl: linkedData.BASE_URI,
      repositoryName: 'Moon BIBFRAME catalogue',
      adminEmail: Deno.env.get('MOON_OAI_ADMIN_EMAIL') || 'catalogue@mooon.site',
    });
    return c.body(xml, 200, { 'Content-Type': 'text/xml; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  } catch (error) {
    console.error('OAI-PMH error:', error);
    return c.text('OAI-PMH failed', 500);
  }
}
// SRU copy cataloguing: the catalogues a cataloger can search, and a search in one of them (MARCXML back).
app.get("/make-server-49c0e13c/sru/targets", async (c) => {
  if (!(await getSession(c))) return c.json({ error: 'Sign in to search other catalogues' }, 401);
  return c.json({ targets: sruTargets(Deno.env.get('MOON_SRU_TARGETS')).map(({ id, name }) => ({ id, name })) });
});
app.get("/make-server-49c0e13c/sru/search", async (c) => {
  try {
    if (!(await getSession(c))) return c.json({ error: 'Sign in to search other catalogues' }, 401);
    const target = sruTargets(Deno.env.get('MOON_SRU_TARGETS')).find((t) => t.id === c.req.query('target'));
    if (!target) return c.json({ error: 'Unknown catalogue' }, 400);
    const index = (['keyword', 'title', 'author', 'isbn', 'lccn'] as const).find((i) => i === c.req.query('index')) || 'keyword';
    const q = (c.req.query('q') || '').trim();
    if (!q) return c.json({ error: 'Type something to search for' }, 400);
    const res = await fetch(sruUrl(target, index, q, Number(c.req.query('start')) || 1), { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return c.json({ error: `${target.name} answered ${res.status}` }, 502);
    const xml = await res.text();
    if (xml.length > 3_000_000) return c.json({ error: 'The answer was too large' }, 502);
    return c.json({ target: target.id, ...sruSummary(xml), xml });
  } catch (error) {
    console.error('SRU search error:', error);
    return c.json({ error: 'The catalogue could not be reached' }, 502);
  }
});
// W3C Reconciliation API for OpenRefine: https://mooon.site/resource/reconcile
// GET with no queries gives the service manifest; queries come as ?queries={...} or a form / JSON POST.
async function reconcileEndpoint(c: any) {
  try {
    const url = new URL(c.req.url);
    let raw = url.searchParams.get('queries');
    if (c.req.method === 'POST') {
      const body = await c.req.text();
      if ((c.req.header('Content-Type') || '').includes('json')) {
        const parsed = JSON.parse(body || '{}');
        raw = JSON.stringify(parsed.queries ?? parsed);
      } else {
        raw = new URLSearchParams(body).get('queries') ?? raw;
      }
    }
    const callback = url.searchParams.get('callback');
    const payload = raw
      ? await reconcile(JSON.parse(raw), (q, kind, limit) => recordStore.searchAuthorities(q, kind, limit))
      : manifest(linkedData.BASE_URI);
    const json = JSON.stringify(payload);
    // JSONP for older OpenRefine versions; only a plain function name is accepted.
    if (callback && /^[A-Za-z_$][\w$.]{0,60}$/.test(callback)) {
      return c.body(`${callback}(${json})`, 200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    }
    return c.body(json, 200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  } catch (error) {
    console.error('Reconciliation error:', error);
    return c.json({ error: 'Reconciliation failed: queries must be JSON' }, 400);
  }
}
app.get("/make-server-49c0e13c/resource/reconcile", reconcileEndpoint);
app.post("/make-server-49c0e13c/resource/reconcile", reconcileEndpoint);

// ISNI name search for the editor (ISNI does not allow calls from other sites' browsers).
app.get("/make-server-49c0e13c/isni/search", async (c) => {
  try {
    if (!(await getSession(c))) return c.json({ error: 'Sign in to search ISNI' }, 401);
    const q = (c.req.query('q') || '').trim();
    if (q.length < 2) return c.json({ names: [] });
    const res = await fetch(isniSearchUrl(q), { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return c.json({ error: `ISNI answered ${res.status}` }, 502);
    return c.json({ names: parseIsni(await res.text()) });
  } catch (error) {
    console.error('ISNI search error:', error);
    return c.json({ error: 'ISNI could not be reached' }, 502);
  }
});

// 📚 Send to FOLIO (Phase 5). The library's FOLIO is entered by the Super Admin in Moon (Settings → FOLIO:
// gateway address, tenant, account, password; the password sealed, never sent back) or set as server secrets
// MOON_FOLIO_URL, MOON_FOLIO_TENANT, MOON_FOLIO_USERNAME, MOON_FOLIO_PASSWORD (these win).
// Three routes: MARC + Instance (quickMARC; FOLIO keeps the MARC in SRS and maps the Instance from it),
// Instance only (Inventory API), and a MARC file for FOLIO's Data Import.
// Moon keeps the FOLIO Instance id per record (KV moon:folio:link:<id>), so a second send updates it.
const FOLIO_SETTINGS_KEY = 'moon:folio:settings';
const folioSecret = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'moon';
async function readFolioSettings(): Promise<FolioSettings | null> {
  const raw = await kv.get(FOLIO_SETTINGS_KEY).catch(() => null);
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
}
async function folioConfig(): Promise<FolioConfig | null> {
  const url = (Deno.env.get('MOON_FOLIO_URL') || '').trim();
  const tenant = (Deno.env.get('MOON_FOLIO_TENANT') || '').trim();
  const username = (Deno.env.get('MOON_FOLIO_USERNAME') || '').trim();
  const password = Deno.env.get('MOON_FOLIO_PASSWORD') || '';
  if (url && tenant && username && password) return { url, tenant, username, password };
  const s = await readFolioSettings();
  if (!s?.url || !s.tenant || !s.username || !s.sealedPassword) return null;
  try {
    return { url: s.url, tenant: s.tenant, username: s.username, password: await unseal(s.sealedPassword, folioSecret()) };
  } catch {
    return null;
  }
}
let folioRefCache: { at: number; key: string; ref: FolioRef } | null = null;
async function folioConnect(cfgIn?: FolioConfig) {
  const cfg = cfgIn || await folioConfig();
  if (!cfg) throw new Error('FOLIO is not connected yet. The Super Admin enters the FOLIO address, tenant, username and password in Send to FOLIO → Connection.');
  const timed = ((input: any, init?: any) => fetch(input, { ...init, signal: AbortSignal.timeout(20_000) })) as typeof fetch;
  const api = await folioClient(cfg, timed);
  const key = `${cfg.url}|${cfg.tenant}|${cfg.username}`;
  if (!folioRefCache || folioRefCache.key !== key || Date.now() - folioRefCache.at > 3_600_000) {
    folioRefCache = { at: Date.now(), key, ref: await loadReference(api) };
  }
  return { cfg, api, ref: folioRefCache.ref };
}
const folioLinkKey = (id: string) => `moon:folio:link:${id}`;
async function readFolioLink(id: string): Promise<(FolioLink & { mode?: string }) | null> {
  const raw = await kv.get(folioLinkKey(id));
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
}
async function folioRecordUrl(instanceId: string) {
  const ui = (Deno.env.get('MOON_FOLIO_UI_URL') || '').trim() || (await readFolioSettings())?.uiUrl || '';
  return ui ? `${ui.replace(/\/+$/, '')}/inventory/view/${instanceId}` : undefined;
}

// The connection details (Super Admin): everything but the password, which is never sent back.
app.get("/make-server-49c0e13c/folio/settings", async (c) => {
  if (!(await isAdminSession(c))) return c.json({ error: 'Super Admin session required' }, 403);
  const fromSecrets = !!(Deno.env.get('MOON_FOLIO_URL') && Deno.env.get('MOON_FOLIO_PASSWORD'));
  return c.json({ settings: publicSettings(await readFolioSettings()), fromSecrets });
});

// Saves the connection after signing in to FOLIO with it (a wrong address or password is not saved).
// Body: { url, tenant, username, password?, uiUrl? }; no password keeps the stored one.
app.put("/make-server-49c0e13c/folio/settings", async (c) => {
  const admin = await isAdminSession(c);
  if (!admin) return c.json({ error: 'Super Admin session required' }, 403);
  const body = await c.req.json().catch(() => ({}));
  const input = {
    url: String(body?.url || '').trim().replace(/\/+$/, ''), tenant: String(body?.tenant || '').trim(),
    username: String(body?.username || '').trim(), uiUrl: String(body?.uiUrl || '').trim().replace(/\/+$/, ''),
  };
  const problems = settingsProblems(input);
  if (problems.length) return c.json({ error: problems.join(' ') }, 400);
  const old = await readFolioSettings();
  const password = typeof body?.password === 'string' && body.password ? body.password.slice(0, 500)
    : old?.sealedPassword ? await unseal(old.sealedPassword, folioSecret()).catch(() => '') : '';
  if (!password) return c.json({ error: 'The FOLIO password is required.' }, 400);
  try {
    folioRefCache = null;
    const { ref } = await folioConnect({ url: input.url, tenant: input.tenant, username: input.username, password });
    const settings: FolioSettings = { ...input, sealedPassword: await seal(password, folioSecret()), updatedBy: admin.username, updatedAt: new Date().toISOString() };
    await kv.set(FOLIO_SETTINGS_KEY, JSON.stringify(settings));
    return c.json({ ok: true, settings: publicSettings(settings), instanceTypes: Object.keys(ref.instanceTypes).length });
  } catch (error) {
    return c.json({ error: `Could not sign in to FOLIO with these details: ${String((error as Error).message || error)}` }, 400);
  }
});

app.delete("/make-server-49c0e13c/folio/settings", async (c) => {
  if (!(await isAdminSession(c))) return c.json({ error: 'Super Admin session required' }, 403);
  await kv.del(FOLIO_SETTINGS_KEY);
  folioRefCache = null;
  return c.json({ ok: true });
});

app.get("/make-server-49c0e13c/folio/status", async (c) => {
  if (!(await getSession(c))) return c.json({ error: 'Sign in to use FOLIO' }, 401);
  const cfg = await folioConfig();
  if (!cfg) return c.json({ configured: false });
  try {
    const { ref } = await folioConnect(cfg);
    const missing = [
      !ref.instanceTypes.txt && 'instance type "txt" (text)',
      !ref.identifierTypes.ISBN && 'identifier type ISBN',
      !ref.contributorNameTypes.personal && 'contributor name type "Personal name"',
      !ref.generalNoteTypeId && 'note type "General note"',
    ].filter(Boolean);
    return c.json({ configured: true, ok: true, url: cfg.url, tenant: cfg.tenant, missingReference: missing });
  } catch (error) {
    return c.json({ configured: true, ok: false, url: cfg.url, tenant: cfg.tenant, error: String((error as Error).message || error) });
  }
});

// What the record becomes in FOLIO (nothing is sent), and whether it changed since it was last sent. The
// published document comes with it, so the browser can show and send the same record as MARC.
app.get("/make-server-49c0e13c/folio/record/:id", async (c) => {
  if (!(await getSession(c))) return c.json({ error: 'Sign in to use FOLIO' }, 401);
  const id = c.req.param('id');
  // FOLIO gets the published version (an edit still waiting for review is not sent).
  const record = await recordStore.getPublishedRecord(id);
  const link = await readFolioLink(id);
  if (!record) return c.json({ published: false, link });
  const cfg = await folioConfig();
  if (!cfg) return c.json({ configured: false, published: true, link, document: record.document });
  try {
    const { ref } = await folioConnect(cfg);
    const { instance, warnings } = buildFolioInstance(record.document, ref);
    return c.json({
      configured: true, published: true, link, instance, warnings, document: record.document,
      changed: !!(link && instance && link.mode !== 'marc' && instanceHash(instance) !== link.hash),
      ...(link ? { folioUrl: await folioRecordUrl(link.instanceId) } : {}),
    });
  } catch (error) {
    return c.json({ configured: true, published: true, link, document: record.document, error: String((error as Error).message || error) }, 502);
  }
});

// Send: create or update. Body: { mode: 'marc' | 'instance', marc? (the record's MARC, for mode marc),
// linkTo?, createAnyway? }. Mode marc sends MARC through quickMARC (MARC in SRS + the Instance FOLIO maps).
app.post("/make-server-49c0e13c/folio/send/:id", async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Sign in to send records to FOLIO' }, 401);
  const id = c.req.param('id');
  const record = await recordStore.getPublishedRecord(id);
  if (!record) return c.json({ status: 'error', message: 'Publish the record first; only published records go to FOLIO.', warnings: [] }, 409);
  const body = await c.req.json().catch(() => ({}));
  const mode = body?.mode === 'instance' ? 'instance' : 'marc';
  const linkTo = typeof body?.linkTo === 'string' && /^[0-9a-f-]{36}$/i.test(body.linkTo) ? body.linkTo : undefined;
  try {
    const { api, ref } = await folioConnect();
    const link = await readFolioLink(id);
    let result: any;
    let hash = '';
    if (mode === 'marc') {
      const marc = body?.marc;
      const problems = marcProblems(marc);
      if (problems.length) return c.json({ status: 'error', message: problems.join(' '), warnings: [] }, 422);
      if (linkTo) {
        return c.json({ status: 'error', message: 'Linking to an existing Instance works with "Instance only". As MARC, a new record is made, or the one sent before is updated.', warnings: [] }, 400);
      }
      result = await sendMarc(api, marc, link, { createAnyway: body?.createAnyway === true });
      hash = instanceHash(marc);
    } else {
      const { instance, warnings } = buildFolioInstance(record.document, ref);
      if (!instance) return c.json({ status: 'error', message: warnings.join(' '), warnings }, 422);
      result = await sendInstance(api, instance, link, { linkTo, createAnyway: body?.createAnyway === true, warnings });
      hash = instanceHash(instance);
    }
    if (result.status === 'created' || result.status === 'updated') {
      const saved = { instanceId: result.instanceId, hrid: result.hrid ?? link?.hrid, sentAt: new Date().toISOString(), hash, mode };
      await kv.set(folioLinkKey(id), JSON.stringify({ ...saved, sentBy: session.username }));
      return c.json({ ...result, link: saved, folioUrl: await folioRecordUrl(result.instanceId) });
    }
    return c.json(result, result.status === 'error' ? 502 : 200);
  } catch (error) {
    console.error('FOLIO send error:', id, error);
    return c.json({ status: 'error', message: String((error as Error).message || error), warnings: [] }, 502);
  }
});

app.get("/make-server-49c0e13c/resource/oai", oaiEndpoint);

// The change feed (Phase 13 S19): https://mooon.site/resource/changes (ActivityStreams 2.0, as LC and OCLC
// publish theirs): what Moon published, changed or withdrawn, newest first; ?page=1 is the newest page.
app.get("/make-server-49c0e13c/resource/changes", async (c) => {
  try {
    const [publishedAll, withdrawn] = await Promise.all([recordStore.listPublishedRecords(), recordStore.listWithdrawnRecords().catch(() => [])]);
    const published = openRecords(publishedAll);
    const records = [
      ...published.map((r: any) => ({ id: r.id, title: r.title, document: r.document, createdAt: r.createdAt, saved: r.saved })),
      ...withdrawn.filter((w) => !published.some((p: any) => p.id === w.id)),
    ];
    const page = Number(c.req.query('page')) || undefined;
    return c.json(changeFeed(records, linkedData.BASE_URI, page), 200, {
      'Content-Type': 'application/activity+json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300',
    });
  } catch (error) {
    console.error('Change feed error:', error);
    return c.json({ error: 'Failed to build the change feed' }, 500);
  }
});
app.post("/make-server-49c0e13c/resource/oai", oaiEndpoint);

app.get("/make-server-49c0e13c/resource/dump.jsonld", (c) => resourceDump(c, 'jsonld'));
app.get("/make-server-49c0e13c/resource/dump.nt", (c) => resourceDump(c, 'nt'));

app.get("/make-server-49c0e13c/resource", resourceIndex);
// Every entity's names, for the catalogue's search (https://mooon.site/resource/names.json): a book is found by any
// name of its people, subjects and places, in either script ("Ibn Khaldun" finds the book whose author's entity
// also has "ابن خلدون"). Public, like the entities themselves; only labels and variants, nothing about who added them.
app.get("/make-server-49c0e13c/resource/names.json", async (c) => {
  try {
    const entities = await recordStore.listAllAuthorities();
    const forms: Record<string, string[]> = {};
    for (const e of entities as any[]) {
      if (e.mergedInto || !e.label) continue;
      const names = [...new Set([e.label, ...(Array.isArray(e.variants) ? e.variants : [])].filter((n: unknown) => typeof n === 'string' && n.trim()))].slice(0, 30);
      if (names.length > 1) forms[`${linkedData.BASE_URI}/${e.kind}/${e.id}`] = names;
    }
    return c.json({ count: Object.keys(forms).length, forms }, 200, { 'Cache-Control': 'public, max-age=1800', 'Access-Control-Allow-Origin': '*' });
  } catch (error) {
    console.error('Name forms error:', error);
    return c.json({ error: 'Could not list the name forms' }, 500);
  }
});
// Every published book, one line each, for AI assistants and tools: https://mooon.site/resource/books.txt
app.get("/make-server-49c0e13c/resource/books.txt", async (c) => {
  try {
    const records = await recordStore.listPublishedRecords();
    const facts = records.map((r) => bookFactsOf({ id: r.id, title: r.title, document: r.document }));
    return c.body(booksText(facts), 200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' });
  } catch (error) {
    console.error('Books list error:', error);
    return c.json({ error: 'Failed to list the books' }, 500);
  }
});
app.get("/make-server-49c0e13c/resource/", resourceIndex);

app.get("/make-server-49c0e13c/resource/:kind/:id", async (c) => {
  const kind = c.req.param('kind');
  const { id, format: fromExtension } = linkedData.splitExtension(c.req.param('id'));
  if (!/^[a-z]+$/.test(kind) || !/^[A-Za-z0-9._:-]{1,120}$/.test(id)) {
    return c.json({ error: 'Not a Moon resource URI' }, 404);
  }
  const uri = `${linkedData.BASE_URI}/${kind}/${id}`;
  const format = fromExtension ?? linkedData.negotiate(c.req.header('Accept'));
  try {
    // Moon's own entities: /resource/agent|place|topic|hub|genre|period/<id>. A merged entry forwards (301).
    if (isEntityKind(kind)) {
      const entry = await recordStore.getAuthority(id);
      if (!entry || entry.kind !== kind) return c.json({ error: 'No authority entry has this URI', uri }, 404);
      const base = { Vary: 'Accept', 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' };
      if (entry.mergedInto) {
        const ext = fromExtension ? `.${fromExtension}` : '';
        return c.body(null, 301, { ...base, Location: `${linkedData.BASE_URI}/${kind}/${entry.mergedInto}${ext}` });
      }
      if (format === 'html') {
        // Straight to the entity's own OPAC page (person, subject, place or hub), not a search.
        const page = new URL('/opac.html', linkedData.BASE_URI);
        page.searchParams.set(...entityPageParams(kind, entry.label, uri));
        return c.body(null, 303, { ...base, Location: page.toString() });
      }
      // A hub lists the published works that are its expressions (bf:hasExpression).
      const expressions = kind === 'hub'
        ? linkedData.worksExpressing((await recordStore.listPublishedRecords()).map((r) => r.document), uri)
        : [];
      const doc = linkedData.authorityDocument(entry, expressions);
      if (format === 'jsonld') {
        return c.body(JSON.stringify(doc, null, 2), 200, { ...base, 'Content-Type': `${linkedData.MEDIA_TYPES.jsonld}; charset=utf-8` });
      }
      const text = format === 'ttl' ? await linkedData.authorityTurtle(doc)
        : format === 'rdf' ? linkedData.nTriplesToRdfXml(await linkedData.authorityNTriples(doc))
        : await linkedData.authorityNTriples(doc);
      return c.body(text, 200, { ...base, 'Content-Type': `${linkedData.MEDIA_TYPES[format]}; charset=utf-8` });
    }
    const found = await recordStore.findPublishedByUri(uri);
    if (!found) {
      return c.json({ error: 'No published record has this URI', uri }, 404);
    }
    // Who created and approved it, for the admin metadata LC writes (falls back to what the lookup gave).
    const full = await recordStore.getPublishedRecord(found.id).catch(() => null);
    const record = { ...found, document: linkedData.publishedDocument({ ...(full || {}), ...found, id: found.id, document: found.document }) };
    const alternates = (['jsonld', 'ttl', 'nt', 'rdf'] as const)
      .map((f) => `<${uri}.${f}>; rel="alternate"; type="${linkedData.MEDIA_TYPES[f]}"`)
      .join(', ');
    const headers: Record<string, string> = {
      Vary: 'Accept',
      Link: alternates,
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    };
    if (format === 'html') {
      const page = new URL('/opac.html', linkedData.BASE_URI);
      page.searchParams.set('work', record.id);
      return c.body(null, 303, { ...headers, Location: page.toString() });
    }
    if (format === 'jsonld') {
      return c.body(JSON.stringify(linkedData.toJsonLd(record.document), null, 2), 200, { ...headers, 'Content-Type': `${linkedData.MEDIA_TYPES.jsonld}; charset=utf-8` });
    }
    const body = format === 'ttl' ? await linkedData.toTurtle(record.document)
      : format === 'rdf' ? await linkedData.toRdfXmlText(record.document)
      : await linkedData.toNTriples(record.document);
    return c.body(body, 200, { ...headers, 'Content-Type': `${linkedData.MEDIA_TYPES[format]}; charset=utf-8` });
  } catch (error) {
    console.error('Resolve URI error:', uri, error);
    return c.json({ error: 'Failed to resolve the URI' }, 500);
  }
});

// 🪪 Local authority file: Moon's own people, organizations, places and topics, each with a permanent
// https://mooon.site/resource/<kind>/<id> address. Search is public (the entries are public data);
// adding needs a signed-in account; merging two entries for one person needs an admin.
const AUTHORITY_KINDS: string[] = [...ENTITY_KINDS];
/** Adds (or finds) the entity for a name a record links; an existing entity gains the record's outside links
 *  (LC, VIAF, Wikidata, ISNI, FAST, ORCID only). */
async function addLinkedEntity(input: { kind: string; label: string; variants: string[]; sameAs: string[]; data: Record<string, unknown> }, by: string) {
  const sameAs = input.sameAs.filter((u) => SAME_AS_HOSTS.test(u)).slice(0, 20);
  const result = await recordStore.addAuthority({ kind: input.kind as any, label: input.label, variants: input.variants, sameAs, data: input.data }, by);
  const missing = sameAs.filter((u) => !(result.authority.sameAs || []).includes(u));
  if (result.existing && missing.length) await recordStore.addAuthoritySameAs(result.authority.id, missing).catch(() => null);
  return result;
}
const KINDS_ERROR = `kind must be one of: ${ENTITY_KINDS.join(', ')}`;
const entityStrings = (v: unknown, max: number): string[] => (Array.isArray(v) ? v : [])
  .filter((s) => typeof s === 'string' && s.trim()).map((s: string) => s.trim().slice(0, 300)).slice(0, max);
/** An entity's details (dates, agent type …): a plain object under 50 KB; an agent's type must be LC's. */
function entityDetails(kind: string, raw: unknown): { data?: Record<string, unknown>; error?: string } {
  const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
  if (JSON.stringify(data).length > 50_000) return { error: 'Details are too large' };
  if (kind === 'agent' && data.agentType !== undefined && !(AGENT_TYPES as readonly string[]).includes(String(data.agentType))) {
    return { error: `agentType must be one of: ${AGENT_TYPES.join(', ')}` };
  }
  // Agent records keep only public facts (S10): contact details and identity documents are refused.
  if (kind === 'agent') {
    const { removed } = withoutPrivateData(data);
    if (removed.length) return { error: `Agent records keep no private details (contact details, identity documents): remove ${removed.join(', ')}` };
  }
  return { data };
}
/** The preferred form for each script (S10), kept only when it is one of the entity's names in that script. */
const withPreferred = (data: Record<string, unknown>, label: string, variants: string[]) => {
  if (data.preferredForms === undefined) return data;
  const p = cleanPreferred(data.preferredForms, label, variants);
  const { preferredForms: _p, ...rest } = data;
  return Object.keys(p).length ? { ...rest, preferredForms: p } : rest;
};
const withUri = (a: any) => ({ ...a, uri: `${linkedData.BASE_URI}/${a.kind}/${a.id}` });
// What the public sees of an entity: who added which value (S18) stays with signed-in cataloguers.
const publicAuthority = (a: any) => ({ ...withUri(a), data: withoutOwners(a.data) });

app.get("/make-server-49c0e13c/authorities", async (c) => {
  try {
    const q = (c.req.query('q') || '').trim().slice(0, 200);
    const kind = c.req.query('kind') || null;
    if (kind && !AUTHORITY_KINDS.includes(kind)) return c.json({ error: KINDS_ERROR }, 400);
    const limit = Math.min(Math.max(Number(c.req.query('limit')) || 20, 1), 100);
    const found = await recordStore.searchAuthorities(q, kind as any, limit);
    const signedIn = !!(await getSession(c));
    return c.json({ authorities: found.map(signedIn ? withUri : publicAuthority) }, 200, { 'Access-Control-Allow-Origin': '*' });
  } catch (error) {
    console.error('Authority search error:', error);
    return c.json({ error: 'Authority search failed' }, 500);
  }
});

// The entity that already has one of these outside links (?uri=…, repeatable; LC, VIAF, Wikidata …), so a
// copy from LC or Wikidata opens Moon's existing entity instead of making a second one. Public, like search.
app.get("/make-server-49c0e13c/authorities/by-link", async (c) => {
  try {
    const uris = (c.req.queries('uri') || []).map((u) => u.trim()).filter((u) => /^https?:\/\/\S{3,300}$/.test(u)).slice(0, 20);
    if (!uris.length) return c.json({ error: 'uri: one or more outside links' }, 400);
    const kind = c.req.query('kind') || null;
    if (kind && !AUTHORITY_KINDS.includes(kind)) return c.json({ error: KINDS_ERROR }, 400);
    const found = await recordStore.findAuthorityByLinks(uris, kind as any);
    return c.json({ authority: found ? publicAuthority(found) : null }, 200, { 'Access-Control-Allow-Origin': '*' });
  } catch (error) {
    console.error('Authority by-link error:', error);
    return c.json({ error: 'Failed to look up the link' }, 500);
  }
});

app.post("/make-server-49c0e13c/authorities", async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'Sign in to add authority entries' }, 401);
    const body = await c.req.json().catch(() => ({}));
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    if (!AUTHORITY_KINDS.includes(body.kind)) return c.json({ error: KINDS_ERROR }, 400);
    if (!label || label.length > 300) return c.json({ error: 'A name (label) of up to 300 characters is required' }, 400);
    const { data, error: detailsError } = entityDetails(body.kind, body.data);
    if (!data) return c.json({ error: detailsError }, 400);
    const variants = entityStrings(body.variants, 50);
    const sameAsNew = entityStrings(body.sameAs, 20);
    const created = { label, variants, sameAs: sameAsNew, data: withPreferred(data, label, variants) };
    const owned = applyOwnership({ label: '', variants: [], sameAs: [] }, created,
      { username: session.username, library: await libraryOf(session.username), admin: session.role === 'admin' }, new Date().toISOString());
    const result = await recordStore.addAuthority({
      kind: body.kind, label, variants, sameAs: sameAsNew,
      note: typeof body.note === 'string' ? body.note.slice(0, 2000) : undefined, data: withOwners(created.data, owned.owners),
    }, session.username);
    return c.json({ existing: result.existing, authority: withUri(result.authority) }, result.existing ? 200 : 201);
  } catch (error) {
    console.error('Authority add error:', error);
    return c.json({ error: 'Failed to add the authority entry' }, 500);
  }
});

// Super Admin: links the names and subjects of records saved before every save linked them. Works in
// batches (offset / limit) so a large catalogue does not time out; each changed record gets a new version
// noted "authority links", so it can be reverted from its history like any edit.
/**
 * Links the names, subjects, places and publishers of one batch of records (offset / limit) to entities, the
 * way every save does. Each changed record gets a new version noted "authority links" (a published record's
 * published version moves with it), so it can be reverted from its history like any edit.
 */
async function linkRecordsBatch(offset: number, limit: number, by: string) {
  const records = (await recordStore.listRecords()).sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));
  const batch = records.slice(offset, offset + limit);
  let changed = 0, linked = 0, mirrored = 0;
  const failed: string[] = [];
  for (const rec of batch as any[]) {
    try {
      const document = JSON.parse(JSON.stringify(rec.document));
      const upgraded = upgradeLegacyTerms(document);
      const n = await linkAuthorities(document, (input) => addLinkedEntity(input, by), (a) => withUri(a).uri);
      // LC-, VIAF- and Wikidata-linked headings get their Moon entity (the record itself is unchanged by this).
      mirrored += await mirrorOutsideLinked(document, (input) => addLinkedEntity(input, by));
      if (!n && !upgraded) continue;
      await recordStore.saveRecord({ ...rec, document, saved: new Date().toISOString() }, by, 'authority links',
        Number.isInteger(rec.version) ? rec.version : undefined);
      changed++;
      linked += n;
    } catch (error) {
      console.error(`Authority linking failed for ${rec.id}:`, error);
      failed.push(rec.id);
    }
  }
  const next = offset + batch.length < records.length ? offset + batch.length : null;
  return { total: records.length, processed: batch.length, changed, linked, mirrored, failed, next };
}

// Super Admin: the library's shelf list (CSV or TSV, one row per copy) becomes copies on the right records
// (copiesImport.tsx). { text, dryRun: true } only says what would happen; without dryRun, each record that gets
// copies is saved as a new version noted "copies import" (a published record stays published), so it can be
// undone from its history like any edit. A copy already on a record is never added twice.
app.post("/make-server-49c0e13c/records/copies-import", async (c) => {
  try {
    const admin = await isAdminSession(c);
    if (!admin) return c.json({ error: 'Super Admin session required' }, 403);
    const body = await c.req.json().catch(() => ({}));
    if (typeof body?.text !== 'string' || body.text.length > 2_000_000) return c.json({ error: 'Send { text: <the sheet as CSV or TSV> }' }, 400);
    const { rows, problems } = parseCopiesTable(body.text);
    if (!rows.length) return c.json({ error: problems[0] || 'No rows', problems }, 400);
    const records = await recordStore.listRecords();
    const plan = planImport(records as any[], rows);
    const count = (st: string) => plan.filter((p) => p.status === st).length;
    const summary = { rows: rows.length, add: count('add'), alreadyThere: count('already there'), noSuchBook: count('no such book'),
      severalBooks: count('several books'), repeated: count('repeated in the sheet') };
    const report = plan.map((p) => ({ line: p.line, status: p.status, recordId: p.recordId, title: p.title, isbn: p.row.isbn, shelfMark: p.row.shelfMark, library: p.row.library }));
    if (body.dryRun) return c.json({ dryRun: true, summary, problems, plan: report });
    const byId = new Map((records as any[]).map((r) => [r.id, r]));
    const salt = Date.now().toString(36);
    let saved = 0, added = 0;
    const failed: string[] = [];
    for (const [recordId, groups] of byRecord(plan)) {
      const rec = byId.get(recordId);
      try {
        let document = rec.document;
        for (const g of groups) { document = withCopies(document, g.instance, g.rows, salt); added += g.rows.length; }
        await recordStore.saveRecord({ ...rec, document, saved: new Date().toISOString() }, admin.username, 'copies import',
          Number.isInteger(rec.version) ? rec.version : undefined);
        saved++;
      } catch (error) {
        console.error(`Copies import failed for ${recordId}:`, error);
        failed.push(recordId);
      }
    }
    return c.json({ dryRun: false, summary, problems, plan: report, savedRecords: saved, addedCopies: added, failed });
  } catch (error) {
    console.error('Copies import error:', error);
    return c.json({ error: 'The copies could not be imported' }, 500);
  }
});

// Super Admin: links the records saved before every save linked them (the button in the account menu and on
// the linked-data scorecard).
app.post("/make-server-49c0e13c/authorities/link-records", async (c) => {
  try {
    const admin = await isAdminSession(c);
    if (!admin) return c.json({ error: 'Super Admin session required' }, 403);
    const offset = Math.max(0, Number(c.req.query('offset')) || 0);
    const limit = Math.min(100, Math.max(1, Number(c.req.query('limit')) || 50));
    return c.json(await linkRecordsBatch(offset, limit, admin.username));
  } catch (error) {
    console.error('Authority link-records error:', error);
    return c.json({ error: 'Failed to link records to authorities' }, 500);
  }
});

// The label cache (Phase 13 S19): refreshed by the nightly job (MOON_JOB_TOKEN) or by the Super Admin; read
// by anyone. No route writes a label by hand.
async function isJobCall(c: any): Promise<boolean> {
  const expected = Deno.env.get('MOON_JOB_TOKEN') || '';
  const given = c.req.header('X-Moon-Job-Token') || '';
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([given, expected].map((x) => crypto.subtle.digest('SHA-256', enc.encode(x))));
  return expected.length >= 32 && new Uint8Array(a).every((x, i) => x === new Uint8Array(b)[i]);
}
// LC for the nightly runner: what Moon links to at LC and when each was last fetched; then the runner sends
// back what it read from id.loc.gov (rows checked here: LC addresses only, LC-shaped labels).
app.get("/make-server-49c0e13c/jobs/label-cache/lc", async (c) => {
  if (!(await isJobCall(c))) return c.json({ error: 'Job token required' }, 403);
  const [records, entities, cachedRows] = await Promise.all([recordStore.listPublishedRecords(), recordStore.listAllAuthorities(), recordStore.allCachedLabels()]);
  const uris = labelCache.outsideUris([...records.map((r: any) => r.document), ...entities.map((e: any) => e.sameAs || [])]).filter((u) => labelCache.sourceOf(u) === 'lc');
  const since = (await recordStore.labelState('lc-feed-read')) || new Date(Date.now() - labelCache.STALE_DAYS * 86_400_000).toISOString();
  return c.json({ uris, cached: cachedRows.filter((r) => r.source === 'lc'), since });
});
app.post("/make-server-49c0e13c/jobs/label-cache/lc", async (c) => {
  if (!(await isJobCall(c))) return c.json({ error: 'Job token required' }, 403);
  const body = await c.req.json().catch(() => ({}));
  const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, labelCache.MAX_PER_RUN).filter((r: any) =>
    r && typeof r.uri === 'string' && labelCache.sourceOf(r.uri) === 'lc' && r.uri === labelCache.canonical(r.uri) && Array.isArray(r.labels) && r.labels.length <= 50
    && r.labels.every((l: any) => typeof l?.value === 'string' && l.value.length <= 500 && (l.lang === undefined || (typeof l.lang === 'string' && l.lang.length <= 20))));
  const at = new Date().toISOString();
  await recordStore.storeLabels(rows.map((r: any) => ({ uri: r.uri, source: 'lc', labels: r.labels.map((l: any) => ({ value: l.value, ...(l.lang ? { lang: l.lang } : {}) })), ...(typeof r.sourceModified === 'string' ? { sourceModified: r.sourceModified.slice(0, 40) } : {}), fetchedAt: at, ...(r.missing ? { missing: true } : {}) })));
  if (Number(body.lcFeedRead) > 0) await recordStore.setLabelState('lc-feed-read', at);
  return c.json({ stored: rows.length, refused: (Array.isArray(body.rows) ? body.rows.length : 0) - rows.length });
});
app.post("/make-server-49c0e13c/jobs/label-cache", async (c) => {
  if (!(await isJobCall(c))) return c.json({ error: 'Job token required' }, 403);
  try { return c.json(await refreshLabelCache()); } catch (error) {
    console.error('Label cache refresh error:', error);
    return c.json({ error: 'Label cache refresh failed' }, 500);
  }
});
app.post("/make-server-49c0e13c/admin/label-cache/refresh", async (c) => {
  const session = await getSession(c);
  if (session?.role !== 'admin') return c.json({ error: 'Only the Super Admin refreshes the label cache' }, 403);
  try { return c.json(await refreshLabelCache()); } catch (error) {
    console.error('Label cache refresh error:', error);
    return c.json({ error: String(error) }, 500);
  }
});
// What LC and Wikidata call things: ?uri=… (repeatable, up to 50). Public, as id.loc.gov and Wikidata are.
app.get("/make-server-49c0e13c/labels", async (c) => {
  const uris = [...new Set((c.req.queries('uri') || []).map((u) => labelCache.canonical(u)).filter((u) => labelCache.sourceOf(u)))].slice(0, 50);
  if (!uris.length) return c.json({ error: 'uri: one or more LC or Wikidata addresses' }, 400, { 'Access-Control-Allow-Origin': '*' });
  try {
    const rows = await recordStore.cachedLabels(uris);
    return c.json({ labels: Object.fromEntries(rows.filter((r) => !r.missing).map((r) => [r.uri, { source: r.source, labels: r.labels, fetchedAt: r.fetchedAt }])) }, 200,
      { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' });
  } catch (error) {
    console.error('Label lookup error:', error);
    return c.json({ labels: {} }, 200, { 'Access-Control-Allow-Origin': '*' });
  }
});

// The nightly job (GitHub Actions, .github/workflows/link-records.yml): the same linking, signed with the
// MOON_JOB_TOKEN secret instead of a person's session. Without the secret set, the job is off.
app.post("/make-server-49c0e13c/jobs/link-records", async (c) => {
  const expected = Deno.env.get('MOON_JOB_TOKEN') || '';
  const given = c.req.header('X-Moon-Job-Token') || '';
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([given, expected].map((x) => crypto.subtle.digest('SHA-256', enc.encode(x))));
  const same = expected.length >= 32 && new Uint8Array(a).every((x, i) => x === new Uint8Array(b)[i]);
  if (!same) return c.json({ error: 'Job token required' }, 403);
  try {
    const offset = Math.max(0, Number(c.req.query('offset')) || 0);
    const limit = Math.min(100, Math.max(1, Number(c.req.query('limit')) || 50));
    return c.json(await linkRecordsBatch(offset, limit, 'moon-nightly'));
  } catch (error) {
    console.error('Nightly link-records error:', error);
    return c.json({ error: 'Failed to link records to authorities' }, 500);
  }
});

// Authority-link report for a set of records (e.g. a MARC batch just imported): which names and subjects
// reach LC / VIAF / Wikidata …, which only Moon's own entry, which none. Body: { ids: [...] } (up to 500).
app.post("/make-server-49c0e13c/authorities/report", async (c) => {
  try {
    if (!(await getSession(c))) return c.json({ error: 'Sign in to see the authority report' }, 401);
    const body = await c.req.json().catch(() => ({}));
    const ids = (Array.isArray(body?.ids) ? body.ids : []).filter((x: unknown) => typeof x === 'string' && /^[A-Za-z0-9._:-]{1,120}$/.test(x)).slice(0, 500);
    if (!ids.length) return c.json({ error: 'ids: the record ids to report on' }, 400);
    const records = (await Promise.all(ids.map((id: string) => recordStore.getRecord(id).catch(() => null))))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => ({ id: r.id, title: r.title, document: r.document }));
    const entryIds = [...new Set(records.flatMap((r) => headingsOf(r.document).map((h) => moonAuthorityId(h.uri)).filter((x): x is string => !!x)))].slice(0, 1000);
    const entries = new Map<string, { sameAs: string[] }>();
    await Promise.all(entryIds.map(async (id) => {
      const a = await recordStore.getAuthority(id).catch(() => null);
      if (a) entries.set(id, { sameAs: a.sameAs || [] });
    }));
    return c.json({ records: records.length, ...authorityReport(records, (id) => entries.get(id)) });
  } catch (error) {
    console.error('Authority report error:', error);
    return c.json({ error: 'Failed to build the authority report' }, 500);
  }
});

// 🧩 One entity (Phase 10): the entry, its address, and how many records use it (public, like search).
// The "Link entities" panel's work list: every entity, unlinked first, with what cataloguers decided before
// (rejected candidates, "no match"). See reconcileQueue.tsx. Signed-in cataloguers only.
app.get("/make-server-49c0e13c/authorities/reconcile-queue", async (c) => {
  if (!(await getSession(c))) return c.json({ error: 'Sign in to link entities' }, 401);
  try {
    const entities = await recordStore.listAllAuthorities();
    const stored = await kv.mget(entities.map((e: any) => NOTE_PREFIX + e.id)).catch(() => []);
    const notes = new Map<string, unknown>(entities.map((e: any, i: number) => [e.id, (stored as any[])[i]]));
    const rows = queueOf(entities as any[], notes).map(withUri);
    return c.json({ total: rows.length, unlinked: rows.filter((r: any) => !r.linked).length, rows });
  } catch (error) {
    console.error('Reconcile queue error:', error);
    return c.json({ error: 'Could not list the entities to link' }, 500);
  }
});

app.get("/make-server-49c0e13c/authorities/:id", async (c) => {
  try {
    const entry = await recordStore.getAuthority(c.req.param('id'));
    if (!entry) return c.json({ error: 'No entity with this id' }, 404);
    const signedIn = !!(await getSession(c));
    const withAddress = signedIn ? withUri(entry) : publicAuthority(entry);
    // Records that point at the entity, or at the same thing in LC, VIAF or Wikidata.
    const usage = await recordStore.authorityUsage(withAddress.uri, withAddress.sameAs || []);
    // Where each outside link came from, for signed-in catalogers only (it names who added it).
    const linkSources = (await getSession(c)) ? await recordStore.listLinkSources(withAddress.id).catch(() => []) : undefined;
    return c.json({ authority: withAddress, usage, ...(linkSources ? { linkSources } : {}) }, 200, { 'Access-Control-Allow-Origin': '*' });
  } catch (error) {
    console.error('Entity read error:', error);
    return c.json({ error: 'Failed to read the entity' }, 500);
  }
});

// 🕸️ How an entity relates to other entities, read from the records that use it (public, like the entity):
// who it worked with, what it wrote about, who published it and where. Each related entity is Moon's own
// when Moon has it (found by its Moon address or by its LC, VIAF or Wikidata link).
app.get("/make-server-49c0e13c/authorities/:id/relations", async (c) => {
  try {
    const entry = await recordStore.getAuthority(c.req.param('id'));
    if (!entry) return c.json({ error: 'No entity with this id' }, 404);
    const withAddress = withUri(entry);
    const links = [withAddress.uri, ...(withAddress.sameAs || [])];
    const usage = await recordStore.authorityUsage(withAddress.uri, withAddress.sameAs || []);
    const records = (await Promise.all(usage.records.map((r) => recordStore.getRecord(r.id).catch(() => null))))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => ({ id: r.id, document: r.document }));
    const titles = Object.fromEntries(usage.records.map((r) => [r.id, r.title]));
    const related = await resolveRelated(relatedFrom(links, records), async (uri, kind) => {
      const found = await recordStore.findAuthorityByLinks([uri], kind as any);
      return found && found.id !== entry.id ? { id: found.id, label: found.label } : null;
    });
    const rows = related
      .filter((r) => r.entityId !== entry.id)
      .map((r) => ({ ...r, entityUri: r.entityId ? `${linkedData.BASE_URI}/${r.kind}/${r.entityId}` : null, titles: r.records.map((id) => titles[id] || id) }));
    return c.json({ records: usage.count, read: records.length, relations: rows }, 200, { 'Access-Control-Allow-Origin': '*' });
  } catch (error) {
    console.error('Entity relations error:', error);
    return c.json({ error: 'Failed to read the entity\'s relations' }, 500);
  }
});

// 👣 The OPAC reports each page a reader opens. Robots and signed-in staff are not counted; no address is kept.
app.post("/make-server-49c0e13c/opac/visit", async (c) => {
  try {
    const ua = c.req.header('user-agent') || '';
    if (isBot(ua) || c.req.header('X-Moon-Session')) return c.json({ counted: false });
    const visit = visitFrom(await c.req.json().catch(() => null));
    if (!visit) return c.json({ error: 'kind: home, search, work, person, subject, hub, place, authors or subjects; ref: what was opened' }, 400);
    const ip = (c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '').split(',')[0].trim();
    const day = visitDay();
    const visitor = await visitorKey(ip, ua, day, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'moon');
    const { error } = await (supabase as any).rpc('moon_record_visit', { p_day: day, p_visitor: visitor, p_kind: visit.kind, p_ref: visit.ref });
    if (error) throw new Error(error.message);
    return c.json({ counted: true });
  } catch (error) {
    console.error('OPAC visit error:', error);
    return c.json({ counted: false }, 500);
  }
});

// 📊 OPAC insights, anonymous (see opacInsights.tsx): once a day the OPAC says what kind of device, language,
// country and source a visitor has; for each search, what was searched and how many results it found; and which
// result a reader opened. Same daily hashed visitor key as /opac/visit, so nobody can be followed between days.
// Robots and signed-in staff are not counted. The country is the request's own (never looked up from an address).
app.post("/make-server-49c0e13c/opac/event", async (c) => {
  try {
    const ua = c.req.header('user-agent') || '';
    if (isBot(ua) || c.req.header('X-Moon-Session')) return c.json({ counted: false });
    const event = parseEvent(await c.req.json().catch(() => null));
    if (!event) return c.json({ error: 'event: context, search or open (see opacInsights.tsx)' }, 400);
    const ip = (c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '').split(',')[0].trim();
    const day = visitDay();
    const visitor = await visitorKey(ip, ua, day, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'moon');
    const db = supabase as any;
    let result;
    if (event.t === 'context') {
      result = await db.rpc('moon_record_context', {
        p_day: day, p_visitor: visitor, p_device: event.device, p_lang: event.lang, p_browser_lang: event.browserLang,
        // The country the page reports (Cloudflare's own check of this site), else the request's, else unknown.
        p_country: event.country || countryFrom(c.req.header('cf-ipcountry')), p_source: event.source, p_entry: event.entry,
        p_hour: baghdadHour(),
      });
    } else if (event.t === 'action') {
      result = await db.rpc('moon_record_action', { p_day: day, p_visitor: visitor, p_action: event.action });
    } else if (event.t === 'end') {
      result = await db.rpc('moon_record_end', { p_day: day, p_visitor: visitor, p_pages: event.pages, p_seconds: event.seconds });
    } else if (event.t === 'search') {
      result = await db.rpc('moon_record_search', {
        p_day: day, p_visitor: visitor, p_query: event.query, p_results: event.results, p_script: event.script,
        p_lang: event.lang, p_filters: event.filters, p_max: MAX_SEARCHES_PER_VISITOR_DAY,
      });
    } else {
      result = await db.rpc('moon_record_open', { p_day: day, p_visitor: visitor, p_query: event.query, p_rank: event.rank });
    }
    if (result.error) throw new Error(result.error.message);
    return c.json({ counted: true });
  } catch (error) {
    console.error('OPAC event error:', error);
    return c.json({ counted: false }, 500);
  }
});

// The dashboard's "What readers do" card (signed-in staff): searches that found nothing, the most searched,
// devices, languages, countries and where readers came from, over ?days= (default 30).
app.get("/make-server-49c0e13c/opac/insights", async (c) => {
  try {
    if (!(await getSession(c))) return c.json({ error: 'Sign in to see what readers do' }, 401);
    const days = Math.min(366, Math.max(1, Number(c.req.query('days')) || 30));
    const { data, error } = await (supabase as any).rpc('moon_insight_stats', { p_today: visitDay(), p_days: days });
    if (error) throw new Error(error.message);
    return c.json(data);
  } catch (error) {
    console.error('OPAC insights error:', error);
    return c.json({ error: 'Could not read what readers do' }, 500);
  }
});

// The dashboard's OPAC visitors card (signed-in staff): today, the last 7 days, each day of ?days= (default 30).
app.get("/make-server-49c0e13c/opac/visits", async (c) => {
  try {
    if (!(await getSession(c))) return c.json({ error: 'Sign in to see OPAC visitors' }, 401);
    const days = Math.min(366, Math.max(1, Number(c.req.query('days')) || 30));
    const { data, error } = await (supabase as any).rpc('moon_visit_stats', { p_today: visitDay(), p_days: days });
    if (error) throw new Error(error.message);
    return c.json(data);
  } catch (error) {
    console.error('OPAC visits error:', error);
    return c.json({ error: 'Could not read OPAC visitors' }, 500);
  }
});


// Edits an entity (signed in). Body: { label, variants, sameAs, note, data, version }; version is the one
// the editor loaded, and if someone saved since, 409 with the current entry. Every edit keeps the old state.
app.put("/make-server-49c0e13c/authorities/:id", async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'Sign in to edit entities' }, 401);
    const id = c.req.param('id');
    const current = await recordStore.getAuthority(id);
    if (!current || current.mergedInto) return c.json({ error: 'No entity with this id (or it was merged)' }, 404);
    const body = await c.req.json().catch(() => ({}));
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    if (!label || label.length > 300) return c.json({ error: 'A name (label) of up to 300 characters is required' }, 400);
    const sameAs = entityStrings(body.sameAs, 20);
    const badLink = sameAs.find((u) => !SAME_AS_HOSTS.test(u));
    if (badLink) return c.json({ error: `Not an LC, VIAF, Wikidata, FAST, ISNI or ORCID link: ${badLink}` }, 400);
    const { data, error: detailsError } = entityDetails(current.kind, body.data);
    if (!data) return c.json({ error: detailsError }, 400);
    const variants = entityStrings(body.variants, 50).filter((v) => v !== label);
    // Protected values (S18): what another library added stays unless that library or the Super Admin removes it.
    const next = { label, variants, sameAs, data: withPreferred(data, label, variants) };
    const ownership = applyOwnership(
      { label: current.label, variants: current.variants || [], sameAs: current.sameAs || [], data: current.data || {} },
      next, { username: session.username, library: await libraryOf(session.username), admin: session.role === 'admin' }, new Date().toISOString());
    if (ownership.blocked.length) return c.json({ error: blockedMessage(ownership.blocked), protected: ownership.blocked }, 409);
    const result = await recordStore.updateAuthority(id, {
      label, variants, sameAs,
      note: typeof body.note === 'string' ? body.note.slice(0, 2000) : null, data: withOwners(next.data, ownership.owners),
    }, session.username, Number.isInteger(body.version) ? body.version : undefined);
    if (result.status === 'conflict') return c.json({ error: 'Someone saved this entity since you opened it', authority: result.authority && withUri(result.authority) }, 409);
    if (result.status === 'duplicate') return c.json({ error: 'Another entity of this kind already has this name', other: result.other && withUri(result.other) }, 409);
    if (result.status !== 'ok' || !result.authority) return c.json({ error: 'No entity with this id (or it was merged)' }, 404);
    return c.json({ authority: withUri(result.authority) });
  } catch (error) {
    console.error('Entity edit error:', error);
    return c.json({ error: 'Failed to save the entity' }, 500);
  }
});

// Earlier states of an entity, newest first (public: the entity is public data; who changed it is shown
// to signed-in users only).
app.get("/make-server-49c0e13c/authorities/:id/history", async (c) => {
  try {
    const signedIn = !!(await getSession(c));
    const history = (await recordStore.authorityHistory(c.req.param('id')))
      .map((h: any) => (signedIn ? h : { ...h, changedBy: undefined }));
    return c.json({ history });
  } catch (error) {
    console.error('Entity history error:', error);
    return c.json({ error: 'Failed to read the history' }, 500);
  }
});

// Links a Moon authority entry to the same person, place or subject elsewhere (owl:sameAs).
const SAME_AS_HOSTS = /^https?:\/\/(id\.loc\.gov\/(authorities|rwo)\/|viaf\.org\/viaf\/|(www\.)?wikidata\.org\/(wiki|entity)\/Q\d+$|id\.worldcat\.org\/fast\/|isni\.org\/isni\/|orcid\.org\/)/;
// Each link keeps where it came from (Phase 13 S18): { uri, method?: person | reconcile | record | import,
// confidence?: 0..1 (a machine match), evidence?: why (its reasons) }. Without a method it is a person's link.
app.post("/make-server-49c0e13c/authorities/:id/same-as", async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'Sign in to link authority entries' }, 401);
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const uri = typeof body?.uri === 'string' ? body.uri.trim() : '';
    if (!SAME_AS_HOSTS.test(uri) || uri.length > 300) return c.json({ error: 'Link to LC, VIAF, Wikidata, FAST, ISNI or ORCID' }, 400);
    const method = ['person', 'reconcile', 'record', 'import'].includes(body?.method) ? body.method : 'person';
    const confidence = typeof body?.confidence === 'number' && body.confidence >= 0 && body.confidence <= 1 ? Math.round(body.confidence * 1000) / 1000 : null;
    const evidence = typeof body?.evidence === 'string' ? body.evidence.trim().slice(0, 500) : null;
    const updated = await recordStore.addAuthoritySameAs(id, [uri]);
    if (!updated) return c.json({ error: 'No authority entry with this id' }, 404);
    await recordStore.addLinkSource(id, { uri, addedBy: session.username, method, confidence, evidence });
    return c.json({ authority: withUri(updated) });
  } catch (error) {
    console.error('Authority same-as error:', error);
    return c.json({ error: 'Failed to link the authority entry' }, 500);
  }
});

// A cataloguer's decision on one entity: { reject: <candidate address> } | { noMatch: true } | { checked: true } | { clear: true }.
app.post("/make-server-49c0e13c/authorities/:id/reconcile-note", async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Sign in to link entities' }, 401);
  try {
    const id = c.req.param('id');
    if (!/^[A-Za-z0-9._:-]{1,120}$/.test(id)) return c.json({ error: 'Not an entity id' }, 400);
    const action = parseNoteAction(await c.req.json().catch(() => null));
    if (!action) return c.json({ error: 'Send { reject: <address> }, { noMatch: true }, { checked: true } or { clear: true }' }, 400);
    const note = applyNote(await kv.get(NOTE_PREFIX + id).catch(() => null), action, session.username);
    await kv.set(NOTE_PREFIX + id, note);
    return c.json({ note });
  } catch (error) {
    console.error('Reconcile note error:', error);
    return c.json({ error: 'Could not save the decision' }, 500);
  }
});

app.post("/make-server-49c0e13c/authorities/:id/merge", async (c) => {
  try {
    if (!(await isAdminSession(c))) return c.json({ error: 'Only an admin can merge authority entries' }, 403);
    const { into } = await c.req.json().catch(() => ({}));
    if (typeof into !== 'string' || !into) return c.json({ error: 'into (the entry to keep) is required' }, 400);
    const admin = await getSession(c);
    const asked = await recordStore.requestEntityChange('merge', c.req.param('id'), into, 'Merged directly by the Super Admin', admin!.username);
    const done = asked ? await recordStore.decideEntityRequest(asked.id, admin!.username, true) : null;
    if (!done || done.status !== 'approved') return c.json({ error: 'Both entries must exist, be unmerged, differ, and be of the same kind' }, 409);
    const kept = await recordStore.getAuthority(into);
    return c.json({ merged: true, authority: kept && withUri(kept) });
  } catch (error) {
    console.error('Authority merge error:', error);
    return c.json({ error: 'Failed to merge the entries' }, 500);
  }
});

// 🗳️ Merge and split requests (Phase 13 S18): any cataloger asks, with a reason; the Super Admin decides.
// { kind: "merge", into, reason } asks to merge this entity into another; { kind: "split", reason } asks to
// take this (merged) entity out of the one it was merged into. An approved merge can be split again exactly.
app.post("/make-server-49c0e13c/authorities/:id/requests", async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'Sign in to ask for a merge or split' }, 401);
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!reason || reason.length > 1000) return c.json({ error: 'Say why, in 1–1000 characters' }, 400);
    let into = '';
    if (body?.kind === 'merge') into = typeof body.into === 'string' ? body.into : '';
    else if (body?.kind === 'split') into = (await recordStore.getAuthority(id))?.mergedInto || '';
    else return c.json({ error: 'kind: merge or split' }, 400);
    const request = into ? await recordStore.requestEntityChange(body.kind, id, into, reason, session.username) : null;
    if (!request) return c.json({ error: body.kind === 'merge' ? 'Both entities must exist, be unmerged, differ, and be of the same kind' : 'This entity is not merged into another' }, 409);
    return c.json({ request });
  } catch (error) {
    console.error('Entity request error:', error);
    return c.json({ error: 'Failed to send the request' }, 500);
  }
});

app.get("/make-server-49c0e13c/authorities/:id/merged", async (c) => {
  try {
    if (!(await getSession(c))) return c.json({ error: 'Sign in' }, 401);
    return c.json({ merged: await recordStore.mergedInto(c.req.param('id')) });
  } catch (error) {
    console.error('Merged entities error:', error);
    return c.json({ error: 'Failed to list merged entities' }, 500);
  }
});

app.get("/make-server-49c0e13c/entity-requests", async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'Sign in' }, 401);
    const status = ['open', 'approved', 'declined'].includes(c.req.query('status') || '') ? c.req.query('status') as any : 'open';
    const all = await recordStore.listEntityRequests(status);
    // The Super Admin sees every request; a cataloger sees their own.
    const admin = !!(await isAdminSession(c));
    return c.json({ requests: admin ? all : all.filter((r) => r.askedBy === session.username), mayDecide: admin });
  } catch (error) {
    console.error('Entity requests list error:', error);
    return c.json({ error: 'Failed to list requests' }, 500);
  }
});

app.post("/make-server-49c0e13c/entity-requests/:rid/decide", async (c) => {
  try {
    if (!(await isAdminSession(c))) return c.json({ error: 'Only the Super Admin decides merges and splits' }, 403);
    const session = await getSession(c);
    const rid = Number(c.req.param('rid'));
    if (!Number.isInteger(rid) || rid < 1) return c.json({ error: 'Invalid request' }, 400);
    const { approve } = await c.req.json().catch(() => ({}));
    if (typeof approve !== 'boolean') return c.json({ error: 'approve: true or false' }, 400);
    const request = await recordStore.decideEntityRequest(rid, session!.username, approve);
    if (!request) return c.json({ error: 'This request was already decided' }, 409);
    return c.json({ request });
  } catch (error) {
    console.error('Entity request decide error:', error);
    return c.json({ error: 'Failed to decide the request' }, 500);
  }
});

// 👯 Before a save: other records that look like the same book (same ISBN, LCCN or normalized title), so
// the editor can ask before a duplicate goes in. { id, document } → { duplicates: [{ id, title, reasons }] }.
app.post("/make-server-49c0e13c/records/check-duplicates", async (c) => {
  try {
    if (!(await getSession(c))) return c.json({ error: 'Sign in to check records' }, 401);
    const { id, document } = await c.req.json().catch(() => ({}));
    if (!document || !Array.isArray(document['@graph'])) return c.json({ error: 'A JSON-LD document with @graph is required' }, 400);
    if (JSON.stringify(document).length > 2_000_000) return c.json({ error: 'Record is too large' }, 413);
    return c.json({ duplicates: await recordStore.findDuplicates(typeof id === 'string' ? id : null, document) });
  } catch (error) {
    console.error('Duplicate check error:', error);
    return c.json({ error: 'Duplicate check failed' }, 500);
  }
});

// 🔎 Search records on the server: ?q=words&status=&cataloger=&language=&template=&limit=&offset=
// Every word must match, however it is spelled (Arabic letter variants and diacritics are folded).
// Same visibility rule as the list: the public and ?view=published search published versions only.
// Registered before /records/:id so "search" is not read as a record id.
app.get("/make-server-49c0e13c/records/search", async (c) => {
  try {
    const published = c.req.query('view') === 'published' || !(await getSession(c));
    const num = (v: string | undefined, d: number) => (v && /^\d+$/.test(v) ? Number(v) : d);
    const result = await recordStore.searchRecords({
      query: (c.req.query('q') || '').slice(0, 200),
      published,
      // A status filter only makes sense on working copies; published results are all 'complete'.
      status: published ? undefined : c.req.query('status'),
      cataloger: c.req.query('cataloger'),
      language: c.req.query('language'),
      template: c.req.query('template'),
      limit: Math.min(num(c.req.query('limit'), 50), 200),
      offset: num(c.req.query('offset'), 0),
    });
    return c.json({
      ...result,
      records: result.records.map((r) => ({ ...r, nodeCount: r.document?.['@graph']?.length || 0 })),
    });
  } catch (error) {
    console.error('Search records error:', error);
    return c.json({ error: 'Search failed' }, 500);
  }
});

// A link between two works (workRelations.tsx): { target: <record id or work address>, relationship: <LC term>,
// remove?: true }. A reviewer or the Super Admin; the record is saved as a new version noted "work link" (a
// published record stays published), so it can be undone from its history. The other book's page shows the
// inverse by itself; nothing is written on it.
app.post("/make-server-49c0e13c/records/:id/work-links", async (c) => {
  const session = await getSession(c);
  if (!canReview(session)) return c.json({ error: 'A reviewer or the Super Admin links works' }, 403);
  try {
    const body = await c.req.json().catch(() => ({}));
    if (!isRelationTerm(body?.relationship)) return c.json({ error: 'relationship: one of the LC terms Moon knows (translationof, commentaryon, partof …)' }, 400);
    const rec: any = await recordStore.getRecord(c.req.param('id'));
    if (!rec) return c.json({ error: 'No record with this id' }, 404);
    const target = typeof body?.target === 'string' ? body.target.trim() : '';
    let targetUri = /^https?:///.test(target) ? target : '';
    if (!targetUri && target) {
      const other: any = await recordStore.getRecord(target);
      targetUri = other ? workNodeOf(other.document)?.['@id'] || '' : '';
    }
    const sourceWork = workNodeOf(rec.document)?.['@id'];
    if (!targetUri || targetUri.length > 300) return c.json({ error: 'target: the other book's record id or work address' }, 400);
    if (targetUri === sourceWork) return c.json({ error: 'A work cannot be linked to itself' }, 400);
    const document = body?.remove === true ? withoutRelation(rec.document, body.relationship, targetUri) : withRelation(rec.document, body.relationship, targetUri);
    if (JSON.stringify(document) === JSON.stringify(rec.document)) {
      return c.json({ unchanged: true, relations: readWorkRelations(workNodeOf(document)) });
    }
    await recordStore.saveRecord({ ...rec, document, saved: new Date().toISOString() }, session!.username, 'work link',
      Number.isInteger(rec.version) ? rec.version : undefined);
    return c.json({ unchanged: false, relations: readWorkRelations(workNodeOf(document)) });
  } catch (error) {
    console.error('Work link error:', error);
    return c.json({ error: 'The link could not be saved' }, 500);
  }
});

// 📖 Load BIBFRAME Record
app.get("/make-server-49c0e13c/records/:id", async (c) => {
  try {
    const id = c.req.param('id');
    // The public, and anyone asking with ?view=published (the OPAC), get the published version: an edit
    // waiting for review never replaces what the catalogue shows. Signed-in catalogers get the working copy.
    const published = c.req.query('view') === 'published' || !(await getSession(c));
    const record = published ? await recordStore.getPublishedRecord(id) : await recordStore.getRecord(id);

    if (!record) {
      return c.json({ error: 'Record not found' }, 404);
    }
    console.log(`[RECORDS] Loaded record ${id}${published ? ' (published)' : ''}`);
    
    return c.json(record);
  } catch (error) {
    console.error('Load record error:', error);
    return c.json({ error: 'Failed to load record' }, 500);
  }
});

// 📋 List All Records
app.get("/make-server-49c0e13c/records", async (c) => {
  try {
    // Same rule as a single record: the public and ?view=published get published versions only.
    const published = c.req.query('view') === 'published' || !(await getSession(c));
    const records = published ? await recordStore.listPublishedRecords() : await recordStore.listRecords();

    const recordList = records
      .map((record) => ({
        id: record.id,
        title: record.title || 'Untitled',
        document: record.document,
        metadata: record.metadata,
        status: record.status,
        cataloger: record.cataloger,
        approvedBy: record.approvedBy,
        approvedAt: record.approvedAt,
        createdAt: record.createdAt || record.saved,
        saved: record.saved,
        version: record.version,
        publishedVersion: record.publishedVersion,
        assignedTo: record.assignedTo,
        // The uploaded (or Open Library / Google Books) cover: the OPAC and the records list show it.
        coverUrl: record.coverUrl,
        nodeCount: record.document?.['@graph']?.length || 0,
      }));

    // Sort by saved date, newest first
    recordList.sort((a: any, b: any) => new Date(b.saved).getTime() - new Date(a.saved).getTime());
    
    console.log(`[RECORDS] Listed ${recordList.length} records`);
    
    return c.json({ records: recordList, count: recordList.length });
  } catch (error) {
    console.error('List records error:', error);
    return c.json({ error: 'Failed to list records' }, 500);
  }
});

// ✅ Approve / reject a pending record (Super Admin only)
async function reviewRecord(c: any, decision: 'complete' | 'needs-review') {
  try {
    // The Super Admin and reviewers review; a reviewer never reviews their own record.
    const admin = await getSession(c);
    if (!admin || !canReview(admin)) {
      return c.json({ success: false, error: 'Only the Super Admin and reviewers can approve or return records' }, 403);
    }
    const id = c.req.param('id');
    if (admin.role !== 'admin') {
      const target = await recordStore.getRecord(id);
      if (target?.cataloger === admin.username) {
        return c.json({ success: false, error: 'You cannot review your own record' }, 403);
      }
    }
    // A return can say what to fix: { "reason": "..." }, shown to the cataloger in their notification.
    const { reason } = await c.req.json().catch(() => ({}));
    if (decision === 'complete') {
      const current = await recordStore.getRecord(id);
      const missing = current ? missingForPublish(current.document) : [];
      if (missing.length) {
        return c.json({ success: false, error: 'This record is missing required fields and cannot be published yet', missing }, 422);
      }
    }
    const record = await recordStore.reviewRecord(id, decision, admin.username);
    if (!record) {
      return c.json({ success: false, error: 'Record not found' }, 404);
    }
    console.log(`[RECORDS] ${admin.username} set record ${id} -> ${decision} (v${record.version})`);
    fireHooks(decision === 'complete' ? 'record.published' : 'record.returned', { id, title: record.title, version: record.version, status: decision });
    if (record.cataloger && record.cataloger !== admin.username) {
      await recordStore.notify(record.cataloger, decision === 'complete' ? 'approved' : 'returned', record, admin.username,
        typeof reason === 'string' ? reason.slice(0, 1000) : undefined);
    }
    return c.json({
      success: true,
      id,
      status: decision,
      version: record.version,
      approvedBy: record.approvedBy,
      approvedAt: record.approvedAt,
    });
  } catch (error) {
    console.error('Review record error:', error);
    return c.json({ success: false, error: 'Failed to update record status' }, 500);
  }
}

app.post("/make-server-49c0e13c/records/:id/approve", (c) => reviewRecord(c, 'complete'));
app.post("/make-server-49c0e13c/records/:id/reject", (c) => reviewRecord(c, 'needs-review'));

// 🔔 Notifications for the signed-in user: newest 30 and the unread count (a new user's welcome is
// created on their first look). POST .../read marks { ids } read, or all of them without ids.
app.get("/make-server-49c0e13c/notifications", async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'Sign in to see notifications' }, 401);
    return c.json(await recordStore.listNotifications(session.username));
  } catch (error) {
    console.error('Notifications error:', error);
    return c.json({ error: 'Failed to load notifications' }, 500);
  }
});

app.post("/make-server-49c0e13c/notifications/read", async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'Sign in to see notifications' }, 401);
    const { ids } = await c.req.json().catch(() => ({}));
    const valid = Array.isArray(ids) ? ids.filter((i: unknown) => Number.isInteger(i)).slice(0, 200) : undefined;
    return c.json({ marked: await recordStore.markNotificationsRead(session.username, valid) });
  } catch (error) {
    console.error('Mark notifications read error:', error);
    return c.json({ error: 'Failed to update notifications' }, 500);
  }
});

// 👤 Assign a record to a reviewer ({ username }), or clear it ({ username: null }). Super Admin only;
// the reviewer is notified.
app.post("/make-server-49c0e13c/records/:id/assign", async (c) => {
  try {
    const admin = await isAdminSession(c);
    if (!admin) return c.json({ error: 'Super Admin session required' }, 403);
    const { username } = await c.req.json().catch(() => ({}));
    const who = typeof username === 'string' && username.trim() ? username.trim() : null;
    if (who && !(await isReviewer(who))) return c.json({ error: `${who} is not a reviewer` }, 400);
    const record = await recordStore.getRecord(c.req.param('id'));
    if (!record || !(await recordStore.assignRecord(record.id, who))) return c.json({ error: 'Record not found' }, 404);
    if (who && who !== admin.username) await recordStore.notify(who, 'assigned', record, admin.username);
    return c.json({ success: true, id: record.id, assignedTo: who });
  } catch (error) {
    console.error('Assign record error:', error);
    return c.json({ error: 'Failed to assign the record' }, 500);
  }
});

// 🖼️ A record's cover. Set by the record's cataloger, a reviewer or the admin: either a picture
// ({ image: "data:image/jpeg;base64,…" }, shrunk in the browser first) or { isbn } to take the cover
// from Open Library or Google Books. Stored in the public "covers" bucket; no new version, no review.
async function coverAccess(c: any) {
  const session = await getSession(c);
  if (!session) return { error: c.json({ error: 'Sign in to change covers' }, 401) };
  const record = await recordStore.getRecord(c.req.param('id'));
  if (!record) return { error: c.json({ error: 'Record not found' }, 404) };
  if (record.cataloger !== session.username && !canReview(session)) {
    return { error: c.json({ error: "Only the record's cataloger or a reviewer can change its cover" }, 403) };
  }
  return { record };
}

app.put("/make-server-49c0e13c/records/:id/cover", async (c) => {
  try {
    const a = await coverAccess(c);
    if (a.error) return a.error;
    const body = await c.req.json().catch(() => ({}));
    let bytes: Uint8Array;
    let source: 'upload' | 'openlibrary' | 'googlebooks' = 'upload';
    if (typeof body.image === 'string') {
      const m = body.image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!m) return c.json({ error: 'image must be a JPEG, PNG or WebP data URL' }, 400);
      if (m[2].length > Math.ceil(recordStore.COVER_MAX_BYTES / 3) * 4) return c.json({ error: 'The picture is larger than 512 KB' }, 413);
      bytes = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
    } else if (body.isbn !== undefined) {
      const isbn = recordStore.cleanIsbn(body.isbn);
      if (!isbn) return c.json({ error: 'Not a valid ISBN' }, 400);
      const found = await recordStore.findCoverByIsbn(isbn);
      if (!found) return c.json({ error: 'No cover found for this ISBN in Open Library or Google Books' }, 404);
      bytes = found.bytes;
      source = found.source;
    } else {
      return c.json({ error: 'Send { image } or { isbn }' }, 400);
    }
    if (!recordStore.sniffImageType(bytes)) return c.json({ error: 'Not a JPEG, PNG or WebP image' }, 400);
    const coverUrl = await recordStore.putCover(a.record!.id, bytes, source);
    return c.json({ success: true, coverUrl, source });
  } catch (error) {
    console.error('Set cover error:', error);
    return c.json({ error: 'Failed to save the cover' }, 500);
  }
});

app.delete("/make-server-49c0e13c/records/:id/cover", async (c) => {
  try {
    const a = await coverAccess(c);
    if (a.error) return a.error;
    await recordStore.removeCover(a.record!.id);
    return c.json({ success: true });
  } catch (error) {
    console.error('Remove cover error:', error);
    return c.json({ error: 'Failed to remove the cover' }, 500);
  }
});

// 💬 Comments on a record's fields. The Super Admin and the record's cataloger may comment and resolve;
// a comment notifies the other side (the cataloger, or the Super Admin when the cataloger replies).
async function commentAccess(c: any) {
  const session = await getSession(c);
  if (!session) return { error: c.json({ error: 'Sign in to see comments' }, 401) };
  const record = await recordStore.getRecord(c.req.param('id'));
  if (!record) return { error: c.json({ error: 'Record not found' }, 404) };
  const mayWrite = canReview(session) || !record.cataloger || record.cataloger === session.username;
  return { session, record, mayWrite };
}

app.get("/make-server-49c0e13c/records/:id/comments", async (c) => {
  try {
    const a = await commentAccess(c);
    if (a.error) return a.error;
    return c.json({ comments: await recordStore.listComments(a.record!.id), mayWrite: a.mayWrite });
  } catch (error) {
    console.error('List comments error:', error);
    return c.json({ error: 'Failed to load comments' }, 500);
  }
});

app.post("/make-server-49c0e13c/records/:id/comments", async (c) => {
  try {
    const a = await commentAccess(c);
    if (a.error) return a.error;
    if (!a.mayWrite) return c.json({ error: 'Only the Super Admin and the record\'s cataloger can comment' }, 403);
    const { field, body } = await c.req.json().catch(() => ({}));
    if (typeof field !== 'string' || !/^[A-Za-z]+:[A-Za-z0-9_.-]{1,80}$/.test(field)) return c.json({ error: 'Invalid field' }, 400);
    if (typeof body !== 'string' || !body.trim() || body.length > 2000) return c.json({ error: 'A comment needs 1–2000 characters' }, 400);
    const comment = await recordStore.addComment(a.record!.id, field, body, a.session!.username);
    const to = a.session!.username === a.record!.cataloger ? SUPER_ADMIN_USERNAME : a.record!.cataloger;
    if (to && to !== a.session!.username) {
      await recordStore.notify(to, 'comment', a.record!, a.session!.username, body.trim().slice(0, 300));
    }
    return c.json({ comment });
  } catch (error) {
    console.error('Add comment error:', error);
    return c.json({ error: 'Failed to add the comment' }, 500);
  }
});

app.post("/make-server-49c0e13c/records/:id/comments/:cid/resolve", async (c) => {
  try {
    const a = await commentAccess(c);
    if (a.error) return a.error;
    if (!a.mayWrite) return c.json({ error: 'Only the Super Admin and the record\'s cataloger can resolve comments' }, 403);
    const cid = Number(c.req.param('cid'));
    if (!Number.isInteger(cid) || cid < 1) return c.json({ error: 'Invalid comment' }, 400);
    const { resolved } = await c.req.json().catch(() => ({}));
    const changed = await recordStore.resolveComment(a.record!.id, cid, a.session!.username, resolved !== false);
    return c.json({ changed });
  } catch (error) {
    console.error('Resolve comment error:', error);
    return c.json({ error: 'Failed to update the comment' }, 500);
  }
});

// 💡 Suggest a change (Phase 13 S4): anyone signed in may suggest a new value for one field, with a reason;
// the record's cataloger (or the Super Admin, when the record has none) is told. The cataloger or a reviewer
// accepts it (the editor then puts the value in the field and saves as usual) or declines it, and the person
// who suggested it is told. Nothing in the record changes on the server here.
app.post("/make-server-49c0e13c/records/:id/suggestions", async (c) => {
  try {
    const a = await commentAccess(c);
    if (a.error) return a.error;
    const { field, body, value } = await c.req.json().catch(() => ({}));
    if (typeof field !== 'string' || !/^[A-Za-z]+:[A-Za-z0-9_.-]{1,80}$/.test(field)) return c.json({ error: 'Invalid field' }, 400);
    if (typeof value !== 'string' || !value.trim() || value.length > 4000) return c.json({ error: 'A suggested value needs 1–4000 characters' }, 400);
    if (typeof body !== 'string' || !body.trim() || body.length > 2000) return c.json({ error: 'Say why, in 1–2000 characters' }, 400);
    const suggestion = await recordStore.addSuggestion(a.record!.id, field, body, value.trim(), a.session!.username);
    const to = a.record!.cataloger || SUPER_ADMIN_USERNAME;
    if (to !== a.session!.username) {
      await recordStore.notify(to, 'suggestion', a.record!, a.session!.username, `${field.split(':')[1]}: ${value.trim()}`.slice(0, 300));
    }
    return c.json({ suggestion });
  } catch (error) {
    console.error('Add suggestion error:', error);
    return c.json({ error: 'Failed to add the suggestion' }, 500);
  }
});

app.post("/make-server-49c0e13c/records/:id/suggestions/:cid/decide", async (c) => {
  try {
    const a = await commentAccess(c);
    if (a.error) return a.error;
    if (!a.mayWrite) return c.json({ error: "Only the Super Admin and the record's cataloger can accept or decline suggestions" }, 403);
    const cid = Number(c.req.param('cid'));
    if (!Number.isInteger(cid) || cid < 1) return c.json({ error: 'Invalid suggestion' }, 400);
    const { accept } = await c.req.json().catch(() => ({}));
    if (typeof accept !== 'boolean') return c.json({ error: 'accept: true or false' }, 400);
    const suggestion = await recordStore.decideSuggestion(a.record!.id, cid, a.session!.username, accept);
    if (!suggestion) return c.json({ error: 'This suggestion was already decided, or is not a suggestion' }, 409);
    if (suggestion.author !== a.session!.username) {
      await recordStore.notify(suggestion.author, accept ? 'suggestion_accepted' : 'suggestion_declined', a.record!, a.session!.username,
        `${suggestion.field.split(':')[1]}: ${suggestion.suggested ?? ''}`.slice(0, 300));
    }
    return c.json({ suggestion });
  } catch (error) {
    console.error('Decide suggestion error:', error);
    return c.json({ error: 'Failed to update the suggestion' }, 500);
  }
});

// ✏️ Who is editing: the editor calls this every half minute while a record is open, and gets back the
// other catalogers active on it, so it can warn "<username> is working on this record".
app.post("/make-server-49c0e13c/records/:id/editing", async (c) => {
  try {
    const session = await getSession(c);
    if (!session) {
      return c.json({ error: 'Sign in to edit records' }, 401);
    }
    const editors = await recordStore.editingHeartbeat(c.req.param('id'), session.username);
    return c.json({ editors });
  } catch (error) {
    console.error('Editing heartbeat error:', error);
    return c.json({ error: 'Failed to update who is editing' }, 500);
  }
});

app.delete("/make-server-49c0e13c/records/:id/editing", async (c) => {
  try {
    const session = await getSession(c);
    if (!session) {
      return c.json({ error: 'Sign in to edit records' }, 401);
    }
    await recordStore.editingLeave(c.req.param('id'), session.username);
    return c.json({ success: true });
  } catch (error) {
    console.error('Editing leave error:', error);
    return c.json({ error: 'Failed to update who is editing' }, 500);
  }
});

// 🟢 Live editing: a 60-second pass to join the record's live room (wss://mooon.site/live/records/:id),
// where catalogers on the same record see each other at once. Off (503) until the LIVE_TICKET_SECRET
// secret is set here and in the Cloudflare Worker; the heartbeat above keeps working either way.
app.post("/make-server-49c0e13c/records/:id/live-ticket", async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'Sign in to edit records' }, 401);
    const secret = Deno.env.get('LIVE_TICKET_SECRET');
    if (!liveTicketsEnabled(secret)) return c.json({ error: 'Live editing is off' }, 503);
    const recordId = c.req.param('id');
    if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(recordId)) return c.json({ error: 'Invalid record' }, 400);
    const ticket = await signLiveTicket(secret, { username: session.username, recordId });
    return c.json({ ticket, url: liveRoomUrl(recordId), expiresIn: 60 });
  } catch (error) {
    console.error('Live ticket error:', error);
    return c.json({ error: 'Failed to start live editing' }, 500);
  }
});

// 🕓 Version history: every save, approval, return and revert of a record (signed-in catalogers only,
// since earlier versions can include unpublished states).
app.get("/make-server-49c0e13c/records/:id/versions", async (c) => {
  try {
    if (!(await getSession(c))) {
      return c.json({ error: 'Sign in to see a record\'s history' }, 401);
    }
    const id = c.req.param('id');
    const record = await recordStore.getRecord(id);
    if (!record) {
      return c.json({ error: 'Record not found' }, 404);
    }
    const versions = await recordStore.listVersions(id);
    return c.json({ id, current: record.version ?? null, published: record.publishedVersion ?? null, versions });
  } catch (error) {
    console.error('List versions error:', error);
    return c.json({ error: 'Failed to load the record\'s history' }, 500);
  }
});

app.get("/make-server-49c0e13c/records/:id/versions/:version", async (c) => {
  try {
    if (!(await getSession(c))) {
      return c.json({ error: 'Sign in to see a record\'s history' }, 401);
    }
    const version = Number(c.req.param('version'));
    if (!Number.isInteger(version) || version < 1) {
      return c.json({ error: 'Invalid version' }, 400);
    }
    const found = await recordStore.getVersion(c.req.param('id'), version);
    return found ? c.json(found) : c.json({ error: 'Version not found' }, 404);
  } catch (error) {
    console.error('Load version error:', error);
    return c.json({ error: 'Failed to load the version' }, 500);
  }
});

// ↩️ Revert: an earlier version becomes current again, saved as a new version. The same people who may
// save the record may revert it, and the same review rule applies: a cataloger's revert waits for approval.
app.post("/make-server-49c0e13c/records/:id/revert", async (c) => {
  try {
    const session = await getSession(c);
    if (!session) {
      return c.json({ error: 'Sign in to revert records' }, 401);
    }
    const id = c.req.param('id');
    const { version } = await c.req.json().catch(() => ({}));
    if (!Number.isInteger(version) || version < 1) {
      return c.json({ error: 'Version number required' }, 400);
    }
    const current = await recordStore.getRecord(id);
    if (!current) {
      return c.json({ error: 'Record not found' }, 404);
    }
    const isAdmin = session.role === 'admin';
    if (!isAdmin && current.cataloger && current.cataloger !== session.username) {
      return c.json({ error: 'This record belongs to another cataloger' }, 403);
    }
    if (version === current.version) {
      return c.json({ error: 'That version is already the current one' }, 400);
    }
    const target = await recordStore.getVersion(id, version);
    if (!target) {
      return c.json({ error: 'Version not found' }, 404);
    }
    // Reverting to a version that lacks required fields saves it, but leaves it unpublished.
    const status = isAdmin && missingForPublish(target.document).length === 0 ? 'complete' : 'pending-review';
    const newVersion = await recordStore.revertRecord(current, target, session.username, status);
    console.log(`[RECORDS] ${session.username} reverted record ${id} to v${version} as v${newVersion}`);
    if (status === 'pending-review' && !isAdmin) {
      await recordStore.notify(SUPER_ADMIN_USERNAME, 'review', { id, title: target.title }, session.username);
    }
    return c.json({ success: true, id, version: newVersion, revertedTo: version, status });
  } catch (error) {
    console.error('Revert record error:', error);
    return c.json({ error: 'Failed to revert the record' }, 500);
  }
});

// 🗑️ Delete Record
app.delete("/make-server-49c0e13c/records/:id", async (c) => {
  try {
    const id = c.req.param('id');

    // Only the Super Admin or the record's own cataloger may delete it.
    const session = await getSession(c);
    if (!session) {
      return c.json({ error: 'Please sign in to delete records' }, 401);
    }
    const existing = await recordStore.getRecord(id);
    if (existing && session.role !== 'admin') {
      const owner = String(existing.cataloger || '').toLowerCase();
      if (owner !== session.username.toLowerCase()) {
        return c.json({ error: 'Only the Super Admin or the record\'s cataloger can delete it' }, 403);
      }
    }

    await recordStore.deleteRecord(id);
    console.log(`[RECORDS] ${session.username} deleted record ${id}`);
    
    return c.json({ success: true, id });
  } catch (error) {
    console.error('Delete record error:', error);
    return c.json({ error: 'Failed to delete record' }, 500);
  }
});

// ═══════════════════════════════════════════════════════════
// 🌙 MOON ENGINE RECORDS (Separate Storage for Moon Engine)
// ══════════════════════════════��════════════════════════════



// ═══════════════════════════════════════════════════════════
// 🌐 VIAF PROXY (CORS Workaround)
// ═══════════════════════════════════════════════════════════

// Helper function for VIAF description
function buildViafDescription(item: any): string {
  const parts: string[] = [];
  if (item.birthDate) parts.push(`b. ${item.birthDate}`);
  if (item.deathDate) parts.push(`d. ${item.deathDate}`);
  if (item.nametype) parts.push(item.nametype);
  return parts.join(', ');
}



// Import BIBFRAME RDF/XML - accepts RDF/XML directly for import
app.post("/make-server-49c0e13c/import-bibframe-rdf", async (c) => {
  try {
    const { rdfXml, uri } = await c.req.json();
    
    if (!rdfXml && !uri) {
      return c.json({ error: 'Either rdfXml or uri parameter required' }, 400);
    }

    console.log('Importing BIBFRAME RDF...');

    // If URI provided, fetch the RDF
    let rdfContent = rdfXml;
    let workUri = uri;
    
    if (uri && !rdfXml) {
      console.log('Fetching RDF from URI:', uri);
      const response = await fetch(`${uri}.rdf`, {
        headers: {
          'Accept': 'application/rdf+xml',
        }
      });
      
      if (!response.ok) {
        // Try JSON-LD as fallback
        const jsonResponse = await fetch(`${uri}.json`);
        if (jsonResponse.ok) {
          const jsonLdData = await jsonResponse.json();
          const record = parseJSONLD(jsonLdData, uri);
          return c.json(record);
        }
        throw new Error('Failed to fetch RDF');
      }
      
      rdfContent = await response.text();
      workUri = uri;
    }
    
    // For now, if RDF/XML is provided, we recommend converting it via LOC's JSON-LD endpoint
    // This is because parsing RDF/XML requires XML parser which is more complex
    console.log('RDF/XML import - redirecting to JSON-LD endpoint');
    
    // Extract URI from RDF if not provided
    if (!workUri && rdfContent) {
      // Simple regex to extract work URI from RDF
      const match = rdfContent.match(/bf:Work.*?rdf:about="([^"]+)"/);
      if (match) {
        workUri = match[1];
      }
    }
    
    if (workUri) {
      // Fetch as JSON-LD instead
      const response = await fetch(`${workUri}.json`);
      if (response.ok) {
        const jsonLdData = await response.json();
        const record = parseJSONLD(jsonLdData, workUri);
        return c.json(record);
      }
    }
    
    return c.json({ 
      error: 'RDF/XML parsing not fully implemented. Please provide a LOC URI instead.',
      hint: 'Use the /load-bibframe endpoint with a uri parameter for best results.'
    }, 400);
  } catch (error) {
    console.error('Import BIBFRAME RDF error:', error);
    return c.json({ error: 'Failed to import RDF' }, 500);
  }
});







// ============================================================================
// JCRICKET COLLABORATIVE ENTITY MANAGEMENT ENDPOINTS
// ============================================================================

// Get user profile with JCricket settings
app.get("/make-server-49c0e13c/jcricket/profile", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Load user profile from KV store
    const profileKey = `jcricket:profile:${user.id}`;
    const storedProfile = await kv.get(profileKey);
    
    let profile;
    if (!storedProfile) {
      // Create default profile
      profile = {
        userId: user.id,
        username: user.user_metadata?.username || user.email,
        email: user.email,
        role: 'basic_editor',
        provenanceId: 'default',
        provenances: ['default'],
        proficientLanguages: ['en'],
        preferences: {
          showAllLanguages: true,
          autoSaveEnabled: true,
          notificationsEnabled: true,
        },
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      };
      await kv.set(profileKey, JSON.stringify(profile));
    } else {
      profile = JSON.parse(storedProfile);
      // Update last login
      profile.lastLogin = new Date().toISOString();
      await kv.set(profileKey, JSON.stringify(profile));
    }

    // Load available provenances
    const provenancesData = await kv.getByPrefix('jcricket:provenance:');
    const provenances = provenancesData.map(p => JSON.parse(p));
    
    // Add default provenance if none exist
    if (provenances.length === 0) {
      const defaultProvenance = {
        id: 'default',
        name: 'Default Institution',
        code: 'DEFAULT',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await kv.set('jcricket:provenance:default', JSON.stringify(defaultProvenance));
      provenances.push(defaultProvenance);
    }

    return c.json({ profile, provenances });
  } catch (error) {
    console.error('Get profile error:', error);
    return c.json({ error: 'Failed to get profile' }, 500);
  }
});

// Update language preferences
app.put("/make-server-49c0e13c/jcricket/profile/languages", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { languages } = await c.req.json();
    const profileKey = `jcricket:profile:${user.id}`;
    const storedProfile = await kv.get(profileKey);
    
    if (!storedProfile) {
      return c.json({ error: 'Profile not found' }, 404);
    }

    const profile = JSON.parse(storedProfile);
    profile.proficientLanguages = languages;
    await kv.set(profileKey, JSON.stringify(profile));

    return c.json({ success: true, profile });
  } catch (error) {
    console.error('Update languages error:', error);
    return c.json({ error: 'Failed to update languages' }, 500);
  }
});

// Get user notifications
app.get("/make-server-49c0e13c/jcricket/notifications", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Get all notifications for this user
    const notificationsData = await kv.getByPrefix(`jcricket:notification:${user.id}:`);
    const notifications = notificationsData.map(n => JSON.parse(n)).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return c.json({ notifications });
  } catch (error) {
    console.error('Get notifications error:', error);
    return c.json({ error: 'Failed to get notifications' }, 500);
  }
});

// Mark notification as read
app.post("/make-server-49c0e13c/jcricket/notifications/:id/read", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const notificationId = c.req.param('id');
    const notificationKey = `jcricket:notification:${user.id}:${notificationId}`;
    const notificationData = await kv.get(notificationKey);
    
    if (!notificationData) {
      return c.json({ error: 'Notification not found' }, 404);
    }

    const notification = JSON.parse(notificationData);
    notification.isRead = true;
    await kv.set(notificationKey, JSON.stringify(notification));

    return c.json({ success: true });
  } catch (error) {
    console.error('Mark notification read error:', error);
    return c.json({ error: 'Failed to mark notification as read' }, 500);
  }
});

// Get review queue
app.get("/make-server-49c0e13c/jcricket/review-queue", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Get all pending reviews
    const reviewsData = await kv.getByPrefix('jcricket:review:');
    const queue = reviewsData
      .map(r => JSON.parse(r))
      .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());

    return c.json({ queue });
  } catch (error) {
    console.error('Get review queue error:', error);
    return c.json({ error: 'Failed to get review queue' }, 500);
  }
});

// Get collaboration statistics
app.get("/make-server-49c0e13c/jcricket/stats", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Get cluster statistics
    const clustersData = await kv.getByPrefix('jcricket:cluster:');
    const clusters = clustersData.map(c => JSON.parse(c));
    
    // Count by provenance
    const clustersByProvenance: Record<string, number> = {};
    for (const cluster of clusters) {
      for (const facet of cluster.facets || []) {
        clustersByProvenance[facet.provenanceName] = (clustersByProvenance[facet.provenanceName] || 0) + 1;
      }
    }

    // Get recent edits (last 7 days)
    const eventsData = await kv.getByPrefix('jcricket:event:');
    const events = eventsData.map(e => JSON.parse(e));
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentEdits = events.filter(e => new Date(e.timestamp) > sevenDaysAgo).length;

    // Get merges and splits this month
    const thisMonth = new Date().getMonth();
    const mergesThisMonth = events.filter(e => 
      e.eventType === 'merge' && new Date(e.timestamp).getMonth() === thisMonth
    ).length;
    const splitsThisMonth = events.filter(e => 
      e.eventType === 'split' && new Date(e.timestamp).getMonth() === thisMonth
    ).length;

    // Get active editors
    const uniqueEditors = new Set(events.filter(e => 
      new Date(e.timestamp).getMonth() === thisMonth
    ).map(e => e.userId));
    const activeEditors = uniqueEditors.size;

    // Get top contributors
    const contributionCounts: Record<string, { username: string; count: number }> = {};
    for (const event of events) {
      if (new Date(event.timestamp).getMonth() === thisMonth) {
        if (!contributionCounts[event.userId]) {
          contributionCounts[event.userId] = { username: event.username, count: 0 };
        }
        contributionCounts[event.userId].count++;
      }
    }
    const topContributors = Object.entries(contributionCounts)
      .map(([userId, data]) => ({ userId, ...data, contributionCount: data.count }))
      .sort((a, b) => b.contributionCount - a.contributionCount)
      .slice(0, 10);

    const stats = {
      totalClusters: clusters.length,
      clustersByProvenance,
      recentEdits,
      pendingReviews: 0, // Calculated from review queue
      mergesThisMonth,
      splitsThisMonth,
      activeEditors,
      topContributors,
    };

    return c.json({ stats });
  } catch (error) {
    console.error('Get stats error:', error);
    return c.json({ error: 'Failed to get statistics' }, 500);
  }
});

// Request merge operation
app.post("/make-server-49c0e13c/jcricket/merge", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Check if user is advanced editor
    const profileKey = `jcricket:profile:${user.id}`;
    const profileData = await kv.get(profileKey);
    if (!profileData) {
      return c.json({ error: 'Profile not found' }, 404);
    }
    const profile = JSON.parse(profileData);
    if (profile.role !== 'advanced_editor' && profile.role !== 'admin') {
      return c.json({ error: 'Only advanced editors can perform merges' }, 403);
    }

    const { destinationClusterId, sourceClusterIds, selectedProperties, reviewerUsername, notes } = await c.req.json();

    // Create merge operation
    const operationId = `merge-${Date.now()}`;
    const operation = {
      id: operationId,
      destinationClusterId,
      sourceClusterIds,
      selectedProperties,
      status: 'pending_review',
      createdBy: user.id,
      createdAt: new Date().toISOString(),
    };

    await kv.set(`jcricket:merge:${operationId}`, JSON.stringify(operation));

    // Create review queue item
    const reviewItem = {
      id: `review-${Date.now()}`,
      operationType: 'merge',
      operationId,
      clusterIds: [destinationClusterId, ...sourceClusterIds],
      requestedBy: user.id,
      requestedByName: profile.username,
      requestedAt: new Date().toISOString(),
      priority: 'medium',
      status: 'pending',
    };

    await kv.set(`jcricket:review:${reviewItem.id}`, JSON.stringify(reviewItem));

    // Log event
    const eventId = `event-${Date.now()}`;
    const event = {
      id: eventId,
      eventType: 'merge',
      clusterId: destinationClusterId,
      userId: user.id,
      username: profile.username,
      provenanceId: profile.provenanceId,
      provenanceName: 'Default',
      changes: [],
      timestamp: new Date().toISOString(),
      description: `Merge operation requested: ${sourceClusterIds.length} sources to destination`,
    };

    await kv.set(`jcricket:event:${eventId}`, JSON.stringify(event));

    return c.json({ success: true, operationId, reviewItemId: reviewItem.id });
  } catch (error) {
    console.error('Merge request error:', error);
    return c.json({ error: 'Failed to create merge request' }, 500);
  }
});

// Request split operation
app.post("/make-server-49c0e13c/jcricket/split", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Check if user is advanced editor
    const profileKey = `jcricket:profile:${user.id}`;
    const profileData = await kv.get(profileKey);
    if (!profileData) {
      return c.json({ error: 'Profile not found' }, 404);
    }
    const profile = JSON.parse(profileData);
    if (profile.role !== 'advanced_editor' && profile.role !== 'admin') {
      return c.json({ error: 'Only advanced editors can perform splits' }, 403);
    }

    const { giverClusterId, receiverClusterId, movedProperties, reviewerUsername, notes } = await c.req.json();

    // Create split operation
    const operationId = `split-${Date.now()}`;
    const operation = {
      id: operationId,
      giverClusterId,
      receiverClusterId,
      movedProperties,
      status: 'pending_review',
      createdBy: user.id,
      createdAt: new Date().toISOString(),
    };

    await kv.set(`jcricket:split:${operationId}`, JSON.stringify(operation));

    // Create review queue item
    const reviewItem = {
      id: `review-${Date.now()}`,
      operationType: 'split',
      operationId,
      clusterIds: [giverClusterId, receiverClusterId],
      requestedBy: user.id,
      requestedByName: profile.username,
      requestedAt: new Date().toISOString(),
      priority: 'medium',
      status: 'pending',
    };

    await kv.set(`jcricket:review:${reviewItem.id}`, JSON.stringify(reviewItem));

    // Log event
    const eventId = `event-${Date.now()}`;
    const event = {
      id: eventId,
      eventType: 'split',
      clusterId: giverClusterId,
      userId: user.id,
      username: profile.username,
      provenanceId: profile.provenanceId,
      provenanceName: 'Default',
      changes: [],
      timestamp: new Date().toISOString(),
      description: `Split operation requested: moving ${Object.keys(movedProperties).length} properties`,
    };

    await kv.set(`jcricket:event:${eventId}`, JSON.stringify(event));

    return c.json({ success: true, operationId, reviewItemId: reviewItem.id });
  } catch (error) {
    console.error('Split request error:', error);
    return c.json({ error: 'Failed to create split request' }, 500);
  }
});

// Get merge/split operation details
app.get("/make-server-49c0e13c/jcricket/:type/:id", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const type = c.req.param('type');
    const id = c.req.param('id');

    if (type !== 'merge' && type !== 'split') {
      return c.json({ error: 'Invalid operation type' }, 400);
    }

    const operationData = await kv.get(`jcricket:${type}:${id}`);
    if (!operationData) {
      return c.json({ error: 'Operation not found' }, 404);
    }

    const operation = JSON.parse(operationData);
    return c.json({ operation });
  } catch (error) {
    console.error('Get operation error:', error);
    return c.json({ error: 'Failed to get operation' }, 500);
  }
});

// Approve merge/split operation
app.post("/make-server-49c0e13c/jcricket/:type/:id/approve", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const type = c.req.param('type');
    const id = c.req.param('id');
    const { reviewNotes } = await c.req.json();

    const operationKey = `jcricket:${type}:${id}`;
    const operationData = await kv.get(operationKey);
    if (!operationData) {
      return c.json({ error: 'Operation not found' }, 404);
    }

    const operation = JSON.parse(operationData);
    operation.status = 'approved';
    operation.reviewedBy = user.id;
    operation.reviewedAt = new Date().toISOString();
    operation.reviewNotes = reviewNotes;
    await kv.set(operationKey, JSON.stringify(operation));

    // Update review queue
    const reviewsData = await kv.getByPrefix('jcricket:review:');
    for (const reviewStr of reviewsData) {
      const review = JSON.parse(reviewStr);
      if (review.operationId === id) {
        review.status = 'completed';
        await kv.set(`jcricket:review:${review.id}`, JSON.stringify(review));
        break;
      }
    }

    // Log approval event
    const profileKey = `jcricket:profile:${user.id}`;
    const profileData = await kv.get(profileKey);
    const profile = profileData ? JSON.parse(profileData) : { username: user.email };

    const eventId = `event-${Date.now()}`;
    const event = {
      id: eventId,
      eventType: 'review_approve',
      clusterId: type === 'merge' ? operation.destinationClusterId : operation.giverClusterId,
      userId: user.id,
      username: profile.username,
      provenanceId: profile.provenanceId || 'default',
      provenanceName: 'Default',
      changes: [],
      timestamp: new Date().toISOString(),
      description: `${type.charAt(0).toUpperCase() + type.slice(1)} operation approved`,
    };

    await kv.set(`jcricket:event:${eventId}`, JSON.stringify(event));

    return c.json({ success: true });
  } catch (error) {
    console.error('Approve operation error:', error);
    return c.json({ error: 'Failed to approve operation' }, 500);
  }
});

// Reject merge/split operation
app.post("/make-server-49c0e13c/jcricket/:type/:id/reject", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const type = c.req.param('type');
    const id = c.req.param('id');
    const { reviewNotes } = await c.req.json();

    if (!reviewNotes || !reviewNotes.trim()) {
      return c.json({ error: 'Review notes required for rejection' }, 400);
    }

    const operationKey = `jcricket:${type}:${id}`;
    const operationData = await kv.get(operationKey);
    if (!operationData) {
      return c.json({ error: 'Operation not found' }, 404);
    }

    const operation = JSON.parse(operationData);
    operation.status = 'rejected';
    operation.reviewedBy = user.id;
    operation.reviewedAt = new Date().toISOString();
    operation.reviewNotes = reviewNotes;
    await kv.set(operationKey, JSON.stringify(operation));

    // Update review queue
    const reviewsData = await kv.getByPrefix('jcricket:review:');
    for (const reviewStr of reviewsData) {
      const review = JSON.parse(reviewStr);
      if (review.operationId === id) {
        review.status = 'completed';
        await kv.set(`jcricket:review:${review.id}`, JSON.stringify(review));
        break;
      }
    }

    // Log rejection event
    const profileKey = `jcricket:profile:${user.id}`;
    const profileData = await kv.get(profileKey);
    const profile = profileData ? JSON.parse(profileData) : { username: user.email };

    const eventId = `event-${Date.now()}`;
    const event = {
      id: eventId,
      eventType: 'review_reject',
      clusterId: type === 'merge' ? operation.destinationClusterId : operation.giverClusterId,
      userId: user.id,
      username: profile.username,
      provenanceId: profile.provenanceId || 'default',
      provenanceName: 'Default',
      changes: [],
      timestamp: new Date().toISOString(),
      description: `${type.charAt(0).toUpperCase() + type.slice(1)} operation rejected: ${reviewNotes}`,
    };

    await kv.set(`jcricket:event:${eventId}`, JSON.stringify(event));

    return c.json({ success: true });
  } catch (error) {
    console.error('Reject operation error:', error);
    return c.json({ error: 'Failed to reject operation' }, 500);
  }
});

// Get entity event log
app.get("/make-server-49c0e13c/jcricket/events", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const clusterId = c.req.query('clusterId');

    // Get all events
    const eventsData = await kv.getByPrefix('jcricket:event:');
    let events = eventsData.map(e => JSON.parse(e));

    // Filter by cluster ID if provided
    if (clusterId) {
      events = events.filter(e => e.clusterId === clusterId);
    }

    // Sort by timestamp descending
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return c.json({ events });
  } catch (error) {
    console.error('Get events error:', error);
    return c.json({ error: 'Failed to get events' }, 500);
  }
});

// Check concurrent edits
app.get("/make-server-49c0e13c/jcricket/cluster/:id/concurrent-edits", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const clusterId = c.req.param('id');

    // Get active edit sessions for this cluster
    const sessionsData = await kv.getByPrefix(`jcricket:edit-session:${clusterId}:`);
    const currentEditors = sessionsData
      .map(s => JSON.parse(s))
      .filter(s => {
        // Filter out sessions older than 5 minutes
        const sessionAge = Date.now() - new Date(s.editingSince).getTime();
        return sessionAge < 5 * 60 * 1000;
      })
      .filter(s => s.userId !== user.id); // Exclude current user

    if (currentEditors.length > 0) {
      const warning = {
        clusterId,
        currentEditors,
        lastModified: new Date().toISOString(),
        lastModifiedBy: 'Unknown',
      };
      return c.json({ warning });
    }

    return c.json({ warning: null });
  } catch (error) {
    console.error('Check concurrent edits error:', error);
    return c.json({ error: 'Failed to check concurrent edits' }, 500);
  }
});

// ═══════════════════════════════════════════════════════════
// 📚 ISBNdb API PROXY (Secure API Key Handling)
// ═══════════════════════════════════════════════════════════

const ISBNDB_BASE_URL = 'https://api2.isbndb.com';

// Helper: get cleaned ISBNdb API key (strips whitespace, quotes, accidental "Bearer " prefix)
function getIsbndbApiKey(): string | null {
  const raw = Deno.env.get('ISBNDB_API_KEY');
  if (!raw) return null;
  let key = raw.trim().replace(/^["']|["']$/g, '');
  if (key.toLowerCase().startsWith('bearer ')) {
    key = key.slice(7).trim();
  }
  return key || null;
}

// Helper: make authenticated ISBNdb fetch
async function isbndbFetch(path: string, method: string = 'GET', body?: string): Promise<Response> {
  const apiKey = getIsbndbApiKey();
  if (!apiKey) throw new Error('ISBNDB_API_KEY not configured');
  console.log(`ISBNdb request: ${method} ${path} (key length: ${apiKey.length}, starts: ${apiKey.substring(0, 4)}...)`);
  const opts: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
  };
  if (body) opts.body = body;
  return fetch(`${ISBNDB_BASE_URL}${path}`, opts);
}

// 📖 Get book by ISBN
app.get("/make-server-49c0e13c/isbndb/book/:isbn", async (c) => {
  try {
    const isbn = c.req.param('isbn');
    const cleanIsbn = isbn.replace(/[^0-9X]/gi, '');
    
    const response = await isbndbFetch(`/book/${cleanIsbn}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return c.json({ error: 'Book not found', message: 'Data may be added soon' }, 404);
      }
      if (response.status === 429) {
        return c.json({ error: 'Rate limit exceeded' }, 429);
      }
      const errorText = await response.text();
      console.error('ISBNdb API error:', response.status, errorText);
      return c.json({ error: 'ISBNdb API error', details: errorText }, response.status as any);
    }
    
    const data = await response.json();
    return c.json(data);
  } catch (error) {
    console.error('ISBNdb book lookup error:', error);
    return c.json({ error: 'Failed to fetch book from ISBNdb', details: String(error) }, 500);
  }
});

// 📚 Get multiple books by ISBNs
app.post("/make-server-49c0e13c/isbndb/books", async (c) => {
  try {
    const { isbns } = await c.req.json();
    
    if (!isbns || !Array.isArray(isbns)) {
      return c.json({ error: 'isbns array required' }, 400);
    }
    
    const cleanIsbns = isbns.map((isbn: string) => isbn.replace(/[^0-9X]/gi, ''));
    
    const response = await isbndbFetch('/books', 'POST', `isbns=${cleanIsbns.join(',')}`);
    
    if (!response.ok) {
      if (response.status === 429) {
        return c.json({ error: 'Rate limit exceeded' }, 429);
      }
      const errorText = await response.text();
      console.error('ISBNdb API error:', response.status, errorText);
      return c.json({ error: 'ISBNdb API error', details: errorText }, response.status as any);
    }
    
    const data = await response.json();
    return c.json(data);
  } catch (error) {
    console.error('ISBNdb bulk lookup error:', error);
    return c.json({ error: 'Failed to fetch books from ISBNdb', details: String(error) }, 500);
  }
});

// 🔍 Search books
app.get("/make-server-49c0e13c/isbndb/search/books/:query", async (c) => {
  try {
    const query = c.req.param('query');
    const page = c.req.query('page') || '1';
    const pageSize = c.req.query('pageSize') || '20';
    const params = new URLSearchParams({ page, pageSize });
    
    const response = await isbndbFetch(`/books/${encodeURIComponent(query)}?${params}`);
    
    if (!response.ok) {
      if (response.status === 429) {
        return c.json({ error: 'Rate limit exceeded' }, 429);
      }
      const errorText = await response.text();
      console.error('ISBNdb API error:', response.status, errorText);
      return c.json({ error: 'ISBNdb API error', details: errorText }, response.status as any);
    }
    
    const data = await response.json();
    return c.json(data);
  } catch (error) {
    console.error('ISBNdb search error:', error);
    return c.json({ error: 'Failed to search ISBNdb', details: String(error) }, 500);
  }
});

// 👤 Search authors
app.get("/make-server-49c0e13c/isbndb/search/authors/:query", async (c) => {
  try {
    const query = c.req.param('query');
    const page = c.req.query('page') || '1';
    const pageSize = c.req.query('pageSize') || '20';
    const params = new URLSearchParams({ page, pageSize });
    
    const response = await isbndbFetch(`/authors/${encodeURIComponent(query)}?${params}`);
    
    if (!response.ok) {
      if (response.status === 429) {
        return c.json({ error: 'Rate limit exceeded' }, 429);
      }
      const errorText = await response.text();
      console.error('ISBNdb API error:', response.status, errorText);
      return c.json({ error: 'ISBNdb API error', details: errorText }, response.status as any);
    }
    
    const data = await response.json();
    return c.json(data);
  } catch (error) {
    console.error('ISBNdb author search error:', error);
    return c.json({ error: 'Failed to search authors in ISBNdb', details: String(error) }, 500);
  }
});

// 👤 Get author details
app.get("/make-server-49c0e13c/isbndb/author/:name", async (c) => {
  try {
    const name = c.req.param('name');
    
    const response = await isbndbFetch(`/author/${encodeURIComponent(name)}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return c.json({ error: 'Author not found' }, 404);
      }
      if (response.status === 429) {
        return c.json({ error: 'Rate limit exceeded' }, 429);
      }
      const errorText = await response.text();
      console.error('ISBNdb API error:', response.status, errorText);
      return c.json({ error: 'ISBNdb API error', details: errorText }, response.status as any);
    }
    
    const data = await response.json();
    return c.json(data);
  } catch (error) {
    console.error('ISBNdb author details error:', error);
    return c.json({ error: 'Failed to get author from ISBNdb', details: String(error) }, 500);
  }
});

// 🏢 Search publishers
app.get("/make-server-49c0e13c/isbndb/search/publishers/:query", async (c) => {
  try {
    const query = c.req.param('query');
    const page = c.req.query('page') || '1';
    const pageSize = c.req.query('pageSize') || '20';
    const params = new URLSearchParams({ page, pageSize });
    
    const response = await isbndbFetch(`/publishers/${encodeURIComponent(query)}?${params}`);
    
    if (!response.ok) {
      if (response.status === 429) {
        return c.json({ error: 'Rate limit exceeded' }, 429);
      }
      const errorText = await response.text();
      console.error('ISBNdb API error:', response.status, errorText);
      return c.json({ error: 'ISBNdb API error', details: errorText }, response.status as any);
    }
    
    const data = await response.json();
    return c.json(data);
  } catch (error) {
    console.error('ISBNdb publisher search error:', error);
    return c.json({ error: 'Failed to search publishers in ISBNdb', details: String(error) }, 500);
  }
});

// 🏷️ Search subjects
app.get("/make-server-49c0e13c/isbndb/search/subjects/:query", async (c) => {
  try {
    const query = c.req.param('query');
    const page = c.req.query('page') || '1';
    const pageSize = c.req.query('pageSize') || '20';
    const params = new URLSearchParams({ page, pageSize });
    
    const response = await isbndbFetch(`/subjects/${encodeURIComponent(query)}?${params}`);
    
    if (!response.ok) {
      if (response.status === 429) {
        return c.json({ error: 'Rate limit exceeded' }, 429);
      }
      const errorText = await response.text();
      console.error('ISBNdb API error:', response.status, errorText);
      return c.json({ error: 'ISBNdb API error', details: errorText }, response.status as any);
    }
    
    const data = await response.json();
    return c.json(data);
  } catch (error) {
    console.error('ISBNdb subject search error:', error);
    return c.json({ error: 'Failed to search subjects in ISBNdb', details: String(error) }, 500);
  }
});

// 🏢 Get publisher details
app.get("/make-server-49c0e13c/isbndb/publisher/:name", async (c) => {
  try {
    const name = c.req.param('name');
    
    const response = await isbndbFetch(`/publisher/${encodeURIComponent(name)}`);
    
    if (!response.ok) {
       if (response.status === 404) return c.json({ error: 'Publisher not found' }, 404);
       const errorText = await response.text();
       console.error('ISBNdb API error:', response.status, errorText);
       return c.json({ error: 'ISBNdb API error', details: errorText }, response.status as any);
    }
    
    const data = await response.json();
    return c.json(data);
  } catch (error) {
    console.error('ISBNdb publisher details error:', error);
    return c.json({ error: 'Failed to get publisher from ISBNdb', details: String(error) }, 500);
  }
});

// 🏷️ Get subject details
app.get("/make-server-49c0e13c/isbndb/subject/:name", async (c) => {
  try {
    const name = c.req.param('name');
    
    const response = await isbndbFetch(`/subject/${encodeURIComponent(name)}`);
    
    if (!response.ok) {
       if (response.status === 404) return c.json({ error: 'Subject not found' }, 404);
       const errorText = await response.text();
       console.error('ISBNdb API error:', response.status, errorText);
       return c.json({ error: 'ISBNdb API error', details: errorText }, response.status as any);
    }
    
    const data = await response.json();
    return c.json(data);
  } catch (error) {
    console.error('ISBNdb subject details error:', error);
    return c.json({ error: 'Failed to get subject from ISBNdb', details: String(error) }, 500);
  }
});

// 📊 Get ISBNdb stats
app.get("/make-server-49c0e13c/isbndb/stats", async (c) => {
  try {
    const response = await isbndbFetch('/stats');
    
    if (!response.ok) {
       const errorText = await response.text();
       console.error('ISBNdb API error:', response.status, errorText);
       return c.json({ error: 'ISBNdb API error', details: errorText }, response.status as any);
    }
    
    const data = await response.json();
    return c.json(data);
  } catch (error) {
    console.error('ISBNdb stats error:', error);
    return c.json({ error: 'Failed to get stats from ISBNdb', details: String(error) }, 500);
  }
});

// ═══════════════════════════════════════════════════════════
// 🌕 MOON LINKED DATA RECORDS API
// Complete JSON-LD storage shared by Moon Engine & Moon OPAC
// ═══════════════════════════════════════════════════════════

// 💾 Create/Update MOON Record (POST /moon/records)
// 🔒 PROTECTED: Requires authentication + records.create permission
app.post("/make-server-49c0e13c/moon/records", 
  authMiddleware.requireAuth,
  authMiddleware.requirePermission('records.create'),
  authMiddleware.auditLog,
  async (c) => {
  try {
    const user = (c as any).user;
    const payload = await c.req.json();
    
    // 🔒 ENFORCE: Institution isolation
    payload.institutionId = user.institutionId;
    
    const record = await moonRecords.saveMoonRecord(payload);
    return c.json(record, 201);
  } catch (error) {
    console.error('[MOON API] Save record error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Failed to save record' 
    }, 400);
  }
});

// 📋 List All MOON Records (GET /moon/records)
// 🔒 PROTECTED: Requires authentication + records.read permission
app.get("/make-server-49c0e13c/moon/records",
  authMiddleware.requireAuth,
  authMiddleware.requirePermission('records.read'),
  async (c) => {
  try {
    const user = (c as any).user;
    const status = c.req.query('status');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;
    const offset = c.req.query('offset') ? parseInt(c.req.query('offset')!) : undefined;
    
    // 🔒 ENFORCE: Only return records from user's institution
    const records = await dataIsolation.listRecords(user.institutionId, { limit, offset });
    return c.json({ records, count: records.length });
  } catch (error) {
    console.error('[MOON API] List records error:', error);
    return c.json({ error: 'Failed to list records' }, 500);
  }
});

// 📖 Get Single MOON Record (GET /moon/records/:id)
// 🔒 PROTECTED: Requires authentication + records.read permission
app.get("/make-server-49c0e13c/moon/records/:id",
  authMiddleware.requireAuth,
  authMiddleware.requirePermission('records.read'),
  async (c) => {
  try {
    const user = (c as any).user;
    const id = c.req.param('id');
    
    // 🔒 ENFORCE: Institution isolation
    const record = await dataIsolation.getRecord(id, user.institutionId);
    
    if (!record) {
      return c.json({ error: 'Record not found or access denied' }, 404);
    }
    
    return c.json(record);
  } catch (error) {
    console.error('[MOON API] Get record error:', error);
    return c.json({ error: 'Failed to get record' }, 500);
  }
});

// 🔄 Update MOON Record (PUT /moon/records/:id)
// 🔒 PROTECTED: Requires authentication + records.edit permission
app.put("/make-server-49c0e13c/moon/records/:id",
  authMiddleware.requireAuth,
  authMiddleware.requirePermission('records.edit'),
  authMiddleware.auditLog,
  async (c) => {
  try {
    const user = (c as any).user;
    const id = c.req.param('id');
    const payload = await c.req.json();
    
    // 🔒 SECURITY: Verify record belongs to user's institution
    const existing = await dataIsolation.getRecord(id, user.institutionId);
    if (!existing) {
      return c.json({ error: 'Record not found or access denied' }, 404);
    }
    
    // Ensure ID matches and institution is locked
    payload.id = id;
    payload.institutionId = user.institutionId;
    
    const record = await moonRecords.saveMoonRecord(payload);
    return c.json(record);
  } catch (error) {
    console.error('[MOON API] Update record error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Failed to update record' 
    }, 400);
  }
});

// 🗑️ Delete MOON Record (DELETE /moon/records/:id)
// 🔒 ADMIN ONLY: Destructive operation
app.delete("/make-server-49c0e13c/moon/records/:id",
  authMiddleware.requireAuth,
  authMiddleware.requireAdmin,
  authMiddleware.auditLog,
  async (c) => {
  try {
    const user = (c as any).user;
    const id = c.req.param('id');
    
    // 🔒 SECURITY: Verify record belongs to user's institution (even for admins)
    const success = await dataIsolation.deleteRecord(id, user.institutionId);
    
    if (!success) {
      return c.json({ error: 'Record not found or deletion failed' }, 500);
    }
    
    return c.json({ success: true, id });
  } catch (error) {
    console.error('[MOON API] Delete record error:', error);
    return c.json({ error: 'Failed to delete record' }, 500);
  }
});

// 🔍 Search MOON Records (GET /moon/search?q=query)
// 🔒 PROTECTED: Requires authentication + records.read permission
app.get("/make-server-49c0e13c/moon/search",
  authMiddleware.requireAuth,
  authMiddleware.requirePermission('records.read'),
  async (c) => {
  try {
    const user = (c as any).user;
    const query = c.req.query('q');
    
    if (!query) {
      return c.json({ error: 'Query parameter required' }, 400);
    }
    
    // 🔒 ENFORCE: Search only within user's institution
    const records = await dataIsolation.searchRecords(user.institutionId, query, {
      limit: 100
    });
    return c.json({ records, count: records.length });
  } catch (error) {
    console.error('[MOON API] Search error:', error);
    return c.json({ error: 'Search failed' }, 500);
  }
});

// ✅ Validate JSON-LD Document with SHACL (POST /moon/validate)
// 🔒 PROTECTED: Requires authentication
app.post("/make-server-49c0e13c/moon/validate",
  authMiddleware.requireAuth,
  async (c) => {
  try {
    const { document, tripleStoreConfig, skipShacl } = await c.req.json();
    
    if (!document) {
      return c.json({ error: 'Document is required' }, 400);
    }

    // Basic JSON-LD validation first
    const basicValidation = moonRecords.validateJSONLD(document);
    
    if (!basicValidation.valid) {
      return c.json({
        valid: false,
        type: 'json-ld',
        errors: basicValidation.errors
      });
    }

    // ⚠️ SHACL validation (requires triple store connection)
    if (tripleStoreConfig && !skipShacl) {
      console.log('[VALIDATION] Running SHACL validation...');
      
      const shaclResult = await shaclValidator.validateDocument(document, tripleStoreConfig);
      
      return c.json({
        valid: shaclResult.valid,
        type: 'shacl',
        violations: shaclResult.violations,
        warnings: shaclResult.warnings,
        info: shaclResult.info
      });
    }

    // Without triple store, only basic validation
    return c.json({
      valid: true,
      type: 'json-ld',
      message: 'Basic JSON-LD validation passed. Connect triple store for SHACL validation.'
    });
  } catch (error) {
    console.error('[MOON API] Validation error:', error);
    return c.json({ error: 'Validation failed', details: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 🎯 AUTHORITY MANAGEMENT ENDPOINTS

// List all authorities (GET /moon/authorities)
app.get("/make-server-49c0e13c/moon/authorities", async (c) => {
  try {
    const type = c.req.query('type');
    const verified = c.req.query('verified');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;
    const offset = c.req.query('offset') ? parseInt(c.req.query('offset')!) : undefined;

    const authList = await authorities.listAuthorities({
      type,
      verified: verified === 'true' ? true : verified === 'false' ? false : undefined,
      limit,
      offset
    });

    return c.json({ authorities: authList, count: authList.length });
  } catch (error) {
    console.error('[MOON API] List authorities error:', error);
    return c.json({ error: 'Failed to list authorities' }, 500);
  }
});

// Search authorities (GET /moon/authorities/search?q=query)
app.get("/make-server-49c0e13c/moon/authorities/search", async (c) => {
  try {
    const query = c.req.query('q');
    const type = c.req.query('type');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 20;

    if (!query) {
      return c.json({ error: 'Query parameter required' }, 400);
    }

    const results = await authorities.searchAuthorities(query, { type, limit });
    return c.json({ authorities: results, count: results.length });
  } catch (error) {
    console.error('[MOON API] Search authorities error:', error);
    return c.json({ error: 'Search failed' }, 500);
  }
});

// Get authority by ID (GET /moon/authorities/:id)
app.get("/make-server-49c0e13c/moon/authorities/:id", async (c) => {
  try {
    const id = c.req.param('id');
    const authority = await authorities.getAuthority(id);

    if (!authority) {
      return c.json({ error: 'Authority not found' }, 404);
    }

    return c.json(authority);
  } catch (error) {
    console.error('[MOON API] Get authority error:', error);
    return c.json({ error: 'Failed to get authority' }, 500);
  }
});

// Create/Update authority (POST /moon/authorities)
// 🔒 PROTECTED: Requires authentication + authorities.create permission
app.post("/make-server-49c0e13c/moon/authorities",
  authMiddleware.requireAuth,
  authMiddleware.requirePermission('authorities.create'),
  authMiddleware.auditLog,
  async (c) => {
  try {
    const user = (c as any).user;
    const authorityData = await c.req.json();
    
    // 🔒 ENFORCE: Institution isolation
    const savedAuthority = await dataIsolation.saveAuthority(
      authorityData.id || crypto.randomUUID(),
      user.institutionId,
      authorityData,
      user.id
    );
    return c.json(savedAuthority);
  } catch (error) {
    console.error('[MOON API] Save authority error:', error);
    return c.json({ error: 'Failed to save authority', details: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Find duplicate authorities (POST /moon/authorities/:id/duplicates)
app.post("/make-server-49c0e13c/moon/authorities/:id/duplicates", async (c) => {
  try {
    const id = c.req.param('id');
    const threshold = parseFloat(c.req.query('threshold') || '0.8');
    
    const authority = await authorities.getAuthority(id);
    if (!authority) {
      return c.json({ error: 'Authority not found' }, 404);
    }

    const duplicates = await authorities.findDuplicates(authority, threshold);
    return c.json({ duplicates, count: duplicates.length });
  } catch (error) {
    console.error('[MOON API] Find duplicates error:', error);
    return c.json({ error: 'Failed to find duplicates' }, 500);
  }
});

// Analyze merge impact (POST /moon/authorities/merge/analyze)
// 🔒 ADMIN ONLY: Preview what will be affected before merging
app.post("/make-server-49c0e13c/moon/authorities/merge/analyze",
  authMiddleware.requireAuth,
  authMiddleware.requireAdmin,
  async (c) => {
  try {
    const user = (c as any).user;
    const { mergeIds } = await c.req.json();
    
    if (!mergeIds || !Array.isArray(mergeIds)) {
      return c.json({ error: 'Invalid request body. Expected { mergeIds }' }, 400);
    }

    const impact = await authorityMergeIntegrity.analyzeMergeImpact(
      mergeIds,
      user.institutionId
    );
    
    return c.json(impact);
  } catch (error) {
    console.error('[MOON API] Merge analysis error:', error);
    return c.json({ error: 'Failed to analyze merge impact', details: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Merge authorities (POST /moon/authorities/merge)
// 🔒 ADMIN ONLY: Merging authorities rewrites references across all records
app.post("/make-server-49c0e13c/moon/authorities/merge",
  authMiddleware.requireAuth,
  authMiddleware.requireAdmin,
  authMiddleware.auditLog,
  async (c) => {
  try {
    const user = (c as any).user;
    const { keepId, mergeIds, tripleStoreConfig } = await c.req.json();
    
    if (!keepId || !mergeIds || !Array.isArray(mergeIds)) {
      return c.json({ error: 'Invalid request body. Expected { keepId, mergeIds, tripleStoreConfig? }' }, 400);
    }

    // ⚠️ CRITICAL: Use new integrity-preserving merge
    console.warn(`[AUTHORITY MERGE] User ${user.email} merging ${mergeIds.join(', ')} into ${keepId}`);
    
    const result = await authorityMergeIntegrity.mergeAuthoritiesWithIntegrity(
      keepId,
      mergeIds,
      user.institutionId,
      user.id,
      tripleStoreConfig
    );
    
    return c.json({
      success: true,
      ...result,
      message: `Merged ${result.recordsUpdated} records with ${result.triplesRewritten} URI replacements`
    });
  } catch (error) {
    console.error('[MOON API] Merge authorities error:', error);
    return c.json({ error: 'Failed to merge authorities', details: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Import external authority (POST /moon/authorities/import)
app.post("/make-server-49c0e13c/moon/authorities/import", async (c) => {
  try {
    const { uri, type } = await c.req.json();
    
    if (!uri || !type) {
      return c.json({ error: 'URI and type are required' }, 400);
    }

    const imported = await authorities.importExternalAuthority(uri, type);
    return c.json(imported);
  } catch (error) {
    console.error('[MOON API] Import authority error:', error);
    return c.json({ error: 'Failed to import authority', details: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 🗄️ TRIPLE STORE INTEGRATION ENDPOINTS

// Execute SPARQL Query (POST /moon/sparql/query)
// 🔒 PROTECTED: Requires authentication + sparql.read permission
app.post("/make-server-49c0e13c/moon/sparql/query",
  authMiddleware.requireAuth,
  authMiddleware.requirePermission('sparql.read'),
  async (c) => {
  try {
    const { query, config } = await c.req.json();
    
    if (!query || !config) {
      return c.json({ error: 'Query and config are required' }, 400);
    }

    // TODO: Add institution-based graph filtering to SPARQL queries
    // For now, allow read access but log it
    const user = (c as any).user;
    console.log(`[SPARQL] Query executed by ${user.email} from institution ${user.institutionId}`);

    const results = await tripleStore.querySparql(query, config);
    return c.json(results);
  } catch (error) {
    console.error('[MOON API] SPARQL query error:', error);
    return c.json({ error: 'SPARQL query failed', details: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Execute SPARQL Update (POST /moon/sparql/update)
// 🔒 ADMIN ONLY: SPARQL UPDATE can modify entire triple store
app.post("/make-server-49c0e13c/moon/sparql/update",
  authMiddleware.requireAuth,
  authMiddleware.requireAdmin,
  authMiddleware.requireSparqlUpdatePermission,
  authMiddleware.auditLog,
  async (c) => {
  try {
    const { query, config } = await c.req.json();
    
    if (!query || !config) {
      return c.json({ error: 'Query and config are required' }, 400);
    }

    // 🚨 CRITICAL: Log all SPARQL UPDATE operations for audit
    const user = (c as any).user;
    console.warn(`[SECURITY AUDIT] SPARQL UPDATE executed by ${user.email} (${user.id})`);
    console.warn(`[SECURITY AUDIT] Query: ${query.substring(0, 200)}...`);

    const result = await tripleStore.updateSparql(query, config);
    return c.json(result);
  } catch (error) {
    console.error('[MOON API] SPARQL update error:', error);
    return c.json({ error: 'SPARQL update failed', details: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Upload record to triple store (POST /moon/triplestore/upload/:id)
app.post("/make-server-49c0e13c/moon/triplestore/upload/:id", async (c) => {
  try {
    const id = c.req.param('id');
    const { config } = await c.req.json();
    
    if (!config) {
      return c.json({ error: 'Triple store config is required' }, 400);
    }

    const record = await moonRecords.getMoonRecord(id);
    if (!record) {
      return c.json({ error: 'Record not found' }, 404);
    }

    const result = await tripleStore.syncRecordToTripleStore(id, record.document, config);
    return c.json(result);
  } catch (error) {
    console.error('[MOON API] Upload to triple store error:', error);
    return c.json({ error: 'Upload failed', details: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Get example triple store configurations
app.get("/make-server-49c0e13c/moon/triplestore/examples", async (c) => {
  return c.json({
    fuseki: tripleStore.EXAMPLE_FUSEKI_CONFIG,
    blazegraph: tripleStore.EXAMPLE_BLAZEGRAPH_CONFIG,
    graphdb: tripleStore.EXAMPLE_GRAPHDB_CONFIG,
    exampleQueries: tripleStore.EXAMPLE_QUERIES
  });
});

// 🕰️ VERSIONING & AUDIT ENDPOINTS

// Soft delete (POST /moon/:entityType/:entityId/delete)
app.post("/make-server-49c0e13c/moon/:entityType/:entityId/delete", async (c) => {
  try {
    const entityType = c.req.param('entityType') as 'record' | 'authority';
    const entityId = c.req.param('entityId');
    // Deleting and restoring records or authorities is the Super Admin's job.
    if (!(await isAdminSession(c))) {
      return c.json({ error: 'Super Admin session required' }, 403);
    }
    const { actor, reason } = await c.req.json();

    if (!actor || !reason) {
      return c.json({ error: 'actor and reason are required' }, 400);
    }

    const success = await versioning.softDelete(entityId, entityType, actor, reason);

    if (!success) {
      return c.json({ error: 'Delete failed' }, 500);
    }

    return c.json({ success: true, message: 'Entity soft deleted' });
  } catch (error) {
    console.error('[MOON API] Soft delete error:', error);
    return c.json({ error: 'Delete failed' }, 500);
  }
});

// Restore deleted entity (POST /moon/:entityType/:entityId/restore)
app.post("/make-server-49c0e13c/moon/:entityType/:entityId/restore", async (c) => {
  try {
    const entityType = c.req.param('entityType') as 'record' | 'authority';
    const entityId = c.req.param('entityId');
    if (!(await isAdminSession(c))) {
      return c.json({ error: 'Super Admin session required' }, 403);
    }
    const { actor } = await c.req.json();

    if (!actor) {
      return c.json({ error: 'actor is required' }, 400);
    }

    const success = await versioning.restore(entityId, entityType, actor);

    if (!success) {
      return c.json({ error: 'Restore failed' }, 500);
    }

    return c.json({ success: true, message: 'Entity restored' });
  } catch (error) {
    console.error('[MOON API] Restore error:', error);
    return c.json({ error: 'Restore failed' }, 500);
  }
});

// 📐 SHACL VALIDATION ENDPOINTS

// Get BIBFRAME SHACL shapes (GET /moon/shacl/shapes)
app.get("/make-server-49c0e13c/moon/shacl/shapes", async (c) => {
  const format = c.req.query('format') || 'jsonld';
  
  if (format === 'turtle') {
    return c.text(getSHACLShapesAsTurtle(), 200, { 'Content-Type': 'text/turtle' });
  } else {
    return c.json(BIBFRAME_SHAPES, 200, { 'Content-Type': 'application/ld+json' });
  }
});

// 🔍 DISCOVERY LAYER ENDPOINTS

// Faceted discovery search (POST /moon/discover)
app.post("/make-server-49c0e13c/moon/discover", async (c) => {
  try {
    const query = await c.req.json();
    const results = await discovery.discover(query);
    return c.json(results);
  } catch (error) {
    console.error('[MOON API] Discovery search error:', error);
    return c.json({ error: 'Discovery search failed' }, 500);
  }
});

// 📥 Import external discovery record to local catalog (POST /moon/discovery/import)
app.post("/make-server-49c0e13c/moon/discovery/import", async (c) => {
  try {
    const record = await c.req.json();
    if (!record?.id || !record?.document) {
      return c.json({ error: 'Record must have id and document' }, 400);
    }
    const imported = await importToLocal(record);
    return c.json({ success: true, record: imported });
  } catch (error) {
    console.error('[MOON API] Discovery import error:', error);
    return c.json({ error: 'Failed to import record to local catalog' }, 500);
  }
});

// 📋 Discovery sources metadata (GET /moon/discovery/sources)
app.get("/make-server-49c0e13c/moon/discovery/sources", async (c) => {
  try {
    const sources = getSourceMetadata();
    return c.json({ sources });
  } catch (error) {
    console.error('[MOON API] Discovery sources error:', error);
    return c.json({ error: 'Failed to get sources' }, 500);
  }
});

// Browse by entity (GET /moon/browse/:entityType/:entityUri)
app.get("/make-server-49c0e13c/moon/browse/:entityType/:entityUri", async (c) => {
  try {
    const entityType = c.req.param('entityType') as 'agent' | 'subject' | 'language' | 'place';
    const entityUri = decodeURIComponent(c.req.param('entityUri'));

    const results = await discovery.browseByEntity(entityType, entityUri);
    return c.json({ results, count: results.length });
  } catch (error) {
    console.error('[MOON API] Browse by entity error:', error);
    return c.json({ error: 'Browse failed' }, 500);
  }
});

// Get work cluster (GET /moon/cluster/work/:workUri)
app.get("/make-server-49c0e13c/moon/cluster/work/:workUri", async (c) => {
  try {
    const workUri = decodeURIComponent(c.req.param('workUri'));
    const cluster = await discovery.getWorkCluster(workUri);
    return c.json(cluster);
  } catch (error) {
    console.error('[MOON API] Get work cluster error:', error);
    return c.json({ error: 'Failed to get work cluster' }, 500);
  }
});

// Get authority page (GET /moon/authority-page/:authorityUri)
app.get("/make-server-49c0e13c/moon/authority-page/:authorityUri", async (c) => {
  try {
    const authorityUri = decodeURIComponent(c.req.param('authorityUri'));
    const page = await discovery.getAuthorityPage(authorityUri);
    return c.json(page);
  } catch (error) {
    console.error('[MOON API] Get authority page error:', error);
    return c.json({ error: 'Failed to get authority page' }, 500);
  }
});

// 🏛️ MULTI-TENANT ENDPOINTS

// Create institution (POST /moon/institutions)
app.post("/make-server-49c0e13c/moon/institutions", async (c) => {
  try {
    if (!(await isAdminSession(c))) {
      return c.json({ error: 'Super Admin session required' }, 403);
    }
    const data = await c.req.json();
    const institution = await multiTenant.createInstitution(data);
    return c.json(institution);
  } catch (error) {
    console.error('[MOON API] Create institution error:', error);
    return c.json({ error: 'Failed to create institution' }, 500);
  }
});

// Create user (POST /moon/users)
app.post("/make-server-49c0e13c/moon/users", async (c) => {
  try {
    // A Moon user's roles decide what the /moon/* routes allow (admin included): only the Super Admin creates them.
    if (!(await isAdminSession(c))) {
      return c.json({ error: 'Super Admin session required' }, 403);
    }
    const data = await c.req.json();
    const user = await multiTenant.createUser(data);
    return c.json(user);
  } catch (error) {
    console.error('[MOON API] Create user error:', error);
    return c.json({ error: 'Failed to create user' }, 500);
  }
});

// 🔐 JWT AUTHENTICATION ENDPOINTS

// 📊 OBSERVABILITY & MONITORING ENDPOINTS

// Get system health (GET /health)
app.get("/make-server-49c0e13c/health", async (c) => {
  try {
    const health = await observability.getSystemHealth();
    return c.json(health);
  } catch (error) {
    console.error('[HEALTH] Health check error:', error);
    return c.json({
      status: 'critical',
      error: 'Failed to retrieve health status'
    }, 500);
  }
});

// Get audit logs (GET /admin/audit)
app.get("/make-server-49c0e13c/admin/audit",
  authMiddleware.requireAuth,
  authMiddleware.requireAdmin,
  async (c) => {
  try {
    const user = (c as any).user;
    const userId = c.req.query('userId');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 100;

    const logs = await observability.getAuditLogs(user.institutionId, {
      userId,
      limit
    });

    return c.json({ logs, count: logs.length });
  } catch (error) {
    console.error('[ADMIN] Audit log query error:', error);
    return c.json({ error: 'Failed to retrieve audit logs' }, 500);
  }
});

// Get error logs (GET /admin/errors)
app.get("/make-server-49c0e13c/admin/errors",
  authMiddleware.requireAuth,
  authMiddleware.requireAdmin,
  async (c) => {
  try {
    const severity = c.req.query('severity') as 'low' | 'medium' | 'high' | 'critical' | undefined;
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 100;

    const errors = await observability.getErrorLogs(severity, limit);

    return c.json({ errors, count: errors.length });
  } catch (error) {
    console.error('[ADMIN] Error log query error:', error);
    return c.json({ error: 'Failed to retrieve error logs' }, 500);
  }
});

// Get performance metrics (GET /admin/metrics)
app.get("/make-server-49c0e13c/admin/metrics",
  authMiddleware.requireAuth,
  authMiddleware.requireAdmin,
  async (c) => {
  try {
    const operation = c.req.query('operation');
    const metrics = await observability.getPerformanceMetrics(operation);

    // Calculate statistics
    const avgDuration = metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length
      : 0;
    
    const successRate = metrics.length > 0
      ? (metrics.filter(m => m.success).length / metrics.length) * 100
      : 0;

    return c.json({
      metrics,
      count: metrics.length,
      statistics: {
        avgDuration,
        successRate,
        totalOperations: metrics.length
      }
    });
  } catch (error) {
    console.error('[ADMIN] Metrics query error:', error);
    return c.json({ error: 'Failed to retrieve metrics' }, 500);
  }
});

// 🧪 LOAD TESTING ENDPOINTS (Development Only)

// Generate test records (POST /test/generate-records)
app.post("/make-server-49c0e13c/test/generate-records",
  authMiddleware.requireAuth,
  authMiddleware.requireAdmin,
  async (c) => {
  try {
    const user = (c as any).user;
    const { count } = await c.req.json();

    if (!count || count < 1 || count > 10000) {
      return c.json({ error: 'Count must be between 1 and 10000' }, 400);
    }

    console.log(`[LOAD TEST] Generating ${count} test records...`);

    const result = await loadTesting.generateTestRecords(
      user.institutionId,
      user.id,
      count
    );

    return c.json(result);
  } catch (error) {
    console.error('[LOAD TEST] Generate records error:', error);
    return c.json({ error: 'Failed to generate test records' }, 500);
  }
});

// Benchmark list operation (POST /test/benchmark/list)
app.post("/make-server-49c0e13c/test/benchmark/list",
  authMiddleware.requireAuth,
  authMiddleware.requireAdmin,
  async (c) => {
  try {
    const user = (c as any).user;
    const { limit } = await c.req.json();

    const result = await loadTesting.benchmarkListOperation(
      user.institutionId,
      limit
    );

    return c.json(result);
  } catch (error) {
    console.error('[LOAD TEST] Benchmark list error:', error);
    return c.json({ error: 'Benchmark failed' }, 500);
  }
});

// Benchmark search operation (POST /test/benchmark/search)
app.post("/make-server-49c0e13c/test/benchmark/search",
  authMiddleware.requireAuth,
  authMiddleware.requireAdmin,
  async (c) => {
  try {
    const user = (c as any).user;
    const { query } = await c.req.json();

    if (!query) {
      return c.json({ error: 'Query required' }, 400);
    }

    const result = await loadTesting.benchmarkSearchOperation(
      user.institutionId,
      query
    );

    return c.json(result);
  } catch (error) {
    console.error('[LOAD TEST] Benchmark search error:', error);
    return c.json({ error: 'Benchmark failed' }, 500);
  }
});

// Stress test concurrent reads (POST /test/stress/concurrent-reads)
app.post("/make-server-49c0e13c/test/stress/concurrent-reads",
  authMiddleware.requireAuth,
  authMiddleware.requireAdmin,
  async (c) => {
  try {
    const user = (c as any).user;
    const { recordId, concurrency } = await c.req.json();

    if (!recordId || !concurrency) {
      return c.json({ error: 'recordId and concurrency required' }, 400);
    }

    if (concurrency > 100) {
      return c.json({ error: 'Concurrency limited to 100' }, 400);
    }

    const result = await loadTesting.stressTestConcurrentReads(
      user.institutionId,
      concurrency,
      recordId
    );

    return c.json(result);
  } catch (error) {
    console.error('[LOAD TEST] Stress test error:', error);
    return c.json({ error: 'Stress test failed' }, 500);
  }
});

// Cleanup test records (DELETE /test/cleanup)
app.delete("/make-server-49c0e13c/test/cleanup",
  authMiddleware.requireAuth,
  authMiddleware.requireAdmin,
  async (c) => {
  try {
    const user = (c as any).user;
    const { recordIds } = await c.req.json();

    if (!recordIds || !Array.isArray(recordIds)) {
      return c.json({ error: 'recordIds array required' }, 400);
    }

    const result = await loadTesting.cleanupTestRecords(
      user.institutionId,
      recordIds
    );

    return c.json(result);
  } catch (error) {
    console.error('[LOAD TEST] Cleanup error:', error);
    return c.json({ error: 'Cleanup failed' }, 500);
  }
});

// ═══════════════════════════════════════════════════════════
// 📚 RECORD LIFECYCLE API (V2)
// ═══════════════════════════════════════════════════════════
app.route('/make-server-49c0e13c', recordRoutes);
app.route('/make-server-49c0e13c', accountRoutes);

// ═══════════════════════════════════════════════════════════
// 🌐 OPEN LINKED DATA — Content Negotiation & Public Endpoints
// ═══════════════════════════════════════════════════════════

import { toTurtle as rdfToTurtle } from "./rdfExporter.tsx";
import { getInternalRecords, getSourceMetadata, importToLocal } from "./discoveryProviders.tsx";

// Helper: resolve a record from ANY storage system
async function resolveRecordById(id: string): Promise<{ record: any; document: any } | null> {
  // Try moon:record: prefix first
  let recordStr = await kv.get(`moon:record:${id}`);
  if (recordStr) {
    const record = typeof recordStr === 'string' ? JSON.parse(recordStr) : recordStr;
    return { record, document: record.document || record };
  }
  // Try record: prefix (recordService format — key is record:bibframe:record:<uuid>)
  recordStr = await kv.get(`record:${id}`);
  if (recordStr) {
    const record = typeof recordStr === 'string' ? JSON.parse(recordStr) : recordStr;
    return { record, document: record.graphJson || record.document || record };
  }
  // Try bibframe:record: prefix (inline routes format)
  recordStr = await kv.get(`bibframe:record:${id}`);
  if (recordStr) {
    const record = typeof recordStr === 'string' ? JSON.parse(recordStr) : recordStr;
    return { record, document: record.document || record };
  }
  // Try moon-engine:record: prefix
  recordStr = await kv.get(`moon-engine:record:${id}`);
  if (recordStr) {
    const record = typeof recordStr === 'string' ? JSON.parse(recordStr) : recordStr;
    return { record, document: record.document || record };
  }
  return null;
}

// Public resource endpoint with full content negotiation
app.get("/make-server-49c0e13c/ld/resource/:id", async (c) => {
  try {
    const id = c.req.param('id');
    const accept = c.req.header('Accept') || 'application/json';
    const resolved = await resolveRecordById(id);
    if (!resolved) return c.json({ error: 'Resource not found', uri: id }, 404);
    const { record, document } = resolved;
    if (accept.includes('text/turtle')) {
      const turtle = rdfToTurtle(document);
      return c.text(turtle, 200, { 'Content-Type': 'text/turtle; charset=utf-8' });
    }
    if (accept.includes('application/ld+json')) {
      return c.json(document, 200, { 'Content-Type': 'application/ld+json; charset=utf-8' });
    }
    if (accept.includes('application/n-triples')) {
      const graph = document['@graph'] || [document];
      const triples: string[] = [];
      for (const node of graph) {
        if (!node['@id']) continue;
        const subject = `<${node['@id']}>`;
        if (node['@type']) {
          const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
          for (const t of types) {
            triples.push(`${subject} <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <${t.startsWith('bf:') ? 'http://id.loc.gov/ontologies/bibframe/' + t.slice(3) : t}> .`);
          }
        }
        for (const [key, val] of Object.entries(node)) {
          if (key.startsWith('@')) continue;
          const predUri = key.startsWith('bf:') ? 'http://id.loc.gov/ontologies/bibframe/' + key.slice(3) : key;
          if (typeof val === 'object' && val !== null && (val as any)['@id']) {
            triples.push(`${subject} <${predUri}> <${(val as any)['@id']}> .`);
          } else if (typeof val === 'string') {
            triples.push(`${subject} <${predUri}> "${val.replace(/"/g, '\\"')}" .`);
          }
        }
      }
      return c.text(triples.join('\n'), 200, { 'Content-Type': 'application/n-triples; charset=utf-8' });
    }
    return c.json({
      '@context': document['@context'], '@graph': document['@graph'],
      _meta: { id: record.id, title: record.title, status: record.status || 'published',
        uri: `https://moonlib.org/resource/${id}`,
        contentNegotiation: { 'application/ld+json': `/ld/resource/${id}`, 'text/turtle': `/ld/resource/${id}`, 'application/n-triples': `/ld/resource/${id}` },
        createdAt: record.createdAt, updatedAt: record.updatedAt }
    });
  } catch (error) {
    console.error('[LD] Resource resolution error:', error);
    return c.json({ error: 'Failed to resolve resource' }, 500);
  }
});

app.get("/make-server-49c0e13c/ld/resource/:id/jsonld", async (c) => {
  try {
    const id = c.req.param('id');
    const resolved = await resolveRecordById(id);
    if (!resolved) return c.json({ error: 'Not found' }, 404);
    return c.json(resolved.document, 200, { 'Content-Type': 'application/ld+json; charset=utf-8' });
  } catch (error) { console.error('[LD] JSON-LD export error:', error); return c.json({ error: 'Export failed' }, 500); }
});

app.get("/make-server-49c0e13c/ld/resource/:id/turtle", async (c) => {
  try {
    const id = c.req.param('id');
    const resolved = await resolveRecordById(id);
    if (!resolved) return c.json({ error: 'Not found' }, 404);
    const turtle = rdfToTurtle(resolved.document);
    return c.text(turtle, 200, { 'Content-Type': 'text/turtle; charset=utf-8' });
  } catch (error) { console.error('[LD] Turtle export error:', error); return c.json({ error: 'Export failed' }, 500); }
});

app.get("/make-server-49c0e13c/ld/resource/:id/ntriples", async (c) => {
  try {
    const id = c.req.param('id');
    const resolved = await resolveRecordById(id);
    if (!resolved) return c.json({ error: 'Not found' }, 404);
    const document = resolved.document;
    const graph = document['@graph'] || [document];
    const triples: string[] = [];
    for (const node of graph) {
      if (!node['@id']) continue;
      const subject = `<${node['@id']}>`;
      if (node['@type']) {
        const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
        for (const t of types) {
          triples.push(`${subject} <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <${t.startsWith('bf:') ? 'http://id.loc.gov/ontologies/bibframe/' + t.slice(3) : t}> .`);
        }
      }
      for (const [key, val] of Object.entries(node)) {
        if (key.startsWith('@')) continue;
        const predUri = key.startsWith('bf:') ? 'http://id.loc.gov/ontologies/bibframe/' + key.slice(3) : key;
        if (typeof val === 'object' && val !== null && (val as any)['@id']) {
          triples.push(`${subject} <${predUri}> <${(val as any)['@id']}> .`);
        } else if (typeof val === 'string') {
          triples.push(`${subject} <${predUri}> "${val.replace(/"/g, '\\"')}" .`);
        }
      }
    }
    return c.text(triples.join('\n'), 200, { 'Content-Type': 'application/n-triples; charset=utf-8' });
  } catch (error) { console.error('[LD] N-Triples export error:', error); return c.json({ error: 'Export failed' }, 500); }
});

// Discovery source metadata
app.get("/make-server-49c0e13c/ld/sources", async (c) => {
  return c.json({ sources: getSourceMetadata() });
});

app.get("/make-server-49c0e13c/ld/subjects/:uri", async (c) => {
  try {
    const uri = decodeURIComponent(c.req.param('uri'));
    const hierarchy = await discovery.getSubjectHierarchy(uri);
    return c.json(hierarchy);
  } catch (error) { console.error('[LD] Subject hierarchy error:', error); return c.json({ error: 'Failed' }, 500); }
});

app.get("/make-server-49c0e13c/ld/stats", async (c) => {
  try {
    // Use the centralized provider to get all internal records
    const normalizedRecords = await getInternalRecords();

    const stats = { totalRecords: normalizedRecords.length, works: 0, instances: 0, items: 0,
      languages: new Set<string>(), contributors: new Set<string>(), subjects: new Set<string>() };
    for (const rec of normalizedRecords) {
      const doc = rec.document;
      if (!doc?.['@graph']) continue;
      for (const node of doc['@graph']) {
        if (!node) continue;
        const types = Array.isArray(node['@type']) ? node['@type'] : (node['@type'] ? [node['@type']] : []);
        if (types.some((t: string) => t?.includes('Work'))) stats.works++;
        if (types.some((t: string) => t?.includes('Instance'))) stats.instances++;
        if (types.some((t: string) => t?.includes('Item'))) stats.items++;
        const lang = node['bf:language'] || node['http://id.loc.gov/ontologies/bibframe/language'];
        if (lang) stats.languages.add(typeof lang === 'object' ? lang['@id'] : lang);
        if (types.some((t: string) => t?.includes('Contribution'))) {
          const agent = node['bf:agent'] || node['http://id.loc.gov/ontologies/bibframe/agent'];
          if (agent) stats.contributors.add(typeof agent === 'object' ? (agent['rdfs:label'] || agent['@id']) : agent);
        }
        const subj = node['bf:subject'] || node['http://id.loc.gov/ontologies/bibframe/subject'];
        if (subj) stats.subjects.add(typeof subj === 'object' ? (subj['rdfs:label'] || subj['@id']) : subj);
      }
    }
    return c.json({ totalRecords: stats.totalRecords, works: stats.works, instances: stats.instances,
      items: stats.items, uniqueLanguages: stats.languages.size, uniqueContributors: stats.contributors.size,
      uniqueSubjects: stats.subjects.size, sources: getSourceMetadata() });
  } catch (error) { console.error('[LD] Stats error:', error); return c.json({ error: 'Failed' }, 500); }
});

// ============================== SCRIPTSHIFTER PROXY ==============================
// Proxies requests to LC ScriptShifter API to bypass CORS restrictions
// https://github.com/lcnetdev/scriptshifter

const SS_UPSTREAM = "https://bibframe.org/scriptshifter";

app.get("/make-server-49c0e13c/scriptshifter/languages", async (c) => {
  try {
    console.log("[ScriptShifter] Fetching languages from LC API...");
    const resp = await fetch(`${SS_UPSTREAM}/languages`, {
      headers: { "Accept": "application/json" },
    });
    if (!resp.ok) {
      console.log(`[ScriptShifter] LC API returned ${resp.status}`);
      return c.json({ error: `LC API returned ${resp.status}` }, resp.status as any);
    }
    const data = await resp.json();
    console.log(`[ScriptShifter] Loaded ${Object.keys(data).length} languages`);
    return c.json(data);
  } catch (error: any) {
    console.error("[ScriptShifter] Failed to fetch languages:", error.message);
    return c.json({ error: `Failed to fetch languages: ${error.message}` }, 502);
  }
});

app.get("/make-server-49c0e13c/scriptshifter/options/:lang", async (c) => {
  const lang = c.req.param("lang");
  try {
    const resp = await fetch(`${SS_UPSTREAM}/options/${encodeURIComponent(lang)}`, {
      headers: { "Accept": "application/json" },
    });
    if (!resp.ok) return c.json({ error: `LC API returned ${resp.status}` }, resp.status as any);
    return c.json(await resp.json());
  } catch (error: any) {
    console.error(`[ScriptShifter] Options error for ${lang}:`, error.message);
    return c.json({ error: error.message }, 502);
  }
});

app.post("/make-server-49c0e13c/scriptshifter/trans", async (c) => {
  try {
    const body = await c.req.json();
    console.log(`[ScriptShifter] Transliterating: lang=${body.lang}, dir=${body.t_dir}, len=${body.text?.length}`);
    const resp = await fetch(`${SS_UPSTREAM}/trans`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) {
      console.log(`[ScriptShifter] Translation error ${resp.status}:`, JSON.stringify(data));
      return c.json(data, resp.status as any);
    }
    console.log(`[ScriptShifter] Success: output length=${data.output?.length}, warnings=${data.warnings?.length || 0}`);
    return c.json(data);
  } catch (error: any) {
    console.error("[ScriptShifter] Translation proxy error:", error.message);
    return c.json({ error: `Translation proxy error: ${error.message}`, warnings: [`Proxy error: ${error.message}`], output: "" }, 502);
  }
});

// ═══════════════════════════════════════════════════════════
// 🧠 ENTERPRISE AI ENGINE — BIBFRAME AI Layer (Level 3)
// ═══════════════════════════════════════════════════════════

// AI Debug: Check OPENAI_API_KEY status (env only — enterprise pattern)
app.get("/make-server-49c0e13c/ai/debug-key", async (c) => {
  const envKey = Deno.env.get("OPENAI_API_KEY");
  const valid = !!envKey && envKey.trim().length >= 20;
  console.log(`[AI DEBUG] ENV key exists=${!!envKey}, length=${envKey?.length ?? 0}, valid=${valid}`);
  return c.json({
    configured: valid,
    keyLength: envKey?.length || 0,
    keyPrefix: envKey ? envKey.slice(0, 7) + "..." : "NOT SET",
    status: valid ? "READY" : `INVALID (${envKey?.length ?? 0} chars — expected 50+)`,
  });
});

// Phase 1: AI Metadata Suggestions
app.post("/make-server-49c0e13c/ai/suggest-metadata", async (c) => {
  try {
    const input = await c.req.json();
    console.log("[AI] Phase 1: Metadata suggestion request", Object.keys(input));
    const result = await aiEngine.suggestMetadata(input);
    return c.json(result);
  } catch (error: any) {
    console.error("[AI] Phase 1 error:", error.message);
    return c.json({ error: `AI metadata suggestion error: ${error.message}` }, 500);
  }
});

// Phase 2: AI Duplicate Detection
app.post("/make-server-49c0e13c/ai/detect-duplicates", async (c) => {
  try {
    const input = await c.req.json();
    console.log("[AI] Phase 2: Duplicate detection request", input.title);
    const result = await aiEngine.detectDuplicates(input);
    return c.json({ candidates: result });
  } catch (error: any) {
    console.error("[AI] Phase 2 error:", error.message);
    return c.json({ error: `AI duplicate detection error: ${error.message}` }, 500);
  }
});

// Phase 3: AI Natural Language Discovery
app.post("/make-server-49c0e13c/ai/natural-search", async (c) => {
  try {
    const { query } = await c.req.json();
    if (!query) return c.json({ error: "query parameter required" }, 400);
    console.log("[AI] Phase 3: Natural language search", query);
    const result = await aiEngine.naturalLanguageSearch(query);
    return c.json(result);
  } catch (error: any) {
    console.error("[AI] Phase 3 error:", error.message);
    return c.json({ error: `AI natural search error: ${error.message}` }, 500);
  }
});

// Phase 4: AI SPARQL Translator
app.post("/make-server-49c0e13c/ai/sparql-translate", async (c) => {
  try {
    const { query } = await c.req.json();
    if (!query) return c.json({ error: "query parameter required" }, 400);
    console.log("[AI] Phase 4: SPARQL translation", query);
    const result = await aiEngine.translateToSPARQL(query);
    return c.json(result);
  } catch (error: any) {
    console.error("[AI] Phase 4 error:", error.message);
    return c.json({ error: `AI SPARQL translation error: ${error.message}` }, 500);
  }
});

// Phase 5: AI Auto Fill
app.post("/make-server-49c0e13c/ai/autofill", async (c) => {
  try {
    const input = await c.req.json();
    console.log("[AI] Phase 5: Auto-fill request", input);
    const result = await aiEngine.autoFill(input);
    return c.json(result);
  } catch (error: any) {
    console.error("[AI] Phase 5 error:", error.message);
    return c.json({ error: `AI auto-fill error: ${error.message}` }, 500);
  }
});

// AI Audit Log
app.get("/make-server-49c0e13c/ai/audit-log", async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") || "50");
    const entries = await aiEngine.getAuditLog(limit);
    return c.json({ entries, count: entries.length });
  } catch (error: any) {
    console.error("[AI] Audit log error:", error.message);
    return c.json({ error: `AI audit log error: ${error.message}` }, 500);
  }
});

// AI Audit Approval/Rejection
app.post("/make-server-49c0e13c/ai/audit/:id/approve", async (c) => {
  try {
    const id = c.req.param("id");
    const { approved } = await c.req.json();
    await aiEngine.updateAuditApproval(id, approved);
    return c.json({ success: true, id, approved });
  } catch (error: any) {
    console.error("[AI] Audit approval error:", error.message);
    return c.json({ error: `AI audit approval error: ${error.message}` }, 500);
  }
});

// ═══════════════════════════════════════════════════════════
// ⭐ FAVORITE TOOLS PERSISTENCE
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// MULTI-AI ROUTING ENGINE (MOON DIJLA)
// ═══════════════════════════════════════════════════════════

// AI Router: Provider Status
app.get("/make-server-49c0e13c/ai-router/status", (c) => {
  try {
    const providers = aiRouter.getProviderStatus();
    const config = aiRouter.getRouterConfig();
    return c.json({ providers, config, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error("[AI-ROUTER] Status error:", error.message);
    return c.json({ error: `AI router status error: ${error.message}` }, 500);
  }
});

// AI Router: Routing Log
app.get("/make-server-49c0e13c/ai-router/routing-log", async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") || "50");
    const log = await aiRouter.getRoutingLog(limit);
    return c.json({ log, count: log.length });
  } catch (error: any) {
    console.error("[AI-ROUTER] Routing log error:", error.message);
    return c.json({ error: `Routing log error: ${error.message}` }, 500);
  }
});

// AI Router: Update Configuration
app.post("/make-server-49c0e13c/ai-router/config", async (c) => {
  try {
    const updates = await c.req.json();
    const config = aiRouter.updateRouterConfig(updates);
    return c.json({ success: true, config });
  } catch (error: any) {
    console.error("[AI-ROUTER] Config update error:", error.message);
    return c.json({ error: `Config update error: ${error.message}` }, 500);
  }
});

// AI Router: Routed Metadata Suggestions
app.post("/make-server-49c0e13c/ai-router/suggest-metadata", async (c) => {
  try {
    const input = await c.req.json();
    console.log("[AI-ROUTER] Routed metadata suggestion", Object.keys(input));
    const result = await aiRouter.routedSuggestMetadata(input);
    return c.json(result);
  } catch (error: any) {
    console.error("[AI-ROUTER] Metadata error:", error.message);
    return c.json({ error: `AI router metadata error: ${error.message}` }, 500);
  }
});

// AI Router: Routed Entity Linking
app.post("/make-server-49c0e13c/ai-router/entity-linking", async (c) => {
  try {
    const input = await c.req.json();
    console.log("[AI-ROUTER] Routed entity linking", input.entityName);
    const result = await aiRouter.routedEntityLinking(input);
    return c.json(result);
  } catch (error: any) {
    console.error("[AI-ROUTER] Entity linking error:", error.message);
    return c.json({ error: `AI router entity linking error: ${error.message}` }, 500);
  }
});

// AI Router: Routed Duplicate Detection
app.post("/make-server-49c0e13c/ai-router/detect-duplicates", async (c) => {
  try {
    const input = await c.req.json();
    console.log("[AI-ROUTER] Routed duplicate detection", input.title);
    const result = await aiRouter.routedDuplicateDetection(input);
    return c.json(result);
  } catch (error: any) {
    console.error("[AI-ROUTER] Duplicate detection error:", error.message);
    return c.json({ error: `AI router duplicate error: ${error.message}` }, 500);
  }
});

// AI Router: Routed Natural Language Search
app.post("/make-server-49c0e13c/ai-router/natural-search", async (c) => {
  try {
    const { query } = await c.req.json();
    if (!query) return c.json({ error: "query required" }, 400);
    console.log("[AI-ROUTER] Routed natural search", query);
    const result = await aiRouter.routedNaturalSearch(query);
    return c.json(result);
  } catch (error: any) {
    console.error("[AI-ROUTER] Natural search error:", error.message);
    return c.json({ error: `AI router search error: ${error.message}` }, 500);
  }
});

// AI Router: Routed SPARQL Translation
app.post("/make-server-49c0e13c/ai-router/sparql-translate", async (c) => {
  try {
    const { query } = await c.req.json();
    if (!query) return c.json({ error: "query required" }, 400);
    console.log("[AI-ROUTER] Routed SPARQL translation", query);
    const result = await aiRouter.routedSPARQLTranslate(query);
    return c.json(result);
  } catch (error: any) {
    console.error("[AI-ROUTER] SPARQL error:", error.message);
    return c.json({ error: `AI router SPARQL error: ${error.message}` }, 500);
  }
});

// AI Router: Routed Auto-Fill
app.post("/make-server-49c0e13c/ai-router/autofill", async (c) => {
  try {
    const input = await c.req.json();
    console.log("[AI-ROUTER] Routed auto-fill", Object.keys(input));
    const result = await aiRouter.routedAutoFill(input);
    return c.json(result);
  } catch (error: any) {
    console.error("[AI-ROUTER] Auto-fill error:", error.message);
    return c.json({ error: `AI router auto-fill error: ${error.message}` }, 500);
  }
});

// AI Router: Routed Discovery Enhancement
app.post("/make-server-49c0e13c/ai-router/discovery-enhance", async (c) => {
  try {
    const { query } = await c.req.json();
    if (!query) return c.json({ error: "query required" }, 400);
    console.log("[AI-ROUTER] Discovery enhancement", query);
    const result = await aiRouter.routedDiscoveryEnhance(query);
    return c.json(result);
  } catch (error: any) {
    console.error("[AI-ROUTER] Discovery error:", error.message);
    return c.json({ error: `AI router discovery error: ${error.message}` }, 500);
  }
});

// ═══════════════════════════════════════════════════════════
// LD4 LINKED DATA INTEGRATION
// ═══════════════════════════════════════════════════════════

// LD4: Service Health Check
app.get("/make-server-49c0e13c/ld4/status", async (c) => {
  try {
    const services = await ld4.checkLD4Services();
    return c.json({ services, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error("[LD4] Status check error:", error.message);
    return c.json({ error: `LD4 status error: ${error.message}` }, 500);
  }
});

// LD4: Fetch Profiles
app.get("/make-server-49c0e13c/ld4/profiles", async (c) => {
  try {
    const profiles = await ld4.fetchLD4Profiles();
    return c.json({ profiles, count: profiles.length });
  } catch (error: any) {
    console.error("[LD4] Profiles error:", error.message);
    return c.json({ error: `LD4 profiles error: ${error.message}` }, 500);
  }
});

// LD4: Import Profile
app.post("/make-server-49c0e13c/ld4/profiles/import", async (c) => {
  try {
    const { profileId } = await c.req.json();
    if (!profileId) return c.json({ error: "profileId required" }, 400);
    const profile = await ld4.importLD4Profile(profileId);
    if (!profile) return c.json({ error: "Profile not found" }, 404);
    return c.json({ success: true, profile });
  } catch (error: any) {
    return c.json({ error: `Profile import error: ${error.message}` }, 500);
  }
});

// LD4: Sinopia Templates
app.get("/make-server-49c0e13c/ld4/sinopia/templates", async (c) => {
  try {
    const templates = await ld4.getSinopiaTemplates();
    return c.json({ templates, count: templates.length });
  } catch (error: any) {
    return c.json({ error: `Sinopia templates error: ${error.message}` }, 500);
  }
});

// LD4: Import Sinopia Template
app.post("/make-server-49c0e13c/ld4/sinopia/import", async (c) => {
  try {
    const raw = await c.req.json();
    const template = ld4.parseSinopiaTemplate(raw);
    await ld4.saveSinopiaTemplate(template);
    const moonTemplate = ld4.convertToMoonTemplate(template);
    return c.json({ success: true, template, moonTemplate });
  } catch (error: any) {
    return c.json({ error: `Sinopia import error: ${error.message}` }, 500);
  }
});

// LD4: Authority Reconciliation (federated)
app.get("/make-server-49c0e13c/ld4/reconcile", async (c) => {
  try {
    const query = c.req.query("q") || "";
    const type = c.req.query("type") || undefined;
    const sources = c.req.query("sources")?.split(",") || undefined;
    if (!query) return c.json({ error: "q parameter required" }, 400);
    console.log(`[LD4] Reconcile: "${query}" type=${type} sources=${sources?.join(",")}`);
    const result = await ld4.reconcileAuthority(query, type, sources);
    return c.json(result);
  } catch (error: any) {
    console.error("[LD4] Reconcile error:", error.message);
    return c.json({ error: `Reconciliation error: ${error.message}` }, 500);
  }
});

// LD4: Authority Search (single source)
app.get("/make-server-49c0e13c/ld4/authority/search", async (c) => {
  try {
    const query = c.req.query("q") || "";
    const source = c.req.query("source") || "LOC";
    const type = c.req.query("type") || undefined;
    if (!query) return c.json({ error: "q parameter required" }, 400);
    const results = await ld4.searchAuthority(query, source, type);
    return c.json({ results, count: results.length, source });
  } catch (error: any) {
    return c.json({ error: `Authority search error: ${error.message}` }, 500);
  }
});

// LD4: Authority Lookup (URI dereference)
app.get("/make-server-49c0e13c/ld4/authority/lookup", async (c) => {
  try {
    const uri = c.req.query("uri") || "";
    if (!uri) return c.json({ error: "uri parameter required" }, 400);
    const result = await ld4.lookupAuthority(uri);
    return c.json({ result });
  } catch (error: any) {
    return c.json({ error: `Authority lookup error: ${error.message}` }, 500);
  }
});

// LD4: Federated Discovery
app.get("/make-server-49c0e13c/ld4/discover", async (c) => {
  try {
    const query = c.req.query("q") || "";
    const sources = c.req.query("sources")?.split(",") || undefined;
    if (!query) return c.json({ error: "q parameter required" }, 400);
    console.log(`[LD4] Federated discovery: "${query}"`);
    const result = await ld4.federatedDiscovery(query, sources);
    return c.json(result);
  } catch (error: any) {
    console.error("[LD4] Discovery error:", error.message);
    return c.json({ error: `Discovery error: ${error.message}` }, 500);
  }
});

// LD4: Linked Data Resource (with content negotiation)
app.get("/make-server-49c0e13c/ld4/resource/:type/:id", async (c) => {
  try {
    const type = c.req.param("type") || "";
    const id = c.req.param("id") || "";
    const accept = c.req.header("Accept") || "application/ld+json";
    const resource = await ld4.getLinkedDataResource(type, id);
    if (!resource) return c.json({ error: `Resource not found: ${type}/${id}` }, 404);
    const format = ld4.negotiateFormat(accept);
    const serialized = ld4.serializeResource(resource, format);
    return new Response(serialized.content, {
      headers: { "Content-Type": serialized.contentType, "Access-Control-Allow-Origin": "*" },
    });
  } catch (error: any) {
    return c.json({ error: `Resource error: ${error.message}` }, 500);
  }
});

// AI Router: Reset Circuit Breaker
app.post("/make-server-49c0e13c/ai-router/reset-circuit/:provider", (c) => {
  try {
    const provider = c.req.param("provider") as any;
    if (!["openai", "gemini", "llama"].includes(provider)) {
      return c.json({ error: "Invalid provider. Must be: openai, gemini, llama" }, 400);
    }
    aiRouter.resetCircuitBreaker(provider);
    return c.json({ success: true, provider, message: `Circuit breaker for ${provider} reset` });
  } catch (error: any) {
    console.error("[AI-ROUTER] Circuit reset error:", error.message);
    return c.json({ error: `Circuit reset error: ${error.message}` }, 500);
  }
});

// ===== FIELD TEMPLATE PERSISTENCE =====

// GET all saved field templates
// Work groups (Phase 13 S11): cataloguers' "same Work" / "not the same" decisions, read by the OPAC (public)
// and the review queue; anyone signed in may decide, and each decision records who and when.
app.get("/make-server-49c0e13c/work-clusters/decisions", async (c) => {
  try {
    const decisions = parseDecisions(await kv.get(DECISIONS_KEY).catch(() => null));
    return c.json({ decisions }, 200, { "Cache-Control": "public, max-age=60" });
  } catch (error) {
    console.log("Error reading work decisions:", error);
    return c.json({ decisions: [] });
  }
});

app.post("/make-server-49c0e13c/work-clusters/decisions", async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ success: false, error: "Sign in to decide on Work groups" }, 401);
    const body = await c.req.json().catch(() => ({}));
    const stored = parseDecisions(await kv.get(DECISIONS_KEY).catch(() => null));
    const result = applyDecision(stored, body, session.username, new Date().toISOString());
    if (result.error) return c.json({ success: false, error: result.error }, 400);
    await kv.set(DECISIONS_KEY, JSON.stringify(result.list));
    return c.json({ success: true, decisions: result.list });
  } catch (error) {
    console.log("Error saving a work decision:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.get("/make-server-49c0e13c/field-templates", async (c) => {
  try {
    const data = await kv.get("field-templates-all");
    const templates = data ? (typeof data === "string" ? JSON.parse(data) : data) : [];
    return c.json({ success: true, templates });
  } catch (error) {
    console.log("Error loading field templates:", error);
    return c.json({ success: false, error: String(error), templates: [] }, 500);
  }
});

// PUT the editor's list of field templates. Each template has an owner and a version (Phase 13 S18): only
// the owner or the Super Admin changes or removes it, a save from an older copy is refused for that template,
// and a template the saver did not know (added by someone meanwhile) is never removed. `known`: the ids the
// saver's copy had. Earlier versions go to field-templates-history:<id> (the last 20).
app.put("/make-server-49c0e13c/field-templates", async (c) => {
  try {
    const session = await getSession(c);
    if (!session) {
      return c.json({ success: false, error: "Sign in to change field templates" }, 401);
    }
    const { templates, known } = await c.req.json();
    if (!Array.isArray(templates) || templates.length > 500 || JSON.stringify(templates).length > 1_000_000) {
      return c.json({ success: false, error: "templates must be an array (up to 500)" }, 400);
    }
    const data = await kv.get("field-templates-all");
    const stored: Template[] = data ? (typeof data === "string" ? JSON.parse(data) : data) : [];
    const result = applyTemplateSave(stored, templates, Array.isArray(known) ? known.map(String) : undefined,
      { username: session.username, admin: !!(await isAdminSession(c)) }, new Date().toISOString());
    await kv.set("field-templates-all", JSON.stringify(result.templates));
    for (const old of result.previous) {
      const key = `field-templates-history:${old.id}`;
      const h = await kv.get(key);
      const list = h ? (typeof h === "string" ? JSON.parse(h) : h) : [];
      await kv.set(key, JSON.stringify([old, ...list].slice(0, 20)));
    }
    return c.json({ success: true, count: result.templates.length, templates: result.templates, refused: result.refused });
  } catch (error) {
    console.log("Error saving field templates:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// DELETE a single field template by id
app.delete("/make-server-49c0e13c/field-templates/:id", async (c) => {
  try {
    if (!(await getSession(c))) {
      return c.json({ success: false, error: "Sign in to change field templates" }, 401);
    }
    const id = c.req.param("id");
    const data = await kv.get("field-templates-all");
    const templates = data ? (typeof data === "string" ? JSON.parse(data) : data) : [];
    const target = templates.find((t: any) => t.id === id);
    const session = await getSession(c);
    if (target?.owner && target.owner !== session!.username && !(await isAdminSession(c))) {
      return c.json({ success: false, error: `Only ${target.owner} (its owner) or the Super Admin can remove this template` }, 403);
    }
    const updated = templates.filter((t: any) => t.id !== id);
    await kv.set("field-templates-all", JSON.stringify(updated));
    return c.json({ success: true, remaining: updated.length });
  } catch (error) {
    console.log("Error deleting field template:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// The earlier versions of a field template, newest first.
app.get("/make-server-49c0e13c/field-templates/:id/history", async (c) => {
  try {
    if (!(await getSession(c))) return c.json({ error: "Sign in" }, 401);
    const h = await kv.get(`field-templates-history:${c.req.param("id")}`);
    return c.json({ history: h ? (typeof h === "string" ? JSON.parse(h) : h) : [] });
  } catch (error) {
    console.log("Error loading template history:", error);
    return c.json({ error: "Failed to load the history" }, 500);
  }
});

Deno.serve(app.fetch);
