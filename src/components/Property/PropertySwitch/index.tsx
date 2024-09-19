import {
	dataeditDropdownTypePrefix,
	dataeditTypeKeyPrefix,
} from "@/lib/constants";
import { Switch, Match, createEffect } from "solid-js";
import {
	PropertyText,
	PropertyNumber,
	PropertyCheckbox,
	PropertyMultitext,
	PropertyDateDatetime,
	PropertyDropdown,
	PropertyColor,
	PropertyToggle,
	PropertyStars,
	PropertyMarkdown,
	PropertySlider,
} from "../Inputs";
import { PropertyDataProps } from "../PropertyData";

export type PropertyCommonProps = PropertyDataProps & {
	updateProperty: (value: unknown) => Promise<void>;
};

export const PropertySwitch = (props: PropertyCommonProps) => {
	return (
		<Switch
			// fallback={<div>fallback</div>}
			fallback={<PropertyText {...props} />}
		>
			<Match
				when={props.propertyType === "text" || props.propertyType === "unknown"}
			>
				<PropertyText {...props} />
			</Match>
			<Match when={props.propertyType === "number"}>
				<PropertyNumber {...props} />
			</Match>
			<Match when={props.propertyType === "checkbox"}>
				<PropertyCheckbox {...props} />
			</Match>
			<Match
				when={
					props.propertyType === "multitext" ||
					props.propertyType === "tags" ||
					props.propertyType === "aliases" ||
					props.propertyType === "cssclasses" ||
					Array.isArray(props.value)
				}
			>
				<PropertyMultitext {...props} />
			</Match>
			<Match
				when={
					props.propertyType === "date" || props.propertyType === "datetime"
				}
			>
				<PropertyDateDatetime {...props} />
			</Match>
			<Match when={props.propertyType?.startsWith(dataeditDropdownTypePrefix)}>
				<PropertyDropdown {...props} />
			</Match>
			<Match when={props.propertyType === dataeditTypeKeyPrefix + "color"}>
				<PropertyColor {...props} />
			</Match>
			<Match when={props.propertyType === dataeditTypeKeyPrefix + "slider"}>
				<PropertySlider {...props} />
			</Match>
			<Match when={props.propertyType === dataeditTypeKeyPrefix + "toggle"}>
				<PropertyToggle {...props} />
			</Match>
			<Match
				when={props.propertyType?.startsWith(dataeditTypeKeyPrefix + "stars-")}
			>
				<PropertyStars
					{...props}
					max={props.propertyType.endsWith("x5") ? 5 : 10}
				/>
			</Match>
			<Match when={props.propertyType === dataeditTypeKeyPrefix + "markdown"}>
				<PropertyMarkdown {...props} />
			</Match>
		</Switch>
	);
};
