import { App, Notice, TFile } from "obsidian";
import type LoomCompanionPlugin from "./main";
import { collectChat } from "./openrouter";
import { getTargetMarkdownView } from "./util";
type Context = {target?:string;signal:AbortSignal;onRecord?:(r:any)=>void};

const TITLE_PROMPT =
  "Read the note. Propose 3–5 concise, specific titles (no clickbait, no colons unless natural). Return one per line, nothing else.";
const DESCRIPTION_PROMPT =
  "Write a single-sentence description (≤140 chars) of this note's content, in plain prose. Return only the sentence.";
const LINKS_PROMPT =
  "Here is a note, then a list of existing note titles in the vault. Pick only the titles that are genuinely topically related to the note (max 8). For each, give the exact title and a ≤12-word reason. Do not invent titles not in the list. Format: `[[Title]] — reason`.";

export interface LinkSuggestion {
  title: string;
  reason: string;
}

export async function suggestTitles(
  plugin: LoomCompanionPlugin,
  body: string, context:Context
): Promise<string[]> {
  const raw = await collectChat({
    plugin, operation:'Suggest titles', ...context,
    model: plugin.settings.model,
    system: TITLE_PROMPT,
    user: body,
    temperature: plugin.settings.temperature,
    maxTokens: Math.max(300, plugin.settings.maxTokens),
    signal: context.signal,
  });
  return raw
    .split("\n")
    .map((l) => l.replace(/^[\s\-*\d.)]+/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

export async function generateDescription(
  plugin: LoomCompanionPlugin,
  body: string, context:Context
): Promise<string> {
  const desc = await collectChat({
    plugin, operation:'Write description', ...context,
    model: plugin.settings.model,
    system: DESCRIPTION_PROMPT,
    user: body,
    temperature: plugin.settings.temperature,
    maxTokens: Math.max(300, plugin.settings.maxTokens),
    signal: context.signal,
  });
  return desc.replace(/^["']|["']$/g, "").trim();
}

export async function suggestLinks(
  plugin: LoomCompanionPlugin,
  file: TFile,
  body: string, context:Context
): Promise<LinkSuggestion[]> {
  const candidates = plugin.app.vault
    .getMarkdownFiles()
    .filter((f) => f.path !== file.path)
    .map((f) => f.path.replace(/\.md$/i,''))
    .slice(0,1000);
  const valid = new Set(candidates);
  const user = `NOTE:\n${body}\n\nEXISTING NOTE TITLES:\n${candidates.join("\n")}`;
  const raw = await collectChat({
    plugin, operation:'Suggest links', ...context,
    model: plugin.settings.model,
    system: LINKS_PROMPT,
    user,
    temperature: plugin.settings.temperature,
    maxTokens: Math.max(600, plugin.settings.maxTokens),
    signal: context.signal,
  });

  const out: LinkSuggestion[] = [];
  for (const line of raw.split("\n")) {
    const m = line.trim().match(/\[\[([^\]]+)\]\]\s*[—\-:]?\s*(.*)$/);
    if (!m) continue;
    const title = m[1].trim();
    if (!valid.has(title)) continue; // reject hallucinated titles
    out.push({ title, reason: m[2].trim() });
  }
  return out;
}

// All writes are performed through EditTarget in panel.ts.
