import { App, MarkdownPreviewRenderer } from "obsidian";

export {};

/**
 * Not sure if you actually want to declare this as a type,
 * but typing it manually or this one inline is hard to read
 */
// type CodeBlockPostProcessorHandler = Parameters<
//   typeof MarkdownPreviewRenderer.createCodeBlockPostProcessor
// >[1];

// declare module "obsidian" {
//   global {
//     const app: App;
//   }

//   namespace MarkdownPreviewRenderer {
//     /**
//      * All currently registered
//      */
//     export const codeBlockPostProcessors: Record<string, CodeBlockPostProcessorHandler>;
//     /**
//      * @public
//      */
//     export function unregisterCodeBlockPostProcessor(language: string): void;
//   }
// }
