import { App, Component, MarkdownRenderer } from "obsidian";
import {
  ComponentProps,
  createEffect,
  createMemo,
  onMount,
  splitProps,
} from "solid-js";
import { DataviewPropertyValueNotLink } from "../../lib/types";

type MarkdownProps = ComponentProps<"div"> & {
  // containerEl: HTMLElement;
  app: App;
  markdown: DataviewPropertyValueNotLink;
  sourcePath: string;
  class?: string;
};
export const Markdown = (props: MarkdownProps) => {
  let ref: HTMLDivElement;

  const [localProps, divProps] = splitProps(props, [
    "app",
    "markdown",
    "sourcePath",
  ]);

  const md = createMemo(() => {
    const str = localProps.markdown ?? "&nbsp;";
    if (Array.isArray(str)) return str.join(", ");
    if (str === "" || typeof str === "object") return "&nbsp;";
    return str.toString();
  });

  const component = new Component();

  createEffect(() => {
    ref.empty();
    MarkdownRenderer.render(
      localProps.app,
      md(),
      ref,
      localProps.sourcePath,
      component,
    );
  });

  return <div {...divProps} ref={(r) => (ref = r)}></div>;
};
