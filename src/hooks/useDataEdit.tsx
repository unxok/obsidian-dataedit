import { AppProps } from "@/App";
import { DataviewAPI } from "@/lib/types";
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
  ctx: {} as MarkdownPostProcessorContext,
  dataviewAPI: {} as DataviewAPI,
});

export const useDataEdit = () => useContext(DataEditContext);
