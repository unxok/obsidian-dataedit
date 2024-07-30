// @refresh reload

import { render } from "solid-js/web";
import App from "./App.tsx";
import "./index.css";
import {
  App as ObsidianApp,
  Notice,
  Plugin,
  MarkdownRenderChild,
  MarkdownView,
} from "obsidian";
import { DataviewAPI, ModifiedDataviewQueryResult } from "./lib/types.ts";
import { splitQueryOnConfig } from "./lib/util.ts";
import { createStore } from "solid-js/store";
import { createUniqueId } from "solid-js";

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

    this.registerMarkdownCodeBlockProcessor(
      "dataedit",
      async (source, el, ctx) => {
        el.empty();
        el.classList.toggle("twcss", true);
        el.parentElement!.style.boxShadow = "none";

        const uid = createUniqueId();
        const dataviewAPI = getDataviewAPI(this.app) as DataviewAPI;
        const { query, config } = splitQueryOnConfig(source);
        // TODO not working :(
        const [configStore, setConfigStore] = createStore(config);

        // obsidian reccomends this approach according to https://forum.obsidian.md/t/how-to-listen-for-toggling-reading-view/67709/2
        const observer = new MutationObserver((mutations) => {
          // use some() so we can end the loop early
          mutations.some((mut) => {
            if (mut.attributeName !== "data-mode") return false;
            // using the old value seems to be the most consistent because checking attribute values from the DOM inside a MO can have gotchas
            const mode = mut.oldValue;
            console.log("got mode: ", mode);
            if (mode === "source") {
              setConfigStore("lockEditing", true);
              return true;
            }
            if (mode === "preview") {
              setConfigStore("lockEditing", false);
              return true;
            }
            // in case mode is something unexpected
            return false;
          });
        });

        (async () => {
          await new Promise<void>((res) => setTimeout(res, 0));
          const container = el.closest("[data-mode]");
          if (!container) {
            // throw new Error("Unable to find container element");
            return;
          }
          observer.observe(container, {
            attributes: true,
            attributeOldValue: true,
          });

          // mutation won't run callback on instantiation so we check here
          const mode = container.getAttribute("data-mode");
          if (mode === "preview") {
            setConfigStore("lockEditing", true);
          }
          if (mode === "source") {
            setConfigStore("lockEditing", false);
          }
        })();

        // for some reason, doing this as a signal inside each <App /> causes glitches when updating from dataview events
        // but this works just fine
        /*
          TODO after coming back to see this and seeing the above comments, this is being created in each code block register callback... which doesn't make sense that this works but doing the store within <App /> doesn't work? I need to figure out what the true issue was before and why this works to figure out what the actual way to do this should be.
        */
        const [queryResultStore, setQueryResultStore] = createStore<
          Record<string, ModifiedDataviewQueryResult>
        >({});
        const dispose = render(() => {
          return (
            <App
              plugin={this}
              el={el}
              source={source}
              query={query}
              // config={config}
              config={configStore}
              setConfigStore={setConfigStore}
              ctx={ctx}
              dataviewAPI={dataviewAPI}
              uid={uid}
              queryResultStore={queryResultStore}
              setQueryResultStore={setQueryResultStore}
            />
          );
        }, el);

        const mdChild = new MarkdownRenderChild(el);
        mdChild.register(() => {
          dispose();
          // removeOnClick();
          setQueryResultStore((prev) => {
            delete prev[uid];
            return prev;
          });
        });
        ctx.addChild(mdChild);
      },
    );
  }
}
