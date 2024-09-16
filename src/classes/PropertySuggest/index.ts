import { AbstractInputSuggest, SearchComponent, App, setIcon } from "obsidian";
import { createFilter } from "@kobalte/core";

type Suggestion = { property: string; type: string; icon: string };
export class PropertySuggest extends AbstractInputSuggest<Suggestion> {
  searchCmp: SearchComponent;
  filter = createFilter({ sensitivity: "base", usage: "search" });

  constructor(app: App, searchCmp: SearchComponent) {
    super(app, searchCmp.inputEl);
    this.searchCmp = searchCmp;
  }

  protected getSuggestions(query: string): Suggestion[] {
    const {
      app: { metadataTypeManager },
      filter,
    } = this;

    const properties = metadataTypeManager.getAllProperties();
    return Object.keys(properties)
      .filter((key) => filter.contains(key, query))
      .map<Suggestion>((key) => {
        const { name: property, type } = properties[key];
        const icon =
          metadataTypeManager.registeredTypeWidgets[type]?.icon ??
          "file-question";
        return { property, type, icon };
      });
  }

  renderSuggestion(value: Suggestion, el: HTMLElement): void {
    const { property, type, icon } = value;
    el.classList.add("mod-complex");
    const contentEl = el.createDiv({ cls: "suggestion-content" });
    contentEl.createDiv({ cls: "suggestion-title", text: property });
    contentEl.createDiv({ cls: "suggestion-note", text: type });
    const auxEl = el.createDiv({ cls: "suggestion-aux" });
    const flairEl = auxEl.createDiv({ cls: "suggestion-flair" });
    setIcon(flairEl, icon);
  }

  selectSuggestion(value: Suggestion, _: MouseEvent | KeyboardEvent): void {
    this.searchCmp.setValue(value.property);
    this.searchCmp.onChanged();
    this.close();
  }
}
