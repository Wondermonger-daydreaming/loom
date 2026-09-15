import { ItemView, Notice, Setting, WorkspaceLeaf } from 'obsidian';
import type LoomCompanionPlugin from './main';
import { TRANSFORMS, startRecast } from './recast';
import { generateSeeds, renderSeedList } from './seed';
import { suggestTitles, generateDescription, suggestLinks } from './christen';
import { captureTarget } from './target';
import { diffText, applyChanges, renderDiff } from './diff';
export const VIEW_TYPE_LOOM_COMPANION='loom-companion-view';
export class LoomCompanionView extends ItemView{
  private controller:AbortController|null=null;
  private modelLabel?:HTMLElement;
  updateModelLabel(){this.modelLabel?.setText(this.plugin.settings.model);}
  constructor(leaf:WorkspaceLeaf,private plugin:LoomCompanionPlugin){super(leaf);}
  getViewType(){return VIEW_TYPE_LOOM_COMPANION;}
  getDisplayText(){return 'Loom Companion';}
  getIcon(){return 'sprout';}
  async onOpen(){this.render();}
  async onClose(){this.controller?.abort();}
  private render(){
    const c=this.contentEl;c.empty();c.addClass('loom-companion-panel');c.createEl('h3',{text:'Loom Companion'});
    const model=c.createEl('p',{text:this.plugin.settings.model});this.modelLabel=model;
    c.createEl('button',{text:'Choose model / favorites'}).addEventListener('click',()=>this.plugin.chooseModel(()=>model.setText(this.plugin.settings.model)));
    c.createEl('button',{text:'Generation history'}).addEventListener('click',()=>void this.plugin.shared.history(r=>this.plugin.reuseSettings(r)));
    c.createEl('h4',{text:'Recast'});
    c.createEl('p',{text:'Select a passage, then choose a transformation.'});
    const row=c.createDiv({cls:'loom-companion-action-row'});
    for(const t of TRANSFORMS)row.createEl('button',{text:t.label}).addEventListener('click',()=>void startRecast(this.plugin,t));
    new Setting(c).setName('Review changes before applying').addToggle(t=>t.setValue(this.plugin.settings.previewRecast).onChange(async v=>{this.plugin.settings.previewRecast=v;await this.plugin.saveSettings();}));
    c.createEl('h4',{text:'Christen & Seed'});
    const actions=c.createDiv({cls:'loom-companion-action-row'}),host=c.createDiv({cls:'loom-companion-results'});
    for(const [label,kind] of [['Suggest titles','titles'],['Write description','description'],['Suggest links','links'],['Sow seeds','seed']]){
      actions.createEl('button',{text:label}).addEventListener('click',()=>void this.run(kind,host));
    }
    new Setting(c).setName('Preview seeds before inserting').addToggle(t=>t.setValue(this.plugin.settings.previewSeed).onChange(async v=>{this.plugin.settings.previewSeed=v;await this.plugin.saveSettings();}));
  }
  private async run(kind:string,host:HTMLElement){
    const target=captureTarget(this.app);if(!target)return;
    let previousDescription='';
    if(kind==='description'){
      try{previousDescription=target.description();}
      catch{new Notice('The note has invalid YAML frontmatter. Fix it before generating a description.');return;}
    }
    this.controller?.abort();const controller=new AbortController();this.controller=controller;
    host.empty();host.createEl('p',{text:target.path+' · '+this.plugin.settings.model});
    const busy=host.createDiv({text:'Generating…'});
    const cancel=host.createEl('button',{text:'Cancel generation'});cancel.addEventListener('click',()=>controller.abort());
    let record:any;
    const context={target:target.path,signal:controller.signal,onRecord:(r:any)=>record=r};
    const live=()=>!controller.signal.aborted&&this.controller===controller&&host.isConnected;
    const apply=(action:()=>boolean,text:string)=>{
      if(!action())return;
      new Notice('Applied to '+target.path+' (Ctrl+Z to undo)');
      if(record?.id){record={...record,applied:true,applications:[...(record.applications||[]),{text,at:new Date().toISOString()}]};void this.plugin.shared.record(record);}
    };
    try{
      if(kind==='titles'){
        const titles=await suggestTitles(this.plugin,target.document,context);if(!live())return;
        for(const title of titles){const row=host.createDiv({cls:'loom-companion-suggestion'});row.createSpan({text:title});
          row.createEl('button',{text:'Insert H1'}).addEventListener('click',()=>apply(()=>target.insertHeading(title),title));
          row.createEl('button',{text:'Copy'}).addEventListener('click',()=>void navigator.clipboard.writeText(title));}
        if(!titles.length)host.createEl('p',{text:'No titles returned.'});
      }else if(kind==='description'){
        const description=await generateDescription(this.plugin,target.document,context);if(!live())return;
        const original=previousDescription;host.createEl('p',{text:original?'Review changes to the existing description:':'Review the new description:'});
        const parts=diffText(original,description),preview=host.createDiv({cls:'loom-companion-result'});
        renderDiff(host.createDiv(),parts,()=>preview.setText(applyChanges(parts)));preview.setText(description);
        const button=host.createEl('button',{text:'Apply description'});
        button.addEventListener('click',()=>{try{apply(()=>{const ok=target.writeDescription(applyChanges(parts));if(ok)button.disabled=true;return ok;},applyChanges(parts));}catch(e){new Notice(String(e));}});
      }else if(kind==='links'){
        const links=await suggestLinks(this.plugin,target.file,target.document,context);if(!live())return;
        for(const link of links){const row=host.createDiv({cls:'loom-companion-suggestion'});row.createSpan({text:'[['+link.title+']] — '+link.reason});
          row.createEl('button',{text:'Insert'}).addEventListener('click',()=>apply(()=>target.replace('[['+link.title+']]'),'[['+link.title+']]'));}
        if(!links.length)host.createEl('p',{text:'No related notes returned.'});
      }else{
        const seeds=await generateSeeds(this.plugin,target.document,controller.signal,context);if(!live())return;
        if(!this.plugin.settings.previewSeed){
          if(seeds.length)apply(()=>target.replace(seeds.map(s=>s.text).join('\n\n')+'\n'),seeds.map(s=>s.text).join('\n\n'));
          else host.createEl('p',{text:'No seeds returned.'});
        }else renderSeedList(host.createDiv(),seeds,text=>apply(()=>target.replace(text),text));
      }
    }catch(e){if(live())host.createEl('p',{text:'Generation failed: '+String(e)});}
    finally{busy.remove();cancel.remove();if(controller.signal.aborted&&this.controller===controller&&host.isConnected)host.createEl('p',{text:'Generation cancelled. Partial output, if any, is in history.'});}
  }
}
