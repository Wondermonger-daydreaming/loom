import type { App } from 'obsidian';
import type { SharedService } from '../../shared/index';
import { join } from 'path';
import * as obsidian from 'obsidian';
export function sharedServices(app: App): SharedService {
  const adapter=app.vault.adapter as any;
  return require(join(adapter.getBasePath(),app.vault.configDir,'plugins/loom-shared/main.js'))(obsidian).getServices(app);
}
