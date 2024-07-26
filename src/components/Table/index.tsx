import {
  ModifiedDataviewQueryResult,
  DataviewQueryResultSuccess,
  DataviewQueryResult,
  DataviewQueryResultFail,
} from "@/lib/types";
import { createSignal, For, Show, createMemo, Setter } from "solid-js";
import { TableBody } from "./TableBody";
import { TableHead } from "./TableHead";
import Plus from "lucide-solid/icons/Plus";
import { autofocus } from "@solid-primitives/autofocus";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { getExistingProperties, getTableLine } from "@/lib/util";
import { Markdown } from "../Markdown";
import { MarkdownView } from "obsidian";
import { uesCodeBlock } from "@/hooks/useDataEdit";
// prevents from being tree-shaken by TS
autofocus;

type TableProps = {
  queryResults: ModifiedDataviewQueryResult;
};
export const Table = (props: TableProps) => {
  const [highlightIndex, setHighlightIndex] = createSignal(-1);
  const [draggedOverIndex, setDraggedOverIndex] = createSignal(-1);
  const [isAddColumnDialogOpen, setAddColumnDialogOpen] = createSignal(false);
  return (
    <Show
      when={props.queryResults.successful}
      fallback={<TableFallback queryResults={props.queryResults} />}
    >
      <div
        class="relative mb-4 mr-4 h-fit w-fit"
        // style={{ "overflow-y": "visible" }}
      >
        <table
          // class="h-fit overflow-y-visible"
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
            properties={props.queryResults.truePropertyNames}
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
            rows={
              (props.queryResults as DataviewQueryResultSuccess).value.values
            }
            highlightIndex={highlightIndex()}
            setHighlightIndex={setHighlightIndex}
            draggedOverIndex={draggedOverIndex()}
            setDraggedOverIndex={setDraggedOverIndex}
          />
        </table>
        <AddColumnButton
          open={isAddColumnDialogOpen()}
          setOpen={setAddColumnDialogOpen}
        />
        <span
          aria-label="Add row after"
          class="absolute bottom-[-1rem] left-0 flex w-full cursor-ns-resize items-center justify-center rounded-[1px] border border-t-0 border-border opacity-0 hover:opacity-50"
        >
          <Plus size="1rem" />
        </span>
      </div>
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

const AddColumnButton = (props: {
  open: boolean;
  setOpen: Setter<boolean>;
}) => {
  const {
    plugin: { app },
    ctx,
    el,
    query,
  } = uesCodeBlock();

  const view = app.workspace.getActiveViewOfType(MarkdownView);

  if (!view) {
    // throw new Error("This should be impossible");
    return;
  }

  const sectionInfo = ctx.getSectionInfo(el);
  if (!sectionInfo) {
    // throw new Error("This should be impossible");
    return;
  }
  const { lineStart } = sectionInfo;

  const [propertyValue, setPropertyValue] = createSignal("");
  const [aliasValue, setAliasValue] = createSignal("");

  const markdown = createMemo(() => {
    const prop = propertyValue().trim();
    const lines = ("```dataview\n" + query + "\n```").split("\n");
    if (!prop) return lines.join("\n");
    const alias = aliasValue();
    const aliasStr = alias
      ? " AS " + (alias.includes(" ") ? '"' + alias + '"' : alias)
      : "";
    const { index } = getTableLine(query);
    // offset by 1 since source doesn't include backticks we added to lines
    lines[index + 1] += ", " + prop + aliasStr;
    return lines.join("\n");
  });

  // const addCol = async (markdown: string) => {
  //   const { vault } = app;
  //   const file = vault.getFileByPath(ctx.sourcePath);
  //   if (!file) {
  //     throw new Error("This should be impossible");
  //   }
  //   // const content = await vault.cachedRead(file);
  //   const content = text;
  //   const lines = content.split("\n");
  //   lines[lineStart + 1] = markdown.split("\n")[1];
  //   const newContent = lines.join("\n");
  //   await vault.modify(file, newContent);
  // };

  const addCol = () => {
    const prop = propertyValue().trim();
    const alias = aliasValue();
    const aliasStr = alias
      ? " AS " + (alias.includes(" ") ? '"' + alias + '"' : alias)
      : "";
    const { line, index } = getTableLine(query);
    // offset by 1 since lineStart is with backticks but query is without
    const relativeIndex = lineStart + index + 1;
    view.editor.setLine(relativeIndex, line + ", " + prop + aliasStr);
    // lines[index + 1] += ", " + prop + aliasStr;
  };

  const properties = getExistingProperties(app);
  const propertyNames = Object.keys(properties).sort();
  return (
    <Dialog open={props.open} onOpenChange={(b) => props.setOpen(b)}>
      <DialogTrigger
        aria-label="Add column after"
        class="absolute right-[-1rem] top-[calc(1rem+var(--border-width))] m-0 flex size-fit h-[calc(100%-1rem-var(--border-width))] cursor-ew-resize items-center justify-center rounded-none border border-l-0 border-border bg-transparent p-0 opacity-0 shadow-none hover:opacity-50"
      >
        {/* <span
          class="absolute right-[-1rem] top-[calc(1rem+var(--border-width))] flex h-[calc(100%-1rem-var(--border-width))] cursor-ew-resize items-center justify-center border border-l-0 border-border opacity-0 hover:opacity-50"
        > */}
        <Plus size="1rem" />
        {/* </span> */}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Add column</DialogTitle>
        <div class="flex w-full items-center justify-between">
          <label for="property-input">Property: </label>
          <input
            use:autofocus
            autofocus
            name="property-input"
            id="property-input"
            type="text"
            list="properties-datalist"
            value={propertyValue()}
            onInput={(e) => setPropertyValue(e.target.value)}
          />
          <datalist id="properties-datalist">
            <For each={propertyNames}>
              {(prop) => <option value={prop}>{properties[prop].type}</option>}
            </For>
          </datalist>
        </div>
        <div class="flex w-full items-center justify-between">
          <label for="alias-input">Alias (optional): </label>
          <input
            name="alias-input"
            id="alias-input"
            type="text"
            value={aliasValue()}
            onInput={(e) => setAliasValue(e.target.value)}
          />
        </div>
        <Markdown app={app} markdown={markdown()} sourcePath={ctx.sourcePath} />
        <div class="w-full">
          <button
            disabled={!propertyValue()}
            onClick={async () => {
              addCol();
              props.setOpen(false);
            }}
            class="float-right bg-interactive-accent p-button text-on-accent hover:bg-interactive-accent-hover hover:text-accent-hover disabled:cursor-not-allowed"
          >
            add
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const AddRowButton = (props: { open: boolean; setOpen: Setter<boolean> }) => {
  const {
    plugin: { app },
  } = uesCodeBlock();

  const [titleValue, setTitleValue] = createSignal("");
  const [templateValue, setTemplateValue] = createSignal("");

  const properties = getExistingProperties(app);
  const propertyNames = Object.keys(properties).sort();
  return (
    <Dialog open={props.open} onOpenChange={(b) => props.setOpen(b)}>
      <DialogTrigger
        aria-label="Add column after"
        class="absolute right-[-1rem] top-[calc(1rem+var(--border-width))] m-0 flex size-fit h-[calc(100%-1rem-var(--border-width))] cursor-ew-resize items-center justify-center rounded-none border border-l-0 border-border bg-transparent p-0 opacity-0 shadow-none hover:opacity-50"
      >
        {/* <span
          class="absolute right-[-1rem] top-[calc(1rem+var(--border-width))] flex h-[calc(100%-1rem-var(--border-width))] cursor-ew-resize items-center justify-center border border-l-0 border-border opacity-0 hover:opacity-50"
        > */}
        <Plus size="1rem" />
        {/* </span> */}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Add column</DialogTitle>
        <div class="flex w-full items-center justify-between">
          <label for="property-input">Property: </label>
          <input
            use:autofocus
            autofocus
            name="property-input"
            id="property-input"
            type="text"
            list="properties-datalist"
            value={titleValue()}
            onInput={(e) => setTitleValue(e.target.value)}
          />
          <datalist id="properties-datalist">
            <For each={propertyNames}>
              {(prop) => <option value={prop}>{properties[prop].type}</option>}
            </For>
          </datalist>
        </div>
        <div class="flex w-full items-center justify-between">
          <label for="alias-input">Alias (optional): </label>
          <input
            name="alias-input"
            id="alias-input"
            type="text"
            value={templateValue()}
            onInput={(e) => setTemplateValue(e.target.value)}
          />
        </div>
        {/* <Markdown app={app} markdown={markdown()} sourcePath={ctx.sourcePath} /> */}
        <div class="w-full">
          <button
            disabled={!titleValue()}
            onClick={async () => {
              // await addCol(markdown());
              props.setOpen(false);
            }}
            class="float-right bg-interactive-accent p-button text-on-accent hover:bg-interactive-accent-hover hover:text-accent-hover disabled:cursor-not-allowed"
          >
            add
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// TODO fix nested
