import { COMPLEX_PROPERTY_PLACEHOLDER } from "@/lib/constants";
import {
  DataviewPropertyValue,
  DataviewPropertyValueArray,
  PropertyType,
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
import { MarkdownPostProcessorContext, Notice } from "obsidian";
import { useCodeBlock } from "@/hooks/useDataEdit";
import DataEdit from "@/main";

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
      settings: {
        tableIdColumnName,
        defaultDateFormat,
        defaultDateTimeFormat,
        renderNullAs,
      },
      luxon,
    },
    config,
    ctx,
  } = useCodeBlock();
  const valueType = createMemo(() => {
    return getValueType(props.value, props.header, luxon);
  });
  const isEditableProperty = (property: string) => {
    // console.log("property: ", property);
    const str = (property ?? "").toLowerCase();
    if (str === COMPLEX_PROPERTY_PLACEHOLDER.toLowerCase()) return false;
    if (str === tableIdColumnName.toLowerCase()) return false;
    if (str.includes("file.")) return false;
    return true;
  };
  return (
    <td
      class="whitespace-normal text-nowrap"
      tabIndex={0}
      onClick={(e) => {
        // new Notice(e.target.tagName);
        // if number buttons are clicked
        if (e.target.tagName.toLowerCase() === "button") return;
        if (valueType() === "multitext") return;
        setEditing(true);
      }}
      onMouseMove={props.onMouseMove}
      style={props.style}
    >
      <Show
        when={valueType() !== "multitext" || valueType() !== "aliases"}
        fallback={
          <ListTableDataWrapper
            {...(props as TableDataProps<DataviewPropertyValueArray>)}
          />
        }
      >
        <Show
          when={
            !config.lockEditing &&
            isEditing() &&
            isEditableProperty(props.property)
          }
          fallback={
            <div
              class={
                isEditableProperty(props.property)
                  ? ""
                  : "hover:cursor-not-allowed"
              }
            >
              <TableDataDisplay
                {...props}
                setEditing={setEditing}
                valueType={valueType()}
                plugin={plugin}
                ctx={ctx}
                defaultDateFormat={defaultDateFormat}
                defaultDateTimeFormat={defaultDateTimeFormat}
                renderNullAs={renderNullAs}
              />
            </div>
          }
        >
          <TableDataEdit
            {...props}
            setEditing={setEditing}
            valueType={valueType()}
          />
        </Show>
        <Show
          when={
            valueType() === "number" &&
            isEditableProperty(props.property) &&
            !config.lockEditing
          }
        >
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
  valueType: PropertyType;
  plugin: DataEdit;
  ctx: MarkdownPostProcessorContext;
  defaultDateFormat: string;
  defaultDateTimeFormat: string;
  renderNullAs: string;
};
export const TableDataDisplay = (props: TableDataDisplayProps) => {
  return (
    <>
      <Show when={props.valueType === "text" || props.valueType === "number"}>
        <Markdown
          class="size-full"
          app={props.plugin.app}
          markdown={
            tryDataviewLinkToMarkdown(props.value) || props.renderNullAs
          }
          sourcePath={props.ctx.sourcePath}
        />
      </Show>
      <Show when={props.valueType === "checkbox"}>
        <CheckboxInput {...props} />
      </Show>
      <Show when={props.valueType === "date" || props.valueType === "datetime"}>
        <div class="size-full">
          {(props.value as DateTime).toFormat(
            checkIfDateHasTime(props.value as DateTime)
              ? props.defaultDateTimeFormat
              : props.defaultDateFormat,
          )}
        </div>
      </Show>
    </>
  );
};

export type TableDataEditProps<T = unknown> = TableDataProps<T> & {
  setEditing: Setter<boolean>;
  valueType: PropertyType;
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
