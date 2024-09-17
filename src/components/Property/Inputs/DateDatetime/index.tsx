import { Markdown } from "@/components/Markdown";
import { useBlock } from "@/components/CodeBlock";
import { DateTime } from "luxon";
import { createSignal, createMemo, Show } from "solid-js";
import { autofocus } from "@solid-primitives/autofocus";
import { Icon } from "@/components/Icon";
import { Notice, TFile } from "obsidian";
import { DailyNotesPluginInstance } from "obsidian-typings";
import { PropertyCommonProps } from "../../PropertySwitch";
import { updateMetadataProperty } from "@/lib/util";
import { checkIfDateHasTime } from "@/util/pure";
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

  const isDailyNotesEnabled = () => {
    return !!bctx.plugin.app.internalPlugins.getEnabledPluginById(
      "daily-notes",
    );
  };

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
    <div class='dataedit-datedatetime-container' style={{"justify-content": bctx.config.horizontalAlignment}}>
      <Show
        when={isEditing() || !bctx.config.formatDates}
        fallback={
          <span class="dataedit-formatted-date" onClick={() => setEditing(true)}>
            {dt()?.toFormat(getDvFormat()) ?? (
              <Markdown
                app={bctx.plugin.app}
                markdown={bctx.dataviewAPI.settings.renderNullAs}
                sourcePath={bctx.ctx.sourcePath}
                class={"dataedit-property-markdown-div no-p-margin"}
              />
            )}
          </span>
        }
      >
        <input
          use:autofocus={!!bctx.config.formatDates}
          autofocus
          class="dataedit-date-datetime-input"
          type={isTime() ? "datetime-local" : "date"}
          // 2018-06-12T19:30
          value={preProcess(dt())}
          onBlur={async (e) => {
            const isValid = e.target.validity;
            if (!isValid) return setEditing(false);
            const format = isTime() ? datetimeFormat : dateFormat;
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
      <Show
        when={
          isDailyNotesEnabled() &&
          !isTime() &&
          bctx.config.dateLinkDaily &&
          dt()
        }
      >
        <Icon
          iconId="link"
          aria-label="Create or open daily note"
          class="clickable-icon"
          onClick={async () => {
            const datetime = dt()!;
            const dailyNotePlugin =
              bctx.plugin.app.internalPlugins.getEnabledPluginById(
                "daily-notes",
              ) as
                | null
                | (DailyNotesPluginInstance & {
                    options: { format: string };
                    getDailyNote: (fileName?: string) => Promise<TFile>;
                  });
            if (!dailyNotePlugin) {
              // daily notes plugin was disabled after already rendered
              new Notice("Daily notes internal plugin is currently disabled!");
              return;
            }
            const format = dailyNotePlugin.options.format;
            // @ts-expect-error Obsidian declares as global, and adding it as import increases bundle size significantly
            const fileName = moment(datetime).format(format);
            const file = await dailyNotePlugin.getDailyNote(fileName);
            bctx.plugin.app.workspace.openLinkText("", file.path);
          }}
        />
      </Show>
    </div>
  );
};
