import { Icon } from "@/components/Icon";
import { Markdown } from "@/components/Markdown";
import { useBlock } from "@/components/CodeBlock";
import { dataeditTypeKeyPrefix } from "@/lib/constants";
import { PropertyType } from "@/lib/types";
import { Menu } from "obsidian";
import { JSXElement, Show, createEffect, createMemo } from "solid-js";
import {
	ColumnEditModal,
	PropertyEditModal,
	ColumnRemoveModal,
	PropertyDeleteModal,
} from "@/classes";

export type PropertyHeaderProps = {
	header: string;
	property: string;
	propertyType: PropertyType;
	index: number;
	children?: JSXElement;
	hideText?: boolean;
};
export const PropertyHeader = (props: PropertyHeaderProps) => {
	const bctx = useBlock();
	// let menu: Menu;

	const isFile = () => {
		const a = props.property === "file.link";
		const b = props.header === bctx.dataviewAPI.settings.tableIdColumnName;
		return a || b;
	};

	const overrideIcon = () => {
		if (isFile()) return "file";
		if (props.property === "file.ctime") {
			return "file-clock";
		}
		if (props.property === "file.mtime") {
			return "file-edit";
		}
		if (props.property.startsWith("file")) {
			return "file-type";
		}
		return undefined;
	};

	const isDefaultIdCol = () => {
		const a = props.property === bctx.dataviewAPI.settings.tableIdColumnName;
		const b = props.header === bctx.dataviewAPI.settings.tableIdColumnName;
		return a && b;
	};

	/* 
    TODO even though it just won't work, it should probably not show the options
    to edit/delete property when the property is dot notation (file.something, or a nested yaml property)
  */
	const createMenu = () => {
		const { isDynamic, checkForReading } = bctx;
		const isReading = checkForReading();
		const isRestricted = isDynamic || isReading;
		const { metadataTypeManager } = bctx.plugin.app;
		const typesObj = { ...metadataTypeManager.registeredTypeWidgets };
		const customTypes = Object.keys(typesObj).filter((k) =>
			k.startsWith(dataeditTypeKeyPrefix)
		) as PropertyType[];
		const deafaultTypes: PropertyType[] = [
			"text",
			"multitext",
			"number",
			"checkbox",
			"date",
			"datetime",
		];

		const allowedTypeKeys = [...deafaultTypes, ...customTypes];

		const typeKeys = (Object.keys(typesObj) as PropertyType[]).filter((k) =>
			allowedTypeKeys.includes(k)
		);

		typeKeys.push("unknown");

		const typeWidgets = metadataTypeManager.registeredTypeWidgets;

		const menu = new Menu();

		isRestricted &&
			menu
				.addItem((item) =>
					item
						.setIsLabel(true)
						.setTitle("Some options disabled")
						.setIcon("x-circle")
						.dom.setAttribute(
							"aria-label",
							"This block appears to be generated dynamically or in reading mode, which restricts some options."
						)
				)
				.addSeparator();

		menu
			.addItem((item) => {
				const submenu = item
					.setSection("type")
					.setTitle("Property type")
					.setIcon("menu")
					.setSubmenu();
				Object.values(metadataTypeManager.registeredTypeWidgets)
					.toSorted((a, b) => a.name().localeCompare(b.name()))
					.forEach(({ name, icon, type }) => {
						submenu.addItem((sub) =>
							sub
								.setTitle(name())
								.setIcon(icon)
								.setChecked(props.propertyType === type)
								.onClick(
									async () =>
										await metadataTypeManager.setType(props.property, type)
								)
						);
					});
				submenu.addItem((sub) =>
					sub
						.setTitle("Unknown")
						.setIcon("file-question")
						.setChecked(props.propertyType === "unknown")
						.onClick(
							async () => await metadataTypeManager.unsetType(props.property)
						)
				);
				// typeKeys.forEach((k) => {
				// 	const {
				// 		icon,
				// 		name,
				// 		type: typeKey,
				// 	} = typesObj[k] ?? {
				// 		icon: "file-question",
				// 		name: () => "Unset",
				// 		type: "unknown",
				// 	};
				// 	submenu.addItem((sub) =>
				// 		sub
				// 			.setTitle(name())
				// 			.setIcon(icon)
				// 			.setChecked(typeKey === props.propertyType)
				// 			.onClick(async () => {
				// 				if (typeKey === "unknown") {
				// 					await metadataTypeManager.unsetType(props.property);
				// 					return;
				// 				}
				// 				await metadataTypeManager.setType(props.property, typeKey);
				// 			})
				// 	);
				// }
				//);
			})
			.addSeparator()
			.addItem((item) =>
				item
					.setSection("edit")
					.setTitle("Edit column")
					.setIcon("pencil")
					.onClick(() => {
						const modal = new ColumnEditModal(
							props.index,
							props.property,
							props.header === props.property ? "" : props.header,
							bctx
						);
						modal.open();
					})
					.setDisabled(isRestricted)
			)
			.addItem((item) =>
				item
					.setSection("edit")
					.setTitle("Edit property")
					.setIcon("pen-box")
					.onClick(() => {
						const modal = new PropertyEditModal(
							props.index,
							props.property,
							props.header,
							bctx
						);
						modal.open();
					})
			)
			.addSeparator()
			.addItem((item) =>
				item
					.setSection("clipboard")
					.setTitle("Copy property")
					.setIcon("clipboard-type")
			)
			.addItem((item) =>
				item
					.setSection("clipboard")
					.setTitle("Copy alias")
					.setIcon("clipboard-list")
			)
			.addSeparator()
			.addItem((item) =>
				item
					.setSection("destructive")
					.setWarning(true)
					.setTitle("Remove column")
					.setIcon("cross")
					.onClick(() => {
						new ColumnRemoveModal(
							props.index,
							props.property,
							props.header,
							bctx
						).open();
					})
					.setDisabled(isRestricted)
			);
		// .addItem((item) =>
		// 	item
		// 		.setSection("destructive")
		// 		.setTitle("Delete property")
		// 		.setIcon("trash")
		// 		.setWarning(true)
		// 		.onClick(() => {
		// 			new PropertyDeleteModal(
		// 				props.index,
		// 				props.property,
		// 				props.header,
		// 				bctx
		// 			).open();
		// 		})
		// );

		return menu;
	};

	// createEffect(() => {
	// 	createMenu();
	// });

	return (
		<div
			aria-label={props.property}
			onClick={(e) => {
				const attr = e.target.getAttribute(
					"data-dataedit-column-reorder-button"
				);
				if (attr !== null || isDefaultIdCol()) return;
				const menu = createMenu();
				bctx.plugin.app.workspace.trigger(
					"file-property-menu",
					menu,
					props.property
				);
				menu.showAtMouseEvent(e);
			}}
			classList={{ "dataedit-property-header": !isDefaultIdCol() }}
			style={{
				// position: "relative",
				"display": "inline-flex",
				"flex-direction": "row",
				"align-items": "center",
				"gap": ".5ch",
				"width": "fit-content",
				"position": "static",
			}}
		>
			{props.children}
			<Show when={bctx.config.typeIcons && bctx.config.typeIconLeft}>
				<PropertyHeaderIcon
					propertyType={props.propertyType}
					overrideIcon={overrideIcon()}
				/>
			</Show>
			<Show when={!props.hideText}>
				<Markdown
					app={bctx.plugin.app}
					markdown={props.header}
					sourcePath={bctx.ctx.sourcePath}
					class='no-p-margin'
					style={{ "text-wrap": "nowrap" }}
				/>
			</Show>
			<Show when={bctx.config.typeIcons && !bctx.config.typeIconLeft}>
				<PropertyHeaderIcon
					propertyType={props.propertyType}
					overrideIcon={overrideIcon()}
				/>
			</Show>
		</div>
	);
};

export const PropertyHeaderIcon = (props: {
	propertyType: PropertyType;
	overrideIcon?: string;
}) => {
	return (
		<Show
			when={props.overrideIcon}
			fallback={<PropertyIcon propertyType={props.propertyType} />}
		>
			<Icon iconId={props.overrideIcon!} />
		</Show>
	);
};

const PropertyIcon = (props: { propertyType: PropertyType }) => {
	const bctx = useBlock();
	const iconId = createMemo(() => {
		const typesObj = bctx.plugin.app.metadataTypeManager.registeredTypeWidgets;
		const icon = typesObj[props.propertyType]?.icon;
		return icon ?? "file-question";
	});

	return <Icon iconId={iconId()} />;
};
