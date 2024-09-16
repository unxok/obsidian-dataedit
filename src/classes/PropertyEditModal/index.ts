import { BlockContext } from "@/components/CodeBlock";
import { DataviewLink } from "@/lib/types";
import { splitYamlAndContent, parseLinesForInlineFields } from "@/lib/util";
import { renameColumn } from "@/util/mutation";
import { Modal, Notice, Setting } from "obsidian";

export class PropertyEditModal extends Modal {
  private colIndex: number;
  private oldProperty: string;
  private alias: string;
  private newProperty: string;
  private blockContext: BlockContext;
  private replaceAll: boolean = false;
  constructor(
    colIndex: number,
    oldProperty: string,
    alias: string,
    blockContext: BlockContext,
  ) {
    super(blockContext.plugin.app);
    this.colIndex = colIndex;
    this.oldProperty = oldProperty;
    this.alias = alias;
    this.newProperty = oldProperty;
    this.blockContext = blockContext;
  }

  async doUpdate(): Promise<void> {
    const { blockContext, oldProperty, alias, newProperty, colIndex } = this;
    const {
      dataviewAPI,
      plugin: { app },
    } = blockContext;
    const result = await dataviewAPI.query(
      "TABLE\nWHERE " + oldProperty + " != null",
    );
    if (!result.successful) {
      const msg = "Failed to update property, please try again!";
      new Notice(msg);
      return console.error(msg);
    }
    const files = result.value.values.map(
      ([obj]) => app.vault.getFileByPath((obj as DataviewLink).path)!,
    );

    files.map(async (f) => {
      let isFail = false;
      await app.fileManager.processFrontMatter(f, (fm) => {
        if (!fm.hasOwnProperty(oldProperty)) {
          // assume it's an inline property
          isFail = true;
        }
        fm[newProperty] = fm[oldProperty];
        delete fm[oldProperty];
      });
      if (!isFail) return;
      await app.vault.process(f, (data) => {
        const { yaml, lines } = splitYamlAndContent(data);
        const fields = parseLinesForInlineFields(lines);
        fields.forEach(({ key, line, match }) => {
          if (key !== oldProperty || !lines[line]) return;
          const newFieldValue = match.replaceAll(oldProperty, newProperty);
          lines[line] = lines[line].replaceAll(match, newFieldValue);
        });
        let finalContent = "";
        for (let m = 0; m < lines.length; m++) {
          const v = lines[m];
          if (v === null) continue;
          finalContent += "\n" + v;
        }
        return yaml.join("\n") + finalContent;
      });
    });

    if (this.replaceAll) {
      blockContext.query = blockContext.query.replaceAll(
        oldProperty,
        newProperty,
      );
    }

    renameColumn({
      propertyName: newProperty,
      alias: oldProperty === alias ? "" : alias,
      blockContext: blockContext,
      index: colIndex,
    });

    new Notice("Succesfully renamed property in " + files.length + " notes!");
  }

  onOpen(): void {
    const { contentEl, oldProperty } = this;
    this.setTitle("Edit property: " + oldProperty);
    contentEl.empty();
    contentEl
      .createEl("p")
      .setText(
        "Edit the property name and modfiy all notes that have the old name in their fronmatter or inline properties.",
      );
    contentEl
      .createEl("p")
      .setText(
        "The specified column will be swapped out with the new name within the 'TABLE ...' line upon completion.",
      );
    contentEl
      .createEl("p", { attr: { style: "color: var(--text-error);" } })
      .setText(
        "This update will be permanent and may modify many notes at once. Use with caution!",
      );

    new Setting(contentEl)
      .setName("New property name")
      .setDesc("The new name to change to.")
      .addText((cmp) =>
        cmp.setValue(oldProperty).onChange((v) => (this.newProperty = v)),
      );

    new Setting(contentEl)
      .setName("Replace all occurrences")
      .setDesc(
        "Turn on to replace all instances of the old property name with the new name within the other lines of this block's query.",
      )
      .addToggle((cmp) =>
        cmp.setValue(false).onChange((b) => (this.replaceAll = b)),
      );

    new Setting(contentEl).addButton((cmp) =>
      cmp
        .setButtonText("update")
        .onClick(async () => {
          const { oldProperty, newProperty } = this;
          if (oldProperty === newProperty) {
            return this.close();
          }

          await this.doUpdate();

          this.close();
        })
        .setCta(),
    );
  }
}
