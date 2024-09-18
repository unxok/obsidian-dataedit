import { DropdownRecord } from "@/classes/DropdownWidgetManager";
import { dataeditDropdownTypePrefix } from "@/lib/constants";
import { createMemo, For } from "solid-js";
import { PropertyCommonProps } from "../../PropertySwitch";
import { settingsSignal } from "@/classes/DataeditSettingTab";

export const PropertyDropdown = (props: PropertyCommonProps) => {
	const defaultRecord = {
		description: "",
		options: [],
	};

	const record = createMemo(
		() => {
			const { propertyType } = props;
			const data = settingsSignal() ?? {};
			const { dropdowns } = data as {
				dropdowns: Record<string, DropdownRecord | undefined>;
			};
			return (
				dropdowns?.[propertyType.slice(dataeditDropdownTypePrefix.length)] ?? {
					...defaultRecord,
				}
			);
		},
		{
			...defaultRecord,
		}
	);

	return (
		<select
			class='dropdown'
			// aria-label={desc()}
			aria-label={record().description}
			value={props.value as string}
			onChange={async (e) => {
				await props.updateProperty(e.target.value);
			}}
		>
			<For each={record().options}>
				{({ label, value }) => <option value={value}>{label}</option>}
			</For>
		</select>
	);
};
