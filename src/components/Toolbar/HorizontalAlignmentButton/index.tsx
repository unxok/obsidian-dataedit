import { CodeBlockConfig } from "@/components/CodeBlock/Config";
import { Icon } from "@/components/Icon";
import { toFirstUpperCase } from "@/util/pure";
import { App, Menu } from "obsidian";

export const HorizontalAlignmentButton = (props: {
	app: App;
	alignment: CodeBlockConfig["horizontalAlignment"];
	updateBlockConfig: (cb: (config: CodeBlockConfig) => CodeBlockConfig) => void;
}) => {
	const iconMap: Record<typeof props.alignment, string> = {
		left: "align-left",
		center: "align-justify",
		right: "align-right",
	};

	const onClick = (e: MouseEvent) => {
		const menu = new Menu();

		Object.keys(iconMap).forEach((k) => {
			const key = k as keyof typeof iconMap;
			menu.addItem((item) =>
				item
					.setIcon(iconMap[key])
					.setTitle(toFirstUpperCase(key))
					.onClick(() =>
						props.updateBlockConfig((prev) => ({
							...prev,
							horizontalAlignment: key,
						}))
					)
			);
		});

		menu.showAtMouseEvent(e);
	};

	return (
		<Icon
			aria-label='Horizontal alignment'
			class='clickable-icon'
			iconId={iconMap[props.alignment]}
			onClick={onClick}
		/>
	);
};
