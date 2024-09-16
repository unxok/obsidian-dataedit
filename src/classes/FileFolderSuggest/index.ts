import {
  AbstractInputSuggest,
  TFile,
  TFolder,
  SearchComponent,
  App,
} from "obsidian";
import { createFilter } from "@kobalte/core";

export class FileFolderSuggest extends AbstractInputSuggest<TFile | TFolder> {
  searchCmp: SearchComponent;
  type: "files" | "folders";
  filter = createFilter({ sensitivity: "base", usage: "search" });

  constructor(app: App, searchCmp: SearchComponent, type: "files" | "folders") {
    super(app, searchCmp.inputEl);
    this.searchCmp = searchCmp;
    this.type = type;
  }

  protected getSuggestions(
    query: string,
  ): (TFile | TFolder)[] | Promise<(TFile | TFolder)[]> {
    const {
      type,
      app: { vault },
      filter,
    } = this;
    const arr = type === "files" ? vault.getFiles() : vault.getAllFolders();
    return arr.filter(
      (f) => filter.contains(f.name, query) || filter.contains(f.path, query),
    );
  }

  renderSuggestion(value: TFile | TFolder, el: HTMLElement): void {
    const { name, path } = value;
    const basename = name.endsWith(".md") ? name.slice(0, -3) : name;
    el.classList.add("mod-complex");
    const contentEl = el.createDiv({ cls: "suggestion-content" });
    contentEl.createDiv({ cls: "suggestion-title", text: basename });
    contentEl.createDiv({ cls: "suggestion-note", text: path });
  }

  selectSuggestion(
    value: TFile | TFolder,
    _: MouseEvent | KeyboardEvent,
  ): void {
    this.searchCmp.setValue(value.path);
    this.searchCmp.onChanged();
    this.close();
  }
}
