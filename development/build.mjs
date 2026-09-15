import esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const dir=dirname(fileURLToPath(import.meta.url));
const root=resolve(dir,'..');
const packaging=process.argv.includes('--package');
if(process.argv.includes('--deploy'))throw new Error('Use --package to refresh release files; scripts/install.mjs installs into a vault.');
const targets=packaging
  ? {loom:root,companion:resolve(root,'companion'),shared:resolve(root,'shared')}
  : {loom:resolve(dir,'dist/loom'),companion:resolve(dir,'dist/loom-companion'),shared:resolve(dir,'dist/loom-shared')};
for(const target of Object.values(targets))mkdirSync(target,{recursive:true});
const options={bundle:true,platform:'node',format:'cjs',target:'es2020',external:['obsidian'],logLevel:'info',minify:false};
await esbuild.build({...options,entryPoints:[resolve(dir,'shared/index.ts')],outfile:resolve(targets.shared,'main.js'),
  banner:{js:'let __loomSharedApi; module.exports = function(__loomObsidian) { if (__loomSharedApi) return __loomSharedApi; const module = { exports: {} }; const require = id => { if (id === "obsidian") return __loomObsidian; throw new Error("Unsupported shared dependency: " + id); };'},
  footer:{js:'return __loomSharedApi = module.exports; };'}});
await esbuild.build({...options,entryPoints:[resolve(dir,'loom-companion/src/main.ts')],outfile:resolve(targets.companion,'main.js'),banner:{js:'/* Editable source: development/loom-companion/src */'}});
copyFileSync(resolve(dir,'loom-companion/styles.css'),resolve(targets.companion,'styles.css'));
copyFileSync(resolve(dir,'node_modules/yaml/LICENSE'),resolve(targets.companion,'YAML-LICENSE.txt'));
copyFileSync(resolve(dir,'loom-main.js'),resolve(targets.loom,'main.js'));
console.log(packaging?'Release files refreshed. No vault was modified.':'Staged build complete.');
