import {
  createContext,
  createEffect,
  createMemo,
  // createEffect,
  createSignal,
  For,
  onCleanup,
  Setter,
  Show,
  useContext,
} from "solid-js";
import "./App.css";
import { MarkdownPostProcessorContext } from "obsidian";
import { Markdown } from "./components/Markdown";
import DataEdit from "./main";
import {
  DataviewAPI,
  DataviewLink,
  DataviewPropertyValue,
  DataviewQueryResult,
  DataviewQueryResultFail,
  DataviewQueryResultHeaders,
  DataviewQueryResultSuccess,
  DataviewQueryResultValues,
  ModifiedDataviewQueryResult,
  PropertyValueType,
} from "./lib/types";
import { createStore } from "solid-js/store";
import {
  checkIfDateHasTime,
  getColumnPropertyNames,
  getIdColumnIndex,
  getValueType,
  registerDataviewEvents,
  toNumber,
  tryDataviewArrayToArray,
  tryDataviewLinkToMarkdown,
  unregisterDataviewEvents,
  updateMetadataProperty,
} from "./lib/util";
import { autofocus } from "@solid-primitives/autofocus";
// import { Minus, Plus } from "lucide-solid";
/*
  TODO
  - problem: build process bundles *all* lucide icons, but *does* correctly treeshake for final bundle. This causes 500% increase to build time despite bundle being correct.
  - workaround:
    - effect: corrects build process time 
    - from https://christopher.engineering/en/blog/lucide-icons-with-vite-dev-server/
    - issue: no autocomplete
*/
import Minus from "lucide-solid/icons/Minus";
import Parentheses from "lucide-solid/icons/Parentheses";
import Plus from "lucide-solid/icons/Plus";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog";
import { ExternalLink } from "./components/ui/external-link";
import { COMPLEX_PROPERTY_PLACEHOLDER } from "./lib/constants";
import { DateTime } from "luxon";
// prevents from being tree-shaken by TS
autofocus;

// const headers = ["File", "Status", "Num"];
// const rows = [
//   ["[[note1]]", "in progress", 3],
//   ["[[note2]]", "done", 15],
//   ["[[note3]]", "not started", 0],
// ];

const defaultQueryResult: ModifiedDataviewQueryResult = {
  successful: true,
  value: {
    headers: [""],
    values: [[null]],
    type: "table",
  },
  truePropertyNames: [],
};

type AppProps = {
  plugin: DataEdit;
  source: string;
  ctx: MarkdownPostProcessorContext;
  dataviewAPI: DataviewAPI;
};

// TODO this feels like bad practice
// but I'm pretty sure it will never actually be undefined
// so providing a dummy default value should be fine?
const DataEditContext = createContext<AppProps>({
  plugin: {} as DataEdit,
  source: "",
  ctx: {} as MarkdownPostProcessorContext,
  dataviewAPI: {} as DataviewAPI,
});

function App(props: AppProps) {
  const [queryResults, setQueryResults] =
    createStore<ModifiedDataviewQueryResult>(defaultQueryResult);

  // createEffect(() => {
  //   if (queryResults.successful) {
  //     console.log(queryResults.value);
  //     return;
  //   }
  //   console.log(queryResults.error);
  // });

  const updateQueryResults = async () => {
    const truePropertyNames = getColumnPropertyNames(props.source);
    // console.log("true props; ", truePropertyNames);
    try {
      const result = await props.dataviewAPI.query(props.source);
      if (result.successful) {
        result.value.values = result.value.values.map((v) =>
          tryDataviewArrayToArray(v),
        );
      }
      setQueryResults({ ...result, truePropertyNames });
    } catch (e) {
      console.log(e);
    }
  };

  updateQueryResults();
  registerDataviewEvents(props.plugin, updateQueryResults);

  onCleanup(() => {
    unregisterDataviewEvents(props.plugin, updateQueryResults);
  });

  return (
    <DataEditContext.Provider value={props}>
      <div class="w-full overflow-x-scroll">
        <Table ctx={props.ctx} queryResults={queryResults} />
      </div>
    </DataEditContext.Provider>
  );
}

export default App;

type TableProps = {
  ctx: MarkdownPostProcessorContext;
  queryResults: ModifiedDataviewQueryResult;
};
const Table = (props: TableProps) => {
  //
  return (
    <Show
      when={props.queryResults.successful}
      fallback={<TableFallback queryResults={props.queryResults} />}
    >
      <table>
        <TableHead
          headers={
            (props.queryResults as DataviewQueryResultSuccess).value.headers
          }
        />
        <TableBody
          headers={
            (props.queryResults as DataviewQueryResultSuccess).value.headers
          }
          properties={props.queryResults.truePropertyNames}
          rows={(props.queryResults as DataviewQueryResultSuccess).value.values}
        />
      </table>
    </Show>
  );
};

type TableFallbackProps = { queryResults: DataviewQueryResult };
const TableFallback = (props: TableFallbackProps) => {
  //
  return (
    <div>
      <h2>Dataview error</h2>
      <p>{(props.queryResults as DataviewQueryResultFail).error}</p>
    </div>
  );
};

type TableHeadProps = {
  headers: DataviewQueryResultHeaders;
};
const TableHead = (props: TableHeadProps) => {
  const { plugin, ctx } = useContext(DataEditContext);
  return (
    <thead>
      <tr>
        <For each={props.headers}>
          {(h) => (
            <th class="text-nowrap">
              <Markdown
                app={plugin.app}
                markdown={h}
                sourcePath={ctx.sourcePath}
              />
            </th>
          )}
        </For>
      </tr>
    </thead>
  );
};

type TableBodyProps = {
  headers: DataviewQueryResultHeaders;
  properties: string[];
  rows: DataviewQueryResultValues;
};
const TableBody = (props: TableBodyProps) => {
  const {
    dataviewAPI: {
      settings: { tableIdColumnName },
    },
  } = useContext(DataEditContext);

  return (
    <tbody>
      <For each={props.rows}>
        {(row) => (
          <tr>
            <For each={row}>
              {(value, valueIndex) => (
                <TableData
                  value={value}
                  header={props.headers[valueIndex()]}
                  property={props.properties[valueIndex()]}
                  filePath={
                    (
                      row[
                        getIdColumnIndex(props.headers, tableIdColumnName)
                      ] as DataviewLink
                    ).path ?? ""
                  }
                />
              )}
            </For>
          </tr>
        )}
      </For>
    </tbody>
  );
};

type TableDataProps<T = DataviewPropertyValue> = {
  value: T;
  header: string;
  property: string;
  filePath: string;
};
export const TableData = (props: TableDataProps) => {
  const [isEditing, setEditing] = createSignal(false);
  const {
    plugin,
    dataviewAPI: {
      settings: { tableIdColumnName },
      luxon,
    },
  } = useContext(DataEditContext);
  const valueType = createMemo(() => {
    return getValueType(props.value, props.header, luxon);
  });
  const isEditableProperty = (property: string) => {
    const str = property.toLowerCase();
    if (str === COMPLEX_PROPERTY_PLACEHOLDER.toLowerCase()) return false;
    if (str === tableIdColumnName.toLowerCase()) return false;
    if (str.includes("file.")) return false;
    return true;
  };
  return (
    <td
      class="whitespace-normal text-nowrap hover:bg-hover"
      tabIndex={0}
      onClick={(e) => {
        // new Notice(e.target.tagName);
        // if number buttons are clicked
        if (e.target.tagName.toLowerCase() === "button") return;
        if (valueType() === "list") return;
        setEditing(true);
      }}
    >
      <Show
        when={valueType() !== "list"}
        fallback={<ListTableDataWrapper {...props} />}
      >
        <Show
          when={isEditing() && isEditableProperty(props.property)}
          fallback={
            <TableDataDisplay
              {...props}
              setEditing={setEditing}
              valueType={valueType()}
            />
          }
        >
          <TableDataEdit
            {...props}
            setEditing={setEditing}
            valueType={valueType()}
          />
        </Show>
        <Show when={valueType() === "number"}>
          <NumberButtons {...props} plugin={plugin} />
        </Show>
      </Show>
    </td>
  );
};

type TableDataDisplayProps = TableDataProps & {
  setEditing: Setter<boolean>;
  valueType: PropertyValueType;
};
export const TableDataDisplay = (props: TableDataDisplayProps) => {
  const {
    plugin,
    ctx,
    dataviewAPI: {
      settings: { defaultDateFormat, defaultDateTimeFormat },
    },
  } = useContext(DataEditContext);
  return (
    <>
      <Show when={props.valueType === "text" || props.valueType === "number"}>
        <Markdown
          class="size-full"
          app={plugin.app}
          markdown={tryDataviewLinkToMarkdown(props.value)}
          sourcePath={ctx.sourcePath}
        />
      </Show>
      <Show when={props.valueType === "checkbox"}>
        <CheckboxInput {...props} />
      </Show>
      <Show when={props.valueType === "date" || props.valueType === "datetime"}>
        <div class="size-full">
          {(props.value as DateTime).toFormat(
            checkIfDateHasTime(props.value as DateTime)
              ? defaultDateTimeFormat
              : defaultDateFormat,
          )}
        </div>
      </Show>
    </>
  );
};

type TableDataEditProps<T = unknown> = TableDataProps<T> & {
  setEditing: Setter<boolean>;
  valueType: PropertyValueType;
};
export const TableDataEdit = (props: TableDataEditProps) => {
  // return <TextInput {...props} />;

  return (
    <>
      <Show when={props.valueType === "text"}>
        <TextInput {...props} />
      </Show>
      <Show when={props.valueType === "number"}>
        <NumberInput {...props} />
      </Show>
      <Show when={props.valueType === "date" || props.valueType === "datetime"}>
        <DateDatetimeInput {...(props as TableDataEditProps<DateTime>)} />
      </Show>
    </>
  );
};

const TextInput = (
  props: TableDataEditProps & {
    updateProperty?: (val: unknown) => Promise<void>;
  },
) => {
  const [size, setSize] = createSignal(props.value?.toString().length ?? 5);
  const { plugin } = useContext(DataEditContext);
  return (
    <input
      use:autofocus
      autofocus
      class="h-auto rounded-none border-none bg-transparent p-0 !shadow-none"
      // style={{ "box-shadow": "none" }}
      size={size()}
      type="text"
      value={props.value?.toString() ?? ""}
      onBlur={async (e) => {
        if (props.updateProperty) {
          await props.updateProperty(e.target.value);
        } else {
          await updateMetadataProperty(
            props.property,
            e.target.value,
            props.filePath,
            plugin,
            props.value,
          );
        }
        props.setEditing(false);
      }}
      onInput={(e) => {
        setSize(e.target.value.length);
      }}
    />
  );
};

const ListTableDataWrapper = (props: TableDataProps<unknown[]>) => {
  const { plugin, ctx } = useContext(DataEditContext);
  return (
    <ul class="m-0 flex flex-col gap-1 p-0 [&>li]:list-disc">
      <For each={props.value}>
        {(val, index) => (
          <ListTableDataItem
            {...props}
            plugin={plugin}
            ctx={ctx}
            itemValue={val}
            itemIndex={index()}
          />
        )}
      </For>
      <button
        class="clickable-icon size-fit p-1"
        onClick={async (e) => {
          e.preventDefault();
          await updateMetadataProperty(
            props.property,
            [...props.value, ""],
            props.filePath,
            plugin,
            props.value,
          );
        }}
      >
        <Plus class="pointer-events-none size-3" />
      </button>
    </ul>
  );
};

type ListTableDataItemProps = TableDataProps & {
  plugin: DataEdit;
  ctx: MarkdownPostProcessorContext;
  itemValue: unknown;
  itemIndex: number;
};
const ListTableDataItem = (props: ListTableDataItemProps) => {
  const [isEditing, setEditing] = createSignal(false);
  return (
    <li class="m-0 ml-3">
      <Show
        when={isEditing()}
        fallback={
          <Markdown
            class="size-full"
            app={props.plugin.app}
            markdown={tryDataviewLinkToMarkdown(props.itemValue)}
            sourcePath={props.ctx.sourcePath}
            onClick={() => setEditing(true)}
          />
        }
      >
        <ListInput {...props} setEditing={setEditing} />
      </Show>
    </li>
  );
};

const ListInput = (
  props: ListTableDataItemProps & { setEditing: Setter<boolean> },
) => {
  return (
    <TextInput
      {...props}
      value={props.itemValue}
      valueType="list"
      updateProperty={async (newVal) => {
        const value = [...props.value] as unknown[];
        if (!newVal && newVal !== 0) {
          const arr = value.filter((_, i) => i !== props.itemIndex);
          await updateMetadataProperty(
            props.property,
            arr,
            props.filePath,
            props.plugin,
            props.itemValue,
            props.itemIndex,
          );
          return;
        }
        value[props.itemIndex] = newVal;
        await updateMetadataProperty(
          props.property,
          value,
          props.filePath,
          props.plugin,
          props.itemValue,
          props.itemIndex,
        );
      }}
    />
  );
};

const NumberInput = (props: TableDataEditProps) => {
  const [size, setSize] = createSignal(props.value?.toString().length ?? 5);
  const { plugin } = useContext(DataEditContext);
  return (
    <input
      use:autofocus
      autofocus
      class="h-auto rounded-none border-none bg-transparent p-0 !shadow-none"
      // style={{ "box-shadow": "none" }}
      size={size()}
      type="number"
      value={props.value?.toString() ?? ""}
      onBlur={async (e) => {
        await updateMetadataProperty(
          props.property,
          toNumber(e.target.value),
          props.filePath,
          plugin,
          props.value,
        );
        props.setEditing(false);
      }}
      onInput={(e) => {
        setSize(e.target.value.length);
      }}
    />
  );
};

type NumberButtonsProps = TableDataProps & { plugin: DataEdit };
const NumberButtons = (props: NumberButtonsProps) => (
  <div class="flex w-full items-center gap-1">
    <button
      class="clickable-icon size-fit p-1"
      onClick={async (e) => {
        e.preventDefault();
        await updateMetadataProperty(
          props.property,
          props.value - 1,
          props.filePath,
          props.plugin,
          props.value,
        );
      }}
    >
      <Minus class="pointer-events-none size-3" />
    </button>
    <NumberExpressionButton {...props} />
    <button
      class="clickable-icon size-fit p-1"
      onClick={async (e) => {
        e.preventDefault();
        await updateMetadataProperty(
          props.property,
          props.value + 1,
          props.filePath,
          props.plugin,
          props.value,
        );
      }}
    >
      <Plus class="pointer-events-none size-3" />
    </button>
  </div>
);

const NumberExpressionButton = (props: NumberButtonsProps) => {
  // const {
  //   dataviewAPI: { evaluate },
  // } = useContext(DataEditContext);
  const [isOpen, setOpen] = createSignal(false);
  const [calculated, setCalculated] = createSignal(Number(props.value));

  const updateProperty = async (v: number) => {
    await updateMetadataProperty(
      props.property,
      v,
      props.filePath,
      props.plugin,
      props.value,
    );
  };

  return (
    <Dialog modal open={isOpen()} onOpenChange={(b) => setOpen(b)}>
      <DialogTrigger class="clickable-icon size-fit p-1">
        <Parentheses class="pointer-events-none size-3" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update by expression</DialogTitle>
          <DialogDescription>
            Enter a valid{" "}
            <ExternalLink href="https://blacksmithgu.github.io/obsidian-dataview/reference/expressions/">
              Dataview mathematical expression
            </ExternalLink>
            <br />
            You can use <code>x</code> as the current value.
          </DialogDescription>
        </DialogHeader>
        <input
          use:autofocus
          autofocus
          class="border-border px-1"
          type="text"
          placeholder="x + 2 / x * 3"
          onKeyDown={async (e) => {
            if (e.key === "Enter" && !Number.isNaN(calculated())) {
              await updateProperty(calculated());
              setOpen(false);
            }
          }}
          onInput={async (e) => {
            /* 
              TODO make this better
              - eval: solid doesn't like it when interopped with signals it seems
              - mathjs: solid also seems to not like it's evaluate function. It also adds 500kb to the bundle :/
            */
            const exp = e.target.value
              .replaceAll("x", props.value.toString())
              .trim();
            const result =
              // @ts-expect-error
              await app.plugins.plugins.dataview.api.evaluate(exp);

            setCalculated(() => {
              if (result.successful) return Number(result.value);
              return NaN;
            });
          }}
        />
        <p>
          <span>Calculated:&nbsp;</span>
          <Show
            when={Number.isNaN(calculated())}
            fallback={<span class="text-success">{calculated()}</span>}
          >
            <span class="text-error">error</span>
          </Show>
        </p>
        <DialogFooter>
          <button
            class="rounded-button bg-interactive-accent p-button text-on-accent hover:bg-interactive-accent-hover"
            disabled={Number.isNaN(calculated())}
            onClick={async () => {
              await updateProperty(calculated());
              setOpen(false);
            }}
          >
            update
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

type CheckboxInputProps = TableDataProps & {
  valueType: PropertyValueType;
};
const CheckboxInput = (props: CheckboxInputProps) => {
  const { plugin } = useContext(DataEditContext);
  return (
    <input
      class=""
      type="checkbox"
      checked={!!props.value}
      onClick={async (e) => {
        await updateMetadataProperty(
          props.property,
          e.currentTarget.checked,
          props.filePath,
          plugin,
          props.value,
        );
      }}
    />
  );
};

type DateDatetimeInputProps = TableDataProps<DateTime> & {
  setEditing: Setter<boolean>;
  valueType: PropertyValueType;
};

const DateDatetimeInput = (props: DateDatetimeInputProps) => {
  const {
    plugin,
    dataviewAPI: { luxon },
  } = useContext(DataEditContext);
  const isTime = createMemo(() => {
    return checkIfDateHasTime(props.value);
  });

  createEffect(() => {
    console.log("isTime: ", isTime());
  });
  return (
    <input
      use:autofocus
      autofocus
      class=""
      type={isTime() ? "datetime-local" : "date"}
      // 2018-06-12T19:30
      value={
        isTime()
          ? props.value.toFormat("yyyy-MM-dd'T'hh:mm")
          : props.value.toFormat("yyyy-MM-dd")
      }
      onBlur={async (e) => {
        const isValid = e.target.validity;
        if (!isValid) return props.setEditing(false);
        const format = isTime() ? "yyyy-MM-dd'T'hh:mm" : "yyyy-MM-dd";
        // const jsDt = new Date(e.target.value);
        // console.log("jsDt: ", jsDt);
        console.log("etarget: ", e.target.value);
        const dt = luxon.DateTime.fromFormat(e.target.value, format);
        console.log("dt: ", dt);
        const newValue = dt.toFormat(format);
        console.log("new value: ", newValue);
        const formattedOld = props.value.toFormat(format);
        await updateMetadataProperty(
          props.property,
          newValue,
          props.filePath,
          plugin,
          formattedOld,
        );
        props.setEditing(false);
      }}
    />
  );
};
