// import React from "react";
// import { createRoot } from "react-dom/client";

import { render } from "solid-js/web";

import App from "./App.tsx";
import "./index.css";
import { Notice, Plugin } from "obsidian";
import { createSignal } from "solid-js";
import { getAPI } from "obsidian-dataview";
import { DataviewAPI } from "./lib/types.ts";

export const [plugin, setPlugin] = createSignal<ObsidianVite>();

export default class ObsidianVite extends Plugin {
  async onload(): Promise<void> {
    setPlugin(this as ObsidianVite);
    // @ts-ignore
    await app.plugins.loadPlugin("dataview");
    const dataviewAPI = getAPI() as DataviewAPI;

    const str = "we out here";
    new Notice(str);
    console.log(str);

    this.registerMarkdownCodeBlockProcessor("dataedit", (source, el, ctx) => {
      el.empty();
      el.classList.toggle("twcss", true);

      // const root = createRoot(el);
      // root.render(
      // 	<React.StrictMode>
      // 		<App
      // 			source={source}
      // 			ctx={ctx}
      // 		/>
      // 	</React.StrictMode>
      // );

      render(
        () => <App source={source} ctx={ctx} dataviewAPI={dataviewAPI} />,
        el,
      );
    });
  }
}
