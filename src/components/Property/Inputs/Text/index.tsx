import { useBlock } from "@/components/CodeBlock";
import { onMount } from "solid-js";
import {
  AbstractInputSuggest,
  App,
  HeadingCache,
  SearchResult,
  SectionCache,
  TFile,
} from "obsidian";
import { createFilter } from "@kobalte/core";
import { MetadataEditor } from "obsidian-typings";
import { PropertyCommonProps } from "../../PropertySwitch";

export const PropertyText = (props: PropertyCommonProps) => {
  const bctx = useBlock();
  let ref: HTMLDivElement;

  onMount(() => {
    /*
      TODO?
      Trying to make the Suggestion Popover myself is *very* annoying.
      But it turns out, mocking a metadata text editor (which has the suggest built in) works!
      Might need more testing, but this looks good for now.
    */
    bctx.plugin.app.metadataTypeManager.registeredTypeWidgets["text"].render(
      ref,
      {
        type: "text",
        key: props.property,
        value: props.value,
      },
      {
        app: bctx.plugin.app,
        metadataEditor: {} as MetadataEditor,
        blur: async () => {
          console.log("blur");
          const newValue = ref.firstElementChild!.textContent;
          if (newValue === props.value) return;
          await props.updateProperty(newValue);
        },
        key: props.property,
        onChange: () => {},
        sourcePath: bctx.ctx.sourcePath,
      },
    );
  });

  return (
    <div
      ref={(r) => (ref = r)}
      style={{
        "text-align": bctx.config.horizontalAlignment,
      }}
      class="dataedit-property-text-div"
      onFocusOut={async (e) => {
        const newValue = e.target.textContent;
        if (newValue === props.value) return;
        await props.updateProperty(newValue);
      }}
    />
  );
};

export const PropertyText2 = (props: PropertyCommonProps) => {
  const bctx = useBlock();
  let ref: HTMLDivElement;
  let suggest: Suggest;

  const oldOnInput = async (e: MouseEvent & { target: HTMLElement }) => {
    const suggest = bctx.plugin.app.workspace.editorSuggest.suggests[0];
    if (!e.target.textContent?.startsWith("[[")) {
      suggest.close();
      return;
    }

    console.log("suggest: ", suggest);
    const query = e.target.textContent.slice(2);
    const { editor, file } = bctx.plugin.app.workspace.activeEditor ?? {};
    if (!editor || !file) {
      throw Error("No editor found");
    }
    const cursor = editor.getCursor();
    suggest.context = {
      editor,
      query,
      file,
      start: cursor,
      end: cursor,
    };
    const suggestions = (await suggest.getSuggestions(
      suggest.context,
    )) as SearchResult[];
    suggest.showSuggestions(suggestions);

    console.log(suggest);
  };

  onMount(() => {
    suggest = new Suggest(bctx.plugin.app, ref);
  });

  return (
    <div
      ref={(r) => (ref = r)}
      style={{
        "text-align": bctx.config.horizontalAlignment,
      }}
      contentEditable={true}
      class="dataedit-property-text"
      onInput={(e) => {
        if (!e.target.textContent?.startsWith("[[")) {
          return suggest.close();
        }
        suggest.open();
      }}
      onBlur={async (e) => {
        const newValue = e.target.textContent;
        if (newValue === props.value) return;
        await props.updateProperty(newValue);
      }}
    >
      {props.value?.toString() ?? ""}
    </div>
  );
};

type Suggestion = {
  title: string;
  note?: string;
  flair?: string;
  file?: TFile;
  section?: SectionCache;
  heading?: HeadingCache;
  isNoMatch?: boolean;
};

type LinkSuggestion = ReturnType<
  App["metadataCache"]["getLinkSuggestions"]
>[0] & { alias?: string };

const defaultNoMatchSuggestion = { title: "No match found", isNoMatch: true };

class Suggest extends AbstractInputSuggest<Suggestion> {
  triggerEl: HTMLDivElement;
  filter = createFilter({ usage: "search", sensitivity: "base" });
  constructor(app: App, el: HTMLDivElement) {
    super(app, el);
    this.triggerEl = el;
  }

  // protected getSuggestions(query: string): string[] | Promise<string[]> {
  //   return ["a", "b", "c", "d"];
  // }

  private getFileSuggestions(parsedQuery: string): Suggestion[] {
    const {
      app: { metadataCache },
      filter,
    } = this;
    const linkObjs = metadataCache.getLinkSuggestions() as LinkSuggestion[];
    const suggestions = linkObjs.map<Suggestion>(({ file, path, alias }) => {
      return {
        title: alias ?? file?.basename ?? path,
        note: file?.path,
        file: file ?? undefined,
      };
    });
    // const intl = Intl.Collator(undefined, {usage: 'search', sensitivity: 'base'});
    const filtered = suggestions.filter(
      ({ note = "", title }) =>
        filter.contains(title, parsedQuery) ||
        filter.contains(note, parsedQuery),
    );
    if (filtered.length) return filtered;
    return [{ ...defaultNoMatchSuggestion }];
  }

  private async getSubSuggestions(parsedQuery: string): Promise<Suggestion[]> {
    const {
      app: { metadataCache, vault },
      filter,
    } = this;
    const headerCharIndex = parsedQuery.indexOf("#");
    const sectionCharIndex = parsedQuery.indexOf("^");
    const subCharIndex =
      headerCharIndex !== -1
        ? headerCharIndex
        : sectionCharIndex !== -1
          ? sectionCharIndex
          : null;
    if (subCharIndex === null) {
      // This method should not called if parsedQuery doesn't have either
      throw new Error('Could not find "#" or "^" character in string.');
    }

    const str = parsedQuery.slice(subCharIndex);
    const subChar = str.charAt(0) as "#" | "^";
    const searchStr = str.slice(1);
    const preFileName = parsedQuery.slice(0, subCharIndex);
    const fileName = preFileName.endsWith(".md")
      ? preFileName
      : preFileName + ".md";
    const file = vault
      .getAllLoadedFiles()
      .find((f) => f.name === fileName && f instanceof TFile) as
      | TFile
      | undefined;
    if (!file) return [{ ...defaultNoMatchSuggestion }];
    const { hash } = metadataCache.fileCache[file.path] ?? {};
    if (!hash || !file) return [{ ...defaultNoMatchSuggestion }];
    console.log("hi");
    const fileContent = await vault.cachedRead(file);
    const metadata = metadataCache.metadataCache[hash];
    const { headings, sections } = metadata;

    // Obsidian's default bahavior when no matches found with headings and links is to show what's typed as the only suggestion
    const noMatchSuggestion: Suggestion = {
      title: searchStr,
      isNoMatch: true,
    };

    if (subChar === "#") {
      if (!headings?.length) {
        return [{ ...noMatchSuggestion }];
      }
      const filtered = headings
        .map<Suggestion>((heading) => ({
          title: heading.heading,
          flair: "H" + heading.level,
          file: file,
          heading: heading,
        }))
        .filter(({ title }) => filter.contains(title, searchStr));
      if (filtered.length) return filtered;
    }
    if (subChar === "^") {
      if (!sections?.length) {
        return [{ ...noMatchSuggestion }];
      }
      const filtered = sections
        .map<Suggestion>((section) => {
          const {
            position: { start, end },
            type,
            id,
          } = section;
          const text = fileContent.slice(start.offset, end.offset);
          return {
            title: text,
            file: file,
            section: section,
            note: id,
            flair: type,
          };
        })
        .filter(
          ({ title, note = "", flair = "" }) =>
            filter.contains(title, searchStr) ||
            filter.contains(note, searchStr) ||
            filter.contains(flair, searchStr),
        );
      if (filtered.length) return filtered;
    }

    return [{ ...noMatchSuggestion }];
  }

  protected async getSuggestions(query: string): Promise<Suggestion[]> {
    if (!query) {
      this.close();
      return [];
    }
    const rightBracketIndex = query.indexOf("]");
    const sliceEnd = rightBracketIndex === -1 ? undefined : rightBracketIndex;
    const parsedQuery = query.slice(2, sliceEnd);

    if (parsedQuery.includes("#") || parsedQuery.includes("^")) {
      return await this.getSubSuggestions(parsedQuery);
    }

    return this.getFileSuggestions(parsedQuery);
  }

  renderSuggestion(value: Suggestion, el: HTMLElement): void {
    const { title, note, flair } = value;
    el.classList.add("mod-complex");
    const contentEl = el.createDiv({ cls: "suggestion-content" });
    contentEl.createDiv({ cls: "suggestion-title", text: title });
    if (note) {
      contentEl.createDiv({ cls: "suggestion-note", text: note });
    }
    const auxEl = el.createDiv({ cls: "suggestion-aux" });
    if (flair) {
      auxEl.createDiv({ cls: "suggestion-flair", text: flair });
    }
    return;
  }

  selectSuggestion(value: Suggestion, evt: MouseEvent | KeyboardEvent): void {
    const placeCursor = () => {
      // place cursor within end of text in triggerEl
      const sel = window.getSelection();
      sel?.selectAllChildren(this.triggerEl);
      sel?.collapseToEnd();
    };

    if (value.isNoMatch) {
      this.close();
      placeCursor();
      return;
    }

    const sourcePath = this.app.workspace.activeEditor?.file?.path;

    if (!sourcePath) {
      throw new Error("File not found for active editor");
    }

    if (value.file) {
      const subpath = this.getSubpath(value);
      const wikiLink = this.app.fileManager.generateMarkdownLink(
        value.file,
        sourcePath,
        subpath,
      );
      this.triggerEl.textContent = wikiLink;
      this.close();
      placeCursor();
    }
    return;
  }

  getSubpath(suggestion: Suggestion): string | undefined {
    const { section, heading } = suggestion;

    if (!(section || heading)) return undefined;

    if (heading) {
      return "#" + heading.heading;
    }

    if (section?.id) {
      return "^" + section.id;
    }

    return "";
  }
}
