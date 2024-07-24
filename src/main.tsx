// @refresh reload

import { render } from "solid-js/web";
import App from "./App.tsx";
import "./index.css";
import {
  App as ObsidianApp,
  Notice,
  Plugin,
  MarkdownRenderChild,
  Component,
  MarkdownRenderer,
} from "obsidian";
import { DataviewAPI } from "./lib/types.ts";
import { createRoot } from "solid-js";
import { splitQueryOnConfig } from "./lib/util.ts";

const getDataviewAPI = (pApp?: ObsidianApp) => {
  if (pApp) {
    // @ts-ignore
    const { plugins } = pApp.plugins;
    if (plugins.hasOwnProperty("dataview")) {
      return plugins.dataview.api as DataviewAPI;
    }
  }
  // @ts-ignore
  const gPlugins = app.plugins.plugins;
  if (gPlugins.hasOwnProperty("dataview")) {
    return gPlugins.dataview.api as DataviewAPI;
  }
  const msg = "Failed to get Dataview API. Is Dataview installed & enabled?";
  new Notice(msg);
  throw new Error(msg);
};

export default class DataEdit extends Plugin {
  async onload(): Promise<void> {
    // @ts-ignore
    await app.plugins.loadPlugin("dataview");
    // const dataviewAPI = getAPI(this.app) as DataviewAPI;
    const dataviewAPI = getDataviewAPI(this.app) as DataviewAPI;

    this.registerMarkdownCodeBlockProcessor("dataedit", (source, el, ctx) => {
      // best practice to empty when registering
      el.empty();
      // allows all descendents to use tw utily classes
      el.classList.toggle("twcss", true);
      // because users will spend a lot of time hovering within
      // I decided to remove the shadow that appears on hover
      el.parentElement!.style.boxShadow = "none";
      // const { text } = ctx.getSectionInfo(el)!;
      const { query, config } = splitQueryOnConfig(source);
      // console.log("config: ", config);

      const dispose = render(
        () => (
          <App
            plugin={this}
            el={el}
            source={source}
            query={query}
            config={config}
            ctx={ctx}
            dataviewAPI={dataviewAPI}
          />
        ),
        el,
      );
      /* 
      the registerMarkdownCodeBlockProcessor callback is called
      every time the code block is rendered. Doing the below
      will cause the associated mdChild to tell solid to dispose
      of this root and not track its context.
      */
      const mdChild = new MarkdownRenderChild(el);
      mdChild.register(dispose);
      ctx.addChild(mdChild);
    });
  }
}
