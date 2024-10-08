import { Markdown } from "@/components/Markdown";
import { DataviewQueryResultHeaders } from "@/lib/types";
import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  Setter,
  Show,
} from "solid-js";
import GripHorizontal from "lucide-solid/icons/Grip-horizontal";
import { draggedOverLeft, draggedOverRight } from "../TableBody";
import { getPropertyTypes, getTableLine, ScrollFixer } from "@/lib/util";
import { MarkdownView } from "obsidian";
import { useCodeBlock } from "@/hooks/useDataEdit";
import { createStore } from "solid-js/store";
import { PropertyIcon } from "@/components/PropertyIcon";

export type TableHeadProps = {
  headers: DataviewQueryResultHeaders;
  properties: string[];
  highlightIndex: number;
  setHighlightIndex: Setter<number>;
  draggedOverIndex: number;
  setDraggedOverIndex: Setter<number>;
};
export const TableHead = (props: TableHeadProps) => {
  const codeBlockInfo = useCodeBlock();
  const {
    plugin,
    ctx,
    el,
    query,
    dataviewAPI: {
      settings: { tableIdColumnName },
    },
    hideFileCol,
  } = codeBlockInfo;
  const [translateX, setTranslateX] = createSignal(0);
  const propertyTypes = createMemo(() =>
    getPropertyTypes(props.properties, plugin.app.metadataCache),
  );
  let lastMousePos = 0;

  const onMouseMove = (e: MouseEvent) => {
    // console.log("mouse move called");
    if (props.highlightIndex === -1) return;
    setTranslateX(() => e.clientX - lastMousePos);
  };

  // const onMouseUp = async () => {
  //   // if dragged over a column other than the highlighted (dragging) one
  //   if (
  //     props.draggedOverIndex !== -1 &&
  //     props.draggedOverIndex !== props.highlightIndex
  //   ) {
  //     const {
  //       plugin,
  //       ctx,
  //       el,
  //       query,
  //       dataviewAPI: {
  //         settings: { tableIdColumnName },
  //       },
  //     } = props.codeBlockInfo;
  //     const {
  //       app: { vault, workspace },
  //     } = plugin;
  //     const view = workspace.getActiveViewOfType(MarkdownView);
  //     const sectionInfo = ctx.getSectionInfo(el);
  //     // you shouldn't be able to get to this point if it's null
  //     if (!sectionInfo || !view) {
  //       throw new Error("This should be impossible");
  //     }
  //     const { lineStart, text: content } = sectionInfo;
  //     const file = vault.getFileByPath(ctx.sourcePath);
  //     // you shouldn't be able to get to this point if it's null
  //     if (!file) {
  //       throw new Error("This should be impossible");
  //     }
  //     const lines = content.split("\n");
  //     const { line: preTableLine, index } = getTableLine(query);
  //     // index is relative to the provided source, so this offsets to an index of the whole note
  //     // add one because `source` doesn't include backticks, but lineStart is the first backticks
  //     const tableLineIndex = lineStart + index + 1;
  //     const isWithoutId = new RegExp(/TABLE\s+WITHOUT\s+ID/gim).test(
  //       preTableLine,
  //     );
  //     const isDraggingDefaultId =
  //       // if query has 'WITHOUT ID' we don't care
  //       !isWithoutId &&
  //       // default id col is always first
  //       props.highlightIndex === 0 &&
  //       // the header will always be the name from dataview settings
  //       props.headers[props.highlightIndex] === tableIdColumnName;
  //     // need to check separately for dragged over because it will change how we adjust the headers
  //     const isDraggedOverDefaultId =
  //       !isWithoutId &&
  //       props.draggedOverIndex === 0 &&
  //       props.headers[props.draggedOverIndex] === tableIdColumnName;
  //     const isRelatingToDefaultId =
  //       isDraggingDefaultId || isDraggedOverDefaultId;
  //     const tableLine = isRelatingToDefaultId
  //       ? // to 'move' the default id col, we have to modify the query to have this and a file.link col
  //         preTableLine.replace(/table/i, "TABLE WITHOUT ID")
  //       : preTableLine;
  //     // TABLE vs TABLE WITHOUT ID
  //     const tableKeyword = tableLine
  //       .slice(0, isWithoutId || isRelatingToDefaultId ? 16 : 5)
  //       .trim();
  //     const preCols = tableLine
  //       .slice(isWithoutId || isRelatingToDefaultId ? 17 : 6)
  //       // split on comma unless surrounded by double quotes
  //       .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
  //       .map((c) => c.trim());
  //     const cols = isRelatingToDefaultId
  //       ? // this is how we allow the default id col to be 'moved'
  //         ["file.link AS " + tableIdColumnName, ...preCols]
  //       : preCols;
  //     // need to offset both by 1 because if query doesn't have 'WITHOUT ID' then the first column is the default id col
  //     const highlightIndex =
  //       props.highlightIndex - (isWithoutId || isRelatingToDefaultId ? 0 : 1);
  //     const draggedIndex =
  //       props.draggedOverIndex - (isWithoutId || isRelatingToDefaultId ? 0 : 1);
  //     const colsWithoutHighlight = cols.toSpliced(highlightIndex, 1);
  //     // insert the highlight col where the indicator is
  //     const newCols = colsWithoutHighlight.toSpliced(
  //       draggedIndex,
  //       0,
  //       cols[highlightIndex],
  //     );
  //     // reconstruct the query line
  //     lines[tableLineIndex] = tableKeyword + " " + newCols.join(", ");
  //     const newContent = lines.join("\n");
  //     // update the file with new line
  //     await vault.modify(file, newContent);
  //   }

  //   props.setHighlightIndex(-1);
  //   props.setDraggedOverIndex(-1);
  //   setTranslateX(0);
  //   lastMousePos = 0;
  //   window.removeEventListener("mousemove", onMouseMove);
  // };

  // window.addEventListener("mousemove", onMouseMove);

  const onMouseUp = () => {
    // if dragged over a column other than the highlighted (dragging) one
    if (
      props.draggedOverIndex !== -1 &&
      props.draggedOverIndex !== props.highlightIndex
    ) {
      const {
        app: { workspace },
      } = plugin;
      const view = workspace.getActiveViewOfType(MarkdownView);
      const sectionInfo = ctx.getSectionInfo(el);
      // you shouldn't be able to get to this point if it's null
      if (!sectionInfo || !view) {
        throw new Error("This should be impossible");
      }
      const { lineStart } = sectionInfo;
      const { line: prePreTableLine, index } = getTableLine(query);
      // remove hidden column if needed
      const preTableLine = hideFileCol
        ? prePreTableLine.slice(0, -11)
        : prePreTableLine;
      // index is relative to the provided source, so this offsets to an index of the whole note
      // add one because `source` doesn't include backticks, but lineStart is the first backticks
      const tableLineIndex = lineStart + index + 1;
      const isWithoutId = new RegExp(/TABLE\s+WITHOUT\s+ID/gim).test(
        preTableLine,
      );
      const isDraggingDefaultId =
        // if query has 'WITHOUT ID' we don't care
        !isWithoutId &&
        // default id col is always first
        props.highlightIndex === 0 &&
        // the header will always be the name from dataview settings
        props.headers[props.highlightIndex] === tableIdColumnName;
      // need to check separately for dragged over because it will change how we adjust the headers
      const isDraggedOverDefaultId =
        !isWithoutId &&
        props.draggedOverIndex === 0 &&
        props.headers[props.draggedOverIndex] === tableIdColumnName;
      const isRelatingToDefaultId =
        isDraggingDefaultId || isDraggedOverDefaultId;
      const tableLine = isRelatingToDefaultId
        ? // to 'move' the default id col, we have to modify the query to have this and a file.link col
          preTableLine.replace(/table/i, "TABLE WITHOUT ID")
        : preTableLine;
      // TABLE vs TABLE WITHOUT ID
      const tableKeyword = tableLine
        .slice(0, isWithoutId || isRelatingToDefaultId ? 16 : 5)
        .trim();
      const preCols = tableLine
        .slice(isWithoutId || isRelatingToDefaultId ? 17 : 6)
        // split on comma unless surrounded by double quotes
        .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
        .map((c) => c.trim());
      const cols = isRelatingToDefaultId
        ? // this is how we allow the default id col to be 'moved'
          ["file.link AS " + tableIdColumnName, ...preCols]
        : preCols;
      // need to offset both by 1 because if query doesn't have 'WITHOUT ID' then the first column is the default id col
      const highlightIndex =
        props.highlightIndex - (isWithoutId || isRelatingToDefaultId ? 0 : 1);
      const draggedIndex =
        props.draggedOverIndex - (isWithoutId || isRelatingToDefaultId ? 0 : 1);
      const colsWithoutHighlight = cols.toSpliced(highlightIndex, 1);
      // insert the highlight col where the indicator is
      const newCols = colsWithoutHighlight.toSpliced(
        draggedIndex,
        0,
        cols[highlightIndex],
      );

      const scrollFixer = new ScrollFixer(el);
      view.editor.setLine(
        tableLineIndex,
        tableKeyword + " " + newCols.join(", "),
      );
      scrollFixer.fix();
    }

    props.setHighlightIndex(-1);
    props.setDraggedOverIndex(-1);
    setTranslateX(0);
    lastMousePos = 0;
    window.removeEventListener("mousemove", onMouseMove);
  };

  window.addEventListener("mouseup", onMouseUp);

  onCleanup(() => {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  });

  return (
    <thead>
      <Show when={!codeBlockInfo.config.lockEditing}>
        <tr>
          <For each={props.headers}>
            {(_, index) => (
              <Show
                when={
                  !(
                    codeBlockInfo.hideFileCol &&
                    index() === props.headers.length - 1
                  )
                }
              >
                <th
                  onMouseDown={(e) => {
                    props.setHighlightIndex(index());
                    setTranslateX(0);
                    lastMousePos = e.clientX;
                    window.addEventListener("mousemove", onMouseMove);
                  }}
                  onMouseMove={() => {
                    if (props.highlightIndex === -1) return;
                    props.setDraggedOverIndex(index());
                  }}
                  // onMouseUp={() => {
                  //   props.setHighlightIndex(-1);
                  //   setTranslateX(0);
                  //   lastMousePos = 0;
                  // }}
                  // onMouseMove={(e) => {
                  //   e.preventDefault();
                  //   setTranslateX(() => e.clientX - lastMousePos);
                  // }}
                  class={`relative m-0 cursor-grab overflow-visible border-x-transparent border-t-transparent p-0 text-muted active:cursor-grabbing ${index() === props.highlightIndex ? "opacity-100" : "opacity-0"} ${props.highlightIndex === -1 ? "hover:opacity-100" : ""}`}
                >
                  <div
                    aria-roledescription="column-drag-handle"
                    class={`flex size-full items-end justify-center`}
                    style={
                      index() === props.highlightIndex
                        ? {
                            background:
                              "hsl(var(--accent-h) var(--accent-s) var(--accent-l))",
                            "border-radius":
                              "var(--radius-s) var(--radius-s) 0 0",
                            translate: translateX() + "px 0",
                            "pointer-events": "none",
                          }
                        : props.highlightIndex !== -1
                          ? {
                              cursor: "grabbing",
                            }
                          : {}
                    }
                  >
                    <GripHorizontal size="1rem" />
                  </div>
                </th>
              </Show>
            )}
          </For>
        </tr>
      </Show>
      <tr>
        <For each={props.headers}>
          {(h, index) => (
            <Show
              when={
                !(
                  codeBlockInfo.hideFileCol &&
                  index() === props.headers.length - 1
                )
              }
            >
              <th
                onMouseMove={() => {
                  if (props.highlightIndex === -1) return;
                  props.setDraggedOverIndex(index());
                }}
                class="relative text-nowrap"
                style={
                  index() === props.highlightIndex
                    ? {
                        "border-top-width": "2px",
                        "border-left-width": "2px",
                        "border-right-width": "2px",
                        "border-top-color":
                          "hsl(var(--accent-h) var(--accent-s) var(--accent-l))",
                        "border-left-color":
                          "hsl(var(--accent-h) var(--accent-s) var(--accent-l))",
                        "border-right-color":
                          "hsl(var(--accent-h) var(--accent-s) var(--accent-l))",
                        "background-color": `hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 10%)`,
                      }
                    : props.highlightIndex !== -1 &&
                        index() === props.draggedOverIndex
                      ? props.highlightIndex < index()
                        ? draggedOverRight
                        : draggedOverLeft
                      : {}
                }
              >
                <div class="flex items-center">
                  <Markdown
                    app={plugin.app}
                    markdown={h}
                    sourcePath={ctx.sourcePath}
                  />
                  <Show
                    when={
                      index() === 0 &&
                      props.properties[index()] === tableIdColumnName
                    }
                  >
                    <span class="px-[.1rem] text-xs text-muted">
                      ({props.headers.length})
                    </span>
                  </Show>
                  &nbsp;
                  <PropertyIcon
                    property={props.properties[index()]}
                    type={propertyTypes()[index()]}
                  />
                </div>
              </th>
            </Show>
          )}
        </For>
      </tr>
    </thead>
  );
};
