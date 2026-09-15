const {chromium}=require(process.env.LOOM_TEST_PLAYWRIGHT_PATH || 'playwright-core');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.connectOverCDP(process.env.LOOM_TEST_CDP_URL || 'http://127.0.0.1:9235');
 const page=browser.contexts()[0].pages()[0];
 if(!process.env.LOOM_TEST_VAULT || await page.evaluate(()=>app.vault.adapter.getBasePath())!==process.env.LOOM_TEST_VAULT)throw Error('Set LOOM_TEST_VAULT to an isolated fixture vault; refusing to modify another vault.');
 page.setDefaultTimeout(12000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 async function setup(text,preview,mode,result){
   await page.evaluate(async({text,preview,mode,result})=>{
     const plugin=app.plugins.plugins['loom-companion'];plugin.settings.previewRecast=preview;
     require('process').env.OPENROUTER_API_KEY='fixture-only';
     window.__originalFetch ||= window.fetch;
     window.fetch=async(url,init)=>{
       if(String(url)!=='https://openrouter.ai/api/v1/chat/completions')return window.__originalFetch(url,init);
       window.__testRequests=(window.__testRequests||0)+1;
       const enc=new TextEncoder();
       return new Response(new ReadableStream({start(c){
         const send=s=>c.enqueue(enc.encode('data: '+JSON.stringify({id:'fixture-response',model:'fixture/model',choices:[{delta:{content:s}}]})+'\n\n'));
         if(mode==='slow'){
           send('Partial');init.signal.addEventListener('abort',()=>c.error(new DOMException('Aborted','AbortError')),{once:true});
           window.__finishTest=()=>{if(!init.signal.aborted){send(result);c.enqueue(enc.encode('data: [DONE]\n\n'));c.close();}};
         }else{send(result);c.enqueue(enc.encode('data: [DONE]\n\n'));c.close();}
       }}),{status:200});
     };
     let file=app.vault.getAbstractFileByPath('Recast.md');if(!file)file=await app.vault.create('Recast.md',text);
     const leaf=app.workspace.getLeaf(false);await leaf.openFile(file);leaf.view.editor.setValue(text);
     leaf.view.editor.setSelection({line:0,ch:0},leaf.view.editor.offsetToPos(text.length));
     window.__targetLeaf=leaf;
   },{text,preview,mode,result});
 }
 async function recast(){await page.evaluate(()=>app.commands.executeCommandById('loom-companion:recast-selection'));await page.getByRole('button',{name:'Tighten',exact:true}).last().click();}
 const content=()=>page.evaluate(()=>window.__targetLeaf.view.editor.getValue());
 async function records(){return page.evaluate(async()=>{const s=app.plugins.plugins['loom-companion'].shared;const listing=await app.vault.adapter.list(s.dir+'/history');return Promise.all(listing.files.map(async f=>JSON.parse(await app.vault.adapter.read(f))));});}

 await setup('Hello old world.',false,'slow',' late');
 await recast();
 await page.getByRole('button',{name:'Cancel this Recast',exact:true}).click();
 await page.waitForFunction(()=>app.plugins.plugins['loom-companion'].controllers.size===0);
 assert.equal(await content(),'Hello old world.');
 assert((await records()).some(r=>r.status==='aborted'&&r.output==='Partial'));
 console.log('PASS live direct Recast has a working visible Cancel button; partial output is recoverable');

 await setup('Hello old world.',true,'complete','Hello bright world!');
 await recast();
 const apply=page.getByRole('button',{name:'Apply selected changes',exact:true});
 await apply.waitFor();await page.waitForFunction(()=>!!document.querySelector('.loom-companion-diff input'));
 const checkboxes=page.locator('.loom-companion-diff input[type=checkbox]');assert.equal(await checkboxes.count(),2);
 await checkboxes.first().uncheck();await apply.click();
 await page.waitForFunction(()=>!document.querySelector('.loom-companion-modal'));
 assert.equal(await content(),'Hello old world!');
 console.log('PASS live revision review applies only selected changes');

 await setup('Hello old world.',false,'slow',' replacement');
 await recast();await page.getByRole('button',{name:'Cancel this Recast',exact:true}).waitFor();
 await page.evaluate(async()=>{await window.__targetLeaf.openFile(app.vault.getAbstractFileByPath('Second.md'));window.__finishTest();});
 await page.waitForFunction(()=>app.plugins.plugins['loom-companion'].controllers.size===0);
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('.notice')).some(n=>n.textContent.includes('original note changed')));
 assert.equal(await content(),'This note must remain unchanged.\n');
 console.log('PASS live note-switch protection rejects stale Recast output');

 const original='---\n# keep comment\ndescription: old # inline\ntags: [one, two]\n---\nBody text.\n';
 await setup(original,true,'complete','New description');
 await page.evaluate(()=>app.plugins.plugins['loom-companion'].activateView());
 await page.getByRole('button',{name:'Write description',exact:true}).click();
 await page.getByRole('button',{name:'Apply description',exact:true}).click();
 assert.equal(await content(),original.replace('description: old # inline','description: "New description" # inline'));
 console.log('PASS live description update preserves comments, formatting and unrelated fields');

 await page.getByRole('button',{name:'Choose model / favorites',exact:true}).click();
 await page.getByPlaceholder('Name or provider/model ID').fill('gpt-5.6-luna');
 assert((await page.locator('.modal-container').innerText()).includes('gpt-5.6-luna'));
 await page.keyboard.press('Escape');
 assert(await page.evaluate(()=>app.plugins.plugins.loom.shared===app.plugins.plugins['loom-companion'].shared));
 assert.deepEqual(errors,[]);
 console.log('PASS live shared model picker and shared service integration');
 if(process.env.LOOM_TEST_SCREENSHOT)await page.screenshot({path:process.env.LOOM_TEST_SCREENSHOT});
 await browser.close();
 console.log('5 live Obsidian checks passed (mocked responses; no paid requests).');
})().catch(e=>{console.error(e);process.exitCode=1;});
