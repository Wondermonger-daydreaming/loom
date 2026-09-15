import { App, PluginSettingTab, Setting, TextAreaComponent } from "obsidian";
import type LoomCompanionPlugin from "./main";

export interface LoomCompanionSettings {
  model: string;
  temperature: number;
  maxTokens: number;
  /** transform-name -> system prompt (seeded, user-editable) */
  recastPrompts: Record<string, string>;
  /** When false, Recast applies directly to the selection (no preview window). */
  previewRecast: boolean;
  /** When false, Seeder drops all fragments at the cursor (no pick list). */
  previewSeed: boolean;
}

export const FALLBACK_MODEL = "anthropic/claude-sonnet-4.6";

/** The {placeholders} in these are filled by recast.ts before sending. */
export const SEED_RECAST_PROMPTS: Record<string, string> = {
  Tighten:
    "Rewrite the passage to be tighter and clearer. Cut filler, redundancy, and hedging. Preserve the author's voice, meaning, and any technical terms or names exactly. Return only the rewritten passage — no preamble, no quotation marks, no commentary.",
  Expand:
    "Develop the passage further: add specificity, a concrete example, or a consequence the author implies but did not state. Match the existing voice and register. Do not pad. Return only the expanded passage — no preamble, no commentary.",
  Rephrase:
    "Rephrase the passage using different wording and sentence structure while preserving its meaning and the author's voice exactly. Return only the rephrased passage — no preamble, no commentary.",
  "Shift register":
    "Rewrite the passage in a {instruction} register. Preserve meaning and all factual/technical content. Return only the rewritten passage — no preamble, no commentary.",
  "Smooth the seam":
    "The MIDDLE passage was inserted between BEFORE and AFTER. Revise ONLY the middle so it reads as one continuous passage — fix transitions, tense, pronoun referents, and repeated words across the seams. Do not rewrite BEFORE or AFTER. Return only the revised middle passage.\n\nBEFORE:\n{before}\n\nAFTER:\n{after}",
  Custom:
    "Apply this instruction to the passage: {instruction}\nPreserve the author's voice unless the instruction says otherwise. Return only the resulting passage — no preamble, no commentary.",
};

export const DEFAULT_SETTINGS: LoomCompanionSettings = {
  model: "", // empty => resolved from Loom's active preset on first run
  temperature: 0.7,
  // 1500 (not 800): reasoning models (e.g. minimax/minimax-m3) spend
  // completion budget on reasoning tokens before any content. max_tokens is a
  // cap, not a target — non-reasoning models stop well short of it for free.
  maxTokens: 1500,
  recastPrompts: { ...SEED_RECAST_PROMPTS },
  previewRecast: true,
  previewSeed: true,
};

/**
 * Read Loom's currently-active model preset from its data.json so the
 * companion defaults to the same model the user is already generating with.
 * Returns null if Loom isn't installed or the file can't be parsed.
 */
export async function readLoomActiveModel(app: App): Promise<string | null> {
  try {
    const raw = await app.vault.adapter.read(
      app.vault.configDir + "/plugins/loom/data.json"
    );
    const data = JSON.parse(raw);
    const idx = data?.settings?.modelPreset;
    const presets = data?.settings?.modelPresets;
    if (Array.isArray(presets) && typeof idx === "number" && presets[idx]) {
      const m = presets[idx].model;
      if (typeof m === "string" && m.length > 0) return m;
    }
  } catch {
    /* Loom not present / unreadable — fall back */
  }
  return null;
}

export class LoomCompanionSettingTab extends PluginSettingTab {
  plugin: LoomCompanionPlugin;

  constructor(app: App, plugin: LoomCompanionPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Model").setDesc(this.plugin.settings.model).addButton(b=>b.setButtonText("Browse shared catalog").onClick(()=>this.plugin.chooseModel(()=>this.display())));
    new Setting(containerEl).setName("Generation history").setDesc("Prompts, results and settings are stored locally for recovery and reuse.").addButton(b=>b.setButtonText("Open history").onClick(()=>this.plugin.shared.history(r=>this.plugin.reuseSettings(r))));

    new Setting(containerEl)
      .setName("Temperature")
      .setDesc("Lower than Loom's default — revision wants less wildness.")
      .addText((t) =>
        t
          .setPlaceholder("0.7")
          .setValue(String(this.plugin.settings.temperature))
          .onChange(async (v) => {
            const n = parseFloat(v);
            if (Number.isFinite(n) && n >= 0 && n <= 2) {
              this.plugin.settings.temperature = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Max tokens")
      .setDesc(
        "Cap on completion tokens per call. Keep generous (≥1500) for reasoning models, which spend this budget thinking before they answer."
      )
      .addText((t) =>
        t
          .setPlaceholder("1500")
          .setValue(String(this.plugin.settings.maxTokens))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (Number.isInteger(n) && n > 0) {
              this.plugin.settings.maxTokens = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Preview Recast before applying")
      .setDesc(
        "On: show a preview window with Accept/Retry. Off: apply the transform directly to the selection (Ctrl+Z undoes)."
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.previewRecast).onChange(async (v) => {
          this.plugin.settings.previewRecast = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Preview Seed before inserting")
      .setDesc(
        "On: show the fragment list to pick from. Off: drop all seeds at the cursor (Ctrl+Z undoes)."
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.previewSeed).onChange(async (v) => {
          this.plugin.settings.previewSeed = v;
          await this.plugin.saveSettings();
        })
      );

    containerEl.createEl("h3", { text: "Recast prompts" });
    containerEl.createEl("p", {
      text: "System prompts for each transform. {instruction}, {before}, {after} are filled in at call time.",
      cls: "setting-item-description",
    });

    for (const name of Object.keys(this.plugin.settings.recastPrompts)) {
      const setting = new Setting(containerEl).setName(name);
      setting.settingEl.addClass("loom-companion-prompt-setting");
      let ta: TextAreaComponent;
      setting.addTextArea((c) => {
        ta = c;
        c.setValue(this.plugin.settings.recastPrompts[name]);
        c.inputEl.rows = 4;
        c.inputEl.style.width = "100%";
        c.onChange(async (v) => {
          this.plugin.settings.recastPrompts[name] = v;
          await this.plugin.saveSettings();
        });
      });
      setting.addExtraButton((b) =>
        b
          .setIcon("rotate-ccw")
          .setTooltip("Reset to default")
          .onClick(async () => {
            const seed = SEED_RECAST_PROMPTS[name];
            if (seed !== undefined) {
              this.plugin.settings.recastPrompts[name] = seed;
              ta.setValue(seed);
              await this.plugin.saveSettings();
            }
          })
      );
    }
  }
}
