import { BlockContext } from "@/components2/CodeBlock";
import { ScrollFixer } from "@/lib/util";

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
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/gm)
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
