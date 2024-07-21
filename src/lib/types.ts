// import { TFile } from "obsidian";
import { Link } from "obsidian-dataview";
import luxonAPI from "luxon";

export type DataviewSettings = {
  renderNullAs: string;
  taskCompletionTracking: boolean;
  taskCompletionUseEmojiShorthand: boolean;
  taskCompletionText: string;
  taskCompletionDateFormat: string;
  recursiveSubTaskCompletion: boolean;
  warnOnEmptyResult: boolean;
  refreshEnabled: boolean;
  refreshInterval: number;
  defaultDateFormat: string;
  defaultDateTimeFormat: string;
  maxRecursiveRenderDepth: number;
  tableIdColumnName: string;
  tableGroupColumnName: string;
  showResultCount: boolean;
  allowHtml: boolean;
  inlineQueryPrefix: string;
  inlineJsQueryPrefix: string;
  inlineQueriesInCodeblocks: boolean;
  enableInlineDataview: boolean;
  enableDataviewJs: boolean;
  enableInlineDataviewJs: boolean;
  prettyRenderInlineFields: boolean;
  prettyRenderInlineFieldsInLivePreview: boolean;
  dataviewJsKeyword: string;
};

// export type DataviewLink = {
//   display: string | undefined;
//   embed: boolean;
//   path: string | undefined;
//   subpath: string | undefined;
//   type: "file" | "string";
//   markdown(): string;
//   fileName(): string;
//   obsidianLink(): string;
//   toFile(): TFile;
//   toEmbed(): string;
//   withPath(): string;
// };

export type DataviewLink = Link;

export type DataviewPropertyValueNotLink =
  | string
  | number
  | boolean
  | null
  | undefined
  | (string | number | boolean | null | undefined)[];

export type DataviewPropertyValue =
  | DataviewPropertyValueNotLink
  | DataviewLink
  | DataviewLink[];

export type DataviewQueryResultHeaders = string[];
export type DataviewQueryResultValues = DataviewPropertyValue[][];
export type DataviewQueryResultSuccess = {
  successful: true;
  value: {
    headers: DataviewQueryResultHeaders;
    values: DataviewQueryResultValues;
    type: "table" | string;
  };
};
export type DataviewQueryResultFail = {
  successful: false;
  error: string;
};
export type DataviewQueryResult =
  | DataviewQueryResultSuccess
  | DataviewQueryResultFail;

export type DataviewAPI = {
  settings: DataviewSettings;
  query(source: string): Promise<DataviewQueryResult>;
  luxon: typeof luxonAPI;
  evaluate(
    source: string,
  ): Promise<
    { successful: true; value: unknown } | { successful: false; error: string }
  >;
};

export type PropertyValueType =
  | "text"
  | "number"
  | "multitext"
  | "tags"
  | "date"
  | "datetime"
  | "checkbox";
