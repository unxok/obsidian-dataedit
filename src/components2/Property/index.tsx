import {
  DataviewLink,
  DataviewPropertyValue,
  DataviewPropertyValueArray,
  DataviewPropertyValueNotLink,
  PropertyType,
} from "@/lib/types";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  Show,
  Switch,
} from "solid-js";
import { useBlock } from "../CodeBlock";
import { Markdown } from "@/components/Markdown";
import { checkIfDateHasTime, updateMetadataProperty } from "@/lib/util";
import { PropertyText } from "./PropertyText";
import { PropertyNumber } from "./PropertyNumber";
import { PropertyCheckbox } from "./PropertyCheckbox";
import { Icon } from "@/components/Icon";
import { PropertyMultitext } from "./PropertyMultitext";
import { DateTime } from "luxon";
import { autofocus } from "@solid-primitives/autofocus";
import { PropertyDateDatetime } from "./PropertyDateDatetime";
import { COMPLEX_PROPERTY_PLACEHOLDER } from "@/lib/constants";
// To prevent treeshaking
autofocus;

type PropertyHeaderProps = {
  header: string;
  property: string;
  propertyType: PropertyType;
};
export const PropertyHeader = (props: PropertyHeaderProps) => {
  const bctx = useBlock();

  return (
    <div
      style={{
        display: "inline-flex",
        "flex-direction": "row",
        "align-items": "center",
        gap: ".5ch",
        width: "fit-content",
      }}
    >
      <Show when={bctx.config.typeIcons && bctx.config.typeIconLeft}>
        <PropertyHeaderIcon
          {...props}
          tableIdColumnName={bctx.dataviewAPI.settings.tableIdColumnName}
        />
      </Show>
      <Markdown
        app={bctx.plugin.app}
        markdown={props.header}
        sourcePath={bctx.ctx.sourcePath}
        class="no-p-margin"
        style={{ "text-wrap": "nowrap" }}
      />
      <Show when={bctx.config.typeIcons && !bctx.config.typeIconLeft}>
        <PropertyHeaderIcon
          {...props}
          tableIdColumnName={bctx.dataviewAPI.settings.tableIdColumnName}
        />
      </Show>
    </div>
  );
};

const PropertyHeaderIcon = (
  props: PropertyHeaderProps & { tableIdColumnName: string },
) => {
  const isFile = () => {
    const a = props.property === "file.link";
    const b = props.header === props.tableIdColumnName;
    return a || b;
  };
  return (
    <Show
      when={isFile()}
      fallback={<PropertyIcon propertyType={props.propertyType} />}
    >
      <Icon iconId="file" />
    </Show>
  );
};

const PropertyIcon = (props: { propertyType: PropertyType }) => {
  //
  return (
    <Switch fallback={<Icon iconId="text" />}>
      <Match when={props.propertyType === "aliases"}>
        <Icon iconId="forward" />
      </Match>
      <Match when={props.propertyType === "checkbox"}>
        <Icon iconId="check-square" />
      </Match>
      <Match when={props.propertyType === "date"}>
        <Icon iconId="calendar" />
      </Match>
      <Match when={props.propertyType === "datetime"}>
        <Icon iconId="clock" />
      </Match>
      <Match when={props.propertyType === "multitext"}>
        <Icon iconId="list" />
      </Match>
      <Match when={props.propertyType === "number"}>
        <Icon iconId="binary" />
      </Match>
      <Match when={props.propertyType === "tags"}>
        <Icon iconId="tags" />
      </Match>
      <Match when={props.propertyType === "unknown"}>
        <Icon iconId="star" />
      </Match>
    </Switch>
  );
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

  const isEditable = createMemo(() => {
    const isComplex = props.property === COMPLEX_PROPERTY_PLACEHOLDER;
    const isFileNested = props.property.includes("file.");
    return !isComplex && !isFileNested;
  });

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

const PropertySwitch = (props: PropertyCommonProps) => {
  return (
    <Switch fallback={<div>fallback</div>}>
      <Match
        when={props.propertyType === "text" || props.propertyType === "unknown"}
      >
        <PropertyText {...props} />
      </Match>
      <Match when={props.propertyType === "number"}>
        <PropertyNumber {...props} />
      </Match>
      <Match when={props.propertyType === "checkbox"}>
        <PropertyCheckbox {...props} />
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
      <Match
        when={
          props.propertyType === "date" || props.propertyType === "datetime"
        }
      >
        <PropertyDateDatetime {...props} />
      </Match>
    </Switch>
  );
};
