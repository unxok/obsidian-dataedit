import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  Setter,
  Show,
} from "solid-js";
import "./App.css";
import { MarkdownPostProcessorContext } from "obsidian";
import { Markdown } from "./components/Markdown";
import { plugin } from "./main";
import {
  DataviewAPI,
  DataviewLink,
  DataviewPropertyValue,
  DataviewQueryResult,
  DataviewQueryResultFail,
  DataviewQueryResultHeaders,
  DataviewQueryResultSuccess,
  DataviewQueryResultValues,
} from "./lib/types";
import { createStore } from "solid-js/store";
import { tryDataviewLinkToMarkdown } from "./lib/util";
import { autofocus } from "@solid-primitives/autofocus";
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
  source: string;
  ctx: MarkdownPostProcessorContext;
  dataviewAPI: DataviewAPI;
};

function App(props: AppProps) {
  const [queryResults, setQueryResults] =
    createStore<DataviewQueryResult>(defaultQueryResult);

  createEffect(() => {
    if (queryResults.successful) {
      console.log(queryResults.value);
      return;
    }
    console.log(queryResults.error);
  });

  const updateQueryResults = async () => {
    console.log("update qr called");
    try {
      const result = await props.dataviewAPI.query(props.source);
      setQueryResults(result);
    } catch (e) {
      console.log(e);
    }
  };

  if (!plugin()) {
    throw Error("No plugin");
  }

  console.log("plugin: ", plugin());

  plugin()!.app.metadataCache.on(
    "dataview:index-ready" as "changed",
    updateQueryResults,
  );

  plugin()!.app.metadataCache.on(
    "dataview:metadata-change" as "changed",
    updateQueryResults,
  );

  onCleanup(() => {
    plugin()!.app.metadataCache.off(
      "dataview:index-ready" as "changed",
      updateQueryResults,
    );

    plugin()!.app.metadataCache.off(
      "dataview:metadata-change" as "changed",
      updateQueryResults,
    );
  });

  return (
    <div class="w-full overflow-x-scroll">
      <Table ctx={props.ctx} queryResults={queryResults} />
    </div>
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
          ctx={props.ctx}
          headers={
            (props.queryResults as DataviewQueryResultSuccess).value.headers
          }
        />
        <TableBody
          ctx={props.ctx}
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
  ctx: MarkdownPostProcessorContext;
  headers: DataviewQueryResultHeaders;
};
const TableHead = (props: TableHeadProps) => {
  //
  return (
    <thead>
      <tr>
        <For each={props.headers}>
          {(h) => (
            <th class="text-nowrap">
              <Markdown
                app={plugin()!.app}
                markdown={h}
                sourcePath={props.ctx.sourcePath}
              />
            </th>
          )}
        </For>
      </tr>
    </thead>
  );
};

type TableBodyProps = {
  ctx: MarkdownPostProcessorContext;
  headers: DataviewQueryResultHeaders;
  rows: DataviewQueryResultValues;
};
const TableBody = (props: TableBodyProps) => {
  //
  return (
    <tbody>
      <For each={props.rows}>
        {(row) => (
          <tr>
            <For each={row}>
              {(value, valueIndex) => (
                <TableData
                  ctx={props.ctx}
                  value={value}
                  header={props.headers[valueIndex()]}
                  filePath={(row[0] as DataviewLink).path ?? ""}
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
  ctx: MarkdownPostProcessorContext;
  value: DataviewPropertyValue;
  header: string;
  filePath: string;
};
export const TableData = (props: TableDataProps) => {
  const [isEditing, setEditing] = createSignal(false);
  return (
    <td
      class="hover:bg-hover whitespace-normal text-nowrap"
      tabIndex={0}
      onClick={() => setEditing(true)}
    >
      <Show when={isEditing()} fallback={<TableDataDisplay {...props} />}>
        <TableDataEdit {...props} setEditing={setEditing} />
      </Show>
    </td>
  );
};

export const TableDataDisplay = (props: TableDataProps) => {
  //
  return (
    <Markdown
      class="size-full"
      app={plugin()!.app}
      markdown={tryDataviewLinkToMarkdown(props.value)}
      sourcePath={props.ctx.sourcePath}
    />
  );
};

export const TableDataEdit = (
  props: TableDataProps & { setEditing: Setter<boolean> },
) => {
  const [size, setSize] = createSignal(props.value?.toString().length ?? 5);
  return (
    <input
      use:autofocus
      autofocus
      class="h-auto rounded-none border-none bg-transparent p-0 !shadow-none"
      // style={{ "box-shadow": "none" }}
      size={size()}
      type="text"
      value={props.value?.toString() ?? ""}
      onBlur={() => props.setEditing(false)}
      onInput={(e) => {
        setSize(e.target.value.length);
      }}
    />
  );
};
