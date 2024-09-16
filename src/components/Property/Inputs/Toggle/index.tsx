import { PropertyCommonProps } from "../../PropertySwitch";

export const PropertyToggle = (props: PropertyCommonProps) => {
  return (
    <div
      classList={{
        "checkbox-container": true,
        "is-enabled": !!props.value,
      }}
      onClick={async () => {
        console.log("click");
        await props.updateProperty(!!!props.value);
      }}
    >
      <input
        type="checkbox"
        checked={!!props.value}
        onClick={async (e) => {
          // await props.updateProperty(e.currentTarget.checked);
        }}
      />
    </div>
  );
};
