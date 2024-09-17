import { CodeBlockConfig } from "@/components/CodeBlock/Config";
import { Icon } from "@/components/Icon";
import { toFirstUpperCase } from "@/util/pure";
import { App, Menu } from "obsidian";

export const VerticalAlignmentButton = (props: {
	app: App;
	alignment: CodeBlockConfig["verticalAlignment"];
	updateBlockConfig: (cb: (config: CodeBlockConfig) => CodeBlockConfig) => void;
}) => {
	const iconMap: Record<typeof props.alignment, string> = {
		top: "chevrons-up",
		middle: "chevrons-down-up",
		bottom: "chevrons-down",
	};

	const onClick = (e: MouseEvent) => {
		const menu = new Menu();

		Object.keys(iconMap).forEach((k) => {
			const key = k as keyof typeof iconMap;
			menu.addItem((item) =>
				item
					.setIcon(iconMap[key])
					.setTitle(toFirstUpperCase(key))
					.setChecked(k === props.alignment)
					.onClick(() =>
						props.updateBlockConfig((prev) => ({
							...prev,
							verticalAlignment: key,
						}))
					)
			);
		});

		menu.showAtMouseEvent(e);
	};

	return (
		<Icon
			aria-label='Vertical alignment'
			class='clickable-icon'
			iconId={iconMap[props.alignment]}
			onClick={onClick}
		/>
	);
};
