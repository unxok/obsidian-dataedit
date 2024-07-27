import { NO_MATCH_FOUND } from "@/lib/constants";
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
import { App } from "obsidian";
import type {
  JSXElement,
  ParentProps,
  ValidComponent,
  VoidProps,
} from "solid-js";
import { createEffect, createSignal, Index, Show, splitProps } from "solid-js";
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
          "size-fit border-none bg-transparent p-1 shadow-none",
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

type comboboxContentProps<T extends ValidComponent = "div"> =
  ComboboxContentProps<T> & {
    class?: string;
    promptInstructions?: [command: string, text: string][];
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
          <Show when={local.promptInstructions}>
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
  const [isLinking, setLinking] = createSignal(false);
  const [labels, setLabels] = createStore<string[]>([]);
  const [aux, setAux] = createStore<string[]>([]);

  // for some reason props.defaultOptions is getting reasigned behind the scenes, so this stops that
  const defaultOptions = [...props.defaultOptions];
  const defaultOnInputChange = (value: string) => {
    const filtered = defaultOptions.filter((option) => {
      const b = option.includes(value);
      if (!b) return b;
      labels.push();
      return b;
    });
    setLinking(false);
    setOptions(filtered);
  };

  const handleNoMatchFound = () => {
    setOptions([NO_MATCH_FOUND]);
    setLabels([]);
  };

  const getLinkOptions = (value: string) => {
    const searchName = value.slice(2);
    // TODO users may want to be able to link to non-md files
    const files = props.app.vault.getMarkdownFiles();
    // console.log("search name: ", searchName.length);
    // console.log("files: ", files);
    const newLabels: string[] = [];
    const filtered = files
      .filter((f) => f.path.includes(searchName))
      .map((f) => {
        newLabels.push(f.path);
        return f.basename;
      });
    // console.log("filtered: ", filtered);
    setLabels(newLabels);
    setOptions(filtered);
    setLinking(true);
  };

  const getTagOptions = (value: string) => {
    // remove the '#' at the beginning
    const searchTag = value.slice(1);
    // @ts-expect-error
    const tags = Object.keys(props.app.metadataCache.getTags());
    // get rid of '#' that will always be in start of tag
    const opts = tags.map((t) => t.slice(1));
    const filtered = opts.filter((t) => t.includes(searchTag));
    setOptions(filtered);
    setLabels([]);
    setLinking(false);
  };

  // TODO
  const getHeaderOptions = (value: string) => {
    setLinking(true);
    // extracts title between '[[' and '#', and header after hastag but before ']]' (if present)
    const match = /\[\[(?<title>\S|[^\[|\]|\]\]]+)#(?<header>.*[^\]]|)/gm.exec(
      value,
    );
    const preTitle = match?.groups?.title;
    const header = match?.groups?.header ?? "";
    console.log(match);
    if (!preTitle) return handleNoMatchFound();
    console.log("header options called");
    const title = preTitle.endsWith(".md") ? preTitle : preTitle + ".md";
    const f = props.app.vault.getFileByPath(title);
    if (!f) return getLinkOptions(value);
    const cache = props.app.metadataCache.getFileCache(f);
    if (!cache) return handleNoMatchFound();
    const { headings } = cache;
    if (!headings) return handleNoMatchFound();
    setLabels([]);
    const newAux: string[] = [];
    console.log(header);
    const filtered = headings
      .filter((h) => {
        const b = h.heading.includes(header);
        console.log(h.heading);
        if (!b) return b;
        newAux.push("H" + h.level);
        return b;
      })
      .map((h) => h.heading);
    console.log("filtered: ", filtered);
    setAux(newAux);
    setOptions(filtered);
  };

  const onInputChange = (value: string) => {
    setAux([]);
    if (value[0] === "#") return getTagOptions(value);
    // regex looks for '[[' with a '#' after it, where there's no ']]' before the '#'
    if (/\[\[\S|[^\]\]]+#/i.test(value)) return getHeaderOptions(value);
    if (value.startsWith("[[")) return getLinkOptions(value);
    return defaultOnInputChange(value);
  };

  return (
    <Combobox
      //   open={true}
      triggerMode="input"
      value={inputValue()}
      onChange={(val) => {
        if (val === NO_MATCH_FOUND) {
          setInputValue("");
          return;
        }
        if (inputValue().includes("[[")) {
          setInputValue(inputValue() + val + "]]");
          return;
        }
        if (inputValue().startsWith("#")) {
          setInputValue("#" + val);
          return;
        }
        setInputValue(val);
      }}
      options={options}
      onInputChange={onInputChange}
      defaultFilter={(option, inputValue) =>
        option.includes(inputValue) ||
        option.includes(inputValue.slice(2)) ||
        typeof aux[0] === "string"
      }
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
          onInput={(e) => setInputValue(e.currentTarget.value)}
        />
      </ComboboxTrigger>
      <ComboboxContent
        promptInstructions={
          isLinking()
            ? [
                ["Type #", "to link heading"],
                ["Type ^", "to link blocks"],
                ["Type |", "to change display text"],
              ]
            : [
                ["Type [[", "to link a note"],
                ["Type #", "to link a tag"],
              ]
        }
      >
        content
      </ComboboxContent>
    </Combobox>
  );
};
