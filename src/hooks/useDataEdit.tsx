import { DataviewAPI } from "@/lib/types";
import { DataEditBlockConfig } from "@/lib/util";
import DataEdit from "@/main";
import { MarkdownPostProcessorContext } from "obsidian";
import { createContext, useContext } from "solid-js";

export type CodeBlockInfo = {
  plugin: DataEdit;
  el: HTMLElement;
  source: string;
  query: string;
  config: DataEditBlockConfig;
  ctx: MarkdownPostProcessorContext;
  dataviewAPI: DataviewAPI;
};

// TODO this feels like bad practice
// but I'm pretty sure it will never actually be undefined
// so providing a dummy default value should be fine?
export const CodeBlockContext = createContext<CodeBlockInfo>({
  plugin: {} as DataEdit,
  el: {} as HTMLElement,
  source: "",
  query: "",
  config: {} as DataEditBlockConfig,
  ctx: {} as MarkdownPostProcessorContext,
  dataviewAPI: {} as DataviewAPI,
});

/**
 * This context will always be up to date since the code block will be rerendered by Obsidian whenever any of this info changes.
 *
 * Therefore, this isn't technically *reactive* in Solid's perspective, so it's okay to destructure this at top level of components.
 * @returns Info specific to the code block instance
 */
export const uesCodeBlock = () => useContext(CodeBlockContext);
