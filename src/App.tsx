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

export type AppProps = CodeBlockInfo & {
  uid: string;
  queryResultStore: Record<string, ModifiedDataviewQueryResult>;
  setQueryResultStore: SetStoreFunction<
    Record<string, ModifiedDataviewQueryResult>
  >;
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

  /*
    TODO I would like to lock editing when in reading mode
    Doing below does correctly identify the leaf a code block is currently in
    And getMode() does get the mode correctly 'preview' || 'source'
    If the note is opened in editing mode, then switching to reading mode *will* rerender and cause this to run again (which is good)
    However is opened in reading mode, switching to edit mode will *not* caues this to run again (bad)
    Ideally we need this to run every time the matched leafs view mode is changed, but I don't think this is possible
  */
  // onMount(() => {
  //   (async () => {
  //     await new Promise<void>((res) => setTimeout(res, 500));
  //     codeBlockInfo.plugin.app.workspace.iterateRootLeaves((leaf) => {
  //       if (!leaf.view.containerEl.contains(codeBlockInfo.el)) return;
  //       console.log("does contain");
  //       if (!(leaf.view instanceof MarkdownView)) return;
  //       console.log("is markdown");
  //       console.log("editor: ", leaf.view.getMode());
  //       if (leaf.view.editor) return;
  //       console.log("no editor");
  //       // isReadingMode = true;
  //       updateBlockConfig("lockEditing", true, codeBlockInfo);
  //     });
  //   })();
  // });

  onCleanup(() => {
    unregisterDataviewEvents(plugin, updateQueryResults);
  });

  return (
    <CodeBlockContext.Provider value={codeBlockInfo}>
      <div class="h-fit w-full overflow-x-scroll">
        <Table queryResults={queryResults()} />
      </div>
      <div class="flex items-center gap-2">
        <Toolbar config={config} />
      </div>
    </CodeBlockContext.Provider>
  );
}

export default App;

export const Toolbar = (props: { config: DataEditBlockConfig }) => {
  const codeBlockInfo = uesCodeBlock();
  const [isConfigOpen, setConfigOpen] = createSignal(false);
  const updateConfig = async (
    key: DataEditBlockConfigKey,
    value: DataEditBlockConfig[typeof key],
  ) => {
    await updateBlockConfig(key, value, codeBlockInfo);
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
      <For each={Object.keys(props.config) as DataEditBlockConfigKey[]}>
        {(key) => {
          const value = props.config[key];
          return (
            <Switch>
              <Match when={key === "lockEditing"}>
                <div
                  class="clickable-icon"
                  onClick={async () => await updateConfig(key, !value)}
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
            description="prevents editing in all cells which makes links and tags
                clickable."
          >
            <Toggle
              checked={form.lockEditing}
              onCheckedChange={(b) => updateForm("lockEditing", b)}
            />
          </Setting>
        </div>
        <DialogFooter>
          <DialogClose
            // variant="outline"
            class={buttonVariants.outline}
            onClick={async () => {
              await setBlockConfig(
                defaultDataEditBlockConfig,
                props.codeBlockInfo,
              );
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
              await setBlockConfig(form, props.codeBlockInfo);
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
}) => (
  <div class="flex w-full items-center justify-between border-0 border-t-[1px] border-solid border-t-[var(--background-modifier-border)] pt-2">
    <div>
      <div class="setting-item-name">{props.title}</div>
      <div class="setting-item-description">{props.description}</div>
    </div>
    {props.children}
  </div>
);
