import { BlockContext } from "@/components/CodeBlock";
import { DataviewLink } from "@/lib/types";
import { splitYamlAndContent, parseLinesForInlineFields } from "@/lib/util";
import { renameColumn } from "@/util/mutation";
import { Modal, Notice, Setting } from "obsidian";

export class PropertyDeleteModal extends Modal {
  private colIndex: number;
  private alias: string;
  private property: string;
  private blockContext: BlockContext;
  constructor(
    colIndex: number,
    property: string,
    alias: string,
    blockContext: BlockContext,
  ) {
    super(blockContext.plugin.app);
    this.colIndex = colIndex;
    this.alias = alias;
    this.property = property;
    this.blockContext = blockContext;
  }

  async doUpdate(): Promise<void> {
    const { blockContext, alias, property, colIndex } = this;
    const {
      dataviewAPI,
      plugin: { app },
    } = blockContext;
    const result = await dataviewAPI.query(
      "TABLE\nWHERE " + property + " != null",
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
        if (!fm.hasOwnProperty(property)) {
          // assume it's an inline property
          isFail = true;
        }
        delete fm[property];
      });
      if (!isFail) return;
      await app.vault.process(f, (data) => {
        const { yaml, lines } = splitYamlAndContent(data);
        const fields = parseLinesForInlineFields(lines);
        fields.forEach(({ key, line, match }) => {
          if (key !== property || !lines[line]) return;
          lines[line] = lines[line].replaceAll(match, "");
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

    renameColumn({
      propertyName: property,
      alias: property === alias ? "" : alias,
      blockContext: blockContext,
      index: colIndex,
      remove: true,
    });

    new Notice("Succesfully renamed property in " + files.length + " notes!");
  }

  onOpen(): void {
    const { contentEl, property } = this;
    this.setTitle("Delete property: " + property);
    contentEl.empty();
    contentEl
      .createEl("p")
      .setText("Removes the property from notes that contain it.");
    contentEl
      .createEl("p")
      .setText(
        "The corresponding column will be removed from the 'TABLE ...' line upon completion, but you may still need to update any other lines that used the property.",
      );
    contentEl
      .createEl("p", { attr: { style: "color: var(--text-error);" } })
      .setText("This update will be permanent! Use with caution.");

    new Setting(contentEl).addButton((cmp) =>
      cmp
        .setButtonText("delete")
        .setWarning()
        .onClick(async () => {
          await this.doUpdate();

          this.close();
        })
        .setCta(),
    );
  }
}
