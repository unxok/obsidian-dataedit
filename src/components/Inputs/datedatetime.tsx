import { PropertyType } from "@/lib/types";
import { checkIfDateHasTime, updateMetadataProperty } from "@/lib/util";
import { DateTime } from "luxon";
import { Setter, createMemo } from "solid-js";
import { TableDataProps } from "../Table/TableData";
import { autofocus } from "@solid-primitives/autofocus";
import { useCodeBlock } from "@/hooks/useDataEdit";
// To prevent treeshaking
autofocus;

type DateDatetimeInputProps = TableDataProps<DateTime> & {
  setEditing: Setter<boolean>;
  valueType: PropertyType;
};

export const DateDatetimeInput = (props: DateDatetimeInputProps) => {
  const {
    plugin,
    dataviewAPI: {
      luxon: { DateTime },
    },
    el,
  } = useCodeBlock();
  const isTime = createMemo(() => {
    return checkIfDateHasTime(props.value);
  });

  return (
    <input
      use:autofocus
      autofocus
      class=""
      type={isTime() ? "datetime-local" : "date"}
      // 2018-06-12T19:30
      value={
        isTime()
          ? props.value.toFormat("yyyy-MM-dd'T'hh:mm")
          : props.value.toFormat("yyyy-MM-dd")
      }
      onBlur={async (e) => {
        const isValid = e.target.validity;
        if (!isValid) return props.setEditing(false);
        const format = isTime() ? "yyyy-MM-dd'T'hh:mm" : "yyyy-MM-dd";
        const dt = DateTime.fromFormat(e.target.value, format);
        const newValue = dt.toFormat(format);
        const formattedOld = props.value.toFormat(format);
        await updateMetadataProperty(
          props.property,
          newValue,
          props.filePath,
          plugin,
          el,
          formattedOld,
        );
        props.setEditing(false);
      }}
    />
  );
};
