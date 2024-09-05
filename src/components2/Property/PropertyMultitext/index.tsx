import { useBlock } from "@/components2/CodeBlock";
import {
  DataviewPropertyValueArray,
  DataviewPropertyValueNotLink,
  DataviewLink,
} from "@/lib/types";
import { updateMetadataProperty } from "@/lib/util";
import { createMemo, For, Show } from "solid-js";
import { PropertyCommonProps } from "..";
import { PropertyText } from "../PropertyText";
import { Icon } from "@/components/Icon";

export const PropertyMultitext = (props: PropertyCommonProps) => {
  const bctx = useBlock();

  const valueArr = createMemo(() => {
    if (Array.isArray(props.value)) {
      return props.value as DataviewPropertyValueArray;
    }
    return [props.value] as DataviewPropertyValueArray;
  });

  const isTag = createMemo(() => {
    return props.propertyType === "tags";
  });

  const removeTag = (value: string) => {
    if (value.startsWith("#")) return value.slice(1);
    return value;
  };

  return (
    <ul class="property-multitext-ul">
      <For each={valueArr()}>
        {(item, index) => (
          <Show when={item !== null && item !== undefined}>
            <li>
              <PropertyText
                {...props}
                value={isTag() ? "#" + item : item}
                updateProperty={async (value: unknown) => {
                  const postValue = isTag()
                    ? removeTag(value?.toString() ?? "")
                    : value;
                  let arr = [...valueArr()];
                  if (postValue) {
                    arr[index()] = postValue as
                      | DataviewPropertyValueNotLink
                      | DataviewLink;
                  } else {
                    arr = arr.filter((_, i) => i !== index());
                  }
                  await updateMetadataProperty(
                    props.property,
                    arr,
                    props.filePath,
                    bctx.plugin,
                    bctx.el,
                    valueArr(),
                    index(),
                  );
                }}
              />
            </li>
          </Show>
        )}
      </For>
      <li
        style={{
          display: "flex",
          "flex-direction": "row",
          "justify-content": "start",
          "align-items": "center",
          "list-style-type": "none",
          "margin-inline-start": 0,
        }}
      >
        <Icon
          iconId="plus"
          class="clickable-icon"
          onClick={async () => {
            const arr = [...valueArr(), ""];
            await updateMetadataProperty(
              props.property,
              arr,
              props.filePath,
              bctx.plugin,
              bctx.el,
              valueArr(),
            );
          }}
        />
      </li>
    </ul>
  );
};
