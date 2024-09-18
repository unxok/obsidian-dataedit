import { useBlock } from "@/components/CodeBlock";
import { Markdown } from "@/components/Markdown";
import { COMPLEX_PROPERTY_PLACEHOLDER } from "@/lib/constants";
import { DataviewPropertyValue, PropertyType } from "@/lib/types";
import { createEffect, createMemo, Show } from "solid-js";
import { PropertySwitch } from "../PropertySwitch";
import { checkIfDateHasTime } from "@/util/pure";
import { DateTime } from "luxon";

export type PropertyDataProps = {
	property: string;
	value: DataviewPropertyValue;
	propertyType: PropertyType;
	header: string;
	filePath: string;
};

export const PropertyData = (props: PropertyDataProps) => {
	const bctx = useBlock();

	const isIdCol = createMemo(
		() =>
			props.property.includes("file.link") ||
			props.header === bctx.dataviewAPI.settings.tableIdColumnName
	);

	const isEditable = createMemo(() => {
		const isComplex = props.property === COMPLEX_PROPERTY_PLACEHOLDER;
		const isFileNested = props.property.includes("file.");
		return !isComplex && !isFileNested;
	});

	const updateProperty = async (value: unknown) => {
		await bctx.plugin.updateProperty(
			props.property,
			value,
			props.filePath,
			props.value
		);
	};

	const tryFormat = (v: unknown) => {
		const {
			dataviewAPI: {
				luxon: { DateTime },
				settings,
			},
		} = bctx;
		const isDt = DateTime.isDateTime(v);
		if (!isDt) return v?.toString() ?? "";
		const timeFormat = settings.defaultDateTimeFormat;
		const dateFormat = settings.defaultDateFormat;
		const dt = v as DateTime;
		const isTime = checkIfDateHasTime(dt);
		if (isTime) {
			return dt.toFormat(timeFormat);
		}
		return dt.toFormat(dateFormat);
	};

	return (
		<Show
			when={!isIdCol() && isEditable()}
			fallback={
				<Markdown
					app={bctx.plugin.app}
					markdown={tryFormat(props.value)}
					sourcePath={bctx.ctx.sourcePath}
					class='no-p-margin'
					style={{ "text-wrap": "nowrap" }}
				/>
			}
		>
			<PropertySwitch
				{...props}
				updateProperty={updateProperty}
			/>
		</Show>
	);
};
