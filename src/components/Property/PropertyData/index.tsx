import { useBlock } from "@/components/CodeBlock";
import { Markdown } from "@/components/Markdown";
import { COMPLEX_PROPERTY_PLACEHOLDER } from "@/lib/constants";
import { DataviewPropertyValue, PropertyType } from "@/lib/types";
import { createMemo, Show } from "solid-js";
import { PropertySwitch } from "../PropertySwitch";

export type PropertyDataProps = {
  property: string;
  value: DataviewPropertyValue;
  propertyType: PropertyType;
  header: string;
  filePath: string;
};

export const PropertyData = (props: PropertyDataProps) => {
  const bctx = useBlock();

  const isIdCol = createMemo(
    () =>
      props.property.includes("file.link") ||
      props.header === bctx.dataviewAPI.settings.tableIdColumnName,
  );

  const isEditable = createMemo(() => {
    const isComplex = props.property === COMPLEX_PROPERTY_PLACEHOLDER;
    const isFileNested = props.property.includes("file.");
    return !isComplex && !isFileNested;
  });

  const updateProperty = async (value: unknown) => {
    await bctx.plugin.updateProperty(
      props.property,
      value,
      props.filePath,
      props.value,
    );
  };

  return (
    <Show
      when={!isIdCol() && isEditable()}
      fallback={
        <Markdown
          app={bctx.plugin.app}
          markdown={props.value?.toString()}
          sourcePath={bctx.ctx.sourcePath}
          class="no-p-margin"
          style={{ "text-wrap": "nowrap" }}
        />
      }
    >
      <PropertySwitch {...props} updateProperty={updateProperty} />
    </Show>
  );
};
