import { DataviewAPI, DataviewQueryResult, PropertyType } from "@/lib/types";
import { Table } from "@/components/Table";
import {
  App,
  MarkdownPostProcessorContext,
  Menu,
  Modal,
  Notice,
  setIcon,
  Setting,
  TextComponent,
} from "obsidian";
import {
  onMount,
  Show,
  createSignal,
  createMemo,
  createContext,
  useContext,
  onCleanup,
  createUniqueId,
} from "solid-js";
import {
  getIdColumnIndex,
  getPropertyTypes,
  registerDataviewEvents,
  unregisterDataviewEvents,
} from "@/lib/util";
import { CodeBlockConfig, CodeBlockConfigModal } from "./Config";
import DataEdit from "@/main";
import { Icon } from "@/components/Icon";
import { DropdownWidgetManager } from "@/classes";
import { setBlockConfig } from "@/util/mutation";
import { toFirstUpperCase, toNumber } from "@/util/pure";

type CodeBlockProps = {
  plugin: DataEdit;
  source: string;
  el: HTMLElement;
  ctx: MarkdownPostProcessorContext;
  query: string;
  config: CodeBlockConfig;
  dataviewAPI: DataviewAPI;
  propertyNames: string[];
};

export type BlockContext = {
  plugin: DataEdit;
  el: HTMLElement;
  ctx: MarkdownPostProcessorContext;
  source: string;
  query: string;
  config: CodeBlockConfig;
  dataviewAPI: DataviewAPI;
  uid: string;
  hideLastId: boolean;
};
const defaultBlockContext: BlockContext = {
  plugin: {} as DataEdit,
  el: {} as HTMLElement,
  ctx: {} as MarkdownPostProcessorContext,
  source: "",
  query: "",
  config: {} as CodeBlockConfig,
  dataviewAPI: {} as DataviewAPI,
  uid: "",
  hideLastId: false,
};
const BlockContext = createContext<BlockContext>({ ...defaultBlockContext });

export const useBlock = () => useContext(BlockContext);

type Pagination = {
  /**
   * zero-based index
   */
  shownStart: number;
  /**
   * zero-based index
   */
  shownEnd: number;
  resultCount: number;
  pageCount: number;
};

export const CodeBlock = (props: CodeBlockProps) => {
  const uid = createUniqueId();
  const [propertyTypes, setPropertyTypes] = createSignal<PropertyType[]>([]);
  const [idColIndex, setIdColIndex] = createSignal(0);
  const [dataviewResult, setDataviewResult] = createSignal<DataviewQueryResult>(
    {
      successful: true,
      value: { headers: [], values: [], type: "table" },
    },
  );
  const [pagination, setPagination] = createSignal<Pagination>({
    shownStart: 0,
    shownEnd: 0,
    resultCount: 0,
    pageCount: 0,
  });

  const updatePropertyTypes = () => {
    // registerDropdownType();
    const arr = getPropertyTypes(
      props.propertyNames,
      props.plugin.app.metadataCache,
    );
    setPropertyTypes(() => arr);
  };

  const updateIdColIndex = (dataviewResult: DataviewQueryResult) => {
    if (!dataviewResult.successful) return;
    const id = getIdColumnIndex(
      dataviewResult.value.headers,
      props.dataviewAPI.settings.tableIdColumnName,
    );
    setIdColIndex(id);
  };

  const overrideEditButton = async () =>
    // ...params: ConstructorParameters<typeof CodeBlockConfigModal>
    {
      // Have to wait for obsidian to render the usual button
      await Promise.resolve();
      const { source, el, plugin, ctx, config } = props;
      const [queryStr, configStr] = source.split(/\n^---$\n/m);
      const btnEl = el.parentElement!.find("div.edit-block-button");
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
                      "```dataedit\n" + source + "\n```",
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
                const info = ctx.getSectionInfo(el);
                const editor = plugin.app.workspace.activeEditor?.editor;
                if (!info || !editor)
                  return new Notice("Failed to delete block");
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
              .setIcon("wrench")
              .onClick(() => {
                new CodeBlockConfigModal(plugin.app, config, {
                  ctx,
                  el,
                  plugin,
                  source,
                }).open();
              }),
          )
          .addItem((item) =>
            item
              .setTitle(config.showToolbar ? "Hide toolbar" : "Show toolbar")
              .setIcon(config.showToolbar ? "eye-off" : "eye")
              .onClick(() =>
                setBlockConfig({
                  ctx,
                  el,
                  plugin,
                  source,
                  newConfig: { ...config, showToolbar: !config.showToolbar },
                }),
              ),
          )
          .addItem((item) =>
            item
              .setTitle("Undo update")
              .setIcon("corner-up-left")
              .onClick(async () => await plugin.undoUpdate()),
          )
          .addItem((item) =>
            item
              .setTitle("Redo update")
              .setIcon("corner-up-right")
              .onClick(async () => await plugin.redoUpdate()),
          )
          .addSeparator()
          .addItem((item) =>
            item
              .setTitle("Manage dropdowns")
              .setIcon("chevron-down-circle")
              .onClick(() => {
                new DropdownWidgetManager(plugin).open();
              }),
          );

        menu.showAtMouseEvent(e);
      };

      setIcon(newBtn, "settings");

      btnEl.insertAdjacentElement("afterend", newBtn);
      btnEl.style.display = "none";
    };

  // memoizing isn't playing nice with dataview event callbacks...?
  // for now it doesn't matter since these props should never actually change without obsidian causing a rerender automatically
  const updateResults = () => {
    (async () => {
      const { pageSize, currentPage: preCurrentPage } = props.config;
      const results = await props.dataviewAPI.query(props.query);
      if (results.value?.values) {
        const resultCount = results.value.values.length;
        const pageCount = Math.ceil(resultCount / pageSize);
        const currentPage = preCurrentPage > pageCount ? 0 : preCurrentPage;
        const start = pageSize * currentPage;
        const preEnd = pageSize * (currentPage + 1);
        const end = preEnd > resultCount ? resultCount : preEnd;

        setPagination(() => ({
          shownStart: start,
          shownEnd: end,
          resultCount: resultCount,
          pageCount: pageCount,
        }));

        if (pageSize > 0) {
          const paginated = results.value?.values.filter(
            (_, i) => i >= start && i < end,
          );
          results.value.values = paginated;
        }
      }
      setDataviewResult(results);
      updateIdColIndex(results);
      updatePropertyTypes();
    })();
  };

  // createEffect(() => {
  //   console.log("settings changed");
  //   setPluginSignal((prev) => {
  //     prev.settings = settingsSignal();
  //     return prev;
  //   });
  // });

  onMount(() => {
    overrideEditButton();
    updateResults();
    registerDataviewEvents(props.plugin, updateResults);
    props.plugin.app.metadataTypeManager.on(
      "changed",
      updatePropertyTypes,
      props.ctx,
    );
  });

  onCleanup(() => {
    unregisterDataviewEvents(props.plugin, updateResults);
    props.plugin.app.metadataTypeManager.off("changed", updatePropertyTypes);
  });

  return (
    <Show
      when={
        dataviewResult().successful && dataviewResult().value!.headers.length
      }
    >
      ID: {uid}
      <BlockContext.Provider
        value={{
          plugin: props.plugin,
          // plugin: pluginSignal(),
          el: props.el,
          ctx: props.ctx,
          source: props.source,
          query: props.query,
          config: props.config,
          dataviewAPI: props.dataviewAPI,
          uid: uid,
          hideLastId: false,
        }}
      >
        <div style={{ "overflow-x": "auto", height: "fit-content" }}>
          <Table
            properties={props.propertyNames}
            headers={dataviewResult().value!.headers}
            values={dataviewResult().value!.values}
            propertyTypes={propertyTypes()}
            idColIndex={idColIndex()}
          />
          <Show when={props.config.showToolbar}>
            <Toolbar
              {...pagination()}
              app={props.plugin.app}
              config={props.config}
              updateBlockConfig={(
                cb: (config: CodeBlockConfig) => CodeBlockConfig,
              ) => {
                const { ctx, el, plugin, source } = props;
                const newConfig = cb(props.config);
                setBlockConfig({
                  newConfig,
                  ctx,
                  el,
                  plugin,
                  source,
                });
              }}
            />
          </Show>
        </div>
      </BlockContext.Provider>
    </Show>
  );
};

type UpdateBlockConfig = (
  cb: (config: CodeBlockConfig) => CodeBlockConfig,
) => void;

const Toolbar = (
  props: Pagination & {
    app: App;
    config: CodeBlockConfig;
    updateBlockConfig: UpdateBlockConfig;
  },
) => {
  let pageNumberDiv: HTMLDivElement;
  let pageResultDiv: HTMLDivElement;

  const trueCurrentPage = createMemo(() => {
    const {
      config: { currentPage },
      pageCount,
    } = props;
    if (currentPage > pageCount) return 0;
    return currentPage;
  }, props.config.currentPage);

  const changePage = (isForward: boolean) => {
    const currentPage = trueCurrentPage();
    const offset = isForward ? 1 : -1;
    const newPage = currentPage + offset;
    props.updateBlockConfig((prev) => ({ ...prev, currentPage: newPage }));
  };

  const setPage = (n: number) => {
    props.updateBlockConfig((prev) => ({ ...prev, currentPage: n }));
  };

  const createPageNumberMenu = (e: MouseEvent) => {
    if (!pageNumberDiv) {
      throw new Error("No div found for page number div");
    }

    const currentPage = trueCurrentPage();

    const menu = new Menu().setNoIcon();
    for (let i = 0; i < props.pageCount; i++) {
      menu.addItem((cmp) => {
        // cmp.iconEl.remove();
        cmp
          .setTitle((i + 1).toString())
          .setChecked(i === currentPage)
          .onClick(() => setPage(i));
      });
    }

    menu.showAtMouseEvent(e);
  };

  const createPageResultMenu = (e: MouseEvent) => {
    if (!pageResultDiv) {
      throw new Error("No div found for page result div");
    }

    const modal = new Modal(props.app).setTitle("Update page size");

    let inputCmp: TextComponent;
    new Setting(modal.contentEl)
      .setName("Page size")
      .setDesc("Must be zero or greater. If zero, no page size will be set.")
      .addText((cmp) => {
        cmp.inputEl.setAttribute("type", "number");
        cmp.inputEl.setAttribute("min", "0");
        cmp.setValue(props.config.pageSize.toString());
        cmp.setPlaceholder("unlimited");
        inputCmp = cmp;
      });

    new Setting(modal.contentEl)
      .addButton((cmp) =>
        cmp.setButtonText("cancel").onClick(() => modal.close()),
      )
      .addButton((cmp) =>
        cmp
          .setCta()
          .setButtonText("update")
          .onClick(() => {
            const newPageSize = toNumber(inputCmp.getValue(), 0, 0);
            props.updateBlockConfig((prev) => ({
              ...prev,
              pageSize: newPageSize,
            }));
            modal.close();
          }),
      );

    modal.open();
  };

  return (
    <div class="dataedit-toolbar">
      <div
        aria-label="Set page size"
        class="clickable-icon"
        ref={(r) => (pageResultDiv = r)}
        onClick={(e) => createPageResultMenu(e)}
      >
        <Show
          when={props.config.pageSize > 0}
          fallback={<>{props.resultCount} results</>}
        >
          {props.shownStart + 1} - {props.shownEnd} of {props.resultCount}{" "}
          results
        </Show>
      </div>
      <Show when={props.config.pageSize > 0}>
        {/* <Separator /> */}
        <div class="dataedit-pagination-container">
          <Icon
            aria-label="Previous page"
            iconId="chevron-left"
            class="clickable-icon"
            onClick={() => changePage(false)}
          />
          <div
            aria-label="Select page"
            ref={(r) => (pageNumberDiv = r)}
            class="clickable-icon"
            onClick={(e) => createPageNumberMenu(e)}
          >
            {trueCurrentPage() + 1} of {props.pageCount}
          </div>
          <Icon
            aria-label="Next page"
            iconId="chevron-right"
            class="clickable-icon"
            onClick={() => changePage(true)}
          />
        </div>
      </Show>
      <HorizontalAlignmentButton
        app={props.app}
        alignment={props.config.horizontalAlignment}
        updateBlockConfig={props.updateBlockConfig}
      />
      <VerticalAlignmentButton
        app={props.app}
        alignment={props.config.verticalAlignment}
        updateBlockConfig={props.updateBlockConfig}
      />
    </div>
  );
};

const HorizontalAlignmentButton = (props: {
  app: App;
  alignment: CodeBlockConfig["horizontalAlignment"];
  updateBlockConfig: UpdateBlockConfig;
}) => {
  const iconMap: Record<typeof props.alignment, string> = {
    left: "align-left",
    center: "align-justify",
    right: "align-right",
  };

  const onClick = (e: MouseEvent) => {
    const menu = new Menu();

    Object.keys(iconMap).forEach((k) => {
      const key = k as keyof typeof iconMap;
      menu.addItem((item) =>
        item
          .setIcon(iconMap[key])
          .setTitle(toFirstUpperCase(key))
          .onClick(() =>
            props.updateBlockConfig((prev) => ({
              ...prev,
              horizontalAlignment: key,
            })),
          ),
      );
    });

    menu.showAtMouseEvent(e);
  };

  return (
    <Icon
      aria-label="Horizontal alignment"
      class="clickable-icon"
      iconId={iconMap[props.alignment]}
      onClick={onClick}
    />
  );
};

const VerticalAlignmentButton = (props: {
  app: App;
  alignment: CodeBlockConfig["verticalAlignment"];
  updateBlockConfig: UpdateBlockConfig;
}) => {
  const iconMap: Record<typeof props.alignment, string> = {
    top: "chevrons-up",
    middle: "chevrons-down-up",
    bottom: "chevrons-down",
  };

  const onClick = (e: MouseEvent) => {
    const menu = new Menu();

    Object.keys(iconMap).forEach((k) => {
      const key = k as keyof typeof iconMap;
      menu.addItem((item) =>
        item
          .setIcon(iconMap[key])
          .setTitle(toFirstUpperCase(key))
          .setChecked(k === props.alignment)
          .onClick(() =>
            props.updateBlockConfig((prev) => ({
              ...prev,
              verticalAlignment: key,
            })),
          ),
      );
    });

    menu.showAtMouseEvent(e);
  };

  return (
    <Icon
      aria-label="Vertical alignment"
      class="clickable-icon"
      iconId={iconMap[props.alignment]}
      onClick={onClick}
    />
  );
};

/**
 * SVG icon from Radix Icons
 * @license MIT
 * @link https://github.com/radix-ui/icons
 */
const Separator = () => (
  <div class="dataedit-toolbar-separator">
    <div>&nbsp;</div>
    {/* <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7.5 2C7.77614 2 8 2.22386 8 2.5L8 12.5C8 12.7761 7.77614 13 7.5 13C7.22386 13 7 12.7761 7 12.5L7 2.5C7 2.22386 7.22386 2 7.5 2Z"
        fill="currentColor"
        fill-rule="evenodd"
        clip-rule="evenodd"
      ></path>
    </svg> */}
  </div>
);

class AlignmentMoenu extends Menu {
  constructor() {
    super();
  }
}
