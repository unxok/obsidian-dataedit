import { TFile } from "obsidian";

export type DataviewLink = {
  display: string | undefined;
  embed: boolean;
  path: string | undefined;
  subpath: string | undefined;
  type: "file" | "string";
  markdown(): string;
  fileName(): string;
  obsidianLink(): string;
  toFile(): TFile;
  toEmbed(): string;
  withPath(): string;
};

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
  query(source: string): Promise<DataviewQueryResult>;
};
