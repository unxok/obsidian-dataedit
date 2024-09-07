import { useBlock } from "@/components2/CodeBlock";
import { PropertyCommonProps } from "..";

export const PropertyCheckbox = (props: PropertyCommonProps) => {
  // I may change this to use the proper `Setting` API,
  // but it has some weird styling stuff, and this is easier for now

  // config changes will always cause a rerender, so it's fine to destructure here
  const {
    config: { toggles },
  } = useBlock();

  return (
    <div
      class={
        toggles ? `checkbox-container ${!!props.value && "is-enabled"}` : ""
      }
      onClick={async () => {
        if (!toggles) return;
        await props.updateProperty(!!!props.value);
      }}
    >
      <input
        type="checkbox"
        checked={!!props.value}
        onClick={async (e) => {
          await props.updateProperty(e.currentTarget.checked);
        }}
      />
    </div>
  );
};
