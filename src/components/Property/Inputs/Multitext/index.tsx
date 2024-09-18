import { useBlock } from "@/components/CodeBlock";
import {
	DataviewPropertyValueArray,
	DataviewPropertyValueNotLink,
	DataviewLink,
} from "@/lib/types";
import { updateMetadataProperty } from "@/lib/util";
import { createMemo, For, Show } from "solid-js";
import { PropertyText } from "../Text";
import { Icon } from "@/components/Icon";
import { PropertyCommonProps } from "../../PropertySwitch";

export const PropertyMultitext = (props: PropertyCommonProps) => {
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
