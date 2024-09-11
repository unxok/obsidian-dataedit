import { DataviewPropertyValue, PropertyType } from "@/lib/types";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { useBlock } from "../CodeBlock";
import { Markdown } from "@/components/Markdown";
import { PropertyText } from "./PropertyText";
import { PropertyNumber } from "./PropertyNumber";
import { PropertyCheckbox } from "./PropertyCheckbox";
import { PropertyMultitext } from "./PropertyMultitext";
import { PropertyDateDatetime } from "./PropertyDateDatetime";
import {
  COMPLEX_PROPERTY_PLACEHOLDER,
  dataeditDropdownTypePrefix,
} from "@/lib/constants";
import { autofocus } from "@solid-primitives/autofocus";
import { DropdownComponent, MarkdownRenderChild, Notice } from "obsidian";
import { DropdownRecord } from "@/classes/DropdownWidgetManager";
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
      <Match when={props.propertyType?.startsWith(dataeditDropdownTypePrefix)}>
        <PropertyDropdown {...props} />
      </Match>
    </Switch>
  );
};

const PropertyDropdown = (props: PropertyCommonProps) => {
  const { plugin } = useBlock();
  // const [desc, setDesc] = createSignal("");
  // const [options, setOptions] = createSignal<DropdownRecord["options"]>([]);
  let ref: HTMLSelectElement;

  // createEffect(() => {

  const { propertyType, updateProperty, value: propValue } = props;
  const data = plugin.settings ?? {};
  const { dropdowns } = data as {
    dropdowns: Record<string, DropdownRecord | undefined>;
  };
  const record =
    dropdowns?.[propertyType.slice(dataeditDropdownTypePrefix.length)];
  if (!dropdowns || !record) {
    const msg = "No saved dropdown settings found. This should never happen.";
    new Notice(msg);
    throw new Error(msg);
  }

  // setDesc(() => record.description);
  // setOptions(() => record.options);
  // });

  // createEffect(() => {
  //   if (!options().length) return;
  //   if (typeof props.value !== "string") return;
  //   const value = options().some((opt) => opt.value === props.value)
  //     ? props.value
  //     : options()[0].value;
  //   ref.value = value as string;
  // });

  return (
    <select
      ref={(r) => (ref = r)}
      class="dropdown"
      // aria-label={desc()}
      aria-label={record.description}
      value={props.value as string}
      onChange={async (e) => {
        // console.log("change");
        // const value = options().some((opt) => opt.value === e.target.value)
        //   ? e.target.value
        //   : options()[0].value;
        // console.log("about to updat to: ", value);
        // await props.updateProperty(value);
        await props.updateProperty(e.target.value);
      }}
    >
      <For each={record.options}>
        {({ label, value }) => <option value={value}>{label}</option>}
      </For>
    </select>
  );
};

// const PropertyDropdown2 = (props: PropertyCommonProps) => {
//   const { plugin, uid } = useBlock();

//   const [counter, setCounter] = createSignal(0);

//   const example = async () => {
//     let result = 0;
//     setCounter((prev) => {

//       console.log("updating to: ", prev + 1);
//       result = prev + 1;
//       return prev + 1;
//     });
//     console.log("setCounter is done! " + result);
//   };

//   let ref: HTMLDivElement;
//   let cmp: DropdownComponent;

//   let promise = Promise.resolve();

//   const asyncEffect = async () => {
//     const rand = Math.random().toFixed(5);
//     console.log("started asyncEffect " + rand);
//     if (cmp) {
//       // won't hit
//       console.log(rand + " removing: ", cmp.selectEl);
//       cmp.selectEl.remove();
//     }

//     if (cmp) {
//       // won't hit
//       console.log(rand + " hit0: ", cmp.selectEl);
//     }

//     const { propertyType, updateProperty, value: propValue } = props;

//     if (cmp) {
//       // won't hit
//       console.log(rand + " before await");
//     }

//     const data = (await plugin.loadData()) ?? {};

//     if (cmp) {
//       // will hit
//       console.log(rand + " after await");
//     }

//     const { dropdowns } = data as {
//       dropdowns: Record<string, DropdownRecord | undefined>;
//     };

//     const record =
//       dropdowns?.[propertyType.slice(dataeditDropdownTypePrefix.length)];
//     if (!dropdowns || !record) {
//       const msg = "No saved dropdown settings found. This should never happen.";
//       new Notice(msg);
//       throw new Error(msg);
//     }

//     if (cmp) {
//       console.log(rand + " hit2: ", cmp.selectEl);
//     }

//     const optionsObj = record.options.reduce(
//       (acc, { label, value }) => {
//         acc[value] = label ? label : value;
//         return acc;
//       },
//       {} as Record<string, string>,
//     );

//     if (cmp) {
//       console.log(rand + " old cmp el: ", cmp.selectEl);
//       cmp.selectEl.remove();
//     }
//     cmp = new DropdownComponent(ref)
//       .addOptions(optionsObj)
//       .setValue(props.value as string)
//       .onChange(async (v) => await updateProperty(v));
//     console.log(rand + " new cmp el: ", cmp.selectEl);
//   };

//   createEffect(() => {
//     promise = promise.then(() => asyncEffect());
//   });

//   onCleanup(() => {
//     if (cmp) {
//       // this does run and *does* remove elements
//       console.log("removing from cleanup: ", cmp.selectEl);
//       cmp.selectEl.remove();
//     }
//   });

//   return <div ref={(r) => (ref = r)} onClick={() => example()}></div>;
// };
