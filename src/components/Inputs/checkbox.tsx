import { PropertyValueType } from "@/lib/types";
import { updateMetadataProperty } from "@/lib/util";
import { TableDataProps } from "../Table/TableData";
import { uesCodeBlock } from "@/hooks/useDataEdit";

type CheckboxInputProps = TableDataProps & {
  valueType: PropertyValueType;
};
export const CheckboxInput = (props: CheckboxInputProps) => {
  const { plugin, config } = uesCodeBlock();
  return (
    <input
      class=""
      disabled={config.lockEditing}
      type="checkbox"
      checked={!!props.value}
      onClick={async (e) => {
        await updateMetadataProperty(
          props.property,
          e.currentTarget.checked,
          props.filePath,
          plugin,
          props.value,
        );
      }}
    />
  );
};
