import { ComponentProps } from "solid-js";

export const ExternalLink = (props: ComponentProps<"a">) => (
  <>
    <span class="cm-link">
      <a {...props} class="text-accent underline hover:text-accent-hover"></a>
    </span>
    <span class="external-link"></span>
  </>
);
