import { existsSync, statSync, mkdirSync, copyFileSync, renameSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argument = process.argv[2];
if (!argument) throw new Error('Usage: node scripts/install.mjs /path/to/vault/.obsidian (close Obsidian first)');
const config = resolve(argument);
if (basename(config) !== '.obsidian' || !existsSync(config) || !statSync(config).isDirectory()) {
  throw new Error('Pass an existing vault .obsidian directory.');
}
const files = [
  ['shared/main.js', 'loom-shared/main.js'],
  ['main.js', 'loom/main.js'], ['manifest.json', 'loom/manifest.json'], ['styles.css', 'loom/styles.css'],
  ['companion/main.js', 'loom-companion/main.js'], ['companion/manifest.json', 'loom-companion/manifest.json'],
  ['companion/styles.css', 'loom-companion/styles.css'], ['companion/YAML-LICENSE.txt', 'loom-companion/YAML-LICENSE.txt']
];
for (const [source] of files) if (!existsSync(join(root, source))) throw new Error('Missing release file: ' + source);
const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid;
const backup = join(config, 'backups', 'loom-code-' + stamp);
mkdirSync(backup, { recursive: true, mode: 0o700 });
for (const [, relative] of files) {
  const destination = join(config, 'plugins', relative);
  if (existsSync(destination)) {
    const saved = join(backup, relative);
    mkdirSync(dirname(saved), { recursive: true });
    copyFileSync(destination, saved);
  }
}
// Copy the shared dependency first. Never read or write data.json or vault notes.
for (const [source, relative] of files) {
  const destination = join(config, 'plugins', relative);
  mkdirSync(dirname(destination), { recursive: true });
  const temporary = destination + '.install-' + stamp;
  copyFileSync(join(root, source), temporary);
  renameSync(temporary, destination);
}
console.log('Installed Loom, Companion and the shared runtime. Code backup: ' + backup);
console.log('Restart Obsidian. Enable Loom and Loom Companion in Community plugins; loom-shared is a support module.');
