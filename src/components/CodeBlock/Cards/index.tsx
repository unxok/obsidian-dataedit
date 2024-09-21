import {
	PropertyHeader,
	PropertyHeaderIcon,
} from "@/components/Property/Header";
import { PropertyData } from "@/components/Property/PropertyData";
import {
	DataviewQueryResultValues,
	PropertyType,
	DataviewLink,
} from "@/lib/types";
import { checkIfDataviewLink } from "@/lib/util";
import { createEffect, For, Show } from "solid-js";
import { useBlock } from "..";

export const Cards = (props: {
	properties: string[];
	headers: string[];
	values: DataviewQueryResultValues;
	propertyTypes: PropertyType[];
	idColIndex: number;
	isDynamic: boolean;
	cardStyle: { "width": string; "min-width": string; "max-width": string };
	cardsWrap: boolean;
}) => {
	const bctx = useBlock();

	const getAlign = () => {
		const align = bctx.config.verticalAlignment;
		if (align === "bottom") return "end";
		if (align === "middle") return "center";
		return "start";
	};
	const getHorizontal = () => {
		return bctx.config.horizontalAlignment;
	};

	const getFilePath = (rowIndex: number) => {
		const fileColValue = props.values[rowIndex][props.idColIndex];

		let filePath = "";
		if (checkIfDataviewLink(fileColValue)) {
			filePath = (fileColValue as DataviewLink).path;
		}
		return filePath;
	};

	const overrideIcon = (property: string, header: string) => {
		if (
			property === "file.link" ||
			header === bctx.dataviewAPI.settings.tableIdColumnName
		)
			return "file";
		if (property === "file.ctime") {
			return "file-clock";
		}
		if (property === "file.mtime") {
			return "file-edit";
		}
		if (property.startsWith("file")) {
			return "file-type";
		}
		return undefined;
	};

	return (
		<div data-dataedit-scroll-el={true}>
			<div>
				<div
					class='dataedit-card-container'
					style={{
						"flex-wrap": props.cardsWrap ? "wrap" : "nowrap",
					}}
				>
					<For each={props.values}>
						{(row, rowIndex) => (
							<div
								class='dataedit-card'
								style={{ ...props.cardStyle }}
							>
								<For each={row}>
									{(item, itemIndex) => (
										<div
											class='dataedit-card-row'
											style={{
												// "align-items": getAlign(),
												"justify-content": getHorizontal(),
											}}
										>
											<Show when={itemIndex() !== props.idColIndex}>
												<PropertyHeader
													propertyType={props.propertyTypes[itemIndex()]}
													property={props.properties[itemIndex()]}
													header={props.headers[itemIndex()]}
													index={itemIndex()}
													hideText={true}
												/>
											</Show>
											<PropertyData
												property={props.properties[itemIndex()]}
												value={item}
												propertyType={props.propertyTypes[itemIndex()]}
												header={props.headers[itemIndex()]}
												filePath={getFilePath(rowIndex())}
											/>
										</div>
									)}
								</For>
							</div>
						)}
					</For>
				</div>
			</div>
		</div>
	);
};
