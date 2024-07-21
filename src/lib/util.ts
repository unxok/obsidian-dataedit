import { Plugin, TFile, Vault } from "obsidian";
import {
  DataviewAPI,
  DataviewLink,
  DataviewPropertyValueNotLink,
  PropertyValueType,
} from "./types";
import { DateTime } from "luxon";
import { COMPLEX_PROPERTY_PLACEHOLDER } from "./constants";

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

/*
  TABLE col1 as Alias1, func(col2)  ,col3.sub, col4 as "Alias 2"
  FROM "/"
  WHERE true 
*/

export const getColumnPropertyNames = (source: string) => {
  const cols = source
    .split("\n")[0]
    .substring(6)
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
        "-",
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
  // first index doesn't actually matter
  // but we need it to make the index match to alias arr
  return ["File", ...cols];
};

export const updateFrontmatterProperty = async (
  property: string,
  value: unknown,
  filePath: string,
  plugin: Plugin,
  previousValue: unknown,
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
  if (!foundInline) return false;
  lines[foundInline.line] =
    lines[foundInline.line]?.replace(
      // TODO I don't think space after colons is required
      (property + ":: " + foundInline.value) as string,
      property + ":: " + (value ?? "").toString(),
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
