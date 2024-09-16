import { PropertyCommonProps } from "../../PropertySwitch";

export const PropertyCheckbox = (props: PropertyCommonProps) => {
  return (
    <div
      onClick={async () => {
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
