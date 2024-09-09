import { BlockContext } from "@/components2/CodeBlock";
import { CodeBlockConfig } from "@/components2/CodeBlock/Config";
import { REGEX_COMMA_NOT_IN_DOUBLE_QUOTES, ScrollFixer } from "@/lib/util";
import { MarkdownPostProcessorContext, Plugin, stringifyYaml } from "obsidian";

export const arrayMove = (arr: any[], from: number, to: number) => {
  const copy = [...arr];
  const item = copy[from];
  copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
};

// TODO move this
const DATAVIEW_KEYWORDS = [
  // 'TABLE'
  "FROM",
  "WHERE",
  "SORT",
];

type MoveColumnParams = {
  indexFrom: number;
  indexTo: number;
  blockContext: BlockContext;
};
export const moveColumn = ({
  indexFrom,
  indexTo,
  blockContext,
}: MoveColumnParams) => {
  // TODO technically dataview doesn't require the 'TABLE ...' line to be separated by new lines
  const { query, plugin, source, ctx, el, dataviewAPI } = blockContext;
  const [preTableLine, ...restLines] = query.split("\n");
  let tableLine = preTableLine;
  const preIsWithoutId = tableLine
    .toLocaleLowerCase()
    .includes("table without id");
  let isWithoutId = preIsWithoutId;
  // Reordering id column when NOT using 'WITHOUT ID'
  if (!preIsWithoutId && indexFrom === 0) {
    const { tableIdColumnName } = dataviewAPI.settings;
    tableLine =
      preTableLine.slice(0, 6) +
      "WITHOUT ID file.link AS " +
      tableIdColumnName +
      ", " +
      preTableLine.slice(6);
    isWithoutId = true;
  }
  const tableKeyword = isWithoutId
    ? tableLine.slice(0, 17)
    : tableLine.slice(0, 6);
  const [_, colsText] = tableLine.split(/table(?:\swithout\sid)?\s/im);
  const cols = colsText
    .split(REGEX_COMMA_NOT_IN_DOUBLE_QUOTES)
    .map((s) => s.trim());
  const [from, to] = isWithoutId
    ? [indexFrom, indexTo]
    : [indexFrom - 1, indexTo - 1];
  if (from === to) return;
  const reordered = arrayMove(cols, from, to);
  const newTableLine = tableKeyword + reordered.join(", ");
  const newQuery = newTableLine + "\n" + restLines.join("\n");
  console.log("new query: ", newQuery);
  const [__, configStr] = source.split(/\n---\n/);
  const newSource = configStr ? newQuery + "\n---\n" + configStr : newQuery;
  const { activeEditor } = plugin.app.workspace;
  if (!activeEditor?.editor) return;
  const section = ctx.getSectionInfo(el);
  if (!section) return;
  const { lineStart, lineEnd } = section;
  const sf = new ScrollFixer(el);
  activeEditor.editor.replaceRange(
    newSource,
    { ch: 0, line: lineStart + 1 },
    { ch: NaN, line: lineEnd - 1 },
  );
  sf.fix();
};

type RenameColumnParams = {
  propertyName: string;
  alias: string;
  index: number;
  blockContext: BlockContext;
  remove?: boolean;
};
export const renameColumn = ({
  propertyName,
  alias,
  index,
  blockContext,
  remove,
}: RenameColumnParams) => {
  // TODO technically dataview doesn't require the 'TABLE ...' line to be separated by new lines
  const { query, plugin, source, ctx, el, dataviewAPI } = blockContext;
  const [preTableLine, ...restLines] = query.split("\n");
  let tableLine = preTableLine;
  const preIsWithoutId = tableLine
    .toLocaleLowerCase()
    .includes("table without id");
  let isWithoutId = preIsWithoutId;
  // Reordering id column when NOT using 'WITHOUT ID'
  if (!preIsWithoutId && index === 0) {
    const { tableIdColumnName } = dataviewAPI.settings;
    tableLine =
      preTableLine.slice(0, 6) +
      "WITHOUT ID file.link AS " +
      tableIdColumnName +
      ", " +
      preTableLine.slice(6);
    isWithoutId = true;
  }
  const tableKeyword = isWithoutId
    ? tableLine.slice(0, 17)
    : tableLine.slice(0, 6);
  const [_, colsText] = tableLine.split(/table(?:\swithout\sid)?\s/im);
  const cols: (string | null)[] = colsText
    .split(REGEX_COMMA_NOT_IN_DOUBLE_QUOTES)
    .map((s) => s.trim());
  const colIndex = isWithoutId ? index : index - 1;
  const aliasStr = alias ? ' AS "' + alias + '"' : "";
  cols[colIndex] = propertyName + aliasStr;
  if (remove) {
    cols[colIndex] = null;
  }
  const newTableLine = tableKeyword + cols.filter((c) => c !== null).join(", ");
  const newQuery = newTableLine + "\n" + restLines.join("\n");
  const [__, configStr] = source.split(/\n---\n/);
  const newSource = configStr ? newQuery + "\n---\n" + configStr : newQuery;
  const { activeEditor } = plugin.app.workspace;
  if (!activeEditor?.editor) return;
  const section = ctx.getSectionInfo(el);
  if (!section) return;
  const { lineStart, lineEnd } = section;
  const sf = new ScrollFixer(el);
  activeEditor.editor.replaceRange(
    newSource,
    { ch: 0, line: lineStart + 1 },
    { ch: NaN, line: lineEnd - 1 },
  );
  sf.fix();
};

export type SetBlockConfigProps = {
  newConfig: CodeBlockConfig | null;
  ctx: MarkdownPostProcessorContext;
  el: HTMLElement;
  plugin: Plugin;
  source: string;
};
export const setBlockConfig = ({
  newConfig: config,
  ctx,
  el,
  plugin,
  source,
}: SetBlockConfigProps) => {
  const {
    app: { workspace },
  } = plugin;
  // turn into yaml text. Always includes a newline character at the end
  const newConfigStr = stringifyYaml(config);
  // text is the entire notes text and is essentially a synchronous read
  const { lineStart, lineEnd } = ctx.getSectionInfo(el)!;
  // remove the ', file.link' we added if so
  // const query = hideFileCol ? preQuery.slice(0, -11) : preQuery;
  const query = source.split("\n---\n")[0];
  let newCodeBlockText = "```dataedit\n" + query;
  if (config) {
    newCodeBlockText += "\n---\n" + newConfigStr + "```";
  } else {
    newCodeBlockText += "\n```";
  }
  const editor = workspace.activeEditor?.editor;
  if (!editor) {
    return;
  }

  const scrollFixer = new ScrollFixer(el);
  editor.replaceRange(
    newCodeBlockText,
    { line: lineStart, ch: 0 },
    { line: lineEnd, ch: NaN },
  );
  scrollFixer.fix();
};

export const toFirstUpperCase = (str: string) => {
  const first = str.charAt(0).toUpperCase();
  return first + str.slice(1);
};
