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
  setIcon,
  Menu,
  MarkdownPreviewRenderer,
} from "obsidian";
import {
  DataviewAPI,
  DataviewQueryResult,
  ModifiedDataviewQueryResult,
} from "./lib/types.ts";
import {
  clampNumber,
  ensureFileLinkColumn,
  getColumnPropertyNames,
  getPropertyTypes,
  splitQueryOnConfig,
  updateMetadataProperty,
} from "./lib/util.ts";
import { createStore } from "solid-js/store";
import { createEffect, createUniqueId, For, onMount, Show } from "solid-js";
import { BlockContext, CodeBlock } from "./components2/CodeBlock/index.tsx";
import {
  CodeBlockConfig,
  CodeBlockConfigModal,
  defaultCodeBlockConfig,
} from "./components2/CodeBlock/Config/index.tsx";

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

type PropertyUpdateRecord = {
  property: string;
  filePath: string;
  oldValue: unknown;
  newValue: unknown;
  itemIndex?: number;
};

export default class DataEdit extends Plugin {
  // TODO make this configurable in plugin settings
  propertyUpdatesLimit: number = 20;
  propertyUpdates: PropertyUpdateRecord[] = [];
  // used to track the current position in undo/redo history
  propertyUpdatesIndex: number = 0;

  onload(): void {
    this.registerMdCBP();
    this.devReload(); // TODO comment out when releasing
  }

  recordUpdate(update: PropertyUpdateRecord): void {
    const arr = [...this.propertyUpdates].slice(this.propertyUpdatesIndex);
    this.propertyUpdatesIndex = 0;
    if (arr.length === this.propertyUpdatesLimit) {
      arr.pop();
    }
    if (arr.length > this.propertyUpdatesLimit) {
      arr.slice(0, this.propertyUpdatesLimit - arr.length);
    }
    arr.unshift(update);
    this.propertyUpdates = arr;
    console.log(arr);
  }

  async getUpdate(): Promise<
    [index: number, limit: number, update?: PropertyUpdateRecord]
  > {
    const {
      propertyUpdatesLimit: limit,
      propertyUpdatesIndex: preIndex,
      propertyUpdates,
    } = this;
    const index = clampNumber(preIndex, 0, limit, true);
    const update = propertyUpdates[index];

    console.log("update: ", update, " index: ", index);
    if (!update) return [index, limit];
    return [index, limit, update];
  }

  async undoUpdate(): Promise<void> {
    const [index, limit, update] = await this.getUpdate();
    if (update) {
      const { property, filePath, oldValue, newValue, itemIndex } = update;
      await this.updateProperty(
        property,
        oldValue, // swapped with newValue since undoing
        filePath,
        newValue,
        itemIndex,
        true,
      );
    }

    if (index < limit) {
      this.propertyUpdatesIndex = index + 1;
    }
  }

  async redoUpdate(): Promise<void> {
    const preIndex = this.propertyUpdatesIndex;
    if (preIndex > 0) {
      this.propertyUpdatesIndex = preIndex - 1;
    }

    const [_, __, update] = await this.getUpdate();
    if (update) {
      const { property, filePath, oldValue, newValue, itemIndex } = update;
      await this.updateProperty(
        property,
        newValue,
        filePath,
        oldValue,
        itemIndex,
        true,
      );
    }
  }

  devReload(): void {
    const { activeEditor } = app.workspace;
    try {
      // @ts-expect-error
      activeEditor.leaf.rebuildView();
    } catch (_) {
      console.log("failed dev reload");
    }
  }

  async overrideEditButton(
    ...params: ConstructorParameters<typeof CodeBlockConfigModal>
  ): Promise<void> {
    await Promise.resolve();
    const [app, form, blockContext] = params;
    const [queryStr, configStr] = blockContext.source.split(/\n^---$\n/m);
    const btnEl = blockContext.el.parentElement!.find("div.edit-block-button");
    if (!btnEl) return;
    const newBtn = document.createElement("div");
    newBtn.className = "edit-block-button";
    newBtn.onclick = (e) => {
      const menu = new Menu()
        .addItem((item) =>
          item
            .setTitle("Edit")
            .setIcon("code-2")
            .onClick(() => {
              btnEl.click();
            }),
        )
        .addItem((item) =>
          item
            .setTitle("Copy")
            .setIcon("copy")
            .setSubmenu()
            .addItem((sub) =>
              sub
                .setTitle("Block")
                .setIcon("code")
                .onClick(async () => {
                  await navigator.clipboard.writeText(
                    "```dataedit\n" + blockContext.source + "\n```",
                  );
                  new Notice("Copied block text to clipboard!");
                }),
            )
            .addItem((sub) =>
              sub
                .setTitle("Query")
                .setIcon("server")
                .onClick(() => {
                  navigator.clipboard.writeText(queryStr);
                  new Notice("Copied query to clipboard!");
                }),
            )
            .addItem((sub) =>
              sub
                .setTitle("Config")
                .setIcon("wrench")
                .onClick(() => {
                  navigator.clipboard.writeText(configStr);
                  new Notice("Copied config to clipboard!");
                }),
            ),
        )
        .addItem((item) =>
          item
            .setTitle("Delete")
            .setIcon("trash")
            .setWarning(true)
            .onClick(() => {
              const { ctx, el } = blockContext;
              const info = ctx.getSectionInfo(el);
              const editor = this.app.workspace.activeEditor?.editor;
              if (!info || !editor) return new Notice("Failed to delete block");
              const { lineStart, lineEnd } = info;
              editor.replaceRange(
                "",
                { ch: 0, line: lineStart },
                { ch: NaN, line: lineEnd },
              );
            }),
        )
        .addSeparator()
        .addItem((item) =>
          item
            .setTitle("Configure")
            .setIcon("sliders-horizontal")
            .onClick(() => {
              new CodeBlockConfigModal(...params).open();
            }),
        )
        .addItem((item) =>
          item
            .setTitle("Undo update")
            .setIcon("corner-up-left")
            .onClick(async () => await this.undoUpdate()),
        )
        .addItem((item) =>
          item
            .setTitle("Redo update")
            .setIcon("corner-up-right")
            .onClick(async () => await this.redoUpdate()),
        );

      menu.showAtMouseEvent(e);
    };

    setIcon(newBtn, "settings");

    btnEl.insertAdjacentElement("afterend", newBtn);
    btnEl.style.display = "none";
  }

  async updateProperty(
    property: string,
    newValue: unknown,
    filePath: string,
    oldValue: unknown,
    itemIndex?: number,
    skipRecord?: boolean,
  ): Promise<void> {
    if (!skipRecord) {
      this.recordUpdate({ property, filePath, newValue, oldValue, itemIndex });
    }
    await updateMetadataProperty(
      property,
      newValue,
      filePath,
      this,
      null,
      oldValue,
      itemIndex,
    );
  }

  registerMdCBP(): void {
    const mdpp = this.registerMarkdownCodeBlockProcessor(
      "dataedit",
      (source, el, ctx) => {
        const [query, configStr = ""] = source.split(/\n^---$\n/m);

        const propertyNames = getColumnPropertyNames(source);

        const preConfig = parseYaml(configStr) ?? {};
        // preConfig is not actually type safe... might use zod later
        const config = {
          ...defaultCodeBlockConfig,
          ...preConfig,
        } as CodeBlockConfig;

        this.overrideEditButton(this.app, config, {
          ctx,
          el,
          source,
          plugin: this,
        });

        const dataviewAPI = getDataviewAPI(this.app);
        if (!dataviewAPI) {
          const msg =
            "Dataedit: Failed to get Dataview API. Is Dataview installed & enabled?";
          new Notice(msg, 5000);
          return;
        }

        el.className += " " + config.containerClass;
        // best practice by Obsidian, but solid may do this anyway
        el.empty();
        // since mouse will often be inside table, the box shadow is annoying to me
        // I guess I should make this a confi option eventually?
        el.parentElement!.style.boxShadow = "none";

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
            />
          ),
          el,
        );

        // ensures solid disposes of itself properly when element is unloaded
        const mdr = new MarkdownRenderChild(el);
        mdr.register(dispose);
        ctx.addChild(mdr);
      },
    );
  }
}
