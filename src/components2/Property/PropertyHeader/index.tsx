import { Icon } from "@/components/Icon";
import { Markdown } from "@/components/Markdown";
import { BlockContext, useBlock } from "@/components2/CodeBlock";
import { PropertyType } from "@/lib/types";
import { renameColumn, toFirstUpperCase } from "@/lib2/utils";
import { App, Menu, Modal, Notice, Setting } from "obsidian";
import { Show, createEffect, createMemo, onCleanup } from "solid-js";

type PropertyHeaderProps = {
  header: string;
  property: string;
  propertyType: PropertyType;
  index: number;
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

  const createMenu = () => {
    const { metadataTypeManager } = bctx.plugin.app;
    const typesObj = metadataTypeManager.registeredTypeWidgets;
    const types: PropertyType[] = [
      "text",
      "multitext",
      "number",
      "checkbox",
      "date",
      "datetime",
    ];
    const typesIcons: [propType: PropertyType, icon: string][] = types.map(
      (t) => {
        const obj = typesObj[t];
        if (!obj) {
          const msg = "Dataedit: Failed to get icon for property type";
          new Notice(msg);
          throw new Error(msg);
        }
        return [t, obj.icon];
      },
    );

    menu = new Menu();

    menu
      .addItem((item) => {
        const submenu = item
          .setTitle("Change type")
          .setIcon("more-horizontal")
          .setSubmenu();
        typesIcons.forEach(([t, icon]) => {
          submenu.addItem((sub) =>
            sub
              .setTitle(t === "datetime" ? "Date & time" : toFirstUpperCase(t))
              .setIcon(icon)
              .setChecked(t === props.propertyType)
              .onClick(async () => {
                await metadataTypeManager.setType(props.property, t);
              }),
          );
        });
      })
      .addItem((item) =>
        item
          .setTitle("Edit")
          .setIcon("pencil")
          .onClick(() => {
            const modal = new PropertyEditModal(
              bctx.plugin.app,
              props.index,
              props.property,
              props.header === props.property ? "" : props.header,
              bctx,
            );
            modal.open();
          }),
      );
  };

  createEffect(() => {
    createMenu();
  });

  return (
    <div
      onClick={(e) => !isDefaultIdCol() && menu.showAtMouseEvent(e)}
      classList={{ "dataedit-property-header": !isDefaultIdCol() }}
      style={{
        display: "inline-flex",
        "flex-direction": "row",
        "align-items": "center",
        gap: ".5ch",
        width: "fit-content",
      }}
    >
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
    return icon ?? "text";
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

class PropertyEditModal extends Modal {
  private colIndex: number;
  private oldProperty: string;
  private oldAlias: string;
  private newProperty: string;
  private newAlias: string;
  private blockContext: BlockContext;
  constructor(
    app: App,
    colIndex: number,
    oldProperty: string,
    oldAlias: string,
    blockContext: BlockContext,
  ) {
    super(app);
    this.colIndex = colIndex;
    this.oldProperty = oldProperty;
    this.oldAlias = oldAlias;
    this.newProperty = oldProperty;
    this.newAlias = oldAlias;
    this.blockContext = blockContext;
  }

  onOpen(): void {
    this.setTitle("Edit property");
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

    new Setting(contentEl).addButton((cmp) =>
      cmp
        .setButtonText("update")
        .onClick(() => {
          const { oldProperty, oldAlias, newProperty, newAlias, blockContext } =
            this;
          if (oldProperty === newProperty && oldAlias === newAlias) {
            return this.close();
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
