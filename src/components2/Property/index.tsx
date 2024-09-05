import {
  DataviewLink,
  DataviewPropertyValue,
  DataviewPropertyValueArray,
  DataviewPropertyValueNotLink,
  PropertyType,
} from "@/lib/types";
import { createMemo, For, Match, Show, Switch } from "solid-js";
import { useBlock } from "../CodeBlock";
import { Markdown } from "@/components/Markdown";
import { updateMetadataProperty } from "@/lib/util";
import { PropertyText } from "./PropertyText";
import { PropertyNumber } from "./PropertyNumber";
import { PropertyCheckbox } from "./PropertyCheckbox";
import { Icon } from "@/components/Icon";
import { PropertyMultitext } from "./PropertyMultitext";

export const PropertyHeader = (props: { header: string; property: string }) => {
  //
  return <div>{props.header}</div>;
};

type PropertyDataProps = {
  property: string;
  value: DataviewPropertyValue;
  propertyType: PropertyType;
  header: string;
  filePath: string;
};

export type PropertyCommonProps = PropertyDataProps & {
  updateProperty: (value: unknown) => Promise<void>;
};

export const PropertyData = (props: PropertyDataProps) => {
  const bctx = useBlock();

  const isIdCol = createMemo(
    () =>
      props.property.includes("file.link") ||
      props.header === bctx.dataviewAPI.settings.tableIdColumnName,
  );

  const updateProperty = async (value: unknown) => {
    await updateMetadataProperty(
      props.property,
      value,
      props.filePath,
      bctx.plugin,
      bctx.el,
      props.value,
    );
  };

  return (
    <Show
      when={!isIdCol()}
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

const PropertySwitch = (props: PropertyCommonProps) => {
  return (
    <Switch fallback={<div>fallback</div>}>
      <Match when={props.propertyType === "text"}>
        <PropertyText {...props} />
      </Match>
      <Match when={props.propertyType === "number"}>
        <PropertyNumber {...props} />
      </Match>
      <Match when={props.propertyType === "checkbox"}>
        <PropertyCheckbox {...props} isToggle={true} />
      </Match>
      <Match
        when={
          props.propertyType === "multitext" ||
          props.propertyType === "tags" ||
          props.propertyType === "aliases" ||
          Array.isArray(props.value)
        }
      >
        <PropertyMultitext {...props} />
      </Match>
    </Switch>
  );
};
