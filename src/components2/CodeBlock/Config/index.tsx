import { setBlockConfig, SetBlockConfigProps } from "@/lib2/utils";
import { App, Modal, Setting } from "obsidian";
import { BlockContext } from "..";

export type CodeBlockConfig = {
  toggles: boolean;
  containerClass: string;
  verticalAlignment: "top" | "middle" | "bottom";
  horizontalAlignment: "left" | "center" | "right";
  typeIcons: boolean;
  typeIconLeft: boolean;
};

export const defaultCodeBlockConfig: CodeBlockConfig = {
  toggles: false,
  containerClass: "",
  verticalAlignment: "top",
  horizontalAlignment: "left",
  typeIcons: true,
  typeIconLeft: true,
};

export class CodeBlockConfigModal extends Modal {
  private form: CodeBlockConfig;
  private setBlockConfigProps: Omit<SetBlockConfigProps, "newConfig">;
  constructor(
    app: App,
    form: CodeBlockConfig,
    setBlockConfigProps: Omit<SetBlockConfigProps, "newConfig">,
  ) {
    super(app);
    this.form = { ...form };
    this.setBlockConfigProps = setBlockConfigProps;
  }

  updateConfig(): void {
    setBlockConfig({ ...this.setBlockConfigProps, newConfig: this.form });
    this.close();
  }

  onOpen(): void {
    this.setTitle("Configure block");
    const { contentEl, form } = this;
    contentEl
      .createEl("p")
      .setText('Remember to press "save" when you\'re done!');

    /* text */
    new Setting(contentEl)
      .setName("Container CSS class")
      .setDesc(
        "Append the code block container (div.block-language-dataedit) with additional CSS classes. To add multiple classes, just separate each name with a space.",
      )
      .addText((cmp) =>
        cmp
          .setValue(form.containerClass)
          .setPlaceholder("cls-one clsTwo")
          .onChange((v) => (form.containerClass = v)),
      );
    /* dropdowns */
    // form.verticalAlignment
    new Setting(contentEl)
      .setName("Vertical alignment")
      .setDesc("Set the vertical alignment of text")
      .addDropdown((cmp) =>
        cmp
          .addOptions({
            // value: label
            top: "top",
            middle: "middle",
            bottom: "bottom",
          } as Record<CodeBlockConfig["verticalAlignment"], string>)
          .setValue(this.form.verticalAlignment)
          .onChange(
            (v) =>
              (this.form.verticalAlignment =
                v as CodeBlockConfig["verticalAlignment"]),
          ),
      );
    // form.horizontalAlignment
    new Setting(contentEl)
      .setName("Horizontal alignment")
      .setDesc("Set the horizontal alignment of text.")
      .addDropdown((cmp) =>
        cmp
          .addOptions({
            // value: label
            left: "left",
            center: "center",
            right: "right",
          } as Record<CodeBlockConfig["horizontalAlignment"], string>)
          .setValue(this.form.horizontalAlignment)
          .onChange(
            (v) =>
              (this.form.horizontalAlignment =
                v as CodeBlockConfig["horizontalAlignment"]),
          ),
      );

    /* toggles */

    // form.toggles
    new Setting(contentEl)
      .setName("Use toggles for checkboxes")
      .setDesc(
        'Renders "checkbox" properties as toggles instead of checkboxes.',
      )
      .addToggle((cmp) =>
        cmp.setValue(form.toggles).onChange((b) => (form.toggles = b)),
      );

    // form.typeIcons
    new Setting(contentEl)
      .setName("Show property type icons")
      .setDesc(
        "Turn on to display an icon corresponding with the property's type.",
      )
      .addToggle((cmp) =>
        cmp.setValue(form.typeIcons).onChange((b) => (form.typeIcons = b)),
      );

    // form.typeIconLeft
    new Setting(contentEl)
      .setName("Property type icon position")
      .setDesc(
        "Turn on to display type icons to the left of the header text. Turn off to display on the right.",
      )
      .addToggle((cmp) =>
        cmp
          .setValue(form.typeIconLeft)
          .onChange((b) => (form.typeIconLeft = b)),
      );

    /* footer buttons */
    new Setting(contentEl)
      .addButton((cmp) =>
        cmp
          .setButtonText("reset")
          .setWarning()
          .onClick(async () => {
            const onConfirm = () => {
              this.form = null as unknown as CodeBlockConfig;
              this.updateConfig();
            };
            new ConfirmationModal(
              this.app,
              "Are you absolutely sure?",
              "this will completely remove the configuration set for this block.",
              onConfirm,
            ).open();
          }),
      )
      .addButton((cmp) =>
        cmp
          .setButtonText("save")
          .setCta()
          .onClick(() => this.updateConfig()),
      );
  }
}

class ConfirmationModal extends Modal {
  private title: string;
  private description: string;
  private onConfirm: () => void;
  constructor(
    app: App,
    title: string,
    description: string,
    onConfirm: () => void,
  ) {
    super(app);
    this.title = title;
    this.description = description;
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { title, description, onConfirm, contentEl } = this;
    this.setTitle(title);
    contentEl.createEl("p").setText(description);
    new Setting(contentEl)
      .addButton((cmp) =>
        cmp.setButtonText("cancel").onClick(() => this.close()),
      )
      .addButton((cmp) =>
        cmp
          .setButtonText("confirm")
          .setWarning()
          .onClick(() => {
            onConfirm();
            this.close();
          }),
      );
  }
}
