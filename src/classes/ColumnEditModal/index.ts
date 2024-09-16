import { BlockContext } from "@/components/CodeBlock";
import { renameColumn } from "@/util/mutation";
import { Modal, Setting } from "obsidian";

export class ColumnEditModal extends Modal {
  private colIndex: number;
  private oldProperty: string;
  private oldAlias: string;
  private newProperty: string;
  private newAlias: string;
  private blockContext: BlockContext;
  private replaceAll: boolean = false;
  constructor(
    colIndex: number,
    oldProperty: string,
    oldAlias: string,
    blockContext: BlockContext,
  ) {
    super(blockContext.plugin.app);
    this.colIndex = colIndex;
    this.oldProperty = oldProperty;
    this.oldAlias = oldAlias;
    this.newProperty = oldProperty;
    this.newAlias = oldAlias;
    this.blockContext = blockContext;
  }

  onOpen(): void {
    this.setTitle("Edit column");
    const { contentEl, colIndex, oldProperty, oldAlias } = this;
    contentEl.empty();
    contentEl
      .createEl("p")
      .setText(
        "Edit your query to the property and alias (if provided) you enter.",
      );
    contentEl.createEl("p").setText("This will NOT update any notes metdata.");

    new Setting(contentEl)
      .setName("Property name")
      .setDesc(
        "The name of the property to query. This will NOT be validated, so make sure to format it correctly.",
      )
      .addText((cmp) =>
        cmp.setValue(oldProperty).onChange((v) => (this.newProperty = v)),
      );

    new Setting(contentEl)
      .setName("Alias name (optional)")
      .setDesc(
        'The name to show in the header. This will be enclosed in double quotes (") automatically for you.',
      )
      .addText((cmp) =>
        cmp.setValue(oldAlias ?? "").onChange((v) => (this.newAlias = v)),
      );

    new Setting(contentEl)
      .setName("Replace all occurrences")
      .setDesc(
        "Turn on to replace all instances of the old property name with the new name.",
      )
      .addToggle((cmp) =>
        cmp.setValue(false).onChange((b) => (this.replaceAll = b)),
      );

    new Setting(contentEl).addButton((cmp) =>
      cmp
        .setButtonText("update")
        .onClick(() => {
          const { oldProperty, oldAlias, newProperty, newAlias, blockContext } =
            this;
          if (oldProperty === newProperty && oldAlias === newAlias) {
            return this.close();
          }
          if (this.replaceAll) {
            blockContext.query = blockContext.query.replaceAll(
              oldProperty,
              newProperty,
            );
          }
          renameColumn({
            propertyName: newProperty,
            alias: newAlias,
            index: colIndex,
            blockContext: blockContext,
          });
          this.close();
        })
        .setCta(),
    );
  }
}
