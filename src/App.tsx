import { onCleanup } from "solid-js";
import "@/App.css";
import { MarkdownPostProcessorContext } from "obsidian";
import DataEdit from "@/main";
import { DataviewAPI, ModifiedDataviewQueryResult } from "@/lib/types";
import { createStore } from "solid-js/store";
import {
  getColumnPropertyNames,
  registerDataviewEvents,
  tryDataviewArrayToArray,
  unregisterDataviewEvents,
} from "@/lib/util";
// import { Minus, Plus } from "lucide-solid";
/*
  TODO
  - problem: build process bundles *all* lucide icons, but *does* correctly treeshake for final bundle. This causes 500% increase to build time despite bundle being correct.
  - workaround:
    - effect: corrects build process time 
    - from https://christopher.engineering/en/blog/lucide-icons-with-vite-dev-server/
    - issue: no autocomplete
*/
import { defaultQueryResult } from "@/lib/constants";
import { DataEditContext } from "@/hooks/useDataEdit";
import { Table } from "@/components/Table";

export type AppProps = {
  plugin: DataEdit;
  el: HTMLElement;
  source: string;
  ctx: MarkdownPostProcessorContext;
  dataviewAPI: DataviewAPI;
};

function App(props: AppProps) {
  const [queryResults, setQueryResults] =
    createStore<ModifiedDataviewQueryResult>(defaultQueryResult);

  const updateQueryResults = async () => {
    const truePropertyNames = getColumnPropertyNames(props.source);
    // console.log("true props; ", truePropertyNames);
    try {
      const result = await props.dataviewAPI.query(props.source);
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
      <div class="w-full overflow-x-scroll">
        <Table ctx={props.ctx} queryResults={queryResults} />
      </div>
      hi theree
    </DataEditContext.Provider>
  );
}

export default App;
