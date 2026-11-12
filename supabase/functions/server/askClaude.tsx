/**
 * The two Claude calls behind Ask Moon (S15), with the official Anthropic SDK: plan the searches, then answer
 * from the records found. Structured outputs (zod) give typed JSON back. Server-side refusal fallbacks are
 * on ("default": the API picks a fallback model if a safety classifier declines). Effort: low for the plan,
 * medium for the answer. Off until the ANTHROPIC_API_KEY secret is set.
 */
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { betaZodOutputFormat } from "npm:@anthropic-ai/sdk@1.3.0/helpers/beta/zod";
import { z } from "npm:zod@4.1.12";
import { PLAN_SYSTEM, ANSWER_SYSTEM, digest, type AskPlan, type AskDraft, type AskRecord } from "./askMoon.tsx";
import { DRAFT_SYSTEM } from "./summaryDrafts.tsx";

const MODEL = "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export const askEnabled = () => !!(Deno.env.get("ANTHROPIC_API_KEY") || "").trim();

let client: Anthropic | null = null;
const anthropic = () => (client ||= new Anthropic({ timeout: 60_000, maxRetries: 1 }));

const PlanSchema = z.object({
  language: z.enum(["ar", "en"]),
  queries: z.array(z.string()),
  ideal: z.object({ titles: z.array(z.string()), people: z.array(z.string()), subjects: z.array(z.string()) }),
});
const AnswerSchema = z.object({ found: z.boolean(), answer: z.string(), cited: z.array(z.string()) });

function logFailure(where: string, error: unknown) {
  if (error instanceof Anthropic.AuthenticationError) console.error(`[ask] ${where}: the ANTHROPIC_API_KEY was refused`);
  else if (error instanceof Anthropic.RateLimitError) console.error(`[ask] ${where}: rate limited`);
  else if (error instanceof Anthropic.APIError) console.error(`[ask] ${where}: API error ${error.status}: ${error.message}`);
  else console.error(`[ask] ${where}:`, error);
}

export async function planWithClaude(question: string): Promise<AskPlan | null> {
  try {
    const res = await anthropic().beta.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: PLAN_SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(PlanSchema) },
      messages: [{ role: "user", content: question }],
    });
    if (res.stop_reason === "refusal") return null;
    const p = res.parsed_output;
    return p ? { ...p, queries: p.queries.slice(0, 4) } : null;
  } catch (error) {
    logFailure("plan", error);
    return null;
  }
}

export async function answerWithClaude(question: string, language: "ar" | "en", records: AskRecord[]): Promise<AskDraft | null> {
  try {
    const res = await anthropic().beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: ANSWER_SYSTEM,
      output_config: { effort: "medium", format: betaZodOutputFormat(AnswerSchema) },
      messages: [{
        role: "user",
        content: `Reader's language: ${language === "ar" ? "Arabic" : "English"}\n\nCatalogue records:\n${records.map(digest).join("\n")}\n\nQuestion: ${question}`,
      }],
    });
    if (res.stop_reason === "refusal") return null;
    return res.parsed_output ?? null;
  } catch (error) {
    logFailure("answer", error);
    return null;
  }
}

// ---- Draft summaries (summaryDrafts.tsx): from the record's own facts only; a reviewer approves before anything is published ----

const DraftSchema = z.object({ enoughFacts: z.boolean(), summary: z.string() });

export async function draftSummaryWithClaude(facts: string, language: "ar" | "en"): Promise<{ enoughFacts: boolean; summary: string } | null> {
  try {
    const res = await anthropic().beta.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: DRAFT_SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(DraftSchema) },
      messages: [{ role: "user", content: `Write the summary in ${language === "ar" ? "Arabic" : "English"}.\n\nThe record's facts:\n${facts}` }],
    });
    if (res.stop_reason === "refusal") return null;
    return res.parsed_output ?? null;
  } catch (error) {
    logFailure("draft summary", error);
    return null;
  }
}
