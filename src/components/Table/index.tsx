import {
  ModifiedDataviewQueryResult,
  DataviewQueryResultSuccess,
  DataviewQueryResult,
  DataviewQueryResultFail,
} from "@/lib/types";
import { MarkdownPostProcessorContext } from "obsidian";
import { createSignal, Show } from "solid-js";
import { TableBody } from "./TableBody";
import { TableHead } from "./TableHead";
import { autofocus } from "@solid-primitives/autofocus";
// prevents from being tree-shaken by TS
autofocus;

type TableProps = {
  ctx: MarkdownPostProcessorContext;
  queryResults: ModifiedDataviewQueryResult;
};
export const Table = (props: TableProps) => {
  const [highlightIndex, setHighlightIndex] = createSignal(-1);
  const [draggedOverIndex, setDraggedOverIndex] = createSignal(-1);
  return (
    <Show
      when={props.queryResults.successful}
      fallback={<TableFallback queryResults={props.queryResults} />}
    >
      <table
        style={
          highlightIndex() !== -1
            ? {
                "user-select": "none",
              }
            : {}
        }
      >
        <TableHead
          headers={
            (props.queryResults as DataviewQueryResultSuccess).value.headers
          }
          rowsLength={
            (props.queryResults as DataviewQueryResultSuccess).value.values
              .length
          }
          highlightIndex={highlightIndex()}
          setHighlightIndex={setHighlightIndex}
          draggedOverIndex={draggedOverIndex()}
          setDraggedOverIndex={setDraggedOverIndex}
        />
        <TableBody
          headers={
            (props.queryResults as DataviewQueryResultSuccess).value.headers
          }
          properties={props.queryResults.truePropertyNames}
          rows={(props.queryResults as DataviewQueryResultSuccess).value.values}
          highlightIndex={highlightIndex()}
          setHighlightIndex={setHighlightIndex}
          draggedOverIndex={draggedOverIndex()}
          setDraggedOverIndex={setDraggedOverIndex}
        />
      </table>
    </Show>
  );
};

type TableFallbackProps = { queryResults: DataviewQueryResult };
const TableFallback = (props: TableFallbackProps) => {
  //
  return (
    <div>
      <h2>Dataview error</h2>
      <p>{(props.queryResults as DataviewQueryResultFail).error}</p>
    </div>
  );
};
