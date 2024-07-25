import { ComponentProps, createSignal, splitProps } from "solid-js";

export type ToggleProps = Omit<
  ComponentProps<"input">,
  "onClick" | "type" | "value"
> & {
  onCheckedChange?: (b: boolean) => void;
  containerClass?: string;
};
export const Toggle = (props: ToggleProps) => {
  const [local, rest] = splitProps(props, [
    "containerClass",
    "onCheckedChange",
  ]);
  const [isChecked, setChecked] = createSignal(!!rest.checked);
  return (
    <div
      class={`checkbox-container ${isChecked() ? "is-enabled" : " "}`}
      onClick={() => {
        setChecked((prev) => {
          if (local.onCheckedChange) local.onCheckedChange(!prev);
          return !prev;
        });
      }}
    >
      <input type="checkbox" {...rest} checked={isChecked()} />
    </div>
  );
};
