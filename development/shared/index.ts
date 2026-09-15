import { App, Modal, Notice, Setting, requestUrl } from 'obsidian';
import seed from './catalog.json';

export type Model = { id: string; name: string; context_length: number; supported_parameters: string[]; pricing: any; top_provider?: any; expiration_date?: string | null };
export function normalizeModels(data: any[]): Model[] {
  if (!Array.isArray(data)) throw new Error('Invalid model catalog');
  const seen = new Set<string>();
  const models = data.filter(m => typeof m?.id === 'string' && !m.id.endsWith(':batch') &&
    m.architecture?.input_modalities?.includes('text') && m.architecture?.output_modalities?.includes('text') &&
    Number.isFinite(m.context_length) && m.context_length > 0 && !seen.has(m.id) && !!seen.add(m.id))
    .map(m => ({id:m.id, name:m.name || m.id, context_length:m.context_length,
      supported_parameters:Array.isArray(m.supported_parameters) ? m.supported_parameters : [],
      pricing:m.pricing || {}, top_provider:m.top_provider, expiration_date:m.expiration_date}));
  if (!models.length) throw new Error('Catalog contained no usable text models');
  return models;
}

export function filterParameters(model: Model | undefined, body: any): any {
  const out = {...body};
  if (!model) return out; // Custom IDs are allowed; capabilities are unknown.
  for (const key of ['temperature','top_p','frequency_penalty','presence_penalty','seed','reasoning','reasoning_effort']) {
    if (!model.supported_parameters.includes(key)) delete out[key];
  }
  const limit = model.top_provider?.max_completion_tokens;
  if (Number.isFinite(limit) && limit > 0 && out.max_tokens > limit) out.max_tokens = limit;
  return out;
}

export class SharedService {
  models: Model[] = seed.models;
  updatedAt = seed.updatedAt;
  favorites: string[] = [];
  private refreshing: Promise<void> | null = null;
  private writes: Promise<any> = Promise.resolve();
  ready: Promise<void>;
  constructor(public app: App) { this.ready = this.load(); }
  get dir() { return this.app.vault.configDir + '/loom-shared'; }
  async load() {
    const a = this.app.vault.adapter;
    if (!await a.exists(this.dir)) await a.mkdir(this.dir);
    if (await a.exists(this.dir+'/catalog.json')) {
      try {
        const cache = JSON.parse(await a.read(this.dir+'/catalog.json'));
        if (!Array.isArray(cache.models) || !cache.models.length || !cache.models.every((m: any) =>
          typeof m.id==='string' && Number.isFinite(m.context_length) && Array.isArray(m.supported_parameters))) throw new Error();
        this.models = cache.models; this.updatedAt = cache.updatedAt;
      } catch { new Notice('Shared model cache could not be read. Using the bundled catalog.'); }
    }
    if (await a.exists(this.dir+'/favorites.json')) {
      try { const v = JSON.parse(await a.read(this.dir+'/favorites.json')); if (Array.isArray(v)) this.favorites=v.filter(x=>typeof x==='string'); }
      catch { new Notice('Model favorites could not be read.'); }
    }
  }
  getModel(id: string) { return this.models.find(m=>m.id===id); }
  parameters(body: any) { return filterParameters(this.getModel(body.model), body); }
  async refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      await this.ready;
      const result = await requestUrl({url:'https://openrouter.ai/api/v1/models',throw:false});
      if (result.status !== 200) throw new Error('OpenRouter catalog HTTP '+result.status);
      const models = normalizeModels(result.json?.data);
      const updatedAt = new Date().toISOString();
      await this.app.vault.adapter.write(this.dir+'/catalog.json',JSON.stringify({models,updatedAt}));
      this.models=models;this.updatedAt=updatedAt;
    })().finally(()=>{this.refreshing=null;});
    return this.refreshing;
  }
  async favorite(id: string) {
    await this.ready;
    this.favorites=this.favorites.includes(id)?this.favorites.filter(x=>x!==id):[...this.favorites,id];
    const snapshot=JSON.stringify(this.favorites);
    this.writes=this.writes.catch(()=>{}).then(()=>this.app.vault.adapter.write(this.dir+'/favorites.json',snapshot));
    await this.writes;
  }
  picker(current: string, select: (model: Model) => any) { new ModelManager(this.app,this,current,select).open(); }
  async record(record: any): Promise<string | null> {
    try {
      await this.ready;
      const dir=this.dir+'/history';
      // Serialize directory creation and writes across both plugins.
      const id=record.id || new Date().toISOString().replace(/[:.]/g,'-')+'-'+Math.random().toString(36).slice(2,10);
      this.writes=this.writes.catch(()=>{}).then(async()=>{
        if (!await this.app.vault.adapter.exists(dir)) await this.app.vault.adapter.mkdir(dir);
        await this.app.vault.adapter.write(dir+'/'+id+'.json',JSON.stringify({...record,id},null,2));
      });
      await this.writes;return id;
    } catch { new Notice('Generation completed, but its history could not be saved. Copy the result before closing.');return null; }
  }
  async history(reuse?: (record: any)=>any) {
    await this.ready;
    const dir=this.dir+'/history';
    const files=await this.app.vault.adapter.exists(dir)?(await this.app.vault.adapter.list(dir)).files.filter(p=>p.endsWith('.json')).sort().reverse():[];
    new HistoryModal(this.app,this,files,reuse).open();
  }
  async showRecord(id: string) {
    if (!/^[\w-]+$/.test(id)) return;
    new HistoryModal(this.app,this,[this.dir+'/history/'+id+'.json']).open();
  }
}

const serviceKey=Symbol.for('loom.shared.services.v1');
export function getServices(app: App): SharedService {
  const holder=app as any;
  return holder[serviceKey] ||= new SharedService(app);
}

class ModelManager extends Modal {
  private query=''; private onlyFavorites=false;
  private rows!: HTMLElement; private status!: HTMLElement;
  constructor(app: App,private service:SharedService,private current:string,private select:(m:Model)=>any){super(app);}
  onOpen() {
    this.titleEl.setText('Shared OpenRouter models');
    this.modalEl.style.width='min(850px, 95vw)';
    this.status=this.contentEl.createEl('p');
    new Setting(this.contentEl).setName('Search models').addText(t=>{
      t.setPlaceholder('Name or provider/model ID').onChange(v=>{this.query=v;this.renderRows();});
      t.inputEl.style.width='100%';setTimeout(()=>t.inputEl.focus(),0);
    });
    new Setting(this.contentEl).setName('Favorites only').addToggle(t=>t.onChange(v=>{this.onlyFavorites=v;this.renderRows();}));
    new Setting(this.contentEl).setName('Catalog').setDesc('Shared by Loom and Companion. Cached for offline use; refreshing preserves custom IDs and favorites.')
      .addButton(b=>b.setButtonText('Refresh from OpenRouter').onClick(async()=>{
        b.setDisabled(true);this.status.setText('Refreshing…');
        try { await this.service.refresh();this.renderRows(); }
        catch(e){this.status.setText('Refresh failed; cached models remain available. '+String(e));}
        finally{b.setDisabled(false);}
      }));
    new Setting(this.contentEl).setName('Custom model ID').setDesc('Use an exact ID even if it is absent from the catalog. Capabilities and pricing will be unknown.')
      .addText(t=>t.setPlaceholder('provider/model').onChange(v=>this.custom=v.trim()))
      .addButton(b=>b.setButtonText('Use custom').onClick(()=>{
        if(!this.custom || /\s/.test(this.custom) || !this.custom.includes('/')) {new Notice('Enter a model ID such as provider/model.');return;}
        void this.choose(this.service.getModel(this.custom)||{id:this.custom,name:this.custom,context_length:0,supported_parameters:[],pricing:{}});
      }));
    this.rows=this.contentEl.createDiv();this.rows.style.maxHeight='50vh';this.rows.style.overflowY='auto';
    void this.service.ready.then(()=>{if(this.rows.isConnected)this.renderRows();}).catch(e=>new Notice(String(e)));
    this.renderRows();
  }
  private custom='';
  private async choose(m:Model){try{await this.select(m);this.close();}catch(e){new Notice('Could not select model: '+String(e));}}
  private renderRows(){
    this.rows.empty();
    const known=this.service.getModel(this.current);
    this.status.setText('Catalog: '+new Date(this.service.updatedAt).toLocaleString()+(!known?' · Current ID is not in this catalog; it is preserved.':''));
    const q=this.query.toLowerCase();
    const models=this.service.models.filter(m=>(m.id+' '+m.name).toLowerCase().includes(q)&&(!this.onlyFavorites||this.service.favorites.includes(m.id)))
      .sort((a,b)=>Number(this.service.favorites.includes(b.id))-Number(this.service.favorites.includes(a.id))||a.name.localeCompare(b.name));
    if(!models.length)this.rows.createEl('p',{text:'No matching models.'});
    for(const m of models){
      const price=(s:any)=>s!=null&&Number.isFinite(Number(s))&&Number(s)>=0?'$'+(Number(s)*1e6).toLocaleString(undefined,{maximumFractionDigits:3}):'unknown';
      const desc=`${m.id}\nContext: ${m.context_length.toLocaleString()} · USD / 1M tokens: input ${price(m.pricing.prompt)}, output ${price(m.pricing.completion)}${m.pricing.overrides?.length?' (variable rates)':''}\nSupported: ${m.supported_parameters.join(', ') || 'not listed'}${m.expiration_date?' · Expires '+m.expiration_date:''}`;
      new Setting(this.rows).setName(m.name+(m.id===this.current?' · selected':'')).setDesc(desc)
        .addButton(b=>b.setButtonText(this.service.favorites.includes(m.id)?'★':'☆').setTooltip('Toggle shared favorite').onClick(async()=>{try{await this.service.favorite(m.id);this.renderRows();}catch(e){new Notice(String(e));}}))
        .addButton(b=>b.setButtonText('Use').onClick(()=>this.choose(m)));
    }
  }
}

class HistoryModal extends Modal {
  constructor(app:App,private service:SharedService,private files:string[],private reuse?:(r:any)=>any){super(app);}
  onOpen(){
    this.titleEl.setText('Generation history');this.modalEl.style.width='min(900px, 95vw)';
    this.contentEl.createEl('p',{text:'Stored locally: model, prompts, settings and generated text. Reusing settings does not send a request.'});
    if(!this.files.length){this.contentEl.createEl('p',{text:'No recorded generations yet.'});return;}
    const list=this.contentEl.createEl('select');list.style.width='100%';
    for(const file of this.files)list.createEl('option',{value:file,text:file.split('/').pop()});
    const body=this.contentEl.createDiv();
    let sequence=0;
    const show=async()=>{
      const token=++sequence;
      try{
        const r=JSON.parse(await this.app.vault.adapter.read(list.value));if(token!==sequence)return;
        body.empty();body.createEl('h3',{text:r.operation+' · '+r.model});
        body.createEl('p',{text:`${r.startedAt} · ${r.status} · ${r.target || 'No note'}${r.applied?' · Applied':''}`});
        const output=Array.isArray(r.output)?r.output.join('\n\n'):r.output||'';
        new Setting(body).setName('Result').addButton(b=>b.setButtonText('Copy result').onClick(async()=>{await navigator.clipboard.writeText(output);new Notice('Result copied');}));
        if(this.reuse)new Setting(body).setName('Reuse model and settings').addButton(b=>b.setButtonText('Load settings').onClick(async()=>{await this.reuse!(r);new Notice('Generation settings loaded');}));
        const pre=body.createEl('pre',{text:JSON.stringify(r,null,2)});pre.style.whiteSpace='pre-wrap';pre.style.maxHeight='55vh';pre.style.overflow='auto';
      }catch(e){if(token===sequence)body.setText('Could not read history entry: '+String(e));}
    };
    list.addEventListener('change',()=>void show());void show();
  }
}
