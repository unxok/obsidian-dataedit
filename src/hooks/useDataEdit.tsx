// import { AppProps } from "@/App";
// import { DataviewAPI } from "@/lib/types";
// import { DataEditBlockConfig } from "@/lib/util";
// import DataEdit from "@/main";
// import { MarkdownPostProcessorContext } from "obsidian";
// import { createContext, JSXElement, useContext } from "solid-js";

// TODO this feels like bad practice
// but I'm pretty sure it will never actually be undefined
// so providing a dummy default value should be fine?
// export const DataEditContext = createContext<AppProps>({
//   plugin: {} as DataEdit,
//   el: {} as HTMLElement,
//   source: "",
//   query: "",
//   config: {} as DataEditBlockConfig,
//   ctx: {} as MarkdownPostProcessorContext,
//   dataviewAPI: {} as DataviewAPI,
// });

//export const useDataEdit = () => useContext(DataEditContext);

/*
  So solid appears to make context globally accessed and updated, which causes all codeblocks to always have the same context.
  Because I need codeblocks to have access to their specific info, this doesn't work.
  So for now, I'm just prop drilling the info, but I should see if there's a better way later
*/
