import { setIcon } from "obsidian";
import { Component, ComponentProps, createEffect, splitProps } from "solid-js";
import { onMount } from "solid-js/types/server/reactive.js";

export const Icon = (
  props: ComponentProps<"span"> & {
    iconId: string;
    effectCallback?: (ref: HTMLSpanElement) => void;
  },
) => {
  let ref: HTMLSpanElement;

  const [local, rest] = splitProps(props, ["iconId", "ref", "effectCallback"]);

  createEffect(() => {
    setIcon(ref, local.iconId);
    local.effectCallback && local.effectCallback(ref);
  });

  return (
    <span
      style={{
        display: "flex",
        "justify-content": "center",
        "align-items": "center",
      }}
      ref={(r) => {
        ref = r;
        typeof local.ref === "function" && local.ref(r);
      }}
      {...rest}
    ></span>
  );
};
