const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(require('path').join(__dirname,'../loom-main.js'),'utf8');
function method(start,end,context){const text=source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))).trim();return vm.runInNewContext('({'+text+'})',context);}
const notices=[];
const context={import_obsidian2:{Notice:class{constructor(t){notices.push(t);}}},getPreset:s=>s.modelPresets[s.modelPreset],AbortController,setTimeout,clearTimeout,resolveLoomApiKey:()=> 'fake-key'};
const generate=method('  async generate(file,rootNode)','  addNode(file, text, parentId)',context).generate;
const complete=method('  async completeOpenRouter(prompt,settings=this.settings)','  async completeOpenAI(prompt)',context).completeOpenRouter;
function fixture(){
  const file={path:'note.md'},state={nodes:{root:{text:'source'}},current:'root'};
  let text='source',editorText='source',active=file,n=0;const records=[],switched=[];
  const p={settings:{modelPreset:0,modelPresets:[{provider:'openrouter',model:'test/model',contextLength:1000}],prepend:'',temperature:1,topP:1,maxTokens:100,n:2,systemPrompt:'system',frequencyPenalty:0,presencePenalty:0},
    state:{'note.md':state},editor:{getValue:()=>editorText},app:{vault:{getAbstractFileByPath:path=>path===file.path?file:null},workspace:{getActiveFile:()=>active,trigger:(event,id)=>switched.push(id)}},
    fullText:()=>text,ancestors:()=>['root'],newNode:completion=>['child'+(++n),{text:completion}],statusBarItem:{style:{}},refreshViews:()=>{},saveAndRender:async()=>{},shared:{record:async r=>{records.push(JSON.parse(JSON.stringify(r)));return 'history-id';}},
    completeOpenRouter:async()=>({ok:true,completions:['A','B'],metadata:[],request:{model:'test/model'}})};
  return {p,file,state,records,switched,setSource:v=>text=v,setEditor:v=>editorText=v,switchFile:()=>active={path:'other.md'}};
}
let count=0;async function test(name,fn){await fn();console.log('PASS '+name);count++;}
(async()=>{
  await test('Loom attaches provenance to each generated child',async()=>{const f=fixture();await generate.call(f.p,f.file,'root');assert.equal(f.state.nodes.child1.provenance.id,'history-id');assert.equal(f.state.nodes.child2.provenance.completionIndex,1);assert.equal(f.records[0].model,'test/model');assert.equal(f.switched.length,1);assert.equal(f.p.loomGenerationBusy,false);});
  await test('Loom does not switch another active note to a generated node',async()=>{const f=fixture();f.p.completeOpenRouter=async()=>{f.switchFile();return {ok:true,completions:['A']};};await generate.call(f.p,f.file,'root');assert(f.state.nodes.child1);assert.equal(f.switched.length,0);});
  await test('edited source branches keep results in history without attaching nodes',async()=>{const f=fixture();f.p.completeOpenRouter=async()=>{f.setSource('changed');return {ok:true,completions:['A']};};await generate.call(f.p,f.file,'root');assert(!f.state.nodes.child1);assert.equal(f.records[0].output[0],'A');});
  await test('intervening editor changes prevent automatic branch switching',async()=>{const f=fixture();f.p.completeOpenRouter=async()=>{f.setEditor('unsaved change');return {ok:true,completions:['A']};};await generate.call(f.p,f.file,'root');assert.equal(f.switched.length,0);});
  await test('renamed files and removed roots do not receive stale children',async()=>{for(const change of [f=>f.file.path='new.md',f=>delete f.state.nodes.root]){const f=fixture();f.p.completeOpenRouter=async()=>{change(f);return {ok:true,completions:['A']};};await generate.call(f.p,f.file,'root');assert(!f.state.nodes.child1);}});
  await test('failed generations are recorded and release the busy lock',async()=>{const f=fixture();f.p.completeOpenRouter=async()=>{throw Error('network error');};await generate.call(f.p,f.file,'root');assert.equal(f.records[0].status,'error');assert.equal(f.p.loomGenerationBusy,false);assert.equal(f.state.generating,null);});
  await test('overlapping Loom generations are rejected',async()=>{const f=fixture();f.p.loomGenerationBusy=true;await generate.call(f.p,f.file,'root');assert.equal(f.records.length,0);});
  await test('OpenRouter keeps successful siblings when another request fails',async()=>{
    const f=fixture();f.p.shared.parameters=b=>b;f.p.trimOpenAIPrompt=p=>p;let calls=0;
    context.fetch=async()=>{calls++;return calls===1?{ok:true,json:async()=>({id:'one',model:'test/model',choices:[{message:{content:'Good'}}]})}:{ok:false,status:429,json:async()=>({error:{message:'rate limited'}})};};
    const r=await complete.call(f.p,'prompt');assert.equal(r.ok,true);assert.equal(r.completions.length,1);assert.equal(r.errors.length,1);assert.equal(r.metadata[0].id,'one');
  });
  await test('OpenRouter malformed responses produce actionable failure rather than TypeError',async()=>{
    const f=fixture();f.p.shared.parameters=b=>b;f.p.trimOpenAIPrompt=p=>p;context.fetch=async()=>({ok:true,json:async()=>({})});
    const r=await complete.call(f.p,'prompt');assert.equal(r.ok,false);assert(r.message.includes('No text returned'));
  });
  await test('OpenRouter limits concurrency to two requests',async()=>{
    const f=fixture();f.p.settings.n=5;f.p.shared.parameters=b=>b;f.p.trimOpenAIPrompt=p=>p;let active=0,peak=0;
    context.fetch=async()=>{active++;peak=Math.max(active,peak);await new Promise(r=>setTimeout(r,3));active--;return {ok:true,json:async()=>({choices:[{message:{content:'ok'}}]})};};
    const r=await complete.call(f.p,'prompt');assert.equal(peak,2);assert.equal(r.completions.length,5);
  });
  console.log('\n'+count+' Loom behavior checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
