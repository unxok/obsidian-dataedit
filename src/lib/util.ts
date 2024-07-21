import { Plugin } from "obsidian";
import {
  DataviewAPI,
  DataviewLink,
  DataviewPropertyValueNotLink,
  PropertyValueType,
} from "./types";
import { DateTime } from "luxon";

export const clampNumber = (n: number, min: number, max: number) => {
  if (n < min) return min;
  if (n > max) return max;
  return n;
};

export const toNumber = (
  v: unknown,
  defaultNumber?: number,
  min?: number,
  max?: number,
  validator?: (val: unknown, num: number) => boolean,
) => {
  const num = Number(v);
  if (Number.isNaN(num)) return defaultNumber ?? 0;
  if (validator) {
    if (!validator(v, num)) return defaultNumber ?? 0;
  }
  if (min !== undefined) {
    if (num < min) return min;
  }
  if (max !== undefined) {
    if (num > max) return max;
  }
  return num;
};

export const getValueType: (
  value: unknown,
  property: string,
  luxon: DataviewAPI["luxon"],
) => PropertyValueType = (value, property, luxon) => {
  const t = typeof value;
  if (t === "string") return "text";
  if (t === "number") return "number";
  if (t === "boolean") return "checkbox";
  if (t === "object") {
    if (Array.isArray(t)) {
      return property === "tags" ? "tags" : "multitext";
    }
    if (luxon.DateTime.isDateTime(value)) {
      const dt = value as unknown as DateTime;
      const isOnlyDate = dt.hour === 0 && dt.minute === 0 && dt.second === 0;
      return isOnlyDate ? "date" : "datetime";
    }
    return "text";
  }
  throw new Error("Failed to get property value type");
};

export const registerDataviewEvents = (
  plugin: Plugin,
  callback: () => Promise<void> | void,
) => {
  plugin.app.metadataCache.on("dataview:index-ready" as "changed", callback);

  plugin.app.metadataCache.on(
    "dataview:metadata-change" as "changed",
    callback,
  );
};

export const unregisterDataviewEvents = (
  plugin: Plugin,
  callback: () => Promise<void> | void,
) => {
  plugin.app.metadataCache.off("dataview:index-ready" as "changed", callback);

  plugin.app.metadataCache.off(
    "dataview:metadata-change" as "changed",
    callback,
  );
};

export const getIdColumnIndex = (
  headers: string[],
  tableIdColumnName: string,
) => {
  const i = headers.findIndex(
    (h) => h === tableIdColumnName || h === "file.link",
  );
  if (i === -1) {
    throw new Error("Couldn't fine ID column index");
  }
  return i;
};

export const checkIfDataviewLink = (val: unknown) => {
  if (!val) return false;
  if (typeof val !== "object") return false;
  if (!val.hasOwnProperty("type")) return false;
  if ((val as { type: unknown }).type !== "file") return false;
  return true;
};

export const tryDataviewLinkToMarkdown = (val: unknown) => {
  if (!checkIfDataviewLink(val)) return val as DataviewPropertyValueNotLink;
  return (val as DataviewLink).markdown();
};

export const updateFrontmatterProperty = async (
  property: string,
  value: unknown,
  filePath: string,
  plugin: Plugin,
) => {
  const {
    app: { fileManager, vault },
  } = plugin;
  const file = vault.getFileByPath(filePath);
  if (!file) {
    throw new Error(
      "Tried updating frontmatter property but couldn't find file",
    );
  }

  await fileManager.processFrontMatter(file, (fm: Record<string, any>) => {
    fm[property] = value;
  });
};
