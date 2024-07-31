import { useCodeBlock } from "@/hooks/useDataEdit";
import { NO_MATCH_FOUND } from "@/lib/constants";
import { getAllFiles, getAllFolders, getTemplateFiles } from "@/lib/util";
import { cn } from "@/libs/cn";
import { createFilter } from "@kobalte/core";
import type {
  ComboboxContentProps,
  ComboboxInputProps,
  ComboboxItemProps,
  ComboboxTriggerProps,
} from "@kobalte/core/combobox";
import { Combobox as ComboboxPrimitive } from "@kobalte/core/combobox";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import { App, HeadingCache, SectionCache, TFile } from "obsidian";
import type {
  JSXElement,
  ParentProps,
  Setter,
  ValidComponent,
  VoidProps,
} from "solid-js";
import {
  createComputed,
  createEffect,
  createSignal,
  Index,
  Show,
  splitProps,
} from "solid-js";
import { createStore } from "solid-js/store";

export const Combobox = ComboboxPrimitive;
export const ComboboxDescription = ComboboxPrimitive.Description;
export const ComboboxErrorMessage = ComboboxPrimitive.ErrorMessage;
export const ComboboxItemDescription = ComboboxPrimitive.ItemDescription;
export const ComboboxHiddenSelect = ComboboxPrimitive.HiddenSelect;

type comboboxInputProps<T extends ValidComponent = "input"> = VoidProps<
  ComboboxInputProps<T> & {
    class?: string;
  }
>;

export const ComboboxInput = <T extends ValidComponent = "input">(
  props: PolymorphicProps<T, comboboxInputProps<T>>,
) => {
  const [local, rest] = splitProps(props as comboboxInputProps, ["class"]);

  return (
    <ComboboxPrimitive.Input
      //   class={cn(
      //     "placeholder:text-muted-foreground h-full bg-transparent text-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
      //     local.class,
      //   )}
      class={cn("", local.class)}
      {...rest}
      {...rest}
    />
  );
};

type comboboxTriggerProps<T extends ValidComponent = "button"> = ParentProps<
  ComboboxTriggerProps<T> & {
    class?: string;
  }
>;

export const ComboboxTrigger = <T extends ValidComponent = "button">(
  props: PolymorphicProps<T, comboboxTriggerProps<T>>,
) => {
  const [local, rest] = splitProps(props as comboboxTriggerProps, [
    "class",
    "children",
  ]);

  return (
    <ComboboxPrimitive.Control>
      <ComboboxPrimitive.Trigger
        // obsidian always show's aria labels as tooltips, which looks weird in this case
        aria-label="" // TODO look into a way to disable tooltip from aria-label in obsidian?
        class={cn(
          "size-fit overflow-visible border-none bg-transparent p-0 shadow-none",
          local.class,
        )}
        {...rest}
      >
        {local.children}
        {/* <ComboboxPrimitive.Icon class="flex h-3.5 w-3.5 items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            class="h-4 w-4 opacity-50"
          >
            <path
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="m8 9l4-4l4 4m0 6l-4 4l-4-4"
            />
            <title>Arrow</title>
          </svg>
        </ComboboxPrimitive.Icon> */}
      </ComboboxPrimitive.Trigger>
    </ComboboxPrimitive.Control>
  );
};

type PromptInstructions = [command: string, text: string][] | string[][];

type comboboxContentProps<T extends ValidComponent = "div"> =
  ComboboxContentProps<T> & {
    class?: string;
    promptInstructions?: PromptInstructions;
  };

export const ComboboxContent = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, comboboxContentProps<T>>,
) => {
  const [local, rest] = splitProps(props as comboboxContentProps, [
    "class",
    "promptInstructions",
  ]);

  return (
    <ComboboxPrimitive.Portal>
      <div class="twcss">
        <ComboboxPrimitive.Content
          class={cn(
            "suggestion-container relative z-50 min-w-[8rem] overflow-hidden data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95",
            local.class,
          )}
          {...rest}
        >
          {/* <div class="suggestion"> */}
          <ComboboxPrimitive.Listbox
            // obsidian always show's aria labels as tooltips, which looks weird in this case
            aria-label="" // TODO look into a way to disable tooltip from aria-label in obsidian?
            class="suggestion m-0"
          />
          {/* </div> */}
          <Show
            when={local.promptInstructions && local.promptInstructions.length}
          >
            <div class="prompt-instructions">
              <Index each={local.promptInstructions}>
                {(arr) => (
                  <div class="prompt-instruction">
                    <span class="prompt-instruction-command">{arr()[0]}</span>
                    <span>{arr()[1]}</span>
                  </div>
                )}
              </Index>
            </div>
          </Show>
        </ComboboxPrimitive.Content>
      </div>
    </ComboboxPrimitive.Portal>
  );
};

type comboboxItemProps<T extends ValidComponent = "li"> = ParentProps<
  ComboboxItemProps<T> & {
    class?: string;
    note?: string;
    auxLabel?: string | JSXElement;
  }
>;

export const ComboboxItem = <T extends ValidComponent = "li">(
  props: PolymorphicProps<T, comboboxItemProps<T>>,
) => {
  const [local, rest] = splitProps(props as comboboxItemProps, [
    "class",
    "children",
    "note",
    "auxLabel",
  ]);

  return (
    <ComboboxPrimitive.Item
      class={cn(
        "suggestion-item mod-complex relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-interactive-hover data-[highlighted]:text-accent-foreground data-[disabled]:opacity-50",
        local.class,
      )}
      //   class={cn("suggestion-item mod-complex", local.class)}
      {...rest}
    >
      <ComboboxPrimitive.ItemIndicator class="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          class="h-4 w-4"
        >
          <path
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="m5 12l5 5L20 7"
          />
          <title>Checked</title>
        </svg>
      </ComboboxPrimitive.ItemIndicator>
      <ComboboxPrimitive.ItemLabel class="suggestion-content">
        <div class="suggestion-title">{local.children}</div>
        <div class="suggestion-note">{local.note}</div>
      </ComboboxPrimitive.ItemLabel>
      <div class="suggestion-aux">{local.auxLabel}</div>
    </ComboboxPrimitive.Item>
  );
};

const defaultInstructions = [
  ["Type [[", "to link note"],
  ["Type #", "to choose tag"],
];
const linkInstructions = [
  ["Type #", "to link heading"],
  ["Type ^", "to link blocks"],
  ["Type |", "to change display text"],
];
const subLinkInstructions = [["↵", "to accept"]];

const filter = createFilter({ sensitivity: "base" });

export type PromptComboBoxProps = {
  app: App;
  defaultOptions: string[];
  triggerProps?: ComboboxTriggerProps;
  inputProps?: ComboboxInputProps;
  itemProps?: ComboboxItemProps;
};
export const PromptComboBox = (props: PromptComboBoxProps) => {
  const [inputValue, setInputValue] = createSignal("");
  const [options, setOptions] = createStore(props.defaultOptions);
  const [labels, setLabels] = createStore<string[]>([]);
  const [aux, setAux] = createStore<string[]>([]);
  const [promptInstructions, setPromptInstructions] =
    createStore<PromptInstructions>(defaultInstructions);
  // will be checked when needed, so no need for reactivity
  let isSubLink = false;

  // for some reason props.defaultOptions is getting reasigned behind the scenes, so this stops that
  const defaultOptions = [...props.defaultOptions];
  const defaultOnInputChange = (value: string) => {
    const val = value.toLowerCase();
    const filtered = defaultOptions.filter((option) => {
      const b = filter.contains(option, val);
      if (!b) return b;
      labels.push();
      return b;
    });
    setPromptInstructions(defaultInstructions);
    setOptions(filtered);
  };

  const handleNoMatchFound = () => {
    setOptions([NO_MATCH_FOUND]);
    setLabels([]);
    setAux([]);
  };

  const getLinkOptions = (value: string) => {
    const searchName = value.slice(2).toLowerCase();
    const files = props.app.vault
      .getAllLoadedFiles()
      .filter((f) => f instanceof TFile);
    const newLabels: string[] = [];
    const filtered = files
      .filter((f) => filter.contains(f.path, searchName))
      .map((f) => {
        newLabels.push(f.path);
        return f.basename;
      });
    setLabels(newLabels);
    setOptions(filtered);
    setPromptInstructions(linkInstructions);
  };

  const getTagOptions = (value: string) => {
    // remove the '#' at the beginning
    const searchTag = value.slice(1).toLowerCase();
    // @ts-expect-error
    const tags = Object.keys(props.app.metadataCache.getTags());
    // get rid of '#' that will always be in start of tag
    const opts = tags.map((t) => t.slice(1).toLowerCase());
    const filtered = opts.filter((t) => filter.contains(t, searchTag));
    setOptions(filtered);
    setLabels([]);
    setPromptInstructions([]);
  };

  const getHeaderOptions = (header: string, headings: HeadingCache[]) => {
    const newAux: string[] = [];
    const filtered = headings
      .filter((h) => {
        const b = filter.contains(h.heading, header);
        if (!b) return b;
        newAux.push("H" + h.level);
        return b;
      })
      .map((h) => h.heading);
    if (!filtered.length) return handleNoMatchFound();
    setAux(newAux);
    setOptions(filtered);
  };

  /*
    TODO
    As is, this only will return sections that have a block id.
    In Obsidian's native suggester, *all* sections will be shown, and if one is clicked without a block id, one will be inserted into the document. As well, they show all the text in the section in the popover, which would require async reading many files on every input. 
    I'm assuming there's a way to get the options and generate an id in the private api, but I haven't found it yet.
  */
  const getSectionOptions = (blockId: string, sections: SectionCache[]) => {
    const filtered = sections
      .filter((s) => s.id && filter.contains(s.id, blockId))
      .map((s) => s.id!);
    console.log("filtered: ", filtered);
    if (!filtered.length) return handleNoMatchFound();
    setOptions(filtered);
  };

  const getLinkSubOptions = (value: string) => {
    isSubLink = true;
    setLabels([]);
    setAux([]);
    setPromptInstructions(subLinkInstructions);
    // extracts title between '[[' and '#', and header after hastag but before ']]' (if present)
    const match =
      /\[\[(?<title>\S|[^\[|\]|\]\]]+)(?:#|\^)(?<sub>.*[^\]]|)/gm.exec(value);
    const preTitle = match?.groups?.title;
    const sub = match?.groups?.sub ?? "";
    if (!preTitle) return handleNoMatchFound();
    const title = preTitle.endsWith(".md") ? preTitle : preTitle + ".md";
    const f = props.app.vault.getFileByPath(title);
    if (!f) return handleNoMatchFound();
    const cache = props.app.metadataCache.getFileCache(f);
    if (!cache) return handleNoMatchFound();
    const { sections, headings } = cache;
    if (value.includes("#")) {
      if (!headings) return handleNoMatchFound();
      return getHeaderOptions(sub, headings);
    }
    if (!sections) return handleNoMatchFound();
    getSectionOptions(sub, sections);
  };

  const onInputChange = (value: string) => {
    isSubLink = false;
    setAux([]);
    if (value[0] === "#") return getTagOptions(value);
    // regex looks for '[[' with a '#' after it, where there's no ']]' before the '#'
    if (/\[\[.*#|\^/.test(value)) return getLinkSubOptions(value);
    if (value.startsWith("[[")) return getLinkOptions(value);
    return defaultOnInputChange(value);
  };

  return (
    <Combobox
      triggerMode="input"
      value={inputValue()}
      /// this runs when an option is clicked
      onChange={(val) => {
        if (val === NO_MATCH_FOUND) {
          return setInputValue("");
        }
        if (isSubLink) {
          const inp = inputValue();
          const hashIndex = inp.indexOf("#");
          const index = hashIndex !== -1 ? hashIndex : inp.indexOf("^");
          if (index === -1) throw new Error("This shouldn't happen");
          return setInputValue(
            inp.slice(0, index + 1) + val + inp.slice(index + 1),
          );
        }
        if (inputValue().includes("[[")) {
          return setInputValue("[[" + val + "]]");
        }
        if (inputValue().startsWith("#")) {
          return setInputValue("#" + val);
        }
        setInputValue(val);
      }}
      options={options}
      // this runs when the input is typed in
      onInputChange={onInputChange}
      // already filtering the options on input, so this isn't needed
      defaultFilter={() => true}
      itemComponent={(iProps) => (
        <ComboboxItem
          {...props.itemProps}
          item={iProps.item}
          note={labels[iProps.item.index]}
          auxLabel={aux[iProps.item.index]}
        >
          {iProps.item.rawValue}
        </ComboboxItem>
      )}
    >
      <ComboboxTrigger {...props.triggerProps}>
        <ComboboxInput
          {...props.inputProps}
          value={inputValue()}
          // without doing this, default options will always be shown on focus, even if input value is not empty
          onFocus={(e) => {
            onInputChange(e.currentTarget.value);
            const { onFocus } = props.inputProps ?? {};
            if (!onFocus || typeof onFocus !== "function") return;
            onFocus(e);
          }}
          onInput={(e) => setInputValue(e.currentTarget.value)}
        />
      </ComboboxTrigger>
      <ComboboxContent promptInstructions={promptInstructions} />
    </Combobox>
  );
};

type Option = {
  value: string;
  label: string;
  disabled: boolean;
};

type OptionGroup = {
  label: string;
  options: Option[];
};

export const FilepathComboBox = (props: {
  pathValue: string;
  setPathValue: (path: string) => void;
  templates: boolean;
}) => {
  const {
    plugin: { app },
  } = useCodeBlock();

  const templateOptions: OptionGroup = {
    label: "Templates",
    options:
      getTemplateFiles(app)?.map((f) => ({
        label: f.basename,
        value: f.path,
        disabled: false,
      })) ?? [],
  };

  const fileOptions: OptionGroup = {
    label: "All files",
    options:
      getAllFiles(app)?.map((f) => ({
        label: f.basename,
        value: f.path,
        disabled: false,
      })) ?? [],
  };
  // const options = getOptions();
  const options = props.templates
    ? [templateOptions, fileOptions]
    : [fileOptions];
  const findChosen = () => {
    const defaultOption = { value: "", label: "", disabled: false };
    if (!props.templates) {
      return (
        fileOptions.options.find((f) => f.value === props.pathValue) ??
        defaultOption
      );
    }
    return (
      templateOptions.options.find((f) => f.value === props.pathValue) ??
      fileOptions.options.find((f) => f.value === props.pathValue) ??
      defaultOption
    );
  };
  const [inputValue, setInputValue] = createStore<Option>(findChosen());

  createComputed(() => {
    props.setPathValue(inputValue.value);
  });

  return (
    <Combobox<Option, OptionGroup>
      value={inputValue}
      onChange={setInputValue}
      onInputChange={(value) =>
        value === "" && setInputValue({ label: "", value: "", disabled: false })
      }
      // onInputChange={(value) => props.setValue(value)}
      options={options}
      optionValue={(opt) => opt?.value ?? ""}
      optionLabel={(opt) => opt?.value ?? ""}
      optionDisabled={(opt) => opt.disabled}
      optionGroupChildren={"options"}
      itemComponent={(itemProps) => (
        <ComboboxItem
          item={itemProps.item}
          note={itemProps.item.rawValue.value}
        >
          {itemProps.item.rawValue.label}
        </ComboboxItem>
      )}
      sectionComponent={(sectionProps) => (
        <Show when={props.templates}>
          <ComboboxItem item={{ ...sectionProps.section, disabled: true }}>
            {sectionProps.section.rawValue.label}
          </ComboboxItem>
        </Show>
      )}
    >
      <ComboboxTrigger>
        <ComboboxInput />
      </ComboboxTrigger>
      <ComboboxContent />
    </Combobox>
  );
};

export const FolderpathComboBox = (props: {
  pathValue: string;
  setPathValue: (path: string) => void;
}) => {
  const {
    plugin: { app },
  } = useCodeBlock();

  const fileOptions: OptionGroup = {
    label: "All files",
    options:
      getAllFolders(app)?.map((f) => ({
        label: f.name,
        value: f.path,
        disabled: false,
      })) ?? [],
  };

  const findChosen = () => {
    const defaultOption = { value: "", label: "", disabled: false };
    return (
      fileOptions.options.find((f) => f.value === props.pathValue) ??
      defaultOption
    );
  };
  const [inputValue, setInputValue] = createStore<Option>(findChosen());

  createComputed(() => {
    props.setPathValue(inputValue.value);
  });

  return (
    <Combobox<Option, OptionGroup>
      value={inputValue}
      onChange={setInputValue}
      onInputChange={(value) =>
        value === "" && setInputValue({ label: "", value: "", disabled: false })
      }
      // onInputChange={(value) => props.setValue(value)}
      options={[fileOptions]}
      optionValue={(opt) => opt?.value ?? ""}
      optionLabel={(opt) => opt?.value ?? ""}
      optionDisabled={(opt) => opt.disabled}
      optionGroupChildren={"options"}
      itemComponent={(itemProps) => (
        <ComboboxItem
          item={itemProps.item}
          note={itemProps.item.rawValue.value}
        >
          {itemProps.item.rawValue.label}
        </ComboboxItem>
      )}
      // sectionComponent={(sectionProps) => (
      //   <Show when={props.templates}>
      //     <ComboboxItem item={{ ...sectionProps.section, disabled: true }}>
      //       {sectionProps.section.rawValue.label}
      //     </ComboboxItem>
      //   </Show>
      // )}
    >
      <ComboboxTrigger>
        <ComboboxInput />
      </ComboboxTrigger>
      <ComboboxContent />
    </Combobox>
  );
};
