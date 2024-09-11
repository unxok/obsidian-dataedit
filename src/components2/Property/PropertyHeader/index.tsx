import { Icon } from "@/components/Icon";
import { Markdown } from "@/components/Markdown";
import { BlockContext, useBlock } from "@/components2/CodeBlock";
import {
  COMPLEX_PROPERTY_PLACEHOLDER,
  dataeditDropdownTypePrefix,
} from "@/lib/constants";
import { DataviewLink, PropertyType } from "@/lib/types";
import { parseLinesForInlineFields, splitYamlAndContent } from "@/lib/util";
import { renameColumn, toFirstUpperCase } from "@/lib2/utils";
import { App, Menu, Modal, Notice, Setting, TFile } from "obsidian";
import { MetadataTypeManagerRegisteredTypeWidgetsRecord } from "obsidian-typings";
import {
  JSXElement,
  Show,
  createEffect,
  createMemo,
  onCleanup,
} from "solid-js";

export type PropertyHeaderProps = {
  header: string;
  property: string;
  propertyType: PropertyType;
  index: number;
  children?: JSXElement;
};
export const PropertyHeader = (props: PropertyHeaderProps) => {
  const bctx = useBlock();
  let menu: Menu;

  const isFile = () => {
    const a = props.property === "file.link";
    const b = props.header === bctx.dataviewAPI.settings.tableIdColumnName;
    return a || b;
  };

  const isDefaultIdCol = () => {
    const a = props.property === bctx.dataviewAPI.settings.tableIdColumnName;
    const b = props.header === bctx.dataviewAPI.settings.tableIdColumnName;
    return a && b;
  };

  /* 
    TODO even though it just won't work, it should probably not show the options
    to edit/delete property when the property is dot notation (file.something, or a nested yaml property)
  */
  const createMenu = () => {
    const { metadataTypeManager } = bctx.plugin.app;
    const typesObj = { ...metadataTypeManager.registeredTypeWidgets };
    const customTypes = Object.keys(typesObj).filter((k) =>
      k.startsWith(dataeditDropdownTypePrefix),
    ) as PropertyType[];
    const deafaultTypes: PropertyType[] = [
      "text",
      "multitext",
      "number",
      "checkbox",
      "date",
      "datetime",
    ];

    const allowedTypeKeys = [...deafaultTypes, ...customTypes];

    const typeKeys = (Object.keys(typesObj) as PropertyType[]).filter((k) =>
      allowedTypeKeys.includes(k),
    );

    typeKeys.push("unknown");

    // const types = [...deafaultTypes, ...customTypes];

    // const typesIcons = types.map<[propType: PropertyType, icon: string]>(
    //   (t) => {
    //     if (t === "unknown") {
    //       return [t, "file-question"];
    //     }
    //     const obj = typesObj[t];
    //     if (!obj) {
    //       const msg = "Dataedit: Failed to get icon for property type";
    //       new Notice(msg);
    //       throw new Error(msg);
    //     }
    //     const postT = t.startsWith(dataeditDropdownTypePrefix)
    //       ? (t.slice(dataeditDropdownTypePrefix.length) as PropertyType)
    //       : t;
    //     return [postT, obj.icon];
    //   },
    // );

    menu = new Menu();

    menu
      .addItem((item) => {
        const submenu = item
          .setTitle("Change type")
          .setIcon("more-horizontal")
          .setSubmenu();
        typeKeys.forEach((k) => {
          const {
            icon,
            name,
            type: typeKey,
          } = typesObj[k] ?? {
            icon: "file-question",
            name: () => "Unset",
            type: "unknown",
          };
          submenu.addItem((sub) =>
            sub
              .setTitle(name())
              .setIcon(icon)
              .setChecked(typeKey === props.propertyType)
              .onClick(async () => {
                if (typeKey === "unknown") {
                  await metadataTypeManager.unsetType(props.property);
                  console.log("should be unset");
                  return;
                }
                await metadataTypeManager.setType(props.property, typeKey);
              }),
          );
        });
        // typesIcons.forEach(([t, icon]) => {
        //   submenu.addItem((sub) =>
        //     sub
        //       .setTitle(t === "datetime" ? "Date & time" : toFirstUpperCase(t))
        //       .setIcon(icon)
        //       .setChecked(t === props.propertyType)
        //       .onClick(async () => {
        //         if (t === "unknown") {
        //           await metadataTypeManager.unsetType(props.property);
        //           return;
        //         }
        //         await metadataTypeManager.setType(props.property, t);
        //       }),
        //   );
        // });
      })
      .addItem((item) =>
        item
          .setTitle("Edit column")
          .setIcon("pencil")
          .onClick(() => {
            const modal = new ColumnEditModal(
              props.index,
              props.property,
              props.header === props.property ? "" : props.header,
              bctx,
            );
            modal.open();
          }),
      )
      .addItem((item) =>
        item
          .setTitle("Edit property")
          .setIcon("pen-box")
          .onClick(() => {
            const modal = new PropertyEditModal(
              props.index,
              props.property,
              props.header,
              bctx,
            );
            modal.open();
          }),
      )
      .addSeparator()
      .addItem((item) =>
        item
          .setTitle("Remove column")
          .setIcon("cross")
          .onClick(() => {
            new ColumnRemoveModal(
              props.index,
              props.property,
              props.header,
              bctx,
            ).open();
          }),
      )
      .addItem((item) =>
        item
          .setTitle("Delete property")
          .setIcon("trash")
          .setWarning(true)
          .onClick(() => {
            new PropertyDeleteModal(
              props.index,
              props.property,
              props.header,
              bctx,
            ).open();
          }),
      );
  };

  createEffect(() => {
    createMenu();
  });

  return (
    <div
      onClick={(e) => {
        const attr = e.target.getAttribute(
          "data-dataedit-column-reorder-button",
        );
        if (attr !== null) return;

        !isDefaultIdCol() && menu.showAtMouseEvent(e);
      }}
      classList={{ "dataedit-property-header": !isDefaultIdCol() }}
      style={{
        // position: "relative",
        display: "inline-flex",
        "flex-direction": "row",
        "align-items": "center",
        gap: ".5ch",
        width: "fit-content",
        position: "static",
      }}
    >
      {props.children}
      <Show when={bctx.config.typeIcons && bctx.config.typeIconLeft}>
        <PropertyHeaderIcon {...props} isFile={isFile()} />
      </Show>
      <Markdown
        app={bctx.plugin.app}
        markdown={props.header}
        sourcePath={bctx.ctx.sourcePath}
        class="no-p-margin"
        style={{ "text-wrap": "nowrap" }}
      />
      <Show when={bctx.config.typeIcons && !bctx.config.typeIconLeft}>
        <PropertyHeaderIcon {...props} isFile={isFile()} />
      </Show>
    </div>
  );
};

const PropertyHeaderIcon = (
  props: PropertyHeaderProps & { isFile: boolean },
) => {
  return (
    <Show
      when={props.isFile}
      fallback={<PropertyIcon propertyType={props.propertyType} />}
    >
      <Icon iconId="file" />
    </Show>
  );
};

const PropertyIcon = (props: { propertyType: PropertyType }) => {
  const bctx = useBlock();
  const iconId = createMemo(() => {
    const typesObj = bctx.plugin.app.metadataTypeManager.registeredTypeWidgets;
    const icon = typesObj[props.propertyType]?.icon;
    return icon ?? "star";
  });

  return <Icon iconId={iconId()} />;

  // return (
  //   <Switch fallback={<Icon iconId="text" />}>
  //     <Match when={props.propertyType === "aliases"}>
  //       <Icon iconId="forward" />
  //     </Match>
  //     <Match when={props.propertyType === "checkbox"}>
  //       <Icon iconId="check-square" />
  //     </Match>
  //     <Match when={props.propertyType === "date"}>
  //       <Icon iconId="calendar" />
  //     </Match>
  //     <Match when={props.propertyType === "datetime"}>
  //       <Icon iconId="clock" />
  //     </Match>
  //     <Match when={props.propertyType === "multitext"}>
  //       <Icon iconId="list" />
  //     </Match>
  //     <Match when={props.propertyType === "number"}>
  //       <Icon iconId="binary" />
  //     </Match>
  //     <Match when={props.propertyType === "tags"}>
  //       <Icon iconId="tags" />
  //     </Match>
  //     <Match when={props.propertyType === "unknown"}>
  //       <Icon iconId="star" />
  //     </Match>
  //   </Switch>
  // );
};

class ColumnEditModal extends Modal {
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

class PropertyEditModal extends Modal {
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
      .setText("Edit the property name for all notes that contain it.");
    contentEl
      .createEl("p")
      .setText(
        "The specified column will be swapped out with the new name within the 'TABLE ...' line upon completion, but you may still need to update any other lines that used the old property name.",
      );
    contentEl
      .createEl("p", { attr: { style: "color: var(--text-error);" } })
      .setText("This update will be permanent! Use with caution.");

    new Setting(contentEl)
      .setName("New property name")
      .setDesc("The new name to change to.")
      .addText((cmp) =>
        cmp.setValue(oldProperty).onChange((v) => (this.newProperty = v)),
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

// class PropertyDeleteModal extends Modal {
//   private colIndex: number;
//   private property: string;
//   private blockContext: BlockContext;

//   constructor(
//     app: App,
//     colIndex: number,
//     blockContext: BlockContext,
//   ) {
//     super(app);
//     this.colIndex = colIndex;
//     this.blockContext = blockContext;
//   }

//   async doUpdate(): Promise<void> {
//     const { blockContext, oldProperty, alias, newProperty, colIndex } = this;
//     const {
//       dataviewAPI,
//       plugin: { app },
//     } = blockContext;
//     const result = await dataviewAPI.query(
//       "TABLE\nWHERE " + oldProperty + " != null",
//     );
//     if (!result.successful) {
//       const msg = "Failed to update property, please try again!";
//       new Notice(msg);
//       return console.error(msg);
//     }
//     const files = result.value.values.map(
//       ([obj]) => app.vault.getFileByPath((obj as DataviewLink).path)!,
//     );

//     files.forEach(async (f) => {
//       await app.fileManager.processFrontMatter(f, (fm) => {
//         if (!fm.hasOwnProperty(oldProperty)) {
//           throw new Error(
//             "Couldn't find old property in found files. This should never happen.",
//           );
//         }
//         fm[newProperty] = fm[oldProperty];
//         delete fm[oldProperty];
//       });
//     });

//     if (this.replaceAll) {
//       blockContext.query = blockContext.query.replaceAll(
//         oldProperty,
//         newProperty,
//       );
//     }

//     renameColumn({
//       propertyName: newProperty,
//       alias: oldProperty === alias ? "" : alias,
//       blockContext: blockContext,
//       index: colIndex,
//     });

//     new Notice("Succesfully renamed property in " + files.length + " notes!");
//   }

//   onOpen(): void {
//     const { contentEl, property } = this;
//     this.setTitle("Delete property: " + property);
//     contentEl.empty();
//     contentEl
//       .createEl("p")
//       .setText("Delete property from notes.");
//     contentEl
//       .createEl("p")
//       .setText(
//         "Only works on frontmatter properties. Inline properties are not supported yet.",
//       );
//     contentEl
//       .createEl("p", { attr: { style: "color: var(--text-error);" } })
//       .setText("This deletion will be permanent! Use with caution.");

//     new Setting(contentEl)
//       .setName("New property name")
//       .setDesc("The new name to change to.")
//       .addText((cmp) =>
//         cmp.setValue(oldProperty).onChange((v) => (this.newProperty = v)),
//       );

//     new Setting(contentEl)
//       .setName("Replace all occurrences")
//       .setDesc(
//         "Turn on to replace all instances of the old property name with the new name.",
//       )
//       .addToggle((cmp) =>
//         cmp.setValue(false).onChange((b) => (this.replaceAll = b)),
//       );

//     new Setting(contentEl).addButton((cmp) =>
//       cmp
//         .setButtonText("update")
//         .onClick(async () => {
//           const { oldProperty, newProperty } = this;
//           if (oldProperty === newProperty) {
//             return this.close();
//           }

//           await this.doUpdate();

//           this.close();
//         })
//         .setCta(),
//     );
//   }
// }

class ColumnRemoveModal extends Modal {
  private colIndex: number;
  private property: string;
  private alias: string;
  private blockContext: BlockContext;
  constructor(
    colIndex: number,
    property: string,
    alias: string,
    blockContext: BlockContext,
  ) {
    super(blockContext.plugin.app);
    this.colIndex = colIndex;
    this.property = property;
    this.alias = alias;
    this.blockContext = blockContext;
  }

  onOpen(): void {
    const { contentEl, colIndex, property, alias } = this;
    const combined = alias ? property + ' AS "' + alias + '"' : property;
    this.setTitle("Remove column: " + combined);
    contentEl.empty();
    contentEl.createEl("p").setText("Removes the column from the table.");
    contentEl
      .createEl("p")
      .setText("This will only affect the 'TABLE ...' line.");
    contentEl.createEl("p").setText("This will NOT update any notes metdata.");

    new Setting(contentEl).addButton((cmp) =>
      cmp
        .setButtonText("remove")
        .setWarning()
        .onClick(() => {
          const { property, alias, blockContext } = this;

          renameColumn({
            propertyName: property,
            alias: alias,
            index: colIndex,
            blockContext: blockContext,
            remove: true,
          });
          this.close();
        })
        .setCta(),
    );
  }
}

class PropertyDeleteModal extends Modal {
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
