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
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import { PropertyText } from "../Text";
import { Icon } from "@/components/Icon";
import { PropertyCommonProps } from "../../PropertySwitch";
import { ComboBoxComponent } from "@/classes/ComboBoxComponent";
import { Component } from "obsidian";
import { MetadataEditor } from "obsidian-typings";

export const PropertyMultitext = (props: PropertyCommonProps) => {
	const {
		config: { useComboBox },
	} = useBlock();

	return (
		<Show
			when={!!useComboBox}
			fallback={<Ul {...props} />}
		>
			<Combobox {...props} />
		</Show>
	);
};

export const Ul = (props: PropertyCommonProps) => {
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

// export const PropertyMultitext3 = (props: PropertyCommonProps) => {
// 	const bctx = useBlock();
// 	let ref: HTMLDivElement;
// 	let component = new Component();
// 	let cmp: ComboBoxComponent;
// 	const [basis, setBasis] = createSignal("unset");
// 	const [gap, setGap] = createSignal("unset");

// 	const normalize = (v: unknown) => {
// 		const arr: unknown[] = Array.isArray(v) ? v : [v];
// 		const normalArr = arr
// 			.map((val) => tryDataviewLinkToMarkdown(val)?.toString() ?? undefined)
// 			.filter((val) => val !== undefined);
// 		return normalArr;
// 	};

// 	const isTag = createMemo(() => {
// 		return props.propertyType === "tags";
// 	});

// 	const removeTag = (value: string) => {
// 		if (value.startsWith("#")) return value.slice(1);
// 		return value;
// 	};

// 	const getAlign = () => {
// 		const align = bctx.config.verticalAlignment;
// 		if (align === "bottom") return "end";
// 		if (align === "top") return "start";
// 		return "center";
// 	};

// 	onMount(() => {
// 		const { horizontalAlignment, multiTextPerRow } = bctx.config;

// 		cmp = new ComboBoxComponent(
// 			ref,
// 			normalize(props.value as string[])
// 		).onChange((v) => {
// 			props.updateProperty(v);
// 		});

// 		const container = cmp.containerEl.find("div.multi-select-container");
// 		if (!container) return;
// 		// container.setAttribute(
// 		// 	"style",
// 		// 	`padding: 0px; align-items: ${getAlign()}; justify-content: ${horizontalAlignment}`
// 		// );
// 		const perRow = multiTextPerRow;
// 		const basis = (100 / perRow).toFixed(5) + "%";
// 		const gap = container.computedStyleMap().get("gap")?.toString();
// 		setBasis(() => basis);
// 		setGap(() => gap?.toString() ?? "");
// 		// pills.forEach((el) => {
// 		// 	el.setAttribute("style", `flex-basis: calc(${basis} - ${gap})`);
// 		// 	const content = el.find("div.multi-select-pill-content");
// 		// 	if (!content) return;
// 		// 	content.setAttribute("style", "width: 100%;");
// 		// });
// 	});

// 	onCleanup(() => {
// 		component.unload();
// 	});

// 	return (
// 		<div
// 			ref={(r) => (ref = r)}
// 			class='dataedit-combobox-container'
// 			style={{
// 				"padding": 0,
// 				"align-items": getAlign(),
// 				"justify-content": bctx.config.horizontalAlignment,
// 				"--multitext-pill-basis": basis(),
// 				"--multitext-pill-gap": gap(),
// 			}}
// 		></div>
// 	);
// };

type MultiSelectComponent = Component & {
	multiselect: {
		inputEl: HTMLDivElement;
		values: string[];
	};
};

export const Combobox = (props: PropertyCommonProps) => {
	const bctx = useBlock();
	let ref: HTMLDivElement;
	let component: MultiSelectComponent;

	const normalize = (v: unknown) => {
		const arr: unknown[] = Array.isArray(v) ? [...v] : [v];
		const normalArr = arr
			.map((val) => tryDataviewLinkToMarkdown(val)?.toString() ?? undefined)
			.filter((val) => val !== undefined);
		return normalArr;
	};

	const getAlign = () => {
		const align = bctx.config.verticalAlignment;
		if (align === "bottom") return "end";
		if (align === "top") return "start";
		return "center";
	};

	createEffect(() => {
		if (!props.propertyType) return;

		ref.empty();

		component = bctx.plugin.app.metadataTypeManager.registeredTypeWidgets[
			props.propertyType
		].render(
			ref,
			{
				type: "text",
				key: props.property,
				value: normalize(props.value),
			},
			{
				app: bctx.plugin.app,

				metadataEditor:
					// @ts-ignore
					bctx.plugin.app.workspace.activeEditor?.leaf.view.metadataEditor ??
					({} as MetadataEditor),
				blur: () => {},
				key: props.property,
				onChange: async (v) => {
					console.log("onChange");

					const oldArr = normalize(props.value);
					const newArr = v as string[];
					if (oldArr.length === newArr.length) {
						const isSame = (v as string[]).every(
							(s, i) => s === normalize(props.value)[i]
						);
						if (isSame) return;
					}
					const inp = document.activeElement;
					// if we update the property while still inside input, solid will remount causing it to lose focus since it gets replaced with new elements
					if (
						inp instanceof HTMLElement &&
						inp?.classList.contains("multi-select-input")
					) {
						return;
					}
					await props.updateProperty(v);
				},
				sourcePath: bctx.ctx.sourcePath,
			}
		) as MultiSelectComponent;
		// console.log("got component: ", component);

		component.multiselect.inputEl.addEventListener("blur", async () => {
			await props.updateProperty(component.multiselect.values);
		});
	});

	onCleanup(() => {
		if (!component) return;
		component.unload();
	});

	return (
		<div
			ref={(r) => (ref = r)}
			data-property-key={props.propertyType}
			class='dataedit-combobox-container metadata-property-value metadata-property'
			style={{
				"padding": 0,
				"align-items": getAlign(),
				"justify-content": bctx.config.horizontalAlignment,
				// "--multitext-pill-basis": basis(),
				// "--multitext-pill-gap": gap(),
				// "--max-width":
				// 	basis() === "unset" && gap() === "unset" ? "300px" : "unset",
			}}
		></div>
	);
};
