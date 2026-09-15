import { App, Editor, MarkdownView, Notice, TFile, getFrontMatterInfo, parseYaml } from 'obsidian';
import { descriptionEdit } from './frontmatter';
import { getTargetMarkdownView } from './util';

/** Conservative snapshot: any intervening document edit requires a new review. */
export class EditTarget {
  readonly file: TFile;
  readonly path: string;
  document: string;
  from: number;
  to: number;
  constructor(private app: App, readonly view: MarkdownView, readonly editor: Editor) {
    if(!view.file)throw new Error('Open a note in editing mode first.');
    this.file=view.file;this.path=view.file.path;this.document=editor.getValue();
    this.from=editor.posToOffset(editor.getCursor('from'));this.to=editor.posToOffset(editor.getCursor('to'));
  }
  get selection(){return this.document.slice(this.from,this.to);}
  check(): boolean {
    const connected=this.app.workspace.getLeavesOfType('markdown').some(l=>l.view===this.view);
    if(!connected || this.view.file!==this.file || this.file.path!==this.path || this.view.editor!==this.editor ||
      this.app.vault.getAbstractFileByPath(this.path)!==this.file || this.editor.getValue()!==this.document){
      new Notice('The original note changed or closed. Nothing was applied. Copy the result or select the passage again.');return false;
    }
    return true;
  }
  replace(text:string):boolean {
    if(!this.check())return false;
    this.editor.replaceRange(text,this.editor.offsetToPos(this.from),this.editor.offsetToPos(this.to));
    this.document=this.editor.getValue();this.from+=text.length;this.to=this.from;
    return true;
  }
  insertHeading(title:string):boolean {
    if(!this.check())return false;
    const info=getFrontMatterInfo(this.document);
    const offset=info.exists?info.contentStart:0;
    this.editor.replaceRange((offset>0&&!this.document.slice(0,offset).endsWith("\n")?"\n":"")+`# ${title}\n\n`,this.editor.offsetToPos(offset));
    this.document=this.editor.getValue();return true;
  }
  description():string {
    const info=getFrontMatterInfo(this.document);
    if(!info.exists)return '';
    const fm=parseYaml(info.frontmatter)||{};
    if(typeof fm!=='object'||Array.isArray(fm))throw new Error('Frontmatter must be a YAML mapping.');
    return String(fm.description ?? '');
  }
  writeDescription(text:string):boolean {
    if(!this.check())return false;
    const edit=descriptionEdit(this.document,text);
    this.editor.replaceRange(edit.text,this.editor.offsetToPos(edit.from),this.editor.offsetToPos(edit.to));
    this.document=this.editor.getValue();return true;
  }
}

export function captureTarget(app:App, editor?:Editor):EditTarget|null {
  const view=editor?app.workspace.getLeavesOfType('markdown').map(l=>l.view).find(v=>v instanceof MarkdownView&&v.editor===editor) as MarkdownView: getTargetMarkdownView(app);
  if(!view?.file){new Notice('Open a note in editing mode first.');return null;}
  return new EditTarget(app,view,editor||view.editor);
}
