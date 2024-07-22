import { render } from "solid-js/web";
import App from "./App.tsx";
import "./index.css";
import { App as ObsidianApp, Notice, Plugin } from "obsidian";
import { DataviewAPI } from "./lib/types.ts";

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
      el.empty();
      el.classList.toggle("twcss", true);

      render(
        () => (
          <App
            plugin={this}
            el={el}
            source={source}
            ctx={ctx}
            dataviewAPI={dataviewAPI}
          />
        ),
        el,
      );
    });
  }
}
