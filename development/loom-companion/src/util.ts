import { App, MarkdownView, TFile } from "obsidian";

/**
 * Resolve the markdown view to act on — robust when called from a side panel.
 *
 * Clicking a button in a sidebar leaf moves focus off the editor, so
 * getActiveViewOfType(MarkdownView) can return null. Fall back to the markdown
 * leaf that shows the currently-active file, then to any markdown leaf.
 */
export function getTargetMarkdownView(app: App): MarkdownView | null {
  const active = app.workspace.getActiveViewOfType(MarkdownView);
  if (active) return active;

  const file = app.workspace.getActiveFile();
  const leaves = app.workspace.getLeavesOfType("markdown");
  for (const leaf of leaves) {
    const v = leaf.view;
    if (v instanceof MarkdownView && file && v.file === file) return v;
  }
  const first = leaves[0]?.view;
  return first instanceof MarkdownView ? first : null;
}

/** The active markdown file, if any (works from the side panel). */
export function getActiveMarkdownFile(app: App): TFile | null {
  const file = app.workspace.getActiveFile();
  return file && file.extension === "md" ? file : null;
}
