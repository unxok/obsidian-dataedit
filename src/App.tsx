import { For, Match, onCleanup, Show, Switch } from "solid-js";
import "@/App.css";
import { MarkdownPostProcessorContext } from "obsidian";
import DataEdit from "@/main";
import { DataviewAPI, ModifiedDataviewQueryResult } from "@/lib/types";
import { createStore } from "solid-js/store";
import {
  DataEditBlockConfig,
  DataEditBlockConfigKey,
  getColumnPropertyNames,
  registerDataviewEvents,
  tryDataviewArrayToArray,
  unregisterDataviewEvents,
  updateBlockConfig,
} from "@/lib/util";
// import { Minus, Plus } from "lucide-solid";
import Lock from "lucide-solid/icons/Lock";
import LockOpen from "lucide-solid/icons/Lock-open";
/*
  TODO
  - problem: build process bundles *all* lucide icons, but *does* correctly treeshake for final bundle. This causes 500% increase to build time despite bundle being correct.
  - workaround:
    - effect: corrects build process time 
    - from https://christopher.engineering/en/blog/lucide-icons-with-vite-dev-server/
    - issue: no autocomplete
*/
import { defaultQueryResult } from "@/lib/constants";
import { DataEditContext, useDataEdit } from "@/hooks/useDataEdit";
import { Table } from "@/components/Table";

export type AppProps = {
  plugin: DataEdit;
  el: HTMLElement;
  source: string;
  query: string;
  config: DataEditBlockConfig;
  ctx: MarkdownPostProcessorContext;
  dataviewAPI: DataviewAPI;
};

function App(props: AppProps) {
  // console.log("app rendered");
  const [queryResults, setQueryResults] =
    createStore<ModifiedDataviewQueryResult>(defaultQueryResult);

  const updateQueryResults = async () => {
    // console.log("we out here", props.query);
    const truePropertyNames = getColumnPropertyNames(props.query);
    // console.log("true props; ", truePropertyNames);
    try {
      const result = await props.dataviewAPI.query(props.query);
      if (result.successful) {
        result.value.values = result.value.values.map((arr) =>
          arr.map((v) => tryDataviewArrayToArray(v)),
        );
      }
      setQueryResults({ ...result, truePropertyNames });
    } catch (e) {
      console.log(e);
    }
  };

  updateQueryResults();
  registerDataviewEvents(props.plugin, updateQueryResults);

  onCleanup(() => {
    unregisterDataviewEvents(props.plugin, updateQueryResults);
  });

  return (
    <DataEditContext.Provider value={props}>
      <div class="h-fit w-full overflow-x-scroll">
        <Table ctx={props.ctx} queryResults={queryResults} />
      </div>
      <div class="flex items-center gap-2">
        <Toolbar config={props.config} />
      </div>
    </DataEditContext.Provider>
  );
}

export default App;

export const Toolbar = (props: { config: DataEditBlockConfig }) => {
  const dataEditInfos = useDataEdit();
  const updateConfig = async (
    key: DataEditBlockConfigKey,
    value: DataEditBlockConfig[typeof key],
  ) => {
    await updateBlockConfig(key, value, dataEditInfos);
  };
  return (
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
  );
};
