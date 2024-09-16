import { PropertyCommonProps } from "../../PropertySwitch";

export const PropertyColor = (props: PropertyCommonProps) => {
  return (
    <input
      type="color"
      value={props.value as string}
      onBlur={async (e) => {
        await props.updateProperty(e.target.value);
      }}
    />
  );
};
