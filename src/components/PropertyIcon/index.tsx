import { PropertyType } from "@/lib/types";
import AlignLeft from "lucide-solid/icons/Align-left";
import SquareCheckBig from "lucide-solid/icons/Square-check-big";
import List from "lucide-solid/icons/List";
import Clock from "lucide-solid/icons/Clock";
import Calendar from "lucide-solid/icons/Calendar";
import Binary from "lucide-solid/icons/Binary";
import Sparkles from "lucide-solid/icons/Sparkles";
import Tags from "lucide-solid/icons/Tags";
import CornerUpRight from "lucide-solid/icons/Corner-up-right";
import File from "lucide-solid/icons/File";
import { Match, Show, Switch } from "solid-js";
import { useCodeBlock } from "@/hooks/useDataEdit";

// TODO make this work with the Iconic plugin
export const PropertyIcon = (props: {
  property: string;
  type: PropertyType;
}) => {
  const {
    dataviewAPI: {
      settings: { tableIdColumnName },
    },
    config: { headerIcons },
  } = useCodeBlock();
  return (
    // <div
    //   class="metadata-property"
    //   data-property-key={props.property}
    //   data-property-type={props.type}
    // >
    //   <span class="metadata-property-icon">
    <div
      aria-label={
        props.property === tableIdColumnName ||
        props.property?.toLowerCase() === "file.link"
          ? "file"
          : props.type
      }
      class="flex items-center justify-center"
    >
      <Show when={headerIcons}>
        <Switch>
          <Match
            when={
              props.property === tableIdColumnName ||
              props.property?.toLowerCase() === "file.link"
            }
          >
            <File size="1rem" />
          </Match>
          <Match when={props.type === "text"}>
            <AlignLeft size="1rem" />
          </Match>
          <Match when={props.type === "multitext"}>
            <List size="1rem" />
          </Match>
          <Match when={props.type === "checkbox"}>
            <SquareCheckBig size="1rem" />
          </Match>
          <Match when={props.type === "number"}>
            <Binary size="1rem" class="svg-icon lucide-binary" />
          </Match>
          <Match when={props.type === "date"}>
            <Calendar size="1rem" />
          </Match>
          <Match when={props.type === "datetime"}>
            <Clock size="1rem" />
          </Match>
          <Match when={props.type === "tags"}>
            <Tags size="1rem" />
          </Match>
          <Match when={props.type === "aliases"}>
            <CornerUpRight size="1rem" />
          </Match>
          <Match when={props.type === "unknown"}>
            <Sparkles size="1rem" />
          </Match>
        </Switch>
      </Show>
    </div>
    //   </span>
    // </div>
  );
};
