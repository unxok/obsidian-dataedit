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
    await bctx.plugin.updateProperty(
      props.property,
      value,
      props.filePath,
      // bctx.plugin,
      // bctx.el,
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
