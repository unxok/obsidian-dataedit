import {
  App,
  MarkdownView,
  MetadataCache,
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
  PropertyType,
} from "./types";
import { DateTime } from "luxon";
import { COMPLEX_PROPERTY_PLACEHOLDER } from "./constants";
import { CodeBlockInfo } from "@/hooks/useDataEdit";
import { REGEX_COMMA_NOT_IN_DOUBLE_QUOTES } from "./regex";

export const clampNumber = (
  n: number,
  min: number,
  max: number,
  inclusive?: boolean,
) => {
  if (inclusive ? n <= min : n < min) return min;
  if (inclusive ? n >= max : n > max) return max;
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
) => PropertyType = (value, property, luxon) => {
  const t = typeof value;
  if (t === "string") return "text";
  if (t === "number") return "number";
  if (t === "boolean") return "checkbox";
  if (t === "object") {
    // console.log("object value: ", value);
    if (Array.isArray(value)) {
      return property === "tags" ? "tags" : "multitext";
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

export const getPropertyTypes: (
  properties: string[],
  metadataCache: MetadataCache,
) => PropertyType[] = (properties, metadataCache) => {
  // Private API
  const infos = metadataCache.getAllPropertyInfos() as Record<
    string,
    PropertyInfo
  >;
  const infosKeys = Object.keys(infos);
  return properties.map((p) => {
    const found = infosKeys.find((k) => infos[k].name === p);
    if (!found) return "unknown";
    return infos[found].type as PropertyType;
  });
};

export const registerDataviewEvents = (
  plugin: Plugin,
  callback: () => unknown,
) => {
  // plugin.app.metadataCache.on("dataview:index-ready" as "changed", callback);

  plugin.app.metadataCache.on(
    "dataview:metadata-change" as "changed",
    callback,
  );
};

export const unregisterDataviewEvents = (
  plugin: Plugin,
  callback: () => unknown,
) => {
  // plugin.app.metadataCache.off("dataview:index-ready" as "changed", callback);

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
    // console.error("Couldn't find ID column index");
    return 0;
  }
  return i;
};

export const checkIfDataviewLink = (val: unknown) => {
  if (!val) return false;
  if (typeof val !== "object") return false;
  if (!val.hasOwnProperty("type")) return false;
  // if ((val as { type: unknown }).type !== "file") return false;
  if (typeof (val as Record<string, any>)?.markdown !== "function")
    return false;
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
  // TODO possible could have this string within a column alias
  const isWithoutId = line.toLowerCase().includes("without id");
  const cols = source
    .split("\n")[0]
    .substring(isWithoutId ? 17 : 6)
    .split(REGEX_COMMA_NOT_IN_DOUBLE_QUOTES)
    .map((c) => {
      const str = c.trim();
      const potential = str.split(/\sAS\s/i)[0].trim();
      // console.log("potential: ", potential);
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
  newValue: unknown,
  filePath: string,
  plugin: Plugin,
  // TODO `el` is not needed
  el: HTMLElement | null,
  oldValue: unknown,
  itemIndex?: number,
) => {
  const value = tryDataviewLinkToMarkdown(newValue);
  const {
    app: { fileManager, vault },
  } = plugin;
  // const scrollFixer = new ScrollFixer(el);
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

  if (fmUpdated) return; //scrollFixer.fix();

  const inlineUpdated = await tryUpdateInlineProperty(
    property,
    value,
    oldValue,
    file,
    vault,
    itemIndex,
  );
  if (inlineUpdated) return; //scrollFixer.fix();

  // property is not in frontmatter nor inline
  await fileManager.processFrontMatter(file, (fm) => {
    fm[property] = value;
  });

  // scrollFixer.fix();
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

export const parseLinesForInlineFields = (lines: (string | null)[]) => {
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

export const splitYamlAndContent = (content: string) => {
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
  return { yaml, lines };
};

const tryUpdateInlineProperty = async (
  property: string,
  value: unknown,
  previousValue: unknown,
  file: TFile,
  vault: Vault,
  itemIndex?: number,
) => {
  if (value?.toString().includes("\n")) {
    new Notice("Inline properties cannot contain new lines!", 5000);
    return true;
  }
  const content = await vault.read(file);
  const { yaml, lines } = splitYamlAndContent(content);
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
  console.log("found: ", foundInline);
  const newFieldValue = foundInline.match.replaceAll(
    previousValue?.toString() ?? "",
    newValue,
  );
  lines[foundInline.line] =
    lines[foundInline.line]?.replaceAll(foundInline.match, newFieldValue) ??
    null;
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
  showToolbar: boolean;
  toolbarTop: boolean;
  lockEditing: boolean;
  headerIcons: boolean;
  newNoteTemplatePath: string;
  newNoteFolderPath: string;
  tableClassName: string;
  horizontalAlignment: "left" | "center" | "right";
  verticalAlignment: "top" | "middle" | "bottom";
};

export type DataEditBlockConfigKey = keyof DataEditBlockConfig;

export const defaultDataEditBlockConfig: DataEditBlockConfig = {
  showToolbar: true,
  toolbarTop: true,
  lockEditing: false,
  headerIcons: true,
  newNoteTemplatePath: "",
  newNoteFolderPath: "",
  tableClassName: "",
  horizontalAlignment: "left",
  verticalAlignment: "top",
};

// TODO adds one extra line of space (not incrementally) which doesn't break anything but looks weird
export const splitQueryOnConfig: (codeBlockText: string) => {
  query: string;
  config: DataEditBlockConfig;
} = (codeBlockText: string) => {
  const [query, configStr] = codeBlockText.split(/\n^---$\n/m);
  try {
    const config = parseYaml(configStr);
    if (typeof config !== "object") throw new Error();
    return {
      query,
      config: {
        ...defaultDataEditBlockConfig,
        ...(config as DataEditBlockConfig),
      },
    };
  } catch (e) {
    // const msg = "invalid YAML detected in config";
    // console.error(msg);
    return { query, config: defaultDataEditBlockConfig };
  }
};

/**
 * Records the current scroll on instantiation, and provides the `fix()` method to revert back to that scroll position.
 *
 * Editing a note with the `Editor` API will usually result in a weird scroll down. Not sure why, but this class can be used to fix that.
 *
 * Having to do this feels like I am doing something wrong but for now it works.
 */
export class ScrollFixer {
  private scroller: HTMLElement;
  private prevScroll: number;

  constructor(el: HTMLElement) {
    const scroller = el.closest(".cm-scroller") as HTMLElement | null;
    if (!scroller) {
      throw new Error("Could not find scroller");
    }
    this.scroller = scroller;
    this.prevScroll = scroller.scrollTop;
  }

  /**
   * Restores scroll position back to the previously recorded position.
   */
  fix(): void {
    // this will be used after a immediately after a DOM mutation so we run this next in the event queue to give it time to update
    setTimeout(() => {
      this.scroller.scrollTo({ top: this.prevScroll, behavior: "instant" });
    }, 0);
  }
}

// TODO fix scroll issue
export const updateBlockConfig = (
  key: DataEditBlockConfigKey,
  value: DataEditBlockConfig[typeof key],
  codeBlockInfo: CodeBlockInfo,
) => {
  const {
    config,
    ctx,
    el,
    plugin: {
      app: { workspace },
    },
    query: preQuery,
    hideFileCol,
  } = codeBlockInfo;
  // update the old config
  const newConfig = { ...config, [key]: value };
  // turn into yaml text. Always includes a newline character at the end
  const newConfigStr = stringifyYaml(newConfig);
  // text is the entire notes text and is essentially a synchronous read
  const { lineStart, lineEnd } = ctx.getSectionInfo(el)!;
  // remove the ', file.link' we added if so
  const query = hideFileCol ? preQuery.slice(0, -11) : preQuery;

  const newCodeBlockText =
    "```dataedit\n" + query + "\n---\n" + newConfigStr + "```";
  const editor = workspace.activeEditor?.editor;
  if (!editor) {
    return;
  }
  const scrollFixer = new ScrollFixer(el);
  editor.replaceRange(
    newCodeBlockText,
    { line: lineStart, ch: 0 },
    { line: lineEnd, ch: NaN },
  );
  scrollFixer.fix();
};

// TODO could probably combine this with the updater func since it's literally just one line difference
// but typing the overloads is seeming more difficult than I thought
// TODO fix scroll issue
export const setBlockConfig = (
  config: DataEditBlockConfig,
  codeBlockInfo: CodeBlockInfo,
) => {
  const {
    ctx,
    el,
    plugin: {
      app: { workspace },
    },
    query: preQuery,
    hideFileCol,
  } = codeBlockInfo;
  // turn into yaml text. Always includes a newline character at the end
  const newConfigStr = stringifyYaml(config);
  // text is the entire notes text and is essentially a synchronous read
  const { lineStart, lineEnd } = ctx.getSectionInfo(el)!;
  // remove the ', file.link' we added if so
  const query = hideFileCol ? preQuery.slice(0, -11) : preQuery;
  const newCodeBlockText =
    "```dataedit\n" + query + "\n---\n" + newConfigStr + "```";
  const editor = workspace.activeEditor?.editor;
  if (!editor) {
    return;
  }

  const scrollFixer = new ScrollFixer(el);
  editor.replaceRange(
    newCodeBlockText,
    { line: lineStart, ch: 0 },
    { line: lineEnd, ch: NaN },
  );
  scrollFixer.fix();
};

export const getTemplateFiles = (app: App) => {
  const folderPath =
    // @ts-expect-error
    app.internalPlugins.plugins.templates.instance.options.folder;
  if (!folderPath) return;
  const folder = app.vault.getFolderByPath(folderPath);
  if (!folder) return;
  if (!folder.children.length) return;
  return folder.children.filter((t) => t instanceof TFile);
};

export const getAllFiles = (app: App) => {
  return app.vault.getAllLoadedFiles().filter((f) => f instanceof TFile);
};

export const getAllFolders = (app: App) => {
  return app.vault.getAllFolders(false);
};

export const ensureFileLinkColumn = (source: string) => {
  if (!source.toLowerCase().startsWith("table without id"))
    return { source, hide: false };
  const lines = source.split("\n");
  if (lines[0].includes("file.link")) return { source, hide: false };
  lines[0] += ", file.link";
  return { source: lines.join("\n"), hide: true };
};
