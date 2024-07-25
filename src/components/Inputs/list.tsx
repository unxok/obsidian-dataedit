import { DataviewPropertyValueArray } from "@/lib/types";
import {
  updateMetadataProperty,
  tryDataviewLinkToMarkdown,
  DataEditBlockConfig,
} from "@/lib/util";
import DataEdit from "@/main";
import Plus from "lucide-solid/icons/Plus";
import { MarkdownPostProcessorContext } from "obsidian";
import { For, createSignal, Show, Setter } from "solid-js";
import { Markdown } from "../Markdown";
import { TableDataProps } from "../Table/TableData";
import { TextInput } from "./text";

export const ListTableDataWrapper = (
  props: TableDataProps<DataviewPropertyValueArray>,
) => {
  const { plugin, ctx, config } = props.codeBlockInfo;
  return (
    <ul class="m-0 flex flex-col gap-1 p-0 [&>li]:list-disc">
      <For each={props.value}>
        {(val, index) => (
          <ListTableDataItem
            {...props}
            plugin={plugin}
            ctx={ctx}
            itemValue={val}
            itemIndex={index()}
            config={config}
          />
        )}
      </For>
      <button
        class="clickable-icon size-fit p-1"
        disabled={config.lockEditing}
        onClick={async (e) => {
          e.preventDefault();
          await updateMetadataProperty(
            props.property,
            [...props.value, ""],
            props.filePath,
            plugin,
            props.value,
          );
        }}
      >
        <Plus class="pointer-events-none size-3" />
      </button>
    </ul>
  );
};

export type ListTableDataItemProps =
  TableDataProps<DataviewPropertyValueArray> & {
    plugin: DataEdit;
    ctx: MarkdownPostProcessorContext;
    itemValue: unknown;
    itemIndex: number;
  };
export const ListTableDataItem = (
  props: ListTableDataItemProps & { config: DataEditBlockConfig },
) => {
  const [isEditing, setEditing] = createSignal(false);
  return (
    <li class="m-0 ml-3">
      <Show
        when={!props.config.lockEditing && isEditing()}
        fallback={
          <Markdown
            class="size-full"
            app={props.plugin.app}
            markdown={tryDataviewLinkToMarkdown(props.itemValue)}
            sourcePath={props.ctx.sourcePath}
            onClick={
              props.config.lockEditing ? undefined : () => setEditing(true)
            }
          />
        }
      >
        <ListInput {...props} setEditing={setEditing} />
      </Show>
    </li>
  );
};

export const ListInput = (
  props: ListTableDataItemProps & { setEditing: Setter<boolean> },
) => {
  return (
    <TextInput
      {...props}
      value={props.itemValue}
      valueType="list"
      updateProperty={async (newVal) => {
        const value = [...props.value] as unknown[];
        if (!newVal && newVal !== 0) {
          const arr = value.filter((_, i) => i !== props.itemIndex);
          await updateMetadataProperty(
            props.property,
            arr,
            props.filePath,
            props.plugin,
            props.itemValue,
            props.itemIndex,
          );
          return;
        }
        value[props.itemIndex] = newVal;
        await updateMetadataProperty(
          props.property,
          value,
          props.filePath,
          props.plugin,
          props.itemValue,
          props.itemIndex,
        );
      }}
    />
  );
};
