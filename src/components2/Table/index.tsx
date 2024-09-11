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
import { debounce } from "obsidian";
import { createStore } from "solid-js/store";
import { moveColumn } from "@/lib2/utils";
import { PropertyHeader } from "../Property/PropertyHeader";
import { relative } from "path";

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
          <div class="dataedit-table-row-btn" aria-label="Add row after">
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

const ColumnReorderButtonContainer = (props: { properties: string[] }) => {
  // const [draggedOverIndex, setDraggedOverIndex] = createSignal(NaN);
  const [boundsArr, setBoundsArr] = createSignal<
    [left: number, right: number][]
  >(props.properties.map(() => [0, 0]));

  const recordBounds = (left: number, right: number, index: number) => {
    setBoundsArr((prev) => {
      const copy = [...prev];
      copy[index] = [left, right];
      return copy;
    });
  };

  const dctx = useDragContext();

  createEffect(() => {
    dctx.context.draggedIndex;
    console.log("dragged index changed");
  });

  return (
    <For each={props.properties}>
      {(item, index) => (
        <th
        // style={{ position: "relative" }}
        >
          <ColumnReorderButton
            index={index()}
            property={item}
            recordBounds={recordBounds}
            boundsArr={boundsArr()}
          />
          {/* <Icon
            iconId="grip-horizontal"
            aria-hidden={true}
            style={{ color: "transparent", background: "transparent" }}
          /> */}
        </th>
      )}
    </For>
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

  const [width, setWidth] = createSignal(0);
  const [isGrabbing, setGrabbing] = createSignal(false);
  const [transform, setTransform] = createSignal(0);
  let lastMousePos = 0;
  let ref: HTMLDivElement;
  let baseDisplay: string;

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
