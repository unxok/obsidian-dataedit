import { ComponentProps, splitProps } from "solid-js";
import { twMerge } from "tailwind-merge";

type Variant = "default" | "ghost" | "outline" | "accent" | "destructive";

export const buttonVariants: Record<Variant, string> = {
  default:
    "inline-flex h-[var(--input-height)] cursor-[var(--cursor)] select-none items-center justify-center whitespace-nowrap rounded-button border-0 p-button text-[length:var(--font-ui-small)] font-[var(--input-font-weight)] text-normal outline-none bg-interactive-normal hover:bg-interactive-hover shadow-['var(--input-shadow)']",
  ghost: "bg-transparent shadow-none",
  // TODO find better width here
  outline:
    "bg-transparent shadow-none border-border border-[length:var(--prompt-border-width)]",
  accent:
    "bg-interactive-accent text-on-accent hover:bg-interactive-accent-hover hover:text-accent-hover",
  destructive: "bg-error hover:bg-error hover:opacity-70 text-on-error",
};

// const class = ""

type ButtonLocalProps = {
  variant?: Variant;
};
export type ButtonProps = ButtonLocalProps & ComponentProps<"button">;
export const Button = (props: ButtonProps) => {
  const [local, rest] = splitProps(props, ["variant", "class"]);

  return (
    <button
      {...rest}
      class={twMerge(
        buttonVariants["default"],
        local.variant && buttonVariants[local.variant],
        local.class,
      )}
    />
  );
};

// import { cn } from "@/libs/cn";
// import type { ButtonRootProps } from "@kobalte/core/button";
// import { Button as ButtonPrimitive } from "@kobalte/core/button";
// import type { PolymorphicProps } from "@kobalte/core/polymorphic";
// import type { VariantProps } from "class-variance-authority";
// import { cva } from "class-variance-authority";
// import type { ValidComponent } from "solid-js";
// import { splitProps } from "solid-js";

// export const buttonVariants = cva(
// 	"inline-flex items-center justify-center rounded-md text-sm font-medium transition-[color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-[1.5px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
// 	{
// 		variants: {
// 			variant: {
// 				default:
// 					"bg-primary text-primary-foreground shadow hover:bg-primary/90",
// 				destructive:
// 					"bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
// 				outline:
// 					"border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
// 				secondary:
// 					"bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
// 				ghost: "hover:bg-accent hover:text-accent-foreground",
// 				link: "text-primary underline-offset-4 hover:underline",
// 			},
// 			size: {
// 				default: "h-9 px-4 py-2",
// 				sm: "h-8 rounded-md px-3 text-xs",
// 				lg: "h-10 rounded-md px-8",
// 				icon: "h-9 w-9",
// 			},
// 		},
// 		defaultVariants: {
// 			variant: "default",
// 			size: "default",
// 		},
// 	},
// );

// type buttonProps<T extends ValidComponent = "button"> = ButtonRootProps<T> &
// 	VariantProps<typeof buttonVariants> & {
// 		class?: string;
// 	};

// export const Button = <T extends ValidComponent = "button">(
// 	props: PolymorphicProps<T, buttonProps<T>>,
// ) => {
// 	const [local, rest] = splitProps(props as buttonProps, [
// 		"class",
// 		"variant",
// 		"size",
// 	]);

// 	return (
// 		<ButtonPrimitive
// 			class={cn(
// 				buttonVariants({
// 					size: local.size,
// 					variant: local.variant,
// 				}),
// 				local.class,
// 			)}
// 			{...rest}
// 		/>
// 	);
// };
