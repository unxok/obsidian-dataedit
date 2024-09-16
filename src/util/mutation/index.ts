/*
    # MUTATION FUNCTIONS
    ---
    These functions may produce side effects such as:
    - updating the content of the DOM
    - updating files and notes
    - etc.
*/

import { BlockContext } from "@/components/CodeBlock";
import { ScrollFixer } from "@/classes";
import { getTableLine, splitTableKeyword, arrayMove } from "../pure";
import { REGEX_COMMA_NOT_IN_DOUBLE_QUOTES } from "../regex";
import { CodeBlockConfig } from "@/components/CodeBlock/Config";
import { MarkdownPostProcessorContext, Plugin, stringifyYaml } from "obsidian";


type MoveColumnParams = {
    indexFrom: number;
    indexTo: number;
    blockContext: BlockContext;
  };

/**
 * Edits the block's content in the note to move a specified column from one position to another.
 */
export const moveColumn = ({
indexFrom,
indexTo,
blockContext,
}: MoveColumnParams) => {
const { query, plugin, source, ctx, el, dataviewAPI } = blockContext;
const { tableLine: preTableLine, rest: restLines } = getTableLine(query);
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
    'WITHOUT ID file.link AS "' +
    tableIdColumnName +
    '", ' +
    preTableLine.slice(6);
    isWithoutId = true;
}
const { keyword: tableKeyword, rest: colsText } =
    splitTableKeyword(tableLine);
const cols = colsText
    .split(REGEX_COMMA_NOT_IN_DOUBLE_QUOTES)
    // can't think of a straightforward way to retain trailing spaces, so oh well
    .map((s) => s.trim());
const [from, to] = isWithoutId
    ? [indexFrom, indexTo]
    : [indexFrom - 1, indexTo - 1];
if (from === to) return;
const reordered = arrayMove(cols, from, to);
const newTableLine = tableKeyword + reordered.join(", ");
const newQuery = newTableLine + restLines;
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
/**
 * Edits the block's content in the note to modify a specified columns property and/or alias
 * @remark Only if `alias` is truthy will 'AS "<alias>"' be added
 */
export const renameColumn = ({
propertyName,
alias,
index,
blockContext,
remove,
}: RenameColumnParams) => {
const { query, plugin, source, ctx, el, dataviewAPI } = blockContext;
const { tableLine, rest: restLines } = getTableLine(query);
const { keyword: preTableKeyword, rest: preColsText } =
    splitTableKeyword(tableLine);
const preIsWithoutId = /table\s*without\s*id\s+/i.test(preTableKeyword);

let isWithoutId = preIsWithoutId;
let tableKeyword = preTableKeyword;
let colsText = preColsText;
// Renaming id column when NOT using 'WITHOUT ID'
if (!preIsWithoutId && index === 0) {
    const { tableIdColumnName } = dataviewAPI.settings;
    tableKeyword = preTableKeyword + "WITHOUT ID ";
    colsText = 'file.link AS "' + tableIdColumnName + '", ' + preColsText;
    isWithoutId = true;
}

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
const newQuery = newTableLine + restLines;
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


/**
 * Edits the block's content to update (or add) the Dataedit YAML config within it
 */
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