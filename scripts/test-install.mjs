import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const scratch=mkdtempSync(join(tmpdir(),'loom-install-test-'));
const config=join(scratch,'.obsidian');
const plugin=join(config,'plugins','loom');
mkdirSync(plugin,{recursive:true});
const privateData='{"fixture":"existing writing state must remain unchanged"}\n';
writeFileSync(join(plugin,'data.json'),privateData);
writeFileSync(join(plugin,'main.js'),'previous plugin code\n');
execFileSync(process.execPath,[join(dirname(fileURLToPath(import.meta.url)),'install.mjs'),config]);
assert.equal(readFileSync(join(plugin,'data.json'),'utf8'),privateData);
const backup=join(config,'backups',readdirSync(join(config,'backups'))[0]);
assert.equal(readFileSync(join(backup,'loom','main.js'),'utf8'),'previous plugin code\n');
for(const id of ['loom','loom-companion','loom-shared']){
  assert(readFileSync(join(config,'plugins',id,'main.js')).length>0);
  execFileSync(process.execPath,['--check',join(config,'plugins',id,'main.js')]);
}
assert.equal(readdirSync(plugin).some(name=>name.includes('.install-')),false);
console.log('PASS installer: previous code backed up, required modules installed, user data unchanged.');
