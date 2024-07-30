import {
  Accessor,
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
  uesCodeBlock,
} from "./hooks/useDataEdit";
import { MarkdownView } from "obsidian";
import { Combobox } from "@kobalte/core/combobox";
import {
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxTrigger,
  PromptComboBox,
} from "./components/ui/combo-box";

export type AppProps = CodeBlockInfo & {
  uid: string;
  queryResultStore: Record<string, ModifiedDataviewQueryResult>;
  setQueryResultStore: SetStoreFunction<
    Record<string, ModifiedDataviewQueryResult>
  >;
  setConfigStore: SetStoreFunction<DataEditBlockConfig>;
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

  // let view: MarkdownView;
  // // TODO this probably isn't the best way to do it, but it works
  // const onContainerClick = (e: Event) => {
  //   console.log("container focused");
  //   // Not properly typed in the API
  //   const mode = view.getMode() as "source" | "preview";
  //   // console.log("mode: ", mode);
  //   if (mode === "preview") {
  //     e.stopPropagation();
  //     e.preventDefault();
  //   }
  // };

  // onMount(() => {
  //   (async () => {
  //     // for some reason this only works with this timeout
  //     await new Promise<void>((res) => setTimeout(res, 0));
  //     codeBlockInfo.plugin.app.workspace.iterateRootLeaves((leaf) => {
  //       if (!leaf.view.containerEl.contains(codeBlockInfo.el)) return;
  //       view = leaf.view as MarkdownView;
  //       leaf.view.containerEl.addEventListener("click", onContainerClick);
  //     });
  //   })();
  // });

  onCleanup(() => {
    unregisterDataviewEvents(plugin, updateQueryResults);
    // (async () => {
    //   await new Promise<void>((res) => setTimeout(res, 0));
    //   codeBlockInfo.plugin.app.workspace.iterateRootLeaves((leaf) => {
    //     if (!leaf.view.containerEl.contains(codeBlockInfo.el)) return;
    //     // console.log("does contain");
    //     leaf.view.containerEl.removeEventListener("click", onContainerClick);
    //   });
    // })();
  });

  return (
    <CodeBlockContext.Provider value={codeBlockInfo}>
      <div class="h-fit w-full overflow-x-scroll">
        <Table queryResults={queryResults()} />
      </div>
      <div class="flex items-center gap-2">
        <Toolbar config={config} setConfigStore={props.setConfigStore} />
      </div>
    </CodeBlockContext.Provider>
  );
}

export default App;

export const Toolbar = (props: {
  config: DataEditBlockConfig;
  setConfigStore: SetStoreFunction<DataEditBlockConfig>;
}) => {
  const codeBlockInfo = uesCodeBlock();
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
            </Switch>
          );
        }}
      </For>
      <div>
        <PromptComboBox
          app={codeBlockInfo.plugin.app}
          defaultOptions={["option a", "option b", "option c"]}
        />
      </div>
    </>
  );
};

export const BlockConfigModal = (props: {
  config: DataEditBlockConfig;
  codeBlockInfo: CodeBlockInfo;
  open?: boolean;
  setOpen?: Setter<boolean>;
  trigger?: JSXElement;
}) => {
  const [form, setForm] = createStore(props.config);
  const templates = getTemplateFiles(props.codeBlockInfo.plugin.app);

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
            title="Lock editing"
            description="Prevents editing in all cells which makes links and tags
                clickable."
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
            title="New note template"
            description="Path to the template file to use by default for notes created view the 'add row' button. Must be within the template folder configured in core plugin setting."
            labelFor="new-note-template"
          >
            {/* TODO make this a combobox */}
            <input
              type="text"
              id="new-note-template"
              name="new-note-template"
              list="template-list"
              value={form.newNoteTemplatePath}
              onInput={(e) =>
                updateForm("newNoteTemplatePath", e.currentTarget.value)
              }
            />
            <datalist id="template-list">
              <For each={templates}>
                {(f) => <option value={f.path}>{f.basename}</option>}
              </For>
            </datalist>
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
