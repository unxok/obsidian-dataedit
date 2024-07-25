import {
  App,
  Notice,
  parseYaml,
  Plugin,
  stringifyYaml,
  TFile,
  Vault,
} from "obsidian";
import {
  DataArray,
  DataviewAPI,
  DataviewLink,
  DataviewPropertyValueNotLink,
  PropertyInfo,
  PropertyValueType,
} from "./types";
import { DateTime } from "luxon";
import { COMPLEX_PROPERTY_PLACEHOLDER } from "./constants";
import { CodeBlockInfo } from "@/App";

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

/**
 * Checks if a luxon DateTime has a non-zero time value
 * @param dt luxon DateTime
 * @returns `true` if time is not all zeroes, false otherwise
 */
export const checkIfDateHasTime = (dt: DateTime) => {
  const isTime = dt.hour !== 0 || dt.minute !== 0 || dt.second !== 0;
  return isTime;
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
    // console.log("object value: ", value);
    if (Array.isArray(value)) {
      return property === "tags" ? "tags" : "list";
    }
    if (luxon.DateTime.isDateTime(value)) {
      const dt = value as unknown as DateTime;
      const isTime = checkIfDateHasTime(dt);
      return isTime ? "datetime" : "date";
    }
    return "text";
  }
  throw new Error("Failed to get property value type");
};

export const registerDataviewEvents = (
  plugin: Plugin,
  callback: () => unknown,
) => {
  plugin.app.metadataCache.on("dataview:index-ready" as "changed", callback);

  plugin.app.metadataCache.on(
    "dataview:metadata-change" as "changed",
    callback,
  );
};

export const unregisterDataviewEvents = (
  plugin: Plugin,
  callback: () => unknown,
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
    (h) =>
      h.toLowerCase() === tableIdColumnName.toLowerCase() || h === "file.link",
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

export const tryDataviewArrayToArray = <T>(val: T) => {
  if (typeof val !== "object") return val;
  if (!val?.hasOwnProperty("array")) return val;
  return ({ ...val } as unknown as DataArray<T>).array() as T;
};

/*
  TABLE col1 as Alias1, func(col2)  ,col3.sub, col4 as "Alias 2"
  FROM "/"
  WHERE true 
*/

export const getColumnPropertyNames = (source: string) => {
  const line = source.split("\n")[0];
  const isWithoutId = line.toLowerCase().includes("without id");
  const cols = source
    .split("\n")[0]
    .substring(isWithoutId ? 17 : 6)
    .split(",")
    .map((c) => {
      const str = c.trim();
      const potential = str.split(/\sAS\s/gim)[0].trim();
      const invalidChars = [
        "(",
        ")",
        "[",
        "]",
        "{",
        "}",
        "+",
        // "-", dashes are pretty common in property names
        "*",
        "/",
        "%",
        "<",
        ">",
        "!",
        "=",
        '"',
      ];
      const isComplex =
        !Number.isNaN(Number(potential)) ||
        //prettier-ignore
        potential
          .split("")
          .some((char) => invalidChars.includes(char));
      if (isComplex) {
        // property is manipulated in the query
        // so it can't be edited since it's a calculated value
        return COMPLEX_PROPERTY_PLACEHOLDER;
      }
      return potential;
    });
  if (isWithoutId) return cols;
  // so it matches with what is returned from dataview
  return ["File", ...cols];
};

export const updateMetadataProperty = async (
  property: string,
  value: unknown,
  filePath: string,
  plugin: Plugin,
  previousValue: unknown,
  itemIndex?: number,
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
  let fmUpdated = false;
  await fileManager.processFrontMatter(file, (fm: Record<string, any>) => {
    if (!fm.hasOwnProperty(property)) {
      // nested (object)
      if (property.includes(".")) {
        assignDotPropertyValue(fm, property, value);
        return (fmUpdated = true);
      }
      // might be inline
      return;
    }
    fm[property] = value;
    return (fmUpdated = true);
  });

  if (fmUpdated) return;

  const inlineUpdated = await tryUpdateInlineProperty(
    property,
    value,
    previousValue,
    file,
    vault,
    itemIndex,
  );
  if (inlineUpdated) return;

  // property is not in frontmatter nor inline
  await fileManager.processFrontMatter(file, (fm) => {
    fm[property] = value;
  });
};

/**
 * Mutates an object by assigning a value to a property given in dot notation
 * @param obj The object to mutate
 * @param property Property name in dot notation
 * @param value The value to assign
 * ---
 * ```ts
 *
 * const obj = {'fizz': 'buzz'};
 * assignDotPropertyValue(obj, 'nested.prop.foo', 'bar');
 * console.log(obj);
 * // {'fizz': 'buzz', nested: {prop: {foo: 'bar'}}}
 * ```
 */
export const assignDotPropertyValue = (
  obj: Record<string, unknown>,
  property: string,
  value: unknown,
) => {
  const keys = property.split(".");
  let current = obj;

  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      current[key] = value;
    } else {
      if (!current[key] || typeof current[key] !== "object") {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }
  });
};

type InlinePropertyValue =
  | string
  | number
  | boolean
  | null
  | (string | number)[]
  | undefined;

const parseLinesForInlineFields = (lines: (string | null)[]) => {
  const reg = new RegExp(/[\[\(]?([^\n\r\(\[]*)::[ ]*([^\)\]\n\r]*)[\]\)]?/gm);
  return lines.reduce<
    {
      key: string;
      value: InlinePropertyValue;
      line: number;
      match: string;
    }[]
  >((prev, curr, index) => {
    let matches = reg.exec(curr ?? "");
    if (!matches) {
      return prev;
    }
    const key = matches[1].trim();
    const oldVal = matches[2].trim();
    return [
      ...prev,
      {
        key: key,
        value: oldVal,
        line: index,
        match: matches[0],
      },
    ];
  }, []);
};

const tryUpdateInlineProperty = async (
  property: string,
  value: unknown,
  previousValue: unknown,
  file: TFile,
  vault: Vault,
  itemIndex?: number,
) => {
  const content = await vault.read(file);
  const lines: (string | null)[] = content.split("\n");
  const yaml = [];
  if (lines[0] === "---") {
    const lastYamlDashesIndex = lines.findIndex(
      (l, i) => l === "---" && i !== 0,
    );
    if (
      lastYamlDashesIndex !== -1 &&
      lines[lastYamlDashesIndex + 1] !== undefined
    ) {
      // this ends up being cheaper than array.slice() when
      // lines can be a very large array of very large strings
      for (let j = 0; j < lastYamlDashesIndex + 1; j++) {
        yaml.push(lines[j]);
        lines[j] = null;
      }
    }
  }
  const parsedFields = parseLinesForInlineFields(lines);
  const foundInline = parsedFields.find(
    (f) => f.value === previousValue?.toString(),
  );
  if (!foundInline) {
    const isNameMatchedInline = parsedFields.some((f) => f.key === property);
    if (isNameMatchedInline) {
      // plus button was clicked for list value
      // you can't really add a inline programmatically
      // because they are defined arbitrarily in the note
      new Notice(
        "Inline fields found for property, so you can't use the plus button",
      );
      // so frontmatter isn't updated
      return true;
    }
    return false;
  }
  const newValue = Array.isArray(value) ? value[itemIndex ?? 0] : value;
  lines[foundInline.line] =
    lines[foundInline.line]?.replace(
      // TODO I don't think space after colons is required
      (property + ":: " + foundInline.value) as string,
      property + ":: " + (newValue ?? "").toString(),
    ) ?? null;
  let finalContent = "";
  for (let m = 0; m < lines.length; m++) {
    const v = lines[m];
    if (v === null) continue;
    finalContent += "\n" + v;
  }
  await vault.modify(file, yaml.join("\n") + finalContent);
  return true;
};

export const getExistingProperties = (app: App) => {
  const { metadataCache } = app;
  // @ts-expect-error
  return metadataCache.getAllPropertyInfos() as Record<string, PropertyInfo>;
};

export const getTableLine = (codeBlockText: string) => {
  const lines = codeBlockText.split("\n");
  let index = 0;
  for (index; index < lines.length; index++) {
    const line = lines[index];
    if (!line.toLowerCase().startsWith("table")) continue;
    return {
      line,
      index,
    };
  }
  throw new Error(
    "Unable to find table line from codeBlockText. This should be impossible.",
  );
};

export type DataEditBlockConfig = {
  lockEditing: boolean;
};

export type DataEditBlockConfigKey = keyof DataEditBlockConfig;

export const defaultDataEditBlockConfig: DataEditBlockConfig = {
  lockEditing: false,
};

// TODO adds one extra line of space (not incrementally) which doesn't break anything but looks weird
export const splitQueryOnConfig = (codeBlockText: string) => {
  const [query, configStr] = codeBlockText.split(/\n^---$\n/gim);
  try {
    const config = parseYaml(configStr);
    if (typeof config !== "object") throw new Error();
    return { query, config: { ...defaultDataEditBlockConfig, ...config } };
  } catch (e) {
    const msg = "invalid YAML detected in config";
    console.error(msg);
    return { query, config: defaultDataEditBlockConfig };
  }
};

export const updateBlockConfig = async (
  key: DataEditBlockConfigKey,
  value: DataEditBlockConfig[typeof key],
  dataEditInfos: CodeBlockInfo,
) => {
  const {
    config,
    ctx,
    el,
    plugin: {
      app: { vault, workspace },
    },
    query,
  } = dataEditInfos;
  // break down the query text into lines
  const queryLines = query.split("\n");
  // update the old config
  const newConfig = { ...config, [key]: value };
  // turn into yaml text
  const newConfigStr = stringifyYaml(newConfig);
  const newConfigLines = newConfigStr.split("\n");
  // stringifyYaml() always adds a new line character at the end, resulting in an extra item in the lines array
  newConfigLines.pop();
  // text is the entire notes text and is essentially a synchronous read
  const { lineStart, lineEnd, text } = ctx.getSectionInfo(el)!;
  const lines = text.split("\n");
  const newLines = lines.toSpliced(
    // start at where the code block text starts
    lineStart + 1,
    // delete existing lines up to end of code block text
    lineEnd - lineStart - 1,
    // reconstruct the code block text with new config
    ...queryLines,
    "---",
    ...newConfigLines,
  );
  const file = vault.getFileByPath(ctx.sourcePath);
  if (!file) {
    throw new Error("This should be impossible");
  }
  // update file with the new config
  await vault.modify(file, newLines.join("\n"));
  // workspace.activeEditor.editor?.
};

// TODO could probably combine this with the updater func since it's literally just one line difference
// but typing the overloads is seeming more difficult than I thought
export const setBlockConfig = async (
  config: DataEditBlockConfig,
  dataEditInfos: CodeBlockInfo,
) => {
  const {
    ctx,
    el,
    plugin: {
      app: { vault },
    },
    query,
  } = dataEditInfos;
  // break down the query text into lines
  const queryLines = query.split("\n");
  // turn into yaml text
  const newConfigStr = stringifyYaml(config);
  const newConfigLines = newConfigStr.split("\n");
  // stringifyYaml() always adds a new line character at the end, resulting in an extra item in the lines array
  newConfigLines.pop();
  // text is the entire notes text and is essentially a synchronous read
  const { lineStart, lineEnd, text } = ctx.getSectionInfo(el)!;
  const lines = text.split("\n");
  const newLines = lines.toSpliced(
    // start at where the code block text starts
    lineStart + 1,
    // delete existing lines up to end of code block text
    lineEnd - lineStart - 1,
    // reconstruct the code block text with new config
    ...queryLines,
    "---",
    ...newConfigLines,
  );
  const file = vault.getFileByPath(ctx.sourcePath);
  if (!file) {
    throw new Error("This should be impossible");
  }
  // update file with the new config
  await vault.modify(file, newLines.join("\n"));
};
