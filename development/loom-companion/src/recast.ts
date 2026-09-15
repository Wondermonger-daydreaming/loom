import { App, Editor, Modal, Notice, Setting } from 'obsidian';
import type LoomCompanionPlugin from './main';
import { streamChat, collectChat } from './openrouter';
import { captureTarget, EditTarget } from './target';
import { diffText, applyChanges, renderDiff, Change } from './diff';

export interface Transform {key:string;label:string;needsInstruction?:boolean;needsSeam?:boolean}
export const TRANSFORMS:Transform[]=[
  {key:'Tighten',label:'Tighten'},{key:'Expand',label:'Expand'},{key:'Rephrase',label:'Rephrase'},
  {key:'Shift register',label:'Shift register…',needsInstruction:true},
  {key:'Smooth the seam',label:'Smooth the seam',needsSeam:true},
  {key:'Custom',label:'Custom…',needsInstruction:true}
];
export async function startRecast(plugin:LoomCompanionPlugin,transform:Transform,editor?:Editor,captured?:EditTarget){
  const target=captured||captureTarget(plugin.app,editor);if(!target)return;
  if(!target.selection.trim()){new Notice('Select a passage first');return;}
  let instruction='';
  if(transform.needsInstruction){
    const answer=await new Promise<string|null>(resolve=>new InstructionModal(plugin.app,transform.key==='Shift register'?'Target register':'Instruction',resolve).open());
    if(answer===null)return;if(!answer.trim()){new Notice('Enter an instruction.');return;}instruction=answer.trim();
  }
  if(!target.check())return;
  let system=plugin.settings.recastPrompts[transform.key]||'';
  system=system.replace(/\{instruction\}/g,()=>instruction);
  if(transform.needsSeam){
    const before=target.document.slice(0,target.from).split(/\n\s*\n/).filter(s=>s.trim()).pop()||'(start of note)';
    const after=target.document.slice(target.to).split(/\n\s*\n/).find(s=>s.trim())||'(end of note)';
    system=system.replace(/\{before\}/g,()=>before).replace(/\{after\}/g,()=>after);
  }
  const operation='Recast: '+transform.key;
  if(plugin.settings.previewRecast){new RecastPreviewModal(plugin,target,system,operation).open();return;}
  const controller=new AbortController();
  const message=document.createDocumentFragment();
  const label=document.createElement('span');
  label.textContent='Recasting '+target.path+'… ';
  const cancel=document.createElement('button');
  cancel.textContent='Cancel';
  cancel.setAttribute('aria-label','Cancel this Recast');
  cancel.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();
    controller.abort();cancel.disabled=true;label.textContent='Cancelling Recast… ';
  });
  message.append(label,cancel);
  const notice=new Notice(message,0);
  let record:any;
  try{
    const result=await collectChat({plugin,operation,target:target.path,onRecord:r=>record=r,model:plugin.settings.model,system,user:target.selection,temperature:plugin.settings.temperature,maxTokens:plugin.settings.maxTokens,signal:controller.signal});
    if(controller.signal.aborted)return;
    if(!result){new Notice('Recast returned nothing.');return;}
    if(target.replace(result)){new Notice('Recast applied to '+target.path+' (Ctrl+Z to undo)');if(record?.id)await plugin.shared.record({...record,applied:true,appliedText:result});}
  }catch(e){
    if(controller.signal.aborted || (e as Error)?.name==='AbortError')new Notice('Recast cancelled. Partial output is available in Generation history.');
    else new Notice('Recast failed: '+String(e));
  }finally{notice.hide();}
}
export async function runRecast(plugin:LoomCompanionPlugin,editor?:Editor){
  const target=captureTarget(plugin.app,editor);if(!target)return;
  if(!target.selection.trim()){new Notice('Select a passage first');return;}
  const modal=new Modal(plugin.app);modal.titleEl.setText('Recast');
  for(const t of TRANSFORMS)modal.contentEl.createEl('button',{text:t.label}).addEventListener('click',()=>{modal.close();void startRecast(plugin,t,target.editor,target);});
  modal.open();
}
class InstructionModal extends Modal{
  private value='';private submitted=false;
  constructor(app:App,private label:string,private done:(s:string|null)=>void){super(app);}
  onOpen(){this.titleEl.setText(this.label);new Setting(this.contentEl).addText(t=>{t.onChange(v=>this.value=v);t.inputEl.addEventListener('keydown',e=>{if(e.key==='Enter')this.submit();});setTimeout(()=>t.inputEl.focus(),0);});new Setting(this.contentEl).addButton(b=>b.setButtonText('Continue').setCta().onClick(()=>this.submit()));}
  submit(){if(this.submitted)return;this.submitted=true;this.done(this.value);this.close();}
  onClose(){if(!this.submitted)this.done(null);}
}
class RecastPreviewModal extends Modal{
  private controller:AbortController|null=null;private result='';private record:any;
  private parts:Change[]=[];private output!:HTMLElement;private changes!:HTMLElement;private preview!:HTMLElement;
  private accept!:HTMLButtonElement;private copy!:HTMLButtonElement;private instruction!:HTMLTextAreaElement;
  private original:string;private config;private closed=false;
  constructor(private plugin:LoomCompanionPlugin,private target:EditTarget,private system:string,private operation:string){
    super(plugin.app);this.original=target.selection;this.config={...plugin.settings};
  }
  onOpen(){
    this.modalEl.addClass('loom-companion-modal');this.titleEl.setText('Recast — review changes');
    this.contentEl.createEl('p',{text:this.target.path+' · '+this.config.model});
    this.contentEl.createDiv({cls:'loom-companion-original',text:this.original});
    this.output=this.contentEl.createDiv({cls:'loom-companion-result'});
    this.contentEl.createEl('h4',{text:'Changes — uncheck any change to keep the original'});
    this.changes=this.contentEl.createDiv();this.preview=this.contentEl.createDiv({cls:'loom-companion-result'});
    this.instruction=this.contentEl.createEl('textarea',{attr:{placeholder:'Optional instruction for retry','aria-label':'Retry instruction'}});
    const buttons=this.contentEl.createDiv({cls:'loom-companion-buttons'});
    this.accept=buttons.createEl('button',{text:'Apply selected changes'});this.accept.disabled=true;
    this.accept.addEventListener('click',()=>void this.apply());
    this.copy=buttons.createEl('button',{text:'Copy selected result'});this.copy.disabled=true;
    this.copy.addEventListener('click',async()=>{await navigator.clipboard.writeText(applyChanges(this.parts));new Notice('Result copied');});
    buttons.createEl('button',{text:'Retry'}).addEventListener('click',()=>void this.start());
    buttons.createEl('button',{text:'Cancel'}).addEventListener('click',()=>this.close());
    void this.start();
  }
  private async start(){
    this.controller?.abort();const controller=new AbortController();this.controller=controller;
    this.result='';this.record=null;this.parts=[];this.output.setText('Generating…');this.changes.empty();this.preview.empty();this.accept.disabled=true;this.copy.disabled=true;
    const system=this.system+(this.instruction.value.trim()?'\nAdditional revision instruction: '+this.instruction.value.trim():'');
    try{
      for await(const delta of streamChat({plugin:this.plugin,operation:this.operation,target:this.target.path,onRecord:r=>{if(this.controller===controller)this.record=r;},model:this.config.model,system,user:this.original,temperature:this.config.temperature,maxTokens:this.config.maxTokens,signal:controller.signal})){
        if(controller.signal.aborted||this.closed)return;this.result+=delta;this.output.setText(this.result);
      }
      if(controller.signal.aborted||this.closed)return;
      this.result=this.result.trim();if(!this.result){this.output.setText('No text returned. Try a larger token budget.');return;}
      this.parts=diffText(this.original,this.result);
      const refresh=()=>{this.preview.setText(applyChanges(this.parts));this.accept.disabled=applyChanges(this.parts)===this.original;};
      renderDiff(this.changes,this.parts,refresh);refresh();this.copy.disabled=false;this.output.setText('Review the changes below.');
    }catch(e){if(!controller.signal.aborted&&!this.closed)this.output.setText('Generation failed: '+String(e));}
  }
  private async apply(){
    const text=applyChanges(this.parts);if(!this.target.replace(text))return;
    this.accept.disabled=true;new Notice('Recast applied to '+this.target.path+' (Ctrl+Z to undo)');
    if(this.record?.id)await this.plugin.shared.record({...this.record,applied:true,appliedText:text});
    this.close();
  }
  onClose(){this.closed=true;this.controller?.abort();this.contentEl.empty();}
}
