import { setIcon } from "obsidian";
import { Component, ComponentProps, createEffect, splitProps } from "solid-js";
import { onMount } from "solid-js/types/server/reactive.js";

export const Icon = (props: ComponentProps<"span"> & { iconId: string }) => {
  let ref: HTMLSpanElement;

  const [local, rest] = splitProps(props, ["iconId"]);

  createEffect(() => {
    setIcon(ref, local.iconId);
  });

  return (
    <span
      style={{
        display: "flex",
        "justify-content": "center",
        "align-items": "center",
      }}
      ref={(r) => (ref = r)}
      {...rest}
    ></span>
  );
};
