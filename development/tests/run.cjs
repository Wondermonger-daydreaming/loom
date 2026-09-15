const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const path=require('path');
const notices=[];let apiResponse;
class MarkdownView{}
const obsidian={MarkdownView,Modal:class{},Setting:class{},Notice:class{constructor(s){notices.push(s);}},requestUrl:async()=>{if(apiResponse instanceof Error)throw apiResponse;return apiResponse;},
  getFrontMatterInfo(text){const m=text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);return {exists:!!m,frontmatter:m?.[1]||'',contentStart:m?.[0].length||0};},
  parseYaml(text){return Object.fromEntries(text.split('\n').filter(Boolean).map(l=>{const i=l.indexOf(':');return [l.slice(0,i),l.slice(i+1).trim()];}));},
  stringifyYaml(fm){return Object.entries(fm).map(([k,v])=>k+': '+v).join('\n')+'\n';}};
function load(file,extra={}){
  const module={exports:{}};const context={module,exports:module.exports,require:id=>id==='obsidian'?obsidian:require(id),console,process:{env:{OPENROUTER_API_KEY:'test-only-key'}},TextDecoder,TextEncoder,AbortController,DOMException,setTimeout,clearTimeout,...extra};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:file});return {exports:module.exports,context};
}
const {exports:h,context}=load(path.join(__dirname,'../dist/test-helpers.cjs'));
let count=0;
async function test(name,fn){await fn();console.log('PASS '+name);count++;}
function fixture(doc='one two three',from=4,to=7){
  let text=doc;
  const editor={getValue:()=>text,getCursor:end=>({line:0,ch:end==='from'?from:to}),posToOffset:p=>p.ch,offsetToPos:n=>({line:0,ch:n}),
    replaceRange:(v,a,b=a)=>{text=text.slice(0,a.ch)+v+text.slice(b.ch);},replaceSelection:()=>{throw Error('Unsafe replaceSelection');}};
  const file={path:'note.md'},view=new MarkdownView();view.file=file;view.editor=editor;
  const leaves=[{view}],app={workspace:{getLeavesOfType:()=>leaves},vault:{getAbstractFileByPath:p=>p===file.path?file:null}};
  const target=new h.EditTarget(app,view,editor);
  return {target,editor,file,view,leaves,app,change:v=>text=v,cursor:(a,b)=>{from=a;to=b;}};
}
function adapterApp(){
  const files=new Map(),dirs=new Set();let failWrite=false;
  const adapter={exists:async p=>files.has(p)||dirs.has(p),mkdir:async p=>{if(dirs.has(p))throw Error('exists');dirs.add(p);},
    read:async p=>{if(!files.has(p))throw Error('not found');return files.get(p);},
    write:async(p,v)=>{if(failWrite)throw Error('disk full');files.set(p,v);},list:async p=>({files:[...files.keys()].filter(k=>k.startsWith(p+'/')),folders:[]})};
  return {app:{vault:{configDir:'.obsidian',adapter}},files,fail:()=>failWrite=true};
}
function plugin(){
  const records=[];return {records,controllers:new Set(),shared:{ready:Promise.resolve(),parameters:b=>b,record:async r=>{records.push(r);return 'test-record';}}};
}
const opts=p=>({plugin:p,operation:'Test',model:'test/model',system:'instruction',user:'passage',temperature:0.7,maxTokens:100,signal:new AbortController().signal});
const fetchChunks=chunks=>async()=>({ok:true,status:200,body:new ReadableStream({start(c){for(const chunk of chunks)c.enqueue(new TextEncoder().encode(chunk));c.close();}})});
(async()=>{
  await test('shared runtime loads through Node with an injected Obsidian API',async()=>{
    const factory=require('../dist/loom-shared/main.js');
    assert.equal(typeof factory,'function');
    const api=factory(obsidian),f=adapterApp();
    const service=api.getServices(f.app);await service.ready;
    assert.equal(factory(obsidian).getServices(f.app),service);
    assert(service.models.length>0);
  });
  await test('diff reconstructs both originals and revisions, including whitespace and Unicode',()=>{
    for(const [a,b] of [['Hello world.','Hello bright world.'],['A\n\nB','A\nC\nB'],['','new'],['old',''],['same','same'],['ação 🌙','ação solar 🌞']]){
      const parts=h.diffText(a,b);assert.equal(h.applyChanges(parts),b);parts.forEach(p=>p.accept=false);assert.equal(h.applyChanges(parts),a);
    }
    for(let i=0;i<100;i++){const a=Array.from({length:20},()=>String(Math.floor(Math.random()*4))).join(' '),b=Array.from({length:20},()=>String(Math.floor(Math.random()*4))).join('\n');const p=h.diffText(a,b);assert.equal(h.applyChanges(p),b);p.forEach(x=>x.accept=false);assert.equal(h.applyChanges(p),a);}
  });
  await test('large diff fallback preserves exact text',()=>{const a='word '.repeat(1200)+'old',b='word '.repeat(1200)+'new';const p=h.diffText(a,b);assert.equal(h.applyChanges(p),b);p.forEach(x=>x.accept=false);assert.equal(h.applyChanges(p),a);});
  await test('moving selection never redirects replacement',()=>{const f=fixture();f.cursor(0,3);assert(f.target.replace('TWO'));assert.equal(f.editor.getValue(),'one TWO three');});
  await test('intervening document edits block replacement',()=>{const f=fixture();f.change('extra one two three');assert.equal(f.target.replace('bad'),false);assert.equal(f.editor.getValue(),'extra one two three');});
  await test('closed, renamed and repurposed views block edits',()=>{for(const action of [f=>f.leaves.pop(),f=>f.file.path='renamed.md',f=>f.view.file={path:'another.md'},f=>f.view.editor={}]){const f=fixture();action(f);assert.equal(f.target.replace('bad'),false);}});
  await test('multiple selected seeds insert sequentially at the captured target',()=>{const f=fixture('start end',6,6);assert(f.target.replace('A '));assert(f.target.replace('B '));assert.equal(f.editor.getValue(),'start A B end');});
  await test('headings preserve frontmatter position',()=>{const f=fixture('---\ntag: keep\n---\nbody',0,0);assert(f.target.insertHeading('Title'));assert.equal(f.editor.getValue(),'---\ntag: keep\n---\n# Title\n\nbody');});
  await test('description replacement preserves other YAML keys and blocks stale writes',()=>{const f=fixture('---\ntag: keep\ndescription: old\n---\nbody',0,0);assert(f.target.writeDescription('new'));assert(f.editor.getValue().includes('tag: keep'));assert(f.editor.getValue().includes('description: "new"'));f.change('edited');assert.equal(f.target.writeDescription('bad'),false);});
  await test('description edits preserve comments, quotes, spacing and CRLF byte-for-byte',()=>{
    for(const eol of ['\n','\r\n']){
      const original=['---','# header','title: \'Keep quotes\'','description:   old # keep inline','tags: [one, two]','','# footer','---','Body'].join(eol);
      const edit=h.descriptionEdit(original,'new: # "quoted"');
      const result=original.slice(0,edit.from)+edit.text+original.slice(edit.to);
      assert.equal(result,original.replace('old # keep inline','"new: # \\"quoted\\"" # keep inline'));
    }
  });
  await test('block descriptions keep header comments and surrounding blank lines',()=>{
    const original='---\n# before\ndescription: >- # important\n  old line\n  second line\n\n# after\ntags: [x]\n---\nbody';
    const edit=h.descriptionEdit(original,'new');
    assert.equal(original.slice(0,edit.from)+edit.text+original.slice(edit.to),'---\n# before\ndescription: "new" # important\n\n# after\ntags: [x]\n---\nbody');
  });
  await test('description scalar variants preserve surrounding source',()=>{
    for(const old of ["'old'",'"old"', 'null', '*shared', '!!str old']){
      const original='---\nbase: &shared old\ndescription: '+old+' # stay\nother: *shared\n---\nbody';
      const edit=h.descriptionEdit(original,'fresh');
      const result=original.slice(0,edit.from)+edit.text+original.slice(edit.to);
      assert(result.includes('base: &shared old'));assert(result.includes('other: *shared'));assert(result.includes('# stay'));
      assert.equal(require('../node_modules/yaml').parse(result.split('---\n')[1]).description,'fresh');
    }
  });
  await test('empty descriptions and missing description fields remain valid',()=>{
    for(const fm of ['description:\n','description: # note\nx: 1\n','# only comment\n','x: 1\n','{ x: 1 }\n','{ x: 1, }\n','{}\n']){
      const original='---\n'+fm+'---\nbody',edit=h.descriptionEdit(original,'new');
      const result=original.slice(0,edit.from)+edit.text+original.slice(edit.to);
      assert.equal(require('../node_modules/yaml').parse(result.split('---\n')[1]).description,'new');
      assert(result.endsWith('---\nbody'));
      if(fm.includes('# note'))assert(result.includes('# note'));
    }
  });
  await test('missing frontmatter preserves BOM and note text',()=>{
    for(const original of ['body','\uFEFFbody','body\r\nnext']){
      const edit=h.descriptionEdit(original,'new'),result=original.slice(0,edit.from)+edit.text+original.slice(edit.to);
      assert(result.endsWith(original.replace(/^\uFEFF/,'')));assert.equal(result.startsWith('\uFEFF'),original.startsWith('\uFEFF'));
    }
  });
  await test('unsafe YAML updates are refused without mutation',()=>{
    for(const fm of ['description: &shared old\nother: *shared\n','description: !!int 42\n','description: [a, b]\n','description: a\ndescription: b\n','- one\n','description: [broken\n']){
      assert.throws(()=>h.descriptionEdit('---\n'+fm+'---\nbody','new'));
    }
    assert.throws(()=>h.descriptionEdit('---\ndescription: missing closing fence','new'));
  });
  await test('capabilities remove unsupported sampling and cap output',()=>{const m={supported_parameters:['top_p'],top_provider:{max_completion_tokens:50}};const body=h.filterParameters(m,{model:'a',max_tokens:100,temperature:1,top_p:0.9,frequency_penalty:1});assert(!('temperature'in body));assert(!('frequency_penalty'in body));assert.equal(body.max_tokens,50);assert.equal(body.top_p,0.9);});
  await test('custom models retain unknown parameters',()=>{assert.equal(h.filterParameters(undefined,{temperature:0.5}).temperature,0.5);});
  await test('catalog filters batch/image-only entries and invalid payloads',()=>{const m={id:'a',name:'A',context_length:10,architecture:{input_modalities:['text'],output_modalities:['text']}};const values=h.normalizeModels([m,m,{...m,id:'b:batch'},{...m,id:'image',architecture:{input_modalities:['text'],output_modalities:['image']}}]);assert.equal(values.length,1);assert.throws(()=>h.normalizeModels([]));});
  await test('failed refresh preserves catalog and shared favorites',async()=>{const f=adapterApp(),s=new h.SharedService(f.app);await s.ready;await s.favorite('custom/id');const before=s.models;apiResponse={status:200,json:{data:[]}};await assert.rejects(s.refresh());assert.equal(s.models,before);assert(s.favorites.includes('custom/id'));});
  await test('refresh replaces cache, retains favorites and survives reload',async()=>{const f=adapterApp(),s=new h.SharedService(f.app);await s.ready;await s.favorite('custom/id');apiResponse={status:200,json:{data:[{id:'new/id',context_length:1024,architecture:{input_modalities:['text'],output_modalities:['text']},supported_parameters:['temperature']}]}};await s.refresh();const fresh=new h.SharedService(f.app);await fresh.ready;assert.equal(fresh.models[0].id,'new/id');assert(fresh.favorites.includes('custom/id'));});
  await test('simultaneous provenance writes create distinct recoverable records',async()=>{const f=adapterApp(),s=new h.SharedService(f.app);await s.ready;const ids=await Promise.all([s.record({output:'a'}),s.record({output:'b'})]);assert(ids.every(Boolean));assert.notEqual(ids[0],ids[1]);assert.equal([...f.files.keys()].filter(x=>x.includes('/history/')).length,2);});
  await test('history failure preserves generation instead of throwing',async()=>{const f=adapterApp(),s=new h.SharedService(f.app);await s.ready;f.fail();assert.equal(await s.record({output:'safe'}),null);});
  await test('stream handles split chunks, CRLF and final unterminated event',async()=>{const p=plugin();context.fetch=fetchChunks(['data: {"choices":[{"delta":{"content":"Hel','lo "}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"world"}}]}']);assert.equal(await h.collectChat(opts(p)),'Hello world');assert.equal(p.records[0].output,'Hello world');assert.equal(p.records[0].status,'complete');assert.equal(p.controllers.size,0);assert(!JSON.stringify(p.records).includes('test-only-key'));});
  await test('stream errors retain partial output in history',async()=>{const p=plugin();context.fetch=fetchChunks(['data: {"choices":[{"delta":{"content":"partial"}}]}\n','data: {"error":{"message":"provider failed"}}\n']);await assert.rejects(h.collectChat(opts(p)),/provider failed/);assert.equal(p.records[0].output,'partial');assert.equal(p.records[0].status,'error');});
  await test('aborted requests are recorded and do not return an applicable result',async()=>{const p=plugin(),controller=new AbortController();context.fetch=async(url,init)=>{controller.abort();if(init.signal.aborted)throw new DOMException('Aborted','AbortError');};await assert.rejects(h.collectChat({...opts(p),signal:controller.signal}));assert.equal(p.records[0].status,'aborted');});
  await test('malformed SSE and HTTP errors are surfaced',async()=>{for(const response of [fetchChunks(['data: invalid\n']),async()=>({ok:false,status:429,text:async()=>'rate limit'})]){context.fetch=response;await assert.rejects(h.collectChat(opts(plugin())));}});
  console.log('\n'+count+' behavior checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
