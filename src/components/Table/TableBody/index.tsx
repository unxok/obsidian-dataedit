import { CodeBlockInfo } from "@/App";
import {
  DataviewQueryResultHeaders,
  DataviewQueryResultValues,
  DataviewLink,
} from "@/lib/types";
import { getIdColumnIndex } from "@/lib/util";
import { For, Setter } from "solid-js";
import { TableData } from "../TableData";

const highlightStyle = {
  "border-left-width": "2px",
  "border-right-width": "2px",
  "border-left-color": "hsl(var(--accent-h) var(--accent-s) var(--accent-l))",
  "border-right-color": "hsl(var(--accent-h) var(--accent-s) var(--accent-l))",
  "background-color": `hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 10%)`,
};

export const draggedOverRight = {
  "border-right-width": "2px",
  "border-right-color": "hsl(var(--accent-h) var(--accent-s) var(--accent-l))",
};

export const draggedOverLeft = {
  "border-left-width": "2px",
  "border-left-color": "hsl(var(--accent-h) var(--accent-s) var(--accent-l))",
};

const lastCellHighlight = {
  "border-bottom-width": "2px",
  "border-bottom-color": "hsl(var(--accent-h) var(--accent-s) var(--accent-l))",
};

type TableBodyProps = {
  headers: DataviewQueryResultHeaders;
  properties: string[];
  rows: DataviewQueryResultValues;
  highlightIndex: number;
  setHighlightIndex: Setter<number>;
  draggedOverIndex: number;
  setDraggedOverIndex: Setter<number>;
  codeBlockInfo: CodeBlockInfo;
};
export const TableBody = (props: TableBodyProps) => {
  const {
    dataviewAPI: {
      settings: { tableIdColumnName },
    },
  } = props.codeBlockInfo;

  return (
    <tbody>
      <For each={props.rows}>
        {(row, rowIndex) => (
          <tr>
            <For each={row}>
              {(value, valueIndex) => (
                <TableData
                  value={value}
                  header={props.headers[valueIndex()]}
                  property={props.properties[valueIndex()]}
                  filePath={
                    (
                      row[
                        getIdColumnIndex(props.headers, tableIdColumnName)
                      ] as DataviewLink
                    ).path ?? ""
                  }
                  onMouseMove={() => {
                    if (props.highlightIndex === -1) return;
                    props.setDraggedOverIndex(valueIndex());
                  }}
                  style={
                    valueIndex() === props.highlightIndex
                      ? rowIndex() === props.rows.length - 1
                        ? { ...highlightStyle, ...lastCellHighlight }
                        : highlightStyle
                      : valueIndex() === props.draggedOverIndex
                        ? props.highlightIndex < valueIndex()
                          ? draggedOverRight
                          : draggedOverLeft
                        : {}
                  }
                  codeBlockInfo={props.codeBlockInfo}
                />
              )}
            </For>
          </tr>
        )}
      </For>
    </tbody>
  );
};
