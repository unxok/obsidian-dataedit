import { App, MarkdownPreviewRenderer } from "obsidian";

export {};

// Not sure if you actually want to declare this as a type, but the
type CodeBlockPostProcessorHandler = Parameters<
  typeof MarkdownPreviewRenderer.createCodeBlockPostProcessor
>[1];

declare module "obsidian" {
  global {
    const app: App;
  }

  class MarkdownPreviewRenderer {
    /**
     * @public
     */
    // codeBlockPostProcessors: Record<string, CodeBlockPostProcessorHandler>;
    /**
     * @public
     */
    static unregisterCodeBlockPostProcessor(language: string): void;
  }
}

// MarkdownPreviewRenderer;
