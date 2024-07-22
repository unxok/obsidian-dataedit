import { useDataEdit } from "@/hooks/useDataEdit";
import { updateMetadataProperty, toNumber } from "@/lib/util";
import DataEdit from "@/main";
import { createSignal, Show } from "solid-js";
import { TableDataEditProps, TableDataProps } from "../Table/TableData";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { ExternalLink } from "@/components/ui/external-link";
import Minus from "lucide-solid/icons/Minus";
import Parentheses from "lucide-solid/icons/Parentheses";
import Plus from "lucide-solid/icons/Plus";
import { autofocus } from "@solid-primitives/autofocus";
// To prevent treeshaking
autofocus;

export const NumberInput = (props: TableDataEditProps) => {
  const [size, setSize] = createSignal(props.value?.toString().length ?? 5);
  const { plugin } = useDataEdit();
  return (
    <input
      use:autofocus
      autofocus
      class="h-auto rounded-none border-none bg-transparent p-0 !shadow-none"
      // style={{ "box-shadow": "none" }}
      size={size()}
      type="number"
      value={props.value?.toString() ?? ""}
      onBlur={async (e) => {
        await updateMetadataProperty(
          props.property,
          toNumber(e.target.value),
          props.filePath,
          plugin,
          props.value,
        );
        props.setEditing(false);
      }}
      onInput={(e) => {
        setSize(e.target.value.length);
      }}
    />
  );
};

type NumberButtonsProps = TableDataProps<number> & { plugin: DataEdit };
export const NumberButtons = (props: NumberButtonsProps) => (
  <div class="flex w-full items-center gap-1">
    <button
      class="clickable-icon size-fit p-1"
      onClick={async (e) => {
        e.preventDefault();
        await updateMetadataProperty(
          props.property,
          props.value - 1,
          props.filePath,
          props.plugin,
          props.value,
        );
      }}
    >
      <Minus class="pointer-events-none size-3" />
    </button>
    <NumberExpressionButton {...props} />
    <button
      class="clickable-icon size-fit p-1"
      onClick={async (e) => {
        e.preventDefault();
        await updateMetadataProperty(
          props.property,
          props.value + 1,
          props.filePath,
          props.plugin,
          props.value,
        );
      }}
    >
      <Plus class="pointer-events-none size-3" />
    </button>
  </div>
);

const NumberExpressionButton = (props: NumberButtonsProps) => {
  // const {
  //   dataviewAPI: { evaluate },
  // } = useDataEdit();
  const [isOpen, setOpen] = createSignal(false);
  const [calculated, setCalculated] = createSignal(Number(props.value));

  const updateProperty = async (v: number) => {
    await updateMetadataProperty(
      props.property,
      v,
      props.filePath,
      props.plugin,
      props.value,
    );
  };

  return (
    <Dialog modal open={isOpen()} onOpenChange={(b) => setOpen(b)}>
      <DialogTrigger class="clickable-icon size-fit p-1">
        <Parentheses class="pointer-events-none size-3" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update by expression</DialogTitle>
          <DialogDescription>
            Enter a valid{" "}
            <ExternalLink href="https://blacksmithgu.github.io/obsidian-dataview/reference/expressions/">
              Dataview mathematical expression
            </ExternalLink>
            <br />
            You can use <code>x</code> as the current value.
          </DialogDescription>
        </DialogHeader>
        <input
          use:autofocus
          autofocus
          class="border-border px-1"
          type="text"
          placeholder="x + 2 / x * 3"
          onKeyDown={async (e) => {
            if (e.key === "Enter" && !Number.isNaN(calculated())) {
              await updateProperty(calculated());
              setOpen(false);
            }
          }}
          onInput={async (e) => {
            /* 
                  TODO make this better
                  - eval: solid doesn't like it when interopped with signals it seems
                  - mathjs: solid also seems to not like it's evaluate function. It also adds 500kb to the bundle :/
                */
            const exp = e.target.value
              .replaceAll("x", props.value.toString())
              .trim();
            const result =
              // @ts-expect-error
              await app.plugins.plugins.dataview.api.evaluate(exp);

            setCalculated(() => {
              if (result.successful) return Number(result.value);
              return NaN;
            });
          }}
        />
        <p>
          <span>Calculated:&nbsp;</span>
          <Show
            when={Number.isNaN(calculated())}
            fallback={<span class="text-success">{calculated()}</span>}
          >
            <span class="text-error">error</span>
          </Show>
        </p>
        <DialogFooter>
          <button
            class="rounded-button bg-interactive-accent p-button text-on-accent hover:bg-interactive-accent-hover"
            disabled={Number.isNaN(calculated())}
            onClick={async () => {
              await updateProperty(calculated());
              setOpen(false);
            }}
          >
            update
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
