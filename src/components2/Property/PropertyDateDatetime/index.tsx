import { Markdown } from "@/components/Markdown";
import { useBlock } from "@/components2/CodeBlock";
import { checkIfDateHasTime, updateMetadataProperty } from "@/lib/util";
import { DateTime } from "luxon";
import { createSignal, createMemo, Show } from "solid-js";
import { PropertyCommonProps } from "..";
import { autofocus } from "@solid-primitives/autofocus";
// To prevent treeshaking
autofocus;

export const PropertyDateDatetime = (props: PropertyCommonProps) => {
  const dateFormat = "yyyy-MM-dd";
  const datetimeFormat = "yyyy-MM-dd'T'hh:mm";
  const bctx = useBlock();
  const [isEditing, setEditing] = createSignal(false);
  const isTime = createMemo(() => {
    if (props.propertyType === "datetime") return true;
    const {
      dataviewAPI: { luxon },
    } = bctx;
    if (!luxon.DateTime.isDateTime(props.value)) return false;
    return checkIfDateHasTime(props.value);
  });

  const dt = createMemo(() => {
    const {
      dataviewAPI: { luxon },
    } = bctx;
    if (luxon.DateTime.isDateTime(props.value)) return props.value;
    return undefined;
  });

  const preProcess = (dt?: DateTime) => {
    if (!dt) return "";
    if (isTime()) {
      return dt.toFormat(datetimeFormat);
    }
    return dt.toFormat(dateFormat);
  };

  const getDvFormat = () => {
    const {
      dataviewAPI: { settings },
    } = bctx;
    if (isTime()) {
      return settings.defaultDateTimeFormat;
    }
    return settings.defaultDateFormat;
  };

  return (
    <Show
      when={isEditing()}
      fallback={
        <div onClick={() => setEditing(true)}>
          {dt()?.toFormat(getDvFormat()) ?? (
            <Markdown
              app={bctx.plugin.app}
              markdown={bctx.dataviewAPI.settings.renderNullAs}
              sourcePath={bctx.ctx.sourcePath}
              class={"property-text-div no-p-margin"}
            />
          )}
        </div>
      }
    >
      <input
        use:autofocus
        autofocus
        class=""
        type={isTime() ? "datetime-local" : "date"}
        // 2018-06-12T19:30
        value={preProcess(dt())}
        onBlur={async (e) => {
          const isValid = e.target.validity;
          if (!isValid) return setEditing(false);
          const format = isTime() ? datetimeFormat : dateFormat;
          // const dt = DateTime.fromFormat(e.target.value, format);
          // const newValue = dt.toFormat(format);
          const newValue = e.target.value;
          const oldDt = dt();
          const formattedOld = oldDt ? oldDt.toFormat(format) : "";
          await updateMetadataProperty(
            props.property,
            newValue,
            props.filePath,
            bctx.plugin,
            bctx.el,
            formattedOld,
          );
          setEditing(false);
        }}
      />
    </Show>
  );
};
