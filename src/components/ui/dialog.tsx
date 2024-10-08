import { cn } from "@/libs/cn";
import type {
  DialogContentProps,
  DialogDescriptionProps,
  DialogTitleProps,
  DialogCloseButtonProps,
} from "@kobalte/core/dialog";
import { Dialog as DialogPrimitive } from "@kobalte/core/dialog";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type { ComponentProps, ParentProps, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";
import { buttonVariants } from "./button";

export const Dialog = DialogPrimitive;
export const DialogTrigger = DialogPrimitive.Trigger;

type dialogCloseProps<T extends ValidComponent = "button"> = PolymorphicProps<
  T,
  DialogCloseButtonProps<T>
>;

export const DialogClose = (props: dialogCloseProps) => {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <DialogPrimitive.CloseButton
      {...rest}
      class={cn(buttonVariants.default, local.class)}
    />
  );
};
export const DialogCloseX = () => (
  <DialogPrimitive.CloseButton class="clickable-icon absolute right-4 top-4 rounded-sm p-1 opacity-70 ring-offset-background transition-[opacity,box-shadow] hover:opacity-100 focus:outline-none focus:ring-[1.5px] focus:ring-selection focus:ring-offset-2 disabled:pointer-events-none">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-4 w-4">
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M18 6L6 18M6 6l12 12"
      />
      {/* <title>Close</title> */}
    </svg>
  </DialogPrimitive.CloseButton>
);

// obsidian natively doesn't use animations for dialogs
// but I might want to use this at some point
export const animateOverlayClass =
  "data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0";
export const animateContentClass =
  "data-[closed]:duration-200 data-[expanded]:duration-200 data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95 data-[closed]:slide-out-to-left-1/2 data-[closed]:slide-out-to-top-[48%] data-[expanded]:slide-in-from-left-1/2 data-[expanded]:slide-in-from-top-[48%]";

type dialogContentProps<T extends ValidComponent = "div"> = ParentProps<
  DialogContentProps<T> & {
    class?: string;
  }
>;

export const DialogContent = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, dialogContentProps<T>>,
) => {
  const [local, rest] = splitProps(props as dialogContentProps, [
    "class",
    "children",
  ]);

  return (
    <DialogPrimitive.Portal>
      <div class="twcss">
        <DialogPrimitive.Overlay
          class={cn("modal-bg z-50 opacity-85")}
          {...rest}
        />
        <DialogPrimitive.Content
          class={cn(
            "prompt left-1/2 z-50 w-full -translate-x-1/2 gap-4 border-[length:var(--prompt-border-width)] border-modal p-6",
            local.class,
          )}
          {...rest}
        >
          {local.children}
          <DialogCloseX />
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
  );
};

type dialogTitleProps<T extends ValidComponent = "h2"> = DialogTitleProps<T> & {
  class?: string;
};

export const DialogTitle = <T extends ValidComponent = "h2">(
  props: PolymorphicProps<T, dialogTitleProps<T>>,
) => {
  const [local, rest] = splitProps(props as dialogTitleProps, ["class"]);

  return (
    <DialogPrimitive.Title
      class={cn("text-foreground m-0 text-lg font-semibold", local.class)}
      {...rest}
    />
  );
};

type dialogDescriptionProps<T extends ValidComponent = "p"> =
  DialogDescriptionProps<T> & {
    class?: string;
  };

export const DialogDescription = <T extends ValidComponent = "p">(
  props: PolymorphicProps<T, dialogDescriptionProps<T>>,
) => {
  const [local, rest] = splitProps(props as dialogDescriptionProps, ["class"]);

  return (
    <DialogPrimitive.Description
      class={cn("text-muted-foreground m-0 text-sm", local.class)}
      {...rest}
    />
  );
};

export const DialogHeader = (props: ComponentProps<"div">) => {
  const [local, rest] = splitProps(props, ["class"]);

  return (
    <div
      class={cn(
        "flex flex-col space-y-2 text-center sm:text-left",
        local.class,
      )}
      {...rest}
    />
  );
};

export const DialogFooter = (props: ComponentProps<"div">) => {
  const [local, rest] = splitProps(props, ["class"]);

  return (
    <div
      class={cn(
        "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
        local.class,
      )}
      {...rest}
    />
  );
};
