import {
  DataviewQueryResultHeaders,
  DataviewQueryResultValues,
  DataviewLink,
} from "@/lib/types";
import { getIdColumnIndex, getPropertyTypes } from "@/lib/util";
import { createMemo, For, Setter, Show } from "solid-js";
import { TableData } from "../TableData";
import { useCodeBlock } from "@/hooks/useDataEdit";

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
};
export const TableBody = (props: TableBodyProps) => {
  const codeBlockInfo = useCodeBlock();
  const {
    dataviewAPI: {
      settings: { tableIdColumnName },
    },
    plugin: {
      app: { metadataCache },
    },
  } = codeBlockInfo;

  const propertyTypes = createMemo(() => {
    return getPropertyTypes(props.properties, metadataCache);
  });

  return (
    <tbody>
      <For each={props.rows}>
        {(row, rowIndex) => (
          <tr>
            <For each={row}>
              {(value, valueIndex) => (
                <Show
                  when={
                    !(
                      codeBlockInfo.hideFileCol &&
                      valueIndex() === props.headers.length - 1
                    )
                  }
                >
                  <TableData
                    value={value}
                    header={props.headers[valueIndex()]}
                    property={props.properties[valueIndex()]}
                    propertyType={propertyTypes()[valueIndex()]}
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
                  />
                </Show>
              )}
            </For>
          </tr>
        )}
      </For>
    </tbody>
  );
};
