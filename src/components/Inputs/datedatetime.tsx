import { useDataEdit } from "@/hooks/useDataEdit";
import { PropertyValueType } from "@/lib/types";
import { checkIfDateHasTime, updateMetadataProperty } from "@/lib/util";
import { DateTime } from "luxon";
import { Setter, createMemo, createEffect } from "solid-js";
import { TableDataProps } from "../Table/TableData";
import { autofocus } from "@solid-primitives/autofocus";
// To prevent treeshaking
autofocus;

type DateDatetimeInputProps = TableDataProps<DateTime> & {
  setEditing: Setter<boolean>;
  valueType: PropertyValueType;
};

export const DateDatetimeInput = (props: DateDatetimeInputProps) => {
  const {
    plugin,
    dataviewAPI: {
      luxon: { DateTime },
    },
  } = useDataEdit();
  const isTime = createMemo(() => {
    return checkIfDateHasTime(props.value);
  });

  createEffect(() => {
    console.log("isTime: ", isTime());
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
        // const jsDt = new Date(e.target.value);
        // console.log("jsDt: ", jsDt);
        console.log("etarget: ", e.target.value);
        const dt = DateTime.fromFormat(e.target.value, format);
        console.log("dt: ", dt);
        const newValue = dt.toFormat(format);
        console.log("new value: ", newValue);
        const formattedOld = props.value.toFormat(format);
        await updateMetadataProperty(
          props.property,
          newValue,
          props.filePath,
          plugin,
          formattedOld,
        );
        props.setEditing(false);
      }}
    />
  );
};
