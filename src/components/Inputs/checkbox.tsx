import { useDataEdit } from "@/hooks/useDataEdit";
import { PropertyValueType } from "@/lib/types";
import { updateMetadataProperty } from "@/lib/util";
import { TableDataProps } from "../Table/TableData";

type CheckboxInputProps = TableDataProps & {
  valueType: PropertyValueType;
};
export const CheckboxInput = (props: CheckboxInputProps) => {
  const { plugin } = useDataEdit();
  return (
    <input
      class=""
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
