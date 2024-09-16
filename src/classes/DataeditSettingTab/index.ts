import DataEdit from "@/main";
import { PluginSettingTab, App, Setting } from "obsidian";
import { DropdownWidgetManager } from "@/classes";

export class DataeditSettingTab extends PluginSettingTab {
  plugin: DataEdit;

  constructor(app: App, plugin: DataEdit) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName("Dropdowns")
      .setDesc(
        "Click the button to open the Dropdown Manager where you can add, edit, and delete custom dropdown configurations for use in frontmatter properties and Dataedit blocks.",
      )
      .addButton((cmp) =>
        cmp.setButtonText("manage").onClick(() => {
          new DropdownWidgetManager(this.plugin).open();
        }),
      );
  }
}
