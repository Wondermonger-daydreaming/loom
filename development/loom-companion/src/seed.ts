import { Notice } from "obsidian";
import type LoomCompanionPlugin from "./main";
import { streamChat } from "./openrouter";

const SEED_PROMPT = `You are given a piece of writing. Generate 5–10 short fragments that could belong somewhere in this piece but are NOT yet in it.

These are SEEDS, not continuations: do not extend the ending, do not summarize, do not resolve anything. Each fragment opens a LATERAL possibility — a detail, image, voice, question, or angle the piece implies but has not used. Throw them at the soil of what is already growing.

Range across types — include several of: a description, a line of dialogue, a snatch of narration, a bare phrase, a question, a possible first line. Vary register and length; keep each fragment short (one line to a couple of sentences).

Return each fragment on its own line, prefixed with its type in square brackets, e.g.:
[description] The kettle had been left on so long the water forgot it was water.
[dialogue] "You keep saying 'we' like there's still a we."
[first line] Nobody warned me the house would learn my footsteps.

No numbering, no commentary, no blank lines between fragments.`;

export interface Seed {
  type: string;
  text: string;
}

export function parseSeeds(raw: string): Seed[] {
  const seeds: Seed[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/^\[([^\]]+)\]\s*(.+)$/);
    if (m) {
      seeds.push({ type: m[1].trim().toLowerCase(), text: m[2].trim() });
    } else {
      seeds.push({
        type: "fragment",
        text: t.replace(/^[\s\-*\d.)]+/, "").trim(),
      });
    }
  }
  return seeds.filter((s) => s.text.length > 0);
}

/** Generate lateral seeds for a piece. Lateral generation runs hotter. */
export async function generateSeeds(
  plugin: LoomCompanionPlugin,
  body: string,
  signal: AbortSignal
  , context: {target?:string;onRecord?:(r:any)=>void} = {}
): Promise<Seed[]> {
  let raw = "";
  for await (const delta of streamChat({
    plugin, operation:'Seed', ...context,
    model: plugin.settings.model,
    system: SEED_PROMPT,
    user: body,
    temperature: Math.min(1, plugin.settings.temperature + 0.2),
    // Reasoning-safe floor: reasoning models burn budget before content.
    maxTokens: Math.max(1500, plugin.settings.maxTokens),
    signal,
  })) {
    raw += delta;
  }
  return parseSeeds(raw);
}

/**
 * Render a seed list into a host element, with per-seed Insert/Copy and a
 * Copy-all action. `insertFn` receives the bare fragment text.
 */
export function renderSeedList(
  host: HTMLElement,
  seeds: Seed[],
  insertFn: (text: string) => void
): void {
  host.empty();
  if (seeds.length === 0) {
    host.createDiv({ text: "No seeds returned." });
    return;
  }

  const bar = host.createDiv({ cls: "loom-companion-buttons" });
  const copyAll = bar.createEl("button", { text: "Copy all" });
  copyAll.addEventListener("click", async () => {
    await navigator.clipboard.writeText(seeds.map((s) => s.text).join("\n"));
    new Notice(`Copied ${seeds.length} seeds`);
  });

  for (const seed of seeds) {
    const row = host.createDiv({ cls: "loom-companion-suggestion" });
    row.createSpan({ cls: "loom-companion-suggestion-reason", text: seed.type });
    row.createSpan({ text: seed.text });
    const actions = row.createSpan();
    actions.style.marginLeft = "auto";
    actions
      .createEl("button", { text: "Insert" })
      .addEventListener("click", () => insertFn(seed.text));
    const copy = actions.createEl("button", { text: "Copy" });
    copy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(seed.text);
      new Notice("Seed copied");
    });
  }
}
