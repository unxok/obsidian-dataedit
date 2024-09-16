import { For } from "solid-js";
import { PropertyCommonProps } from "../../PropertySwitch";
import { Icon } from "@/components/Icon";
import { toNumber } from "@/util/pure";

export const PropertyStars = (props: PropertyCommonProps & { max: number }) => {
  const getStarCount = () => {
    return toNumber(props.value, 0, 0, props.max);
  };

  const getMaxArray = () => {
    const arr = [];
    for (let i = 1; i <= props.max; i++) {
      arr.push(i);
    }
    return arr;
  };

  return (
    <>
      <div class="dataedit-star-container">
        <For each={getMaxArray()}>
          {(n) =>
            n <= 5 && (
              <Icon
                class="clickable-icon"
                aria-label={n.toString()}
                iconId="star"
                onClick={async () => {
                  if (getStarCount() === n) {
                    return await props.updateProperty(n - 1);
                  }
                  await props.updateProperty(n);
                }}
                effectCallback={(r) => {
                  const svg = r.firstElementChild;
                  if (!svg || n > getStarCount()) return;
                  svg.setAttribute("fill", "currentColor");
                }}
              />
            )
          }
        </For>
      </div>
      <div class="dataedit-star-container">
        <For each={getMaxArray()}>
          {(n) =>
            n > 5 && (
              <Icon
                class="clickable-icon"
                aria-label={n.toString()}
                iconId="star"
                onClick={async () => {
                  if (getStarCount() === n) {
                    return await props.updateProperty(n - 1);
                  }
                  await props.updateProperty(n);
                }}
                effectCallback={(r) => {
                  const svg = r.firstElementChild;
                  if (!svg || n > getStarCount()) return;
                  svg.setAttribute("fill", "currentColor");
                }}
              />
            )
          }
        </For>
      </div>
    </>
  );
};
