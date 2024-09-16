import { SliderComponent } from "obsidian";
import { PropertyCommonProps } from "../../PropertySwitch";
import { onMount } from "solid-js";

export const PropertySlider = (props: PropertyCommonProps) => {
  let ref: HTMLDivElement;

  onMount(() => {
    new SliderComponent(ref)
      .setDynamicTooltip()
      .setInstant(false)
      .setLimits(0, 100, 1)
      .setValue(Number(props.value))
      .onChange(async (n) => await props.updateProperty(n));
  });

  return <div ref={(r) => (ref = r)}></div>;
};
