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
import {
  getExistingProperties,
  getTableLine,
  getTemplateFiles,
  updateBlockConfig,
} from "@/lib/util";
import { Markdown } from "../Markdown";
import { MarkdownView, Notice, TFile } from "obsidian";
import { uesCodeBlock } from "@/hooks/useDataEdit";
import { createStore } from "solid-js/store";
// prevents from being tree-shaken by TS
autofocus;

type TableProps = {
  queryResults: ModifiedDataviewQueryResult;
};
export const Table = (props: TableProps) => {
  const [highlightIndex, setHighlightIndex] = createSignal(-1);
  const [draggedOverIndex, setDraggedOverIndex] = createSignal(-1);
  const [isAddColumnDialogOpen, setAddColumnDialogOpen] = createSignal(false);
  const [isAddRowDialogOpen, setAddRowDialogOpen] = createSignal(false);
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
          onClick={() => setAddRowDialogOpen(true)}
          aria-label="Add row after"
          class="absolute bottom-[-1rem] left-0 flex w-full cursor-ns-resize items-center justify-center rounded-[1px] border border-t-0 border-solid border-border opacity-0 hover:opacity-50"
        >
          <Plus size="1rem" />
        </span>
        <AddRowButton
          open={isAddRowDialogOpen()}
          setOpen={setAddRowDialogOpen}
        />
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
        class="absolute right-[-1rem] top-[calc(1rem+var(--border-width))] m-0 flex size-fit h-[calc(100%-1rem-var(--border-width))] cursor-ew-resize items-center justify-center rounded-none border border-l-0 border-solid border-border bg-transparent p-0 opacity-0 shadow-none hover:opacity-50"
      >
        {/* <span
          class="absolute right-[-1rem] top-[calc(1rem+var(--border-width))] flex h-[calc(100%-1rem-var(--border-width))] cursor-ew-resize items-center justify-center border border-l-0 border-border opacity-0 hover:opacity-50"
        > */}
        <Plus size="1rem" />
        {/* </span> */}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Add column</DialogTitle>
        <div class="flex w-full flex-wrap items-center justify-between">
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
        <div class="flex w-full flex-wrap items-center justify-between">
          <label for="alias-input">Alias (optional): </label>
          <input
            name="alias-input"
            id="alias-input"
            type="text"
            value={aliasValue()}
            onInput={(e) => setAliasValue(e.target.value)}
          />
        </div>
        <Markdown
          app={app}
          markdown={markdown()}
          sourcePath={ctx.sourcePath}
          class="max-h-[50%] overflow-y-auto"
        />
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
  const codeBlockInfo = uesCodeBlock();
  const {
    plugin: { app },
    config,
  } = codeBlockInfo;

  const [titleValue, setTitleValue] = createSignal("");
  const [templateValue, setTemplateValue] = createSignal("");
  const [isSaveDefault, setSaveDefault] = createSignal(false);
  const templates = getTemplateFiles(app);

  const handleHasDefault = () => {
    if (!config.newNoteTemplatePath) return;
    const found = templates?.find((f) => f.path === config.newNoteTemplatePath);
    if (!found) return;
    setTemplateValue(found.name.slice(0, -3));
  };

  handleHasDefault();

  return (
    <Dialog open={props.open} onOpenChange={(b) => props.setOpen(b)}>
      <DialogContent>
        <DialogTitle>Create new note</DialogTitle>
        <div class="flex w-full items-center justify-between">
          <label for="title-input">Title: </label>
          <input
            use:autofocus
            autofocus
            name="title-input"
            id="title-input"
            type="text"
            value={titleValue()}
            onInput={(e) => setTitleValue(e.target.value)}
          />
        </div>
        <div class="flex w-full items-center justify-between">
          <label for="template-input">Template (optional): </label>
          <input
            disabled={!templates}
            name="template-input"
            id="template-input"
            type="text"
            list="template-datalist"
            value={templateValue()}
            onInput={(e) => setTemplateValue(e.target.value)}
          />
          <Show when={templates}>
            <datalist id="template-datalist">
              <For each={templates}>
                {(file) => (
                  <option value={file.name.slice(0, -3)}>{file.path}</option>
                )}
              </For>
            </datalist>
          </Show>
        </div>
        <div class="flex items-center gap-1">
          <input
            type="checkbox"
            id="save-as-default-template"
            name="save-as-default-template"
            checked={isSaveDefault()}
            onClick={() => setSaveDefault((prev) => !prev)}
          />
          <label for="save-as-default-template">
            Save as default for this block
          </label>
        </div>
        <div class="w-full">
          <button
            disabled={!titleValue()}
            onClick={async () => {
              // todo technically you could have something like 'Note.md.sdflkj.sdf'
              const title = titleValue().includes(".md")
                ? titleValue()
                : titleValue() + ".md";
              if (!templates) {
                try {
                  await app.vault.create(title, "");
                  props.setOpen(false);
                  return;
                } catch (_) {
                  new Notice("Note already exists, choose a different name");
                  return;
                }
              }
              const templateFile = templates.find(
                (t) => t.name === templateValue() + ".md",
              );
              const content = await app.vault.cachedRead(templateFile!);
              try {
                await app.vault.create(title, content);
              } catch (_) {
                new Notice("Note already exists, choose a different name");
                return;
              }

              if (isSaveDefault()) {
                const path = templates.find(
                  (f) => f.name === templateValue() + ".md",
                )!.path;
                updateBlockConfig("newNoteTemplatePath", path, codeBlockInfo);
              }

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
