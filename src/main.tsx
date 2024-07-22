// import React from "react";
// import { createRoot } from "react-dom/client";

import { render } from "solid-js/web";

import App from "./App.tsx";
import "./index.css";
import { Plugin } from "obsidian";
import { getAPI } from "obsidian-dataview";
import { DataviewAPI } from "./lib/types.ts";

export default class DataEdit extends Plugin {
  async onload(): Promise<void> {
    // @ts-ignore
    await app.plugins.loadPlugin("dataview");
    const dataviewAPI = getAPI(this.app) as DataviewAPI;
    // console.log(dataviewAPI);

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
        () => (
          <App
            plugin={this}
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
