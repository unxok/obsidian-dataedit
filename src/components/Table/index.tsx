import {
  ModifiedDataviewQueryResult,
  DataviewQueryResultSuccess,
  DataviewQueryResult,
  DataviewQueryResultFail,
  PropertyType,
} from "@/lib/types";
import {
  createSignal,
  For,
  Show,
  createMemo,
  Setter,
  createComputed,
} from "solid-js";
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
  getAllFolders,
  getExistingProperties,
  getTableLine,
  getTemplateFiles,
  ScrollFixer,
  setBlockConfig,
  updateBlockConfig,
} from "@/lib/util";
import { Markdown } from "../Markdown";
import { MarkdownView, Notice } from "obsidian";
import { useCodeBlock } from "@/hooks/useDataEdit";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxTrigger,
  FilepathComboBox,
  FolderpathComboBox,
} from "../ui/combo-box";
import { createStore } from "solid-js/store";
import { PropertyIcon } from "../PropertyIcon";
// prevents from being tree-shaken by TS
autofocus;

type TableProps = {
  queryResults: ModifiedDataviewQueryResult;
  hideFileCol: boolean;
};
export const Table = (props: TableProps) => {
  const codeBlockInfo = useCodeBlock();
  const {
    config: { tableClassName },
  } = codeBlockInfo;
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
          class={tableClassName}
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
        <Show when={!codeBlockInfo.config.lockEditing}>
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
        </Show>
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
  } = useCodeBlock();

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

  const addCol = () => {
    // const view = app.workspace.getActiveViewOfType(MarkdownView);
    const editor = app.workspace.activeEditor?.editor;
    if (!editor) {
      // throw new Error("This should be impossible");
      return;
    }
    const prop = propertyValue().trim();
    const alias = aliasValue();
    const aliasStr = alias
      ? " AS " + (alias.includes(" ") ? '"' + alias + '"' : alias)
      : "";
    const { line, index } = getTableLine(query);
    // offset by 1 since lineStart is with backticks but query is without
    const relativeIndex = lineStart + index + 1;
    editor.setLine(relativeIndex, line + ", " + prop + aliasStr);
    // lines[index + 1] += ", " + prop + aliasStr;
  };

  const properties = getExistingProperties(app);
  const propertyNames = Object.keys(properties).sort();
  const propertyTypes = propertyNames.map((p) => properties[p].type);
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
          <PropertiesComboBox
            value={propertyValue()}
            setValue={setPropertyValue}
            propertyNames={propertyNames}
            propertyTypes={propertyTypes}
          />
          {/* <input
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
          </datalist> */}
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
          class="max-h-[50%] w-full overflow-y-auto"
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

// TODO it seems this is normal behavior based on the docs, but it will clear the value if unfocused when options are shown and none is selected
const PropertiesComboBox = (props: {
  value: string;
  setValue: (value: string) => void;
  propertyNames: string[];
  propertyTypes: string[];
  mount?: Node;
}) => {
  const [inputValue, setInputValue] = createSignal(props.value);

  return (
    <Combobox
      disallowEmptySelection={true}
      value={inputValue()}
      onChange={(value) => {
        props.setValue(value);
        setInputValue(value);
      }}
      onInputChange={(value) => {
        value === "" && props.setValue("");
        // props.setValue(value);
      }}
      // onInputChange={(value) => props.setValue(value)}
      options={props.propertyNames}
      itemComponent={(itemProps) => (
        <ComboboxItem
          item={itemProps.item}
          note={props.propertyTypes[itemProps.item.index]}
          auxLabel={
            <PropertyIcon
              property=""
              type={props.propertyTypes[itemProps.item.index] as PropertyType}
            />
          }
        >
          {itemProps.item.rawValue}
        </ComboboxItem>
      )}
    >
      <ComboboxTrigger>
        <ComboboxInput
          onBlur={(e) => {
            props.setValue(e.currentTarget.value);
          }}
        />
      </ComboboxTrigger>
      <ComboboxContent mount={props.mount} />
    </Combobox>
  );
};

const AddRowButton = (props: { open: boolean; setOpen: Setter<boolean> }) => {
  const codeBlockInfo = useCodeBlock();
  const {
    plugin: { app },
    config,
  } = codeBlockInfo;

  const [titleValue, setTitleValue] = createSignal("");
  const [templateValue, setTemplateValue] = createSignal(
    config.newNoteTemplatePath,
  );
  const [folderValue, setFolderValue] = createSignal(config.newNoteFolderPath);
  const [isSaveDefault, setSaveDefault] = createSignal(false);

  const createNote = async () => {
    // todo technically you could have something like 'Note.md.sdflkj.sdf'
    const title = titleValue().includes(".md")
      ? titleValue()
      : titleValue() + ".md";
    if (!templateValue()) {
      try {
        await app.vault.create(title, "");
        props.setOpen(false);
        return;
      } catch (_) {
        new Notice("Note already exists, choose a different name");
        return;
      }
    }
    const templateFile = app.vault.getFileByPath(templateValue());
    if (!templateFile) {
      new Notice("Couldn't find template note. Double check the file path!");
      return;
    }
    const content = await app.vault.cachedRead(templateFile!);
    try {
      await app.vault.create(folderValue() + "/" + title, content);
    } catch (_) {
      new Notice("Note already exists, choose a different name");
      return;
    }

    if (isSaveDefault()) {
      setBlockConfig(
        {
          ...config,
          newNoteTemplatePath: templateValue(),
          newNoteFolderPath: folderValue(),
        },
        codeBlockInfo,
      );
    }

    props.setOpen(false);
  };

  return (
    <Dialog open={props.open} onOpenChange={(b) => props.setOpen(b)}>
      <DialogContent>
        <DialogTitle>Create new note</DialogTitle>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const sf = new ScrollFixer(codeBlockInfo.el);
            await createNote();
            sf.fix();
          }}
          class="flex flex-col gap-3"
        >
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
            <label for="template-input">Folder (optional): </label>
            <FolderpathComboBox
              pathValue={folderValue()}
              setPathValue={(v) => setFolderValue(v)}
            />
          </div>
          <div class="flex w-full items-center justify-between">
            <label for="template-input">Template (optional): </label>
            <FilepathComboBox
              pathValue={templateValue()}
              setPathValue={(v) => setTemplateValue(v)}
              templates={true}
            />
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
              type="submit"
              disabled={!titleValue()}
              // onClick={}
              class="float-right bg-interactive-accent p-button text-on-accent hover:bg-interactive-accent-hover hover:text-accent-hover disabled:cursor-not-allowed"
            >
              add
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
