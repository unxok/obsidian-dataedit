import { DataviewAPI, DataviewQueryResult, PropertyType } from "@/lib/types";
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
  createUniqueId,
} from "solid-js";
import { createStore } from "solid-js/store";
import {
  getIdColumnIndex,
  getPropertyTypes,
  registerDataviewEvents,
  unregisterDataviewEvents,
} from "@/lib/util";
import { CodeBlockConfig } from "./Config";
import DataEdit from "@/main";

type CodeBlockProps = {
  plugin: DataEdit;
  source: string;
  el: HTMLElement;
  ctx: MarkdownPostProcessorContext;
  query: string;
  config: CodeBlockConfig;
  dataviewAPI: DataviewAPI;
  propertyNames: string[];
};

export type BlockContext = {
  plugin: DataEdit;
  el: HTMLElement;
  ctx: MarkdownPostProcessorContext;
  source: string;
  query: string;
  config: CodeBlockConfig;
  dataviewAPI: DataviewAPI;
  uid: string;
};
const defaultBlockContext: BlockContext = {
  plugin: {} as DataEdit,
  el: {} as HTMLElement,
  ctx: {} as MarkdownPostProcessorContext,
  source: "",
  query: "",
  config: {} as CodeBlockConfig,
  dataviewAPI: {} as DataviewAPI,
  uid: "",
};
const BlockContext = createContext<BlockContext>({ ...defaultBlockContext });

export const useBlock = () => useContext(BlockContext);

export const CodeBlock = (props: CodeBlockProps) => {
  const uid = createUniqueId();
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
    props.plugin.app.metadataTypeManager.on(
      "changed",
      updatePropertyTypes,
      props.ctx,
    );
  });

  onCleanup(() => {
    unregisterDataviewEvents(props.plugin, updateResults);
    props.plugin.app.metadataTypeManager.off("changed", updatePropertyTypes);
  });

  return (
    <Show
      when={
        dataviewResult().successful && dataviewResult().value!.headers.length
      }
    >
      ID: {uid}
      <BlockContext.Provider
        value={{
          plugin: props.plugin,
          el: props.el,
          ctx: props.ctx,
          source: props.source,
          query: props.query,
          config: props.config,
          dataviewAPI: props.dataviewAPI,
          uid: uid,
        }}
      >
        <div style={{ "overflow-x": "auto", height: "fit-content" }}>
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
