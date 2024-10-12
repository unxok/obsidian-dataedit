import { useBlock } from "@/components/CodeBlock";
import { Markdown } from "@/components/Markdown";
import { COMPLEX_PROPERTY_PLACEHOLDER } from "@/lib/constants";
import { DataviewAPI, DataviewPropertyValue, PropertyType } from "@/lib/types";
import { createEffect, createMemo, onCleanup, onMount, Show } from "solid-js";
import { PropertySwitch } from "../PropertySwitch";
import { checkIfDateHasTime } from "@/util/pure";
import { DateTime } from "luxon";
import { MetadataEditor, PropertyWidget } from "obsidian-typings";
import { MarkdownRenderChild } from "obsidian";
import { tryDataviewLinkToMarkdown } from "@/lib/util";

export type PropertyDataProps = {
	property: string;
	value: DataviewPropertyValue;
	propertyType: PropertyType;
	propertyTypeWidget: PropertyWidget<unknown>;
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
					data-dataedit-id-col={true}
					app={bctx.plugin.app}
					markdown={tryFormat(props.value)}
					sourcePath={bctx.ctx.sourcePath}
					class='no-p-margin'
					style={{ "text-wrap": "nowrap" }}
				/>
			}
		>
			{/* <PropertySwitch
				{...props}
				updateProperty={updateProperty}
			/> */}
			<Editable
				{...props}
				updateProperty={updateProperty}
			/>
		</Show>
	);
};

const Editable = (
	props: PropertyDataProps & {
		updateProperty: (value: unknown) => Promise<void>;
	}
) => {
	const {
		plugin: { app },
		ctx,
		dataviewAPI,
	} = useBlock();
	let ref: HTMLDivElement;
	let mdrc: MarkdownRenderChild;

	onMount(() => {
		mdrc = new MarkdownRenderChild(ref);
		ctx.addChild(mdrc);
	});

	onCleanup(() => {
		mdrc.unload();
	});

	createEffect(() => {
		if (!mdrc || !ref) return;
		const {
			propertyTypeWidget,
			property,
			propertyType,
			value,
			updateProperty,
		} = props;
		if (!propertyTypeWidget) return;
		ref.empty();

		const normal = normalizeValue(value, dataviewAPI);

		propertyTypeWidget.render(
			ref,
			{
				key: property,
				type: propertyType,
				value: normal,
			},
			{
				app: app,
				blur: () => console.log("blur called"),
				key: property,
				// @ts-ignore
				onChange: async (value: unknown) => await updateProperty(value),
				sourcePath: ctx.sourcePath,
				metadataEditor: {
					register: (cb) => {
						mdrc.register(cb);
					},
				} as MetadataEditor,
			}
		);
	});

	return (
		<div
			class='metadata-property'
			data-property-key={props.property}
		>
			<div
				ref={(r) => (ref = r)}
				class='dataedit-property-editable-container metadata-property-value'
			></div>
		</div>
	);
};

const normalizeValue = (value: unknown, dv: DataviewAPI) => {
	if (dv.luxon.DateTime.isDateTime(value)) {
		const isTime = checkIfDateHasTime(value);
		if (isTime) {
			return value.toFormat("yyyy-MM-dd'T'hh:mm");
		}
		return value.toFormat("YYYY-MM-DD");
	}
	return tryDataviewLinkToMarkdown(value);
};


