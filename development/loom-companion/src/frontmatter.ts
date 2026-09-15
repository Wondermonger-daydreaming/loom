import { isMap, isScalar, isAlias, parseDocument } from 'yaml';

export interface TextEdit { from: number; to: number; text: string }

/** Edit only the description value's source range. Never serialize the document. */
export function descriptionEdit(document: string, description: string): TextEdit {
  const quoted = JSON.stringify(description);
  const eol = document.includes('\r\n') ? '\r\n' : '\n';
  const opener = document.match(/^\uFEFF?---[ \t]*\r?\n/);
  if (!opener) {
    const offset = document.startsWith('\uFEFF') ? 1 : 0;
    return { from: offset, to: offset, text: '---' + eol + 'description: ' + quoted + eol + '---' + eol };
  }
  const start = opener[0].length;
  const closing = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m.exec(document.slice(start));
  if (!closing) throw new Error('Frontmatter has no closing fence.');
  const source = document.slice(start, start + closing.index);
  const doc = parseDocument(source, { keepSourceTokens: true, uniqueKeys: true, merge: true });
  if (doc.errors.length) throw new Error('Fix invalid YAML frontmatter before updating its description.');
  const map = doc.contents;
  if (map !== null && !isMap(map)) throw new Error('Frontmatter must be a YAML mapping.');
  const pair = isMap(map) ? map.items.find(p => isScalar(p.key) && p.key.value === 'description') : undefined;
  let from: number, to: number, value: string;
  if (pair) {
    const node = pair.value;
    if ((!isScalar(node) && !isAlias(node)) || !node.range) {
      throw new Error('The description must be a scalar value, not a collection.');
    }
    // Changing an anchor may silently alter other fields through aliases.
    if (isScalar(node) && node.anchor) throw new Error('The description defines a YAML anchor. Remove that anchor before replacing it.');
    if (isScalar(node) && node.tag && node.tag !== 'tag:yaml.org,2002:str') {
      throw new Error('The description has a non-string YAML tag. Change it to a string first.');
    }
    [from, to] = node.range;
    value = quoted;
    const token: any = node.srcToken;
    if (token?.type === 'block-scalar') {
      // Keep the block header's comment and line ending when replacing its contents.
      const tail = token.props.slice(1).map((t: any) => t.source).join('');
      const trailing = token.source.match(/(?:\r?\n[ \t]*)+$/)?.[0] || '';
      value += tail + trailing.replace(/^\r?\n/, '');
      if (!value.endsWith('\n') && source.slice(from, to).endsWith('\n')) value += eol;
    } else {
      if (source[from - 1] === ':') value = ' ' + value;
      if (from === to && source[to] === '#') value += ' ';
    }
  } else if (isMap(map) && map.flow) {
    const token: any = map.srcToken;
    const end = token?.end?.find((t: any) => t.type === 'flow-map-end');
    if (!end) throw new Error('Cannot locate the end of the frontmatter mapping.');
    from = to = end.offset;
    const comma = map.items.length && !source.slice(0, from).trimEnd().endsWith(',') ? ',' : '';
    value = comma + ' description: ' + quoted;
  } else {
    from = to = source.length;
    value = (source && !source.endsWith('\n') ? eol : '') + 'description: ' + quoted + eol;
  }
  const changed = source.slice(0, from) + value + source.slice(to);
  const checked = parseDocument(changed, { uniqueKeys: true, merge: true });
  if (checked.errors.length || checked.get('description') !== description) {
    throw new Error('Could not update the description without altering its YAML structure.');
  }
  return { from: start + from, to: start + to, text: value };
}
