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
  MarkdownPostProcessor,
  parseYaml,
  MarkdownPostProcessorContext,
} from "obsidian";
import {
  DataviewAPI,
  DataviewQueryResult,
  ModifiedDataviewQueryResult,
} from "./lib/types.ts";
import {
  ensureFileLinkColumn,
  getColumnPropertyNames,
  getPropertyTypes,
  splitQueryOnConfig,
} from "./lib/util.ts";
import { createStore } from "solid-js/store";
import { createEffect, createUniqueId, For, onMount, Show } from "solid-js";
import { CodeBlock } from "./components2/CodeBlock/index.tsx";

const getDataviewAPI = (pApp?: ObsidianApp) => {
  if (pApp) {
    // @ts-ignore
    const { plugins } = pApp.plugins;
    if (plugins.hasOwnProperty("dataview")) {
      // @ts-ignore TODO obsidian-typings messed up this type
      return plugins.dataview.api as DataviewAPI;
    }
  }
  // @ts-ignore
  const gPlugins = app.plugins.plugins;
  if (gPlugins.hasOwnProperty("dataview")) {
    // @ts-ignore TODO obsidian-typings messed up this type
    return gPlugins.dataview.api as DataviewAPI;
  }
  return null;
};

// export default class DataEdit extends Plugin {
//   async onload(): Promise<void> {
//     // @ts-ignore
//     await app.plugins.loadPlugin("dataview");
//     // const dataviewAPI = getAPI(this.app) as DataviewAPI;

//     this.registerMarkdownCodeBlockProcessor(
//       "dataedit",
//       async (preSource, el, ctx) => {
//         el.empty();
//         el.classList.toggle("twcss", true);
//         el.parentElement!.style.boxShadow = "none";

//         const { source, hide: hideFileCol } = ensureFileLinkColumn(preSource);

//         const uid = createUniqueId();
//         const dataviewAPI = getDataviewAPI(this.app) as DataviewAPI;
//         const { query, config } = splitQueryOnConfig(source);
//         const [configStore, setConfigStore] = createStore(config);

//         // obsidian reccomends this approach according to https://forum.obsidian.md/t/how-to-listen-for-toggling-reading-view/67709/2
//         const observer = new MutationObserver((mutations) => {
//           // use some() so we can end the loop early
//           mutations.some((mut) => {
//             if (mut.attributeName !== "data-mode") return false;
//             // using the old value seems to be the most consistent because checking attribute values from the DOM inside a MO can have gotchas
//             const mode = mut.oldValue;
//             console.log("got mode: ", mode);
//             if (mode === "source") {
//               setConfigStore("lockEditing", true);
//               return true;
//             }
//             if (mode === "preview") {
//               setConfigStore("lockEditing", false);
//               return true;
//             }
//             // in case mode is something unexpected
//             return false;
//           });
//         });

//         // TODO this breaks with using markdown editors in the table
//         const watchEditMode = async () => {
//           await new Promise<void>((res) => setTimeout(res, 0));
//           const container = el.closest("[data-mode]");
//           if (!container) {
//             // throw new Error("Unable to find container element");
//             return;
//           }
//           observer.observe(container, {
//             attributes: true,
//             attributeOldValue: true,
//           });

//           // mutation won't run callback on instantiation so we check here
//           const mode = container.getAttribute("data-mode");
//           console.log("mode: ", mode);
//           if (mode === "preview") {
//             setConfigStore("lockEditing", true);
//           }
//           // if (mode === "source") {
//           //   setConfigStore("lockEditing", false);
//           // }
//         };

//         // watchEditMode();

//         // for some reason, doing this as a signal inside each <App /> causes glitches when updating from dataview events
//         // but this works just fine
//         /*
//           TODO after coming back to see this and seeing the above comments, this is being created in each code block register callback... which doesn't make sense that this works but doing the store within <App /> doesn't work? I need to figure out what the true issue was before and why this works to figure out what the actual way to do this should be.
//         */
//         const [queryResultStore, setQueryResultStore] = createStore<
//           Record<string, ModifiedDataviewQueryResult>
//         >({});
//         const dispose = render(() => {
//           return (
//             <App
//               plugin={this}
//               el={el}
//               source={source}
//               query={query}
//               // config={config}
//               config={configStore}
//               setConfigStore={setConfigStore}
//               ctx={ctx}
//               dataviewAPI={dataviewAPI}
//               uid={uid}
//               queryResultStore={queryResultStore}
//               setQueryResultStore={setQueryResultStore}
//               hideFileCol={hideFileCol}
//             />
//           );
//         }, el);

//         const mdChild = new MarkdownRenderChild(el);
//         mdChild.register(() => {
//           dispose();
//           // removeOnClick();
//           setQueryResultStore((prev) => {
//             delete prev[uid];
//             return prev;
//           });
//         });
//         ctx.addChild(mdChild);
//       },
//     );
//   }
// }

/////////////////////////////////////////////////////////////////////////

export type CodeBlockConfig = {
  hello: string;
};

export const defaultCodeBlockConfig: CodeBlockConfig = {
  hello: "world",
};

export default class DataEdit extends Plugin {
  onload(): void {
    this.registerMdCBP();
  }

  registerMdCBP(): void {
    this.registerMarkdownCodeBlockProcessor("dataedit", (source, el, ctx) => {
      const [query, configStr = ""] = source.split(/\n^---$\n/gm);

      const propertyNames = getColumnPropertyNames(source);
      const propertyTypes = getPropertyTypes(
        propertyNames,
        this.app.metadataCache,
      );

      const preConfig = parseYaml(configStr) ?? {};
      // preConfig is not actually type safe... might use zod later
      const config = {
        ...defaultCodeBlockConfig,
        ...preConfig,
      } as CodeBlockConfig;

      const dataviewAPI = getDataviewAPI(this.app);
      if (!dataviewAPI) {
        const msg =
          "Dataedit: Failed to get Dataview API. Is Dataview installed & enabled?";
        new Notice(msg, 5000);
        return;
      }

      // best practice by Obsidian, but solid may do this anyway
      el.empty();

      // entrypoint for Solid
      const dispose = render(
        () => (
          <CodeBlock
            plugin={this}
            source={source}
            el={el}
            ctx={ctx}
            query={query}
            config={config}
            dataviewAPI={dataviewAPI}
            propertyNames={propertyNames}
            propertyTypes={propertyTypes}
          />
        ),
        el,
      );

      // ensures solid disposes of itself properly when element is unloaded
      const mdr = new MarkdownRenderChild(el);
      mdr.register(dispose);
      ctx.addChild(mdr);
    });
  }
}
