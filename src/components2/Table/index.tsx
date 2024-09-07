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
  onCleanup,
  Setter,
  useContext,
} from "solid-js";
import { PropertyHeader, PropertyData } from "../Property";
import { useBlock } from "../CodeBlock";
import { checkIfDataviewLink } from "@/lib/util";
import { Icon } from "@/components/Icon";
import { DOMElement } from "solid-js/jsx-runtime";
import { debounce } from "obsidian";
import { createStore } from "solid-js/store";
import { moveColumn } from "@/lib2/utils";

type DragContextValue = {
  draggedIndex: number;
  draggedOverIndex: number;
};

const defaultDragContextValue: DragContextValue = {
  draggedIndex: NaN,
  draggedOverIndex: NaN,
};

type DragContextProps = {
  context: DragContextValue;
  setContext: (cb: (previous: DragContextValue) => DragContextValue) => void;
};

const DragContext = createContext<DragContextProps>({
  context: defaultDragContextValue,
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
  const [dragContext, setDragContext] = createStore<DragContextValue>(
    defaultDragContextValue,
  );

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

  return (
    <DragContext.Provider
      value={{ context: dragContext, setContext: setDragContext }}
    >
      <table class="dataedit-table" style={{ width: "fit-content" }}>
        <thead>
          <tr>
            <ColumnReorderButtonContainer properties={props.properties} />
          </tr>
          <tr>
            <For each={props.properties}>
              {(item, index) => (
                <th
                  classList={{
                    "dataedit-is-selected":
                      dragContext.draggedIndex === index(),
                    top: true,
                    "dataedit-is-dragged-over":
                      dragContext.draggedOverIndex === index(),
                    right: dragContext.draggedIndex < index(),
                    left: dragContext.draggedIndex > index(),
                  }}
                  style={{
                    "vertical-align": getVertical(),
                    "text-align": getHorizontal(),
                  }}
                >
                  <PropertyHeader
                    header={props.headers[index()]}
                    property={item}
                    propertyType={props.propertyTypes[index()]}
                  />
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
    console.log("dragged over: ", dctx.context.draggedOverIndex);
  });

  return (
    <For each={props.properties}>
      {(item, index) => (
        <th>
          <ColumnReorderButton
            index={index()}
            property={item}
            recordBounds={recordBounds}
            boundsArr={boundsArr()}
          />
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

  const onmousemove = (e: MouseEvent) => {
    if (!isGrabbing()) return;
    const diff = e.pageX - lastMousePos;
    setTransform(diff);
    const [left, right] = props.boundsArr[props.index];
    const middle = (right + left) / 2 + transform();
    props.boundsArr.forEach((arr, index) => {
      if (!(middle >= arr[0] && middle <= arr[1])) return;
      if (dragCtx.context.draggedOverIndex === index) return;
      console.log("index should be set");
      dragCtx.setContext((prev) => ({ ...prev, draggedOverIndex: index }));
      return;
    });
  };

  const onmouseup = (e: MouseEvent) => {
    if (!isGrabbing()) return;

    moveColumn({
      indexFrom: props.index,
      indexTo: dragCtx.context.draggedOverIndex,
      blockContext: bctx,
    });

    lastMousePos = 0;
    setTransform(0);
    document.removeEventListener("mouseup", onmouseup);
    document.removeEventListener("mousemove", onmousemove);
    dragCtx.setContext((prev) => ({
      ...prev,
      draggedIndex: NaN,
      draggedOverIndex: NaN,
    }));
    setGrabbing(false);
  };

  const onMouseDown = (
    e: MouseEvent & {
      currentTarget: HTMLSpanElement;
      target: DOMElement;
    },
  ) => {
    dragCtx.setContext((prev) => ({
      ...prev,
      draggedIndex: props.index,
      draggedOverIndex: props.index,
    }));
    setGrabbing(true);
    setTransform(0);
    lastMousePos = e.pageX;
    document.addEventListener("mouseup", onmouseup);
    document.addEventListener("mousemove", onmousemove);
  };

  onCleanup(() => {
    document.removeEventListener("mouseup", onmouseup);
    document.removeEventListener("mousemove", onmousemove);
  });

  return (
    <div
      ref={async (r) => {
        // I'm not sure if this is the right approach
        // The idea is to allow CSS to resize the elements
        // but the width is needed when we change position to absolute

        const update = debounce(
          () => {
            const w = r.offsetWidth;
            setWidth(w);
            const { left, right } = r.getBoundingClientRect();
            props.recordBounds(left, right, props.index);
            observer.disconnect();
          },
          100,
          true,
        );

        const observer = new ResizeObserver(() => {
          update();
        });

        observer.observe(r);
      }}
      class="column-reorder-button"
      data-grabbing={isGrabbing().toString()}
      onMouseDown={onMouseDown}
      style={
        isGrabbing()
          ? {
              position: "absolute",
              width: width() + "px",
              translate: transform() + "px 0px",
            }
          : {}
      }
    >
      <Icon
        iconId="grip-horizontal"
        style={{
          display: "flex",
          "align-items": "end",
          "justify-content": "center",
        }}
      />
    </div>
  );
};
