import { useDataEdit } from "@/hooks/useDataEdit";
import { updateMetadataProperty } from "@/lib/util";
import { createSignal } from "solid-js";
import { TableDataEditProps } from "../Table/TableData";
import { autofocus } from "@solid-primitives/autofocus";
// To prevent treeshaking
autofocus;

export const TextInput = (
  props: TableDataEditProps & {
    updateProperty?: (val: unknown) => Promise<void>;
  },
) => {
  const [size, setSize] = createSignal(props.value?.toString().length ?? 5);
  const { plugin } = useDataEdit();
  return (
    <input
      use:autofocus
      autofocus
      class="h-auto rounded-none border-none bg-transparent p-0 !shadow-none"
      // style={{ "box-shadow": "none" }}
      size={size()}
      type="text"
      value={props.value?.toString() ?? ""}
      onBlur={async (e) => {
        if (props.updateProperty) {
          await props.updateProperty(e.target.value);
        } else {
          await updateMetadataProperty(
            props.property,
            e.target.value,
            props.filePath,
            plugin,
            props.value,
          );
        }
        props.setEditing(false);
      }}
      onInput={(e) => {
        setSize(e.target.value.length);
      }}
    />
  );
};
