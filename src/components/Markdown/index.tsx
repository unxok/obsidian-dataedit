import { App, Component, MarkdownRenderer } from "obsidian";
import { ComponentProps, onMount, splitProps } from "solid-js";
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

  const md = (() => {
    const str = localProps.markdown ?? "&nbsp;";
    if (Array.isArray(str)) return str.join(", ");
    if (str === "" || typeof str === "object") return "&nbsp;";
    return str.toString();
  })();

  onMount(() => {
    MarkdownRenderer.render(
      localProps.app,
      md,
      ref,
      localProps.sourcePath,
      new Component(),
    );
  });

  return <div {...divProps} ref={(r) => (ref = r)}></div>;
};
