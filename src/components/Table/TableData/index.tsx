import { useDataEdit } from "@/hooks/useDataEdit";
import { COMPLEX_PROPERTY_PLACEHOLDER } from "@/lib/constants";
import {
  DataviewPropertyValue,
  DataviewPropertyValueArray,
  PropertyValueType,
} from "@/lib/types";
import {
  checkIfDateHasTime,
  getValueType,
  tryDataviewLinkToMarkdown,
} from "@/lib/util";
import { createSignal, createMemo, Show, Setter, JSX } from "solid-js";
import { Markdown } from "@/components/Markdown";
import { DateTime } from "luxon";
import { CheckboxInput } from "@/components/Inputs/checkbox";
import { DateDatetimeInput } from "@/components/Inputs/datedatetime";
import { ListTableDataWrapper } from "@/components/Inputs/list";
import { NumberButtons, NumberInput } from "@/components/Inputs/number";
import { TextInput } from "@/components/Inputs/text";

export type TableDataProps<T = DataviewPropertyValue> = {
  value: T;
  header: string;
  property: string;
  filePath: string;
  style: string | JSX.CSSProperties | undefined;
  onMouseMove: (e: MouseEvent) => void;
};
export const TableData = (props: TableDataProps) => {
  const [isEditing, setEditing] = createSignal(false);
  const {
    plugin,
    dataviewAPI: {
      settings: { tableIdColumnName },
      luxon,
    },
  } = useDataEdit();
  const valueType = createMemo(() => {
    return getValueType(props.value, props.header, luxon);
  });
  const isEditableProperty = (property: string) => {
    const str = property.toLowerCase();
    if (str === COMPLEX_PROPERTY_PLACEHOLDER.toLowerCase()) return false;
    if (str === tableIdColumnName.toLowerCase()) return false;
    if (str.includes("file.")) return false;
    return true;
  };
  return (
    <td
      class="whitespace-normal text-nowrap hover:bg-hover"
      tabIndex={0}
      onClick={(e) => {
        // new Notice(e.target.tagName);
        // if number buttons are clicked
        if (e.target.tagName.toLowerCase() === "button") return;
        if (valueType() === "list") return;
        setEditing(true);
      }}
      onMouseMove={props.onMouseMove}
      style={props.style}
    >
      <Show
        when={valueType() !== "list"}
        fallback={
          <ListTableDataWrapper
            {...(props as TableDataProps<DataviewPropertyValueArray>)}
          />
        }
      >
        <Show
          when={isEditing() && isEditableProperty(props.property)}
          fallback={
            <TableDataDisplay
              {...props}
              setEditing={setEditing}
              valueType={valueType()}
            />
          }
        >
          <TableDataEdit
            {...props}
            setEditing={setEditing}
            valueType={valueType()}
          />
        </Show>
        <Show when={valueType() === "number"}>
          <NumberButtons
            {...(props as TableDataProps<number>)}
            plugin={plugin}
          />
        </Show>
      </Show>
    </td>
  );
};

export type TableDataDisplayProps = TableDataProps & {
  setEditing: Setter<boolean>;
  valueType: PropertyValueType;
};
export const TableDataDisplay = (props: TableDataDisplayProps) => {
  const {
    plugin,
    ctx,
    dataviewAPI: {
      settings: { defaultDateFormat, defaultDateTimeFormat },
    },
  } = useDataEdit();
  return (
    <>
      <Show when={props.valueType === "text" || props.valueType === "number"}>
        <Markdown
          class="size-full"
          app={plugin.app}
          markdown={tryDataviewLinkToMarkdown(props.value)}
          sourcePath={ctx.sourcePath}
        />
      </Show>
      <Show when={props.valueType === "checkbox"}>
        <CheckboxInput {...props} />
      </Show>
      <Show when={props.valueType === "date" || props.valueType === "datetime"}>
        <div class="size-full">
          {(props.value as DateTime).toFormat(
            checkIfDateHasTime(props.value as DateTime)
              ? defaultDateTimeFormat
              : defaultDateFormat,
          )}
        </div>
      </Show>
    </>
  );
};

export type TableDataEditProps<T = unknown> = TableDataProps<T> & {
  setEditing: Setter<boolean>;
  valueType: PropertyValueType;
};
export const TableDataEdit = (props: TableDataEditProps) => {
  // return <TextInput {...props} />;

  return (
    <>
      <Show when={props.valueType === "text"}>
        <TextInput {...props} />
      </Show>
      <Show when={props.valueType === "number"}>
        <NumberInput {...props} />
      </Show>
      <Show when={props.valueType === "date" || props.valueType === "datetime"}>
        <DateDatetimeInput {...(props as TableDataEditProps<DateTime>)} />
      </Show>
    </>
  );
};
