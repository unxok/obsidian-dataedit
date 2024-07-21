import {
  createContext,
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
  PropertyValueType,
} from "./lib/types";
import { createStore } from "solid-js/store";
import {
  getIdColumnIndex,
  getValueType,
  registerDataviewEvents,
  toNumber,
  tryDataviewLinkToMarkdown,
  unregisterDataviewEvents,
  updateFrontmatterProperty,
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
// prevents from being tree-shaken by TS
autofocus;

// const headers = ["File", "Status", "Num"];
// const rows = [
//   ["[[note1]]", "in progress", 3],
//   ["[[note2]]", "done", 15],
//   ["[[note3]]", "not started", 0],
// ];

const defaultQueryResult: DataviewQueryResult = {
  successful: true,
  value: {
    headers: [""],
    values: [[null]],
    type: "table",
  },
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
    createStore<DataviewQueryResult>(defaultQueryResult);

  // createEffect(() => {
  //   if (queryResults.successful) {
  //     console.log(queryResults.value);
  //     return;
  //   }
  //   console.log(queryResults.error);
  // });

  const updateQueryResults = async () => {
    // console.log("update qr called");
    try {
      const result = await props.dataviewAPI.query(props.source);
      setQueryResults(result);
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
  queryResults: DataviewQueryResult;
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

type TableDataProps = {
  value: DataviewPropertyValue;
  header: string;
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
  const isEditableProperty = (h: string) => {
    const str = h.toLowerCase();
    if (str === tableIdColumnName) return false;
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
        setEditing(true);
      }}
    >
      <Show
        when={isEditing() && isEditableProperty(props.header)}
        fallback={<TableDataDisplay {...props} valueType={valueType()} />}
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
    </td>
  );
};

type TableDataDisplayProps = TableDataProps & { valueType: PropertyValueType };
export const TableDataDisplay = (props: TableDataDisplayProps) => {
  const { plugin, ctx } = useContext(DataEditContext);
  return (
    <>
      <Markdown
        class="size-full"
        app={plugin.app}
        markdown={tryDataviewLinkToMarkdown(props.value)}
        sourcePath={ctx.sourcePath}
      />
    </>
  );
};

type TableDataEditProps = TableDataProps & {
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
    </>
  );
};

const TextInput = (props: TableDataEditProps) => {
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
        await updateFrontmatterProperty(
          props.header,
          e.target.value,
          props.filePath,
          plugin,
        );
        props.setEditing(false);
      }}
      onInput={(e) => {
        setSize(e.target.value.length);
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
        await updateFrontmatterProperty(
          props.header,
          toNumber(e.target.value),
          props.filePath,
          plugin,
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
        await updateFrontmatterProperty(
          props.header,
          props.value - 1,
          props.filePath,
          props.plugin,
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
        await updateFrontmatterProperty(
          props.header,
          props.value + 1,
          props.filePath,
          props.plugin,
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
    await updateFrontmatterProperty(
      props.header,
      v,
      props.filePath,
      props.plugin,
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
            class="bg-interactive-accent text-on-accent hover:bg-interactive-accent-hover p-button rounded-button"
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
