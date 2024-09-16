import { useBlock } from "@/components/CodeBlock";
import { Modal, App, Setting } from "obsidian";
import { createSignal } from "solid-js";
import { Icon } from "@/components/Icon";
import { PropertyCommonProps } from "../../PropertySwitch";
import { toNumber } from "@/util/pure";

export const PropertyNumber = (props: PropertyCommonProps) => {
  const bctx = useBlock();
  const [size, setSize] = createSignal(props.value?.toString().length ?? 3);
  return (
    <div
    >
      <input
        type="number"
        style={{ width: size() + 0 + "ch" }}
        class="dataedit-property-number-input"
        value={toNumber(props.value, 0)}
        onInput={(e) => {
          setSize(() => e.target.value.length);
        }}
        onBlur={async (e) => {
          const value = toNumber(e.target.value, 0);
          await props.updateProperty(value);
        }}
      />
      <div class="dataedit-number-buttons-container">
        <Icon
          iconId="minus"
          class="clickable-icon"
          style={{ width: "fit-content" }}
          onClick={async () => {
            await props.updateProperty(toNumber(props.value) - 1);
          }}
        />
        <Icon
          iconId="variable"
          class="clickable-icon"
          style={{ width: "fit-content" }}
          onClick={async () => {
            const modal = new ExpressionModal(
              bctx.plugin.app,
              toNumber(props.value),
              props.updateProperty,
            );
            modal.open();
          }}
        />
        <Icon
          iconId="plus"
          class="clickable-icon"
          style={{ width: "fit-content" }}
          onClick={async () => {
            await props.updateProperty(toNumber(props.value) + 1);
          }}
        />
      </div>
    </div>
  );
};

class ExpressionModal extends Modal {
  x: number;
  value: number;
  isValid: boolean = false;
  updateProperty: (v: unknown) => Promise<void>;

  constructor(
    app: App,
    defaultValue: number,
    updateProperty: (v: unknown) => Promise<void>,
  ) {
    super(app);
    this.x = defaultValue;
    this.value = defaultValue;
    this.updateProperty = updateProperty;
  }

  onOpen(): void {
    this.setTitle("Update via expression");
    this.contentEl
      .createEl("p")
      .setText(
        "WARNING: Typing inside the input will arbitrarily execute the value as JavaScript.",
      );
    const expSetting = new Setting(this.contentEl);

    const submitSetting = new Setting(this.contentEl);
    const submitBtn = submitSetting.addButton((btn) =>
      btn
        .setButtonText("update")
        .setCta()
        .setDisabled(true)
        .onClick(async (e) => {
          this.close();
          this.updateProperty(this.value);
        }),
    );

    expSetting
      .setName("Expression")
      .setDesc(
        'Enter a valid JavaScript expression. You may use "x" to access the current value.',
      )
      .addText((inp) => {
        inp.setPlaceholder("x + 2 * 2**4 / Math.PI");
        inp.onChange((v) => {
          try {
            const num = eval(`((x) => (${v}))(${this.x})`);
            if (Number.isNumber(num)) {
              this.value = num;
              submitSetting.setDesc("Calculated: " + num);
              submitBtn.setDisabled(false);
              return;
            }
            this.value = NaN;
            submitSetting.setDesc("Invalid expression!");
            submitBtn.setDisabled(true);
          } catch (e) {
            this.value = NaN;
            submitSetting.setDesc("Invalid expression!");
            submitBtn.setDisabled(true);
          }
        });
      });
  }
}
