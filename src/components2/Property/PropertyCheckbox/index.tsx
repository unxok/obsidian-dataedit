import { PropertyCommonProps } from "..";

export const PropertyCheckbox = (
  props: PropertyCommonProps & { isToggle: boolean },
) => {
  // I may change this to use the proper `Setting` API,
  // but it has some weird styling stuff, and this is easier for now
  return (
    <div
      class={
        props.isToggle
          ? `checkbox-container ${!!props.value && "is-enabled"}`
          : ""
      }
      onClick={async () => {
        if (!props.isToggle) return;
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
