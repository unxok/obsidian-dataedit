import { DataviewAPI, DataviewQueryResult, PropertyType } from "@/lib/types";
import { CodeBlockConfig } from "@/main";
import { Table } from "@/components2/Table";
import { MarkdownPostProcessorContext, Plugin } from "obsidian";
import {
  onMount,
  createEffect,
  Show,
  createSignal,
  createMemo,
  createContext,
  useContext,
  onCleanup,
} from "solid-js";
import { createStore } from "solid-js/store";
import {
  getIdColumnIndex,
  getPropertyTypes,
  registerDataviewEvents,
  unregisterDataviewEvents,
} from "@/lib/util";

type CodeBlockProps = {
  plugin: Plugin;
  source: string;
  el: HTMLElement;
  ctx: MarkdownPostProcessorContext;
  query: string;
  config: CodeBlockConfig;
  dataviewAPI: DataviewAPI;
  propertyNames: string[];
};

export type BlockContext = {
  plugin: Plugin;
  el: HTMLElement;
  ctx: MarkdownPostProcessorContext;
  source: string;
  query: string;
  config: CodeBlockConfig;
  dataviewAPI: DataviewAPI;
};
const defaultBlockContext: BlockContext = {
  plugin: {} as Plugin,
  el: {} as HTMLElement,
  ctx: {} as MarkdownPostProcessorContext,
  source: "",
  query: "",
  config: {} as CodeBlockConfig,
  dataviewAPI: {} as DataviewAPI,
};
const BlockContext = createContext<BlockContext>(defaultBlockContext);

export const useBlock = () => useContext(BlockContext);

export const CodeBlock = (props: CodeBlockProps) => {
  const [propertyTypes, setPropertyTypes] = createSignal<PropertyType[]>([]);
  const [idColIndex, setIdColIndex] = createSignal(0);
  const [dataviewResult, setDataviewResult] = createSignal<DataviewQueryResult>(
    {
      successful: true,
      value: { headers: [], values: [], type: "table" },
    },
  );

  const updatePropertyTypes = () => {
    const arr = getPropertyTypes(
      props.propertyNames,
      props.plugin.app.metadataCache,
    );
    setPropertyTypes(() => arr);
  };

  const updateIdColIndex = (dataviewResult: DataviewQueryResult) => {
    if (!dataviewResult.successful) return;
    const id = getIdColumnIndex(
      dataviewResult.value.headers,
      props.dataviewAPI.settings.tableIdColumnName,
    );
    setIdColIndex(id);
  };

  // memoizing isn't playing nice with dataview event callbacks...?
  // for now it doesn't matter since these props should never actually change without obsidian causing a rerender automatically
  const updateResults = () => {
    (async () => {
      const results = await props.dataviewAPI.query(props.query);
      setDataviewResult(results);
      updateIdColIndex(results);
      updatePropertyTypes();
    })();
  };

  onMount(() => {
    updateResults();
    registerDataviewEvents(props.plugin, updateResults);
  });

  onCleanup(() => {
    unregisterDataviewEvents(props.plugin, updateResults);
  });

  return (
    <Show
      when={
        dataviewResult().successful && dataviewResult().value!.headers.length
      }
    >
      <BlockContext.Provider
        value={{
          plugin: props.plugin,
          el: props.el,
          ctx: props.ctx,
          source: props.source,
          query: props.query,
          config: props.config,
          dataviewAPI: props.dataviewAPI,
        }}
      >
        <div style={{ "overflow-x": "auto" }}>
          <Table
            properties={props.propertyNames}
            headers={dataviewResult().value!.headers}
            values={dataviewResult().value!.values}
            propertyTypes={propertyTypes()}
            idColIndex={idColIndex()}
          />
        </div>
      </BlockContext.Provider>
    </Show>
  );
};
