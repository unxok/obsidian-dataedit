import { PropertyType } from "@/lib/types";
import { updateMetadataProperty } from "@/lib/util";
import { TableDataProps } from "../Table/TableData";
import { useCodeBlock } from "@/hooks/useDataEdit";

type CheckboxInputProps = TableDataProps & {
  valueType: PropertyType;
};
export const CheckboxInput = (props: CheckboxInputProps) => {
  const { plugin, config, el } = useCodeBlock();
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
          el,
          props.value,
        );
      }}
    />
  );
};
