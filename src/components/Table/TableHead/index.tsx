import { Markdown } from "@/components/Markdown";
import { useDataEdit } from "@/hooks/useDataEdit";
import { DataviewQueryResultHeaders } from "@/lib/types";
import { createSignal, For, onCleanup, Setter } from "solid-js";
import GripHorizontal from "lucide-solid/icons/Grip-horizontal";
import { draggedOverLeft, draggedOverRight } from "../TableBody";
import { Notice } from "obsidian";
import Plus from "lucide-solid/icons/Plus";

export type TableHeadProps = {
  headers: DataviewQueryResultHeaders;
  rowsLength: number;
  highlightIndex: number;
  setHighlightIndex: Setter<number>;
  draggedOverIndex: number;
  setDraggedOverIndex: Setter<number>;
};
export const TableHead = (props: TableHeadProps) => {
  const {
    plugin,
    ctx,
    el,
    dataviewAPI: {
      settings: { tableIdColumnName },
    },
  } = useDataEdit();

  const [translateX, setTranslateX] = createSignal(0);
  let lastMousePos = 0;

  const onMouseMove = (e: MouseEvent) => {
    if (props.highlightIndex === -1) return;
    setTranslateX(() => e.clientX - lastMousePos);
  };

  const onMouseUp = async () => {
    if (
      props.draggedOverIndex !== -1 &&
      props.draggedOverIndex !== props.highlightIndex
    ) {
      const {
        app: { vault },
      } = plugin;
      const sectionInfo = ctx.getSectionInfo(el);
      if (!sectionInfo) {
        throw new Error("This should be impossible");
      }
      const { lineStart } = sectionInfo;
      const file = vault.getFileByPath(ctx.sourcePath);
      if (!file) {
        throw new Error("This should be impossible");
      }
      const content = await vault.read(file);
      const lines = content.split("\n");
      const tableLine = lines[lineStart + 1];
      const isWithoutId = tableLine.toLowerCase().includes("without id");
      const tableKeyword = tableLine.slice(0, isWithoutId ? 16 : 5).trim();
      const cols = tableLine
        .slice(isWithoutId ? 17 : 6)
        .split(",")
        .map((c) => c.trim());
      console.log(tableKeyword);
      console.log(cols);
      const newCols = [...cols];
      const highlightIndex = props.highlightIndex - (isWithoutId ? 0 : 1);
      const draggedIndex = props.draggedOverIndex - (isWithoutId ? 0 : 1);
      newCols[highlightIndex] = cols[draggedIndex];
      newCols[draggedIndex] = cols[highlightIndex];
      console.log("new cols: ", newCols);
      lines[lineStart + 1] = tableKeyword + " " + newCols.join(", ");
      const newContent = lines.join("\n");
      vault.modify(file, newContent);
    }

    props.setHighlightIndex(-1);
    props.setDraggedOverIndex(-1);
    setTranslateX(0);
    lastMousePos = 0;
    window.removeEventListener("mousemove", onMouseMove);
  };

  // window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);

  onCleanup(() => {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  });

  return (
    <thead>
      <tr>
        <For each={props.headers}>
          {(_, index) => (
            <th
              onMouseDown={(e) => {
                if (props.headers[index()] === tableIdColumnName) {
                  new Notice(
                    "Can't reorder default ID column. Specify 'WIHOUT ID' to be able to drag it.",
                  );
                  return;
                }
                props.setHighlightIndex(index());
                setTranslateX(0);
                lastMousePos = e.clientX;
                window.addEventListener("mousemove", onMouseMove);
              }}
              onMouseMove={() => {
                if (
                  props.highlightIndex === -1 ||
                  props.headers[index()] === tableIdColumnName
                )
                  return;
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
                class={`flex size-full items-end justify-center`}
                style={
                  index() === props.highlightIndex
                    ? {
                        background:
                          "hsl(var(--accent-h) var(--accent-s) var(--accent-l))",
                        "border-radius": "var(--radius-s) var(--radius-s) 0 0",
                        translate: translateX() + "px 0",
                      }
                    : {}
                }
              >
                <GripHorizontal size="1rem" />
              </div>
            </th>
          )}
        </For>
      </tr>
      <tr>
        <For each={props.headers}>
          {(h, index) => (
            <th
              onMouseMove={() => {
                if (props.highlightIndex === -1 || h === tableIdColumnName)
                  return;
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
              <Markdown
                app={plugin.app}
                markdown={h}
                sourcePath={ctx.sourcePath}
              />
            </th>
          )}
        </For>
        <th
          aria-label="Add column after"
          // TODO idk why this doesn't work
          rowspan={props.rowsLength}
          class="w-6 border-transparent p-0 opacity-0 hover:border-border hover:opacity-100"
        >
          <div class="flex size-full items-center justify-center">
            <Plus size="1rem" />
          </div>
        </th>
      </tr>
    </thead>
  );
};
