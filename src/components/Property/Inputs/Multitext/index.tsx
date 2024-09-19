import { useBlock } from "@/components/CodeBlock";
import {
	DataviewPropertyValueArray,
	DataviewPropertyValueNotLink,
	DataviewLink,
} from "@/lib/types";
import { tryDataviewLinkToMarkdown, updateMetadataProperty } from "@/lib/util";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	onMount,
	Show,
} from "solid-js";
import { PropertyText } from "../Text";
import { Icon } from "@/components/Icon";
import { PropertyCommonProps } from "../../PropertySwitch";
import { ComboBoxComponent } from "@/classes/ComboBoxComponent";

export const PropertyMultitext2 = (props: PropertyCommonProps) => {
	const bctx = useBlock();

	const valueArr = createMemo(() => {
		if (Array.isArray(props.value)) {
			return props.value as DataviewPropertyValueArray;
		}
		return [props.value] as DataviewPropertyValueArray;
	});

	const isTag = createMemo(() => {
		return props.propertyType === "tags";
	});

	const removeTag = (value: string) => {
		if (value.startsWith("#")) return value.slice(1);
		return value;
	};

	return (
		<ul class='dataedit-property-multitext-ul'>
			<For each={valueArr()}>
				{(item, index) => (
					<Show when={item !== null && item !== undefined}>
						<li>
							<PropertyText
								{...props}
								value={item}
								updateProperty={async (value: unknown) => {
									const postValue = isTag()
										? removeTag(value?.toString() ?? "")
										: value;
									let arr = [...valueArr()];
									if (postValue) {
										arr[index()] = postValue as
											| DataviewPropertyValueNotLink
											| DataviewLink;
									} else {
										arr = arr.filter((_, i) => i !== index());
									}
									await updateMetadataProperty(
										props.property,
										arr,
										props.filePath,
										bctx.plugin,
										bctx.el,
										valueArr(),
										index()
									);
								}}
							>
								<Show when={isTag()}>
									&nbsp;
									<span>
										<a
											class='tag'
											onClick={(e) => {
												// Obsidian will always search the tag based on the actual text content
												e.preventDefault();
												const el = e.target as HTMLAnchorElement;
												(el.nextElementSibling as HTMLAnchorElement).click();
											}}
										>
											#
										</a>
										<a
											style={{ display: "none" }}
											href={"#" + item}
											class='tag'
											target='_blank'
											rel='noopener'
										>
											#{item?.toString()}
										</a>
									</span>
								</Show>
							</PropertyText>
						</li>
					</Show>
				)}
			</For>
			<li
				style={{
					"display": "flex",
					"flex-direction": "row",
					"justify-content": "start",
					"align-items": "center",
					"list-style-type": "none",
					"margin-inline-start": 0,
				}}
			>
				<Icon
					iconId='plus'
					class='clickable-icon'
					onClick={async () => {
						const arr = [...valueArr(), ""];
						await updateMetadataProperty(
							props.property,
							arr,
							props.filePath,
							bctx.plugin,
							bctx.el,
							valueArr()
						);
					}}
				/>
			</li>
		</ul>
	);
};

export const PropertyMultitext = (props: PropertyCommonProps) => {
	const bctx = useBlock();
	let ref: HTMLDivElement;
	let cmp: ComboBoxComponent;
	const [basis, setBasis] = createSignal("unset");

	const valueArr = createMemo(() => {
		if (Array.isArray(props.value)) {
			const v = props.value as DataviewPropertyValueArray;
			return v;
		}
		const v = [props.value] as DataviewPropertyValueArray;
		return v;
	});

	const normalize = (v: string | string[]) => {
		if (Array.isArray(v)) return v;
		return [v];
	};

	const isTag = createMemo(() => {
		return props.propertyType === "tags";
	});

	const removeTag = (value: string) => {
		if (value.startsWith("#")) return value.slice(1);
		return value;
	};

	const getAlign = () => {
		const align = bctx.config.verticalAlignment;
		if (align === "bottom") return "end";
		if (align === "top") return "start";
		return "center";
	};

	createEffect(() => {
		if (!cmp) return;
		cmp.setValue(normalize(props.value as string[]));
	});

	onMount(() => {
		const { horizontalAlignment, multiTextPerRow } = bctx.config;

		cmp = new ComboBoxComponent(
			ref,
			normalize(props.value as string[])
		).onChange((v) => {
			props.updateProperty(v);
		});

		const container = cmp.containerEl.find("div.multi-select-container");
		if (!container) return;
		// container.setAttribute(
		// 	"style",
		// 	`padding: 0px; align-items: ${getAlign()}; justify-content: ${horizontalAlignment}`
		// );
		const perRow = multiTextPerRow;
		const basis = (100 / perRow).toFixed(5) + "%";
		const gap = container.computedStyleMap().get("gap")?.toString();
		setBasis(() => basis + "-" + gap);
		// pills.forEach((el) => {
		// 	el.setAttribute("style", `flex-basis: calc(${basis} - ${gap})`);
		// 	const content = el.find("div.multi-select-pill-content");
		// 	if (!content) return;
		// 	content.setAttribute("style", "width: 100%;");
		// });
	});

	return (
		<div
			ref={(r) => (ref = r)}
			class='dataedit-combobox-container'
			style={{
				"padding": 0,
				"align-items": getAlign(),
				"justify-content": bctx.config.horizontalAlignment,
				"--test-var": basis(),
			}}
		></div>
	);
};
