import { AppProps } from "@/App";
import { DataviewAPI } from "@/lib/types";
import { DataEditBlockConfig } from "@/lib/util";
import DataEdit from "@/main";
import { MarkdownPostProcessorContext } from "obsidian";
import { createContext, useContext } from "solid-js";

// TODO this feels like bad practice
// but I'm pretty sure it will never actually be undefined
// so providing a dummy default value should be fine?
export const DataEditContext = createContext<AppProps>({
  plugin: {} as DataEdit,
  el: {} as HTMLElement,
  source: "",
  query: "",
  config: {} as DataEditBlockConfig,
  ctx: {} as MarkdownPostProcessorContext,
  dataviewAPI: {} as DataviewAPI,
});

export const useDataEdit = () => useContext(DataEditContext);
