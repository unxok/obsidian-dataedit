import {
  DataviewLink,
  DataviewPropertyValue,
  DataviewQueryResultValues,
  PropertyType,
} from "@/lib/types";
import {
  Accessor,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  For,
  JSX,
  onCleanup,
  Setter,
  useContext,
} from "solid-js";
import { PropertyData } from "../Property";
import { useBlock } from "../CodeBlock";
import { checkIfDataviewLink } from "@/lib/util";
import { Icon } from "@/components/Icon";
import { DOMElement } from "solid-js/jsx-runtime";
import {
  AbstractInputSuggest,
  App,
  debounce,
  Modal,
  Notice,
  SearchComponent,
  Setting,
  TFile,
  TFolder,
} from "obsidian";
import { createStore } from "solid-js/store";
import { moveColumn } from "@/lib2/utils";
import { PropertyHeader } from "../Property/PropertyHeader";
import { relative } from "path";
import { createFilter } from "@kobalte/core";

type DragContextValue = {
  draggedIndex: number;
  draggedOverIndex: number;
};

const defaultDragContextValue: DragContextValue = {
  draggedIndex: -1,
  draggedOverIndex: -1,
};

type DragContextProps = {
  context: DragContextValue;
  setContext: (cb: (previous: DragContextValue) => DragContextValue) => void;
};

const DragContext = createContext<DragContextProps>({
  context: { ...defaultDragContextValue },
  setContext: () => {},
});

export const useDragContext = () => {
  const ctx = useContext(DragContext);

  if (!ctx) {
    throw new Error(
      "useDragContext must be used within a DragContext.Provider",
    );
  }

  return ctx;
};

export const Table = (props: {
  properties: string[];
  headers: string[];
  values: DataviewQueryResultValues;
  propertyTypes: PropertyType[];
  idColIndex: number;
}) => {
  const bctx = useBlock();
  const [dragContext, setDragContext] = createStore<DragContextValue>({
    ...defaultDragContextValue,
  });
  const [boundsArr, setBoundsArr] = createSignal<
    [left: number, right: number][]
  >(props.properties.map(() => [0, 0]));

  const getVertical = () => {
    return bctx.config.verticalAlignment;
  };
  const getHorizontal = () => {
    return bctx.config.horizontalAlignment;
  };

  const getFilePath = (rowIndex: number) => {
    const fileColValue = props.values[rowIndex][props.idColIndex];

    let filePath = "";
    if (checkIfDataviewLink(fileColValue)) {
      filePath = (fileColValue as DataviewLink).path;
    }
    return filePath;
  };

  const recordBounds = (left: number, right: number, index: number) => {
    setBoundsArr((prev) => {
      const copy = [...prev];
      copy[index] = [left, right];
      return copy;
    });
  };

  const getThClassList = (index: number) => {
    return {
      top: true,
      "dataedit-is-selected": dragContext.draggedIndex === index,
      "dataedit-is-dragged-over": dragContext.draggedOverIndex === index,
      right: dragContext.draggedIndex < index,
      left: dragContext.draggedIndex > index,
    };
  };

  return (
    <DragContext.Provider
      value={{ context: dragContext, setContext: setDragContext }}
    >
      <div
        data-dataedit-scroll-el={true}
        style={{
          position: "relative",
          padding: "var(--size-4-4)",
          contain: "paint !important",
          "overflow-wrap": "normal",
          "word-break": "normal",
          "white-space": "normal",
          margin: "0 calc(-1 * var(--size-4-4)) !important",
          "overflow-x": "auto",
          "overflow-y": "hidden",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "fit-content",
            overflow: "visible",
          }}
        >
          <table class="dataedit-table" style={{ width: "fit-content" }}>
            <thead>
              {/* <tr>
              <ColumnReorderButtonContainer properties={props.properties} />
            </tr> */}
              <tr>
                <For each={props.properties}>
                  {(item, index) => (
                    <th
                      classList={getThClassList(index())}
                      style={{
                        "vertical-align": getVertical(),
                        "text-align": getHorizontal(),
                        position: "relative",
                        overflow: "visible",
                      }}
                    >
                      <PropertyHeader
                        header={props.headers[index()]}
                        property={item}
                        propertyType={props.propertyTypes[index()]}
                        index={index()}
                      >
                        <ColumnReorderButton
                          property={item}
                          boundsArr={boundsArr()}
                          index={index()}
                          recordBounds={recordBounds}
                        />
                      </PropertyHeader>
                    </th>
                  )}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={props.values}>
                {(row, rowIndex) => (
                  <tr>
                    <For each={row}>
                      {(item, itemIndex) => (
                        <td
                          classList={{
                            "dataedit-is-selected":
                              dragContext.draggedIndex === itemIndex(),
                            bottom: rowIndex() === props.values.length - 1,
                            "dataedit-is-dragged-over":
                              dragContext.draggedOverIndex === itemIndex(),
                            right: dragContext.draggedIndex < itemIndex(),
                            left: dragContext.draggedIndex > itemIndex(),
                          }}
                          style={{
                            "vertical-align": getVertical(),
                            "text-align": getHorizontal(),
                          }}
                        >
                          <PropertyData
                            property={props.properties[itemIndex()]}
                            value={item}
                            propertyType={props.propertyTypes[itemIndex()]}
                            header={props.headers[itemIndex()]}
                            filePath={getFilePath(rowIndex())}
                          />
                        </td>
                      )}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
          <div
            class="dataedit-table-row-btn"
            aria-label="Add row after"
            onClick={() => {
              const modal = new AddRowModal(bctx.plugin.app);
              modal.open();
            }}
          >
            <Icon iconId="plus" />
          </div>
          <div class="dataedit-table-col-btn" aria-label="Add column after">
            <Icon iconId="plus" />
          </div>
        </div>
      </div>
    </DragContext.Provider>
  );
};

const ColumnReorderButton = (props: {
  index: number;
  property: string;
  recordBounds: (left: number, right: number, index: number) => void;
  boundsArr: [left: number, right: number][];
}) => {
  // later this could probably just be in parent
  const dragCtx = useDragContext();
  const bctx = useBlock();

  const [isGrabbing, setGrabbing] = createSignal(false);
  const [transform, setTransform] = createSignal(0);
  let lastMousePos = 0;
  let ref: HTMLDivElement;

  const onmousemove = (e: MouseEvent) => {
    console.log("mouse move called from: ", bctx.uid);
    if (!isGrabbing()) return;
    const diff = e.pageX - lastMousePos;
    setTransform(diff);
    const [left, right] = props.boundsArr[props.index];
    const middle = (right + left) / 2 + transform();
    props.boundsArr.forEach((arr, index) => {
      if (!(middle >= arr[0] && middle <= arr[1])) return;
      if (dragCtx.context.draggedOverIndex === index) return;
      dragCtx.setContext((prev) => ({ ...prev, draggedOverIndex: index }));
      return;
    });
  };

  const onmouseup = (e: MouseEvent) => {
    const cleanup = () => {
      lastMousePos = 0;
      setTransform(0);
      document.removeEventListener("mouseup", onmouseup);
      document.removeEventListener("mousemove", onmousemove);
      dragCtx.setContext(() => ({
        draggedIndex: -1,
        draggedOverIndex: -1,
      }));
      setGrabbing(false);
    };

    if (!isGrabbing()) return;
    const { draggedIndex, draggedOverIndex } = dragCtx.context;
    console.log(draggedIndex, " ", draggedOverIndex);
    if (draggedIndex === -1 || draggedOverIndex === -1) return cleanup();
    if (draggedIndex === draggedOverIndex) return cleanup();

    moveColumn({
      indexFrom: props.index,
      indexTo: dragCtx.context.draggedOverIndex,
      blockContext: bctx,
    });

    cleanup();
  };

  const onMouseDown = (
    e: MouseEvent & {
      currentTarget: HTMLSpanElement;
      target: DOMElement;
    },
  ) => {
    e.preventDefault();
    dragCtx.setContext(() => ({
      draggedIndex: props.index,
      draggedOverIndex: props.index,
    }));
    setGrabbing(true);
    setTransform(0);
    lastMousePos = e.pageX;
    console.log("about to add listeners");
    document.addEventListener("mouseup", onmouseup);
    document.addEventListener("mousemove", onmousemove);
  };

  let timerRef = 0;

  createEffect(() => {
    dragCtx.context.draggedIndex;
    const { left, right } = ref.getBoundingClientRect();
    props.recordBounds(left, right, props.index);
  });

  const getGrabbingStyle: () => JSX.CSSProperties = () => {
    if (isGrabbing()) {
      return { translate: "calc(-50% + " + transform() + "px) 0%" };
    }
    return {};
  };

  onCleanup(() => {
    window.clearTimeout(timerRef);
    document.removeEventListener("mouseup", onmouseup);
    document.removeEventListener("mousemove", onmousemove);
  });

  return (
    <div
      ref={async (r) => (ref = r)}
      data-dataedit-column-reorder-button={true}
      class="dataedit-column-reorder-button"
      data-grabbing={isGrabbing().toString()}
      data-hidden={!isGrabbing() && dragCtx.context.draggedIndex !== -1}
      onMouseDown={onMouseDown}
      style={{
        ...{
          position: "absolute",
          translate: "-50% 0%",
          bottom: "100%",
          left: "50%",
        },
        ...getGrabbingStyle(),
      }}
    >
      <Icon
        iconId="grip-horizontal"
        style={{
          display: "flex",
          "align-items": "end",
          "justify-content": "center",
          "pointer-events": "none",
        }}
      />
    </div>
  );
};

class AddRowModal extends Modal {
  rowData: { folder: string; name: string; template: string }[] = [];

  constructor(app: App) {
    super(app);
    // this.createSettingRow.bind(this);
  }

  createSettingRow(
    containerEl: HTMLElement,
    // rowData: typeof this.rowData,
  ): void {
    // TODO why is `this` always undefined in this method??
    // console.log("this: ", this);
    const index = this.rowData.push({ folder: "", name: "", template: "" }) - 1;
    const setting = new Setting(containerEl)
      .addSearch((cmp) => {
        cmp.setPlaceholder("folder");
        new FileFolderSuggest(this.app, cmp, "folders");
        cmp.onChange((v) => (this.rowData[index].folder = v));
      })
      .addText((cmp) =>
        cmp
          .setPlaceholder("note name")
          .onChange((v) => (this.rowData[index].name = v)),
      )
      .addSearch((cmp) => {
        cmp.setPlaceholder("template");
        new FileFolderSuggest(this.app, cmp, "files");
        cmp.onChange((v) => (this.rowData[index].template = v));
      });
    setting.addExtraButton((cmp) =>
      cmp.setIcon("cross").onClick(() => {
        this.rowData = this.rowData.filter((_, i) => i !== index);
        setting.settingEl.remove();
      }),
    );
  }

  onOpen(): void {
    this.setTitle("Create note");
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("p", {
      text: "Enter the details for a new note or notes. You can set default folder and template in the block configuration.",
    });

    const ul = contentEl.createEl("ul");
    ul.createEl("li", { text: 'Do not include trailing slashes ("/")' });
    ul.createEl("li", { text: 'Do not include file extension (".md")' });
    ul.createEl("li", {
      text: "Duplicate folder  + note name combinations will not be created.",
    });
    ul.createEl("li", {
      text: "If note already exists, the creation of that note will fail.",
    });

    const rowContainer = contentEl.createDiv();

    this.createSettingRow(rowContainer);

    new Setting(contentEl).addButton((cmp) =>
      cmp.setIcon("plus").onClick(() => this.createSettingRow(rowContainer)),
    );

    new Setting(contentEl).addButton((cmp) =>
      cmp
        .setCta()
        .setButtonText("create")
        .onClick(() => {
          this.createNotes();
        }),
    );
  }

  async createNotes(): Promise<void> {
    const {
      app: { vault },
      rowData,
    } = this;
    const noteMap = new Map<string, (typeof this.rowData)[0]>();
    const templateSet = new Set<string>();

    rowData.forEach((o) => {
      if (!o.name) return;
      noteMap.set(o.folder + "/" + o.name, o);
      templateSet.add(o.template);
    });

    const templateMap = new Map<string, string>();
    await Promise.all(
      Array.from(templateSet).map(async (v) => {
        const file = vault.getFileByPath(v);
        if (!file) {
          return templateMap.set(v, "");
        }
        const content = await vault.cachedRead(file);
        templateMap.set(v, content);
      }),
    );

    await Promise.all(
      Array.from(noteMap).map(async ([key, o]) => {
        try {
          await vault.create(key + ".md", templateMap.get(o.template) ?? "");
        } catch (e) {
          // file may already exist and will throw
          const msg = (e as Error).message + " -- " + key + ".md";
          new Notice(msg);
          console.error(msg);
        }
      }),
    );

    this.close();
  }
}

class FileFolderSuggest extends AbstractInputSuggest<TFile | TFolder> {
  searchCmp: SearchComponent;
  type: "files" | "folders";
  filter = createFilter({ sensitivity: "base", usage: "search" });

  constructor(app: App, searchCmp: SearchComponent, type: "files" | "folders") {
    super(app, searchCmp.inputEl);
    this.searchCmp = searchCmp;
    this.type = type;
  }

  protected getSuggestions(
    query: string,
  ): (TFile | TFolder)[] | Promise<(TFile | TFolder)[]> {
    const {
      type,
      app: { vault },
      filter,
    } = this;
    const arr = type === "files" ? vault.getFiles() : vault.getAllFolders();
    return arr.filter(
      (f) => filter.contains(f.name, query) || filter.contains(f.path, query),
    );
  }

  renderSuggestion(value: TFile | TFolder, el: HTMLElement): void {
    const { name, path } = value;
    const basename = name.endsWith(".md") ? name.slice(0, -3) : name;
    el.classList.add("mod-complex");
    const contentEl = el.createDiv({ cls: "suggestion-content" });
    contentEl.createDiv({ cls: "suggestion-title", text: basename });
    contentEl.createDiv({ cls: "suggestion-note", text: path });
  }

  selectSuggestion(
    value: TFile | TFolder,
    _: MouseEvent | KeyboardEvent,
  ): void {
    this.searchCmp.setValue(value.path);
    this.searchCmp.onChanged();
    this.close();
  }
}
