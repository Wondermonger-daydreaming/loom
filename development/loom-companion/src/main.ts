import { Plugin, WorkspaceLeaf } from "obsidian";
import {
  DEFAULT_SETTINGS,
  LoomCompanionSettings,
  LoomCompanionSettingTab,
  FALLBACK_MODEL,
  readLoomActiveModel,
} from "./settings";
import { runRecast } from "./recast";
import { LoomCompanionView, VIEW_TYPE_LOOM_COMPANION } from "./panel";
import { sharedServices } from './shared';
import type { SharedService } from '../../shared/index';

export default class LoomCompanionPlugin extends Plugin {
  settings!: LoomCompanionSettings;
  shared!: SharedService;
  controllers = new Set<AbortController>();
  private saveQueue:Promise<any> = Promise.resolve();

  async onload() {
    this.shared=sharedServices(this.app);
    await this.shared.ready;
    await this.loadSettings();
    this.addCommand({id:'shared-models',name:'Choose model (shared catalog)',callback:()=>this.chooseModel()});
    this.addCommand({id:'generation-history',name:'Generation history',callback:()=>void this.shared.history(r=>this.reuseSettings(r))});
    this.addCommand({id:'cancel-generation',name:'Cancel active generations',callback:()=>{for(const c of this.controllers)c.abort();}});

    this.registerView(
      VIEW_TYPE_LOOM_COMPANION,
      (leaf) => new LoomCompanionView(leaf, this)
    );

    // Left-ribbon entry point — the main way to reach the tools.
    this.addRibbonIcon("sprout", "Loom Companion", () => void this.activateView());

    this.addCommand({
      id: "open-panel",
      name: "Open panel",
      callback: () => void this.activateView(),
    });

    this.addCommand({
      id: "recast-selection",
      name: "Recast selection",
      editorCallback: (editor) => void runRecast(this, editor),
    });

    this.addSettingTab(new LoomCompanionSettingTab(this.app, this));
  }

  onunload() {
    for(const controller of this.controllers)controller.abort();
  }

  /** Open (or reveal) the Loom Companion panel in the right sidebar (with Loom). */
  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null =
      workspace.getLeavesOfType(VIEW_TYPE_LOOM_COMPANION)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      await leaf?.setViewState({
        type: VIEW_TYPE_LOOM_COMPANION,
        active: true,
      });
    }
    if (leaf) workspace.revealLeaf(leaf);
  }

  async loadSettings() {
    const saved=await this.loadData() || {};
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      { recastPrompts: { ...DEFAULT_SETTINGS.recastPrompts } },
      saved,
      {recastPrompts:{...DEFAULT_SETTINGS.recastPrompts,...saved.recastPrompts}}
    );
    if (!this.settings.model) {
      this.settings.model =
        (await readLoomActiveModel(this.app)) ?? FALLBACK_MODEL;
      await this.saveSettings();
    }
  }

  async saveSettings() {
    const snapshot=JSON.parse(JSON.stringify(this.settings));
    this.saveQueue=this.saveQueue.catch(()=>{}).then(()=>this.saveData(snapshot));
    await this.saveQueue;
    for(const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_LOOM_COMPANION))if(leaf.view instanceof LoomCompanionView)leaf.view.updateModelLabel();
  }
  chooseModel(onSelected?:()=>void){
    this.shared.picker(this.settings.model,async m=>{this.settings.model=m.id;await this.saveSettings();onSelected?.();});
  }
  async reuseSettings(r:any){
    if(r.provider && r.provider!=='openrouter')return;
    this.settings.model=r.model;
    if(Number.isFinite(r.request?.temperature))this.settings.temperature=r.request.temperature;
    if(Number.isInteger(r.request?.max_tokens))this.settings.maxTokens=r.request.max_tokens;
    await this.saveSettings();
  }
}
