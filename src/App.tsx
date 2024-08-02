import {
  Accessor,
  Component,
  createMemo,
  createSignal,
  For,
  JSXElement,
  Match,
  onCleanup,
  onMount,
  Setter,
  Show,
  splitProps,
  Switch,
} from "solid-js";
import "@/App.css";
import { ModifiedDataviewQueryResult } from "@/lib/types";
import { createStore, SetStoreFunction } from "solid-js/store";
import {
  DataEditBlockConfig,
  DataEditBlockConfigKey,
  defaultDataEditBlockConfig,
  getColumnPropertyNames,
  getTemplateFiles,
  registerDataviewEvents,
  setBlockConfig,
  tryDataviewArrayToArray,
  unregisterDataviewEvents,
  updateBlockConfig,
} from "@/lib/util";
// import { Minus, Plus } from "lucide-solid";
import Lock from "lucide-solid/icons/Lock";
import LockOpen from "lucide-solid/icons/Lock-open";
import Gear from "lucide-solid/icons/Settings";
import ChevronsUp from "lucide-solid/icons/Chevrons-up";
import ChevronsDown from "lucide-solid/icons/Chevrons-down";
import ChevronsDownUp from "lucide-solid/icons/Chevrons-down-up";
import AlignLeft from "lucide-solid/icons/Align-left";
import AlignCenter from "lucide-solid/icons/Align-center";
import AlignRight from "lucide-solid/icons/Align-right";
import Wrench from "lucide-solid/icons/Wrench";
/*
  TODO
  - problem: build process bundles *all* lucide icons, but *does* correctly treeshake for final bundle. This causes 500% increase to build time despite bundle being correct.
  - workaround:
    - effect: corrects build process time 
    - from https://christopher.engineering/en/blog/lucide-icons-with-vite-dev-server/
    - issue: no autocomplete
*/
import { defaultQueryResult } from "@/lib/constants";
import { Table } from "@/components/Table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog";
import { ExternalLink } from "./components/ui/external-link";
import { buttonVariants } from "./components/ui/button";
import { Toggle } from "./components/ui/toggle";
import {
  CodeBlockContext,
  CodeBlockInfo,
  useCodeBlock,
} from "./hooks/useDataEdit";
import { MarkdownView } from "obsidian";
import { Combobox } from "@kobalte/core/combobox";
import {
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxTrigger,
  FilepathComboBox,
  PromptComboBox,
} from "./components/ui/combo-box";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./components/ui/popover";
import { LucideProps } from "lucide-solid";

export type AppProps = CodeBlockInfo & {
  uid: string;
  queryResultStore: Record<string, ModifiedDataviewQueryResult>;
  setQueryResultStore: SetStoreFunction<
    Record<string, ModifiedDataviewQueryResult>
  >;
  setConfigStore: SetStoreFunction<DataEditBlockConfig>;
  hideFileCol: boolean;
};

function App(props: AppProps) {
  const [local, codeBlockInfo] = splitProps(props, [
    "uid",
    "queryResultStore",
    "setQueryResultStore",
  ]);
  const { plugin, query, config, dataviewAPI } = codeBlockInfo;
  const queryResults: Accessor<ModifiedDataviewQueryResult> = createMemo(() => {
    return props.queryResultStore[props.uid] ?? defaultQueryResult;
  }, defaultQueryResult);

  const updateQueryResults = async () => {
    // console.log("we out here", props.query);
    const truePropertyNames = getColumnPropertyNames(query);
    // console.log("true props; ", truePropertyNames);
    const result = await dataviewAPI.query(query);
    if (!result.successful) {
      local.setQueryResultStore(local.uid, { ...result, truePropertyNames });
      return;
    }
    result.value.values = result.value.values.map((arr) =>
      arr.map((v) => tryDataviewArrayToArray(v)),
    );
    local.setQueryResultStore(local.uid, { ...result, truePropertyNames });
  };

  updateQueryResults();
  registerDataviewEvents(plugin, updateQueryResults);

  onCleanup(() => {
    unregisterDataviewEvents(plugin, updateQueryResults);
  });

  return (
    <CodeBlockContext.Provider value={codeBlockInfo}>
      <div
        aria-label="Toggle toolbar"
        onClick={() => {
          updateBlockConfig(
            "showToolbar",
            !codeBlockInfo.config.showToolbar,
            codeBlockInfo,
          );
        }}
        class="clickable-icon inset edit-block-button absolute !top-[calc(2*var(--size-2-2)+var(--icon-size)+10px)]"
      >
        <Wrench class="svg-icon" />
      </div>
      <Show
        when={
          codeBlockInfo.config.showToolbar && codeBlockInfo.config.toolbarTop
        }
      >
        <div class="flex items-center gap-2">
          <Toolbar config={config} setConfigStore={props.setConfigStore} />
        </div>
      </Show>
      <div class="h-fit w-full overflow-x-scroll">
        <Table queryResults={queryResults()} hideFileCol={props.hideFileCol} />
      </div>
      <Show
        when={
          codeBlockInfo.config.showToolbar && !codeBlockInfo.config.toolbarTop
        }
      >
        <div class="flex -translate-y-4 items-center gap-2">
          <Toolbar config={config} setConfigStore={props.setConfigStore} />
        </div>
      </Show>
    </CodeBlockContext.Provider>
  );
}

export default App;

export const Toolbar = (props: {
  config: DataEditBlockConfig;
  setConfigStore: SetStoreFunction<DataEditBlockConfig>;
}) => {
  const codeBlockInfo = useCodeBlock();
  const [isConfigOpen, setConfigOpen] = createSignal(false);

  const updateConfig = (
    key: DataEditBlockConfigKey,
    value: DataEditBlockConfig[typeof key],
  ) => {
    updateBlockConfig(key, value, codeBlockInfo);
  };
  return (
    <>
      <BlockConfigModal
        config={props.config}
        codeBlockInfo={codeBlockInfo}
        open={isConfigOpen()}
        setOpen={setConfigOpen}
      />
      <div
        class="clickable-icon"
        onClick={() => setConfigOpen((prev) => !prev)}
      >
        <Gear size="1rem" />
      </div>
      <For each={Object.keys(codeBlockInfo.config) as DataEditBlockConfigKey[]}>
        {(key) => {
          const value = codeBlockInfo.config[key];
          return (
            <Switch>
              <Match when={key === "lockEditing"}>
                <div
                  class="clickable-icon"
                  onClick={async () => updateConfig(key, !value)}
                >
                  <Show
                    when={value === true}
                    fallback={<LockOpen size={"1rem"} />}
                  >
                    <Lock size={"1rem"} />
                  </Show>
                </div>
              </Match>
              <Match when={key === "horizontalAlignment"}>
                <Popover>
                  <PopoverTrigger
                    as="div"
                    aria-label={
                      "Horizontal alignment: " +
                      props.config.horizontalAlignment
                    }
                    class="clickable-icon"
                  >
                    <HorizontalAlignIcon
                      align={props.config.horizontalAlignment}
                    />
                  </PopoverTrigger>
                  <PopoverContent class="flex size-fit rounded-md p-2">
                    <div
                      aria-label="left"
                      class="clickable-icon"
                      onClick={() =>
                        updateConfig("horizontalAlignment", "left")
                      }
                    >
                      <AlignLeft class="svg-icon" />
                    </div>
                    <div
                      aria-label="center"
                      class="clickable-icon"
                      onClick={() =>
                        updateConfig("horizontalAlignment", "center")
                      }
                    >
                      <AlignCenter class="svg-icon" />
                    </div>
                    <div
                      aria-label="right"
                      class="clickable-icon"
                      onClick={() =>
                        updateConfig("horizontalAlignment", "right")
                      }
                    >
                      <AlignRight class="svg-icon" />
                    </div>
                  </PopoverContent>
                </Popover>
              </Match>
              <Match when={key === "verticalAlignment"}>
                <Popover>
                  <PopoverTrigger
                    as="div"
                    aria-label={
                      "Vertical alignment: " + props.config.verticalAlignment
                    }
                    class="clickable-icon"
                  >
                    <VerticalAlignIcon align={props.config.verticalAlignment} />
                  </PopoverTrigger>
                  <PopoverContent class="flex size-fit rounded-md p-2">
                    <div
                      aria-label="top"
                      class="clickable-icon"
                      onClick={() => updateConfig("verticalAlignment", "top")}
                    >
                      <ChevronsUp class="svg-icon" />
                    </div>
                    <div
                      aria-label="middle"
                      class="clickable-icon"
                      onClick={() =>
                        updateConfig("verticalAlignment", "middle")
                      }
                    >
                      <ChevronsDownUp class="svg-icon" />
                    </div>
                    <div
                      aria-label="bottom"
                      class="clickable-icon"
                      onClick={() =>
                        updateConfig("verticalAlignment", "bottom")
                      }
                    >
                      <ChevronsDown class="svg-icon" />
                    </div>
                  </PopoverContent>
                </Popover>
              </Match>
            </Switch>
          );
        }}
      </For>
    </>
  );
};

const HorizontalAlignIcon = (props: {
  align: DataEditBlockConfig["horizontalAlignment"];
  iconProps?: Component<LucideProps>;
}) => {
  //
  return (
    <Switch fallback={<AlignLeft class="svg-icon" {...props.iconProps} />}>
      <Match when={props.align === "center"}>
        <AlignCenter class="svg-icon" {...props.iconProps} />
      </Match>
      <Match when={props.align === "right"}>
        <AlignRight class="svg-icon" {...props.iconProps} />
      </Match>
    </Switch>
  );
};

const VerticalAlignIcon = (props: {
  align: DataEditBlockConfig["verticalAlignment"];
  iconProps?: Component<LucideProps>;
}) => {
  //
  return (
    <Switch fallback={<ChevronsUp class="svg-icon" {...props.iconProps} />}>
      <Match when={props.align === "middle"}>
        <ChevronsDownUp class="svg-icon" {...props.iconProps} />
      </Match>
      <Match when={props.align === "bottom"}>
        <ChevronsDown class="svg-icon" {...props.iconProps} />
      </Match>
    </Switch>
  );
};

export const BlockConfigModal = (props: {
  config: DataEditBlockConfig;
  codeBlockInfo: CodeBlockInfo;
  open?: boolean;
  setOpen?: Setter<boolean>;
  trigger?: JSXElement;
}) => {
  const [form, setForm] = createStore({ ...props.config });

  const updateForm = (
    key: keyof DataEditBlockConfig,
    value: DataEditBlockConfig[typeof key],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={props.open} onOpenChange={props.setOpen}>
      <Show when={props.trigger}>
        <DialogTrigger>{props.trigger!}</DialogTrigger>
      </Show>
      <DialogContent>
        <DialogTitle>Block configuration</DialogTitle>
        <DialogDescription>
          see the docs{" "}
          <ExternalLink href="https://github.com/unxok/obsidian-dataedit">
            here
          </ExternalLink>{" "}
          for more information
        </DialogDescription>
        <div class="flex size-full max-h-[90%] flex-col gap-2 overflow-y-auto pr-2">
          <Setting
            title="Toolbar on top"
            description="Turn off to have toolbar be at the bottom of the table."
            labelFor="toolbar-top-toggle"
          >
            <Toggle
              id="toolbar-top-toggle"
              name="toolbar-top-toggle"
              checked={form.toolbarTop}
              onCheckedChange={(b) => updateForm("toolbarTop", b)}
            />
          </Setting>
          <Setting
            title="Lock editing"
            description="Prevents editing in all cells which makes links and tags clickable."
            labelFor="lock-editing-toggle"
          >
            <Toggle
              id="lock-editing-toggle"
              name="lock-editing-toggle"
              checked={form.lockEditing}
              onCheckedChange={(b) => updateForm("lockEditing", b)}
            />
          </Setting>
          <Setting
            title="Header icons"
            description="If enabled, will display the icon corresponding to the property type in the header cell."
            labelFor="header-icons-toggle"
          >
            <Toggle
              id="header-icons-toggle"
              name="header-icons-toggle"
              checked={form.headerIcons}
              onCheckedChange={(b) => updateForm("headerIcons", b)}
            />
          </Setting>
          <Setting
            title="New note template"
            description="Path to the template file to use by default for notes created view the 'add row' button. Must be within the template folder configured in core plugin setting."
            labelFor="new-note-template"
          >
            <FilepathComboBox
              pathValue={form.newNoteTemplatePath}
              setPathValue={(v) => updateForm("newNoteTemplatePath", v)}
              templates={true}
            />
            {/* TODO make this a combobox */}
            {/* <input
              type="text"
              id="new-note-template"
              name="new-note-template"
              list="template-list"
              value={form.newNoteTemplatePath}
              class="w-48"
              onInput={(e) =>
                updateForm("newNoteTemplatePath", e.currentTarget.value)
              }
            />
            <datalist id="template-list">
              <For each={templates}>
                {(f) => <option value={f.path}>{f.basename}</option>}
              </For>
            </datalist> */}
          </Setting>
          <Setting
            title="Table CSS class"
            description="Class name to attach to the table element. Do spaces to separate multiple if desired."
            labelFor="table-class-name"
          >
            <input
              type="text"
              id="table-class-name"
              name="table-class-name"
              value={form.tableClassName}
              onInput={(e) =>
                updateForm("tableClassName", e.currentTarget.value)
              }
            />
          </Setting>
          <Setting
            title="Vertical alignment"
            description="Sets the vertical alignment of all table cells."
            labelFor="vertical-alignment"
          >
            <select
              id="vertical-alignment"
              name="vertical-alignment"
              value={form.verticalAlignment}
              onChange={(e) => {
                updateForm("verticalAlignment", e.currentTarget.value);
              }}
              class="dropdown"
            >
              <option value="top">Top (default)</option>
              <option value="middle">Middle</option>
              <option value="bottom">Bottom</option>
            </select>
          </Setting>
          <Setting
            title="Horizontal alignment"
            description="Sets the vertical alignment of all table cells."
            labelFor="horizontal-alignment"
          >
            <select
              id="horizontal-alignment"
              name="horizontal-alignment"
              value={form.horizontalAlignment}
              onChange={(e) => {
                updateForm("horizontalAlignment", e.currentTarget.value);
              }}
              class="dropdown"
            >
              <option value="left">Left (default)</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </Setting>
        </div>
        <DialogFooter>
          <DialogClose
            // variant="outline"
            class={buttonVariants.outline}
            onClick={async () => {
              setBlockConfig(defaultDataEditBlockConfig, props.codeBlockInfo);
            }}
          >
            reset
          </DialogClose>
          <DialogClose
            // variant="ghost"
            class={buttonVariants.ghost}
            onClick={() => props.setOpen && props.setOpen(false)}
          >
            cancel
          </DialogClose>
          <DialogClose
            // variant="accent"
            class={buttonVariants.accent}
            onClick={async () => {
              setBlockConfig(form, props.codeBlockInfo);
              if (!props.setOpen) return;
              props.setOpen(false);
            }}
          >
            save
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const Setting = (props: {
  title: string;
  description: string;
  children: JSXElement;
  labelFor: string;
}) => (
  <div class="flex w-full items-center justify-between border-0 border-t-[1px] border-solid border-t-[var(--background-modifier-border)] pt-2">
    <label for={props.labelFor}>
      <div class="setting-item-name">{props.title}</div>
      <div class="setting-item-description">{props.description}</div>
    </label>
    {props.children}
  </div>
);
