// import { App, MarkdownPreviewRenderer } from "obsidian";

import { MarkdownPreviewRenderer } from "obsidian";

export {};

type Handler = Parameters<
  typeof MarkdownPreviewRenderer.createCodeBlockPostProcessor
>[1];
declare module "obsidian" {
  global {
    const app: App;
  }

  // interface MarkdownPreviewRenderer {
  //   codeBlockPostProcessors: Record<string, (souce: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => Promise<any> | void>;
  //   unregisterCodeBlockPostProcessor: (language: string) => void;
  // }
}

global {
  const app: App;
}

// interface MarkdownPreviewRenderer {
//   codeBlockPostProcessors: Record<string, Handler>;
//   unregisterCodeBlockPostProcessor: (language: string) => void;
// }
