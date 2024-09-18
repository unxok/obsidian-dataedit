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
};
export const PropertyHeader = (props: PropertyHeaderProps) => {
	const bctx = useBlock();
	let menu: Menu;

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
		menu = new Menu();

		menu
			.addItem((item) => {
				const submenu = item
					.setTitle("Property type")
					.setIcon("menu")
					.setSubmenu();
				typeKeys.forEach((k) => {
					const {
						icon,
						name,
						type: typeKey,
					} = typesObj[k] ?? {
						icon: "file-question",
						name: () => "Unset",
						type: "unknown",
					};
					submenu.addItem((sub) =>
						sub
							.setTitle(name())
							.setIcon(icon)
							.setChecked(typeKey === props.propertyType)
							.onClick(async () => {
								if (typeKey === "unknown") {
									await metadataTypeManager.unsetType(props.property);
									console.log("should be unset");
									return;
								}
								await metadataTypeManager.setType(props.property, typeKey);
							})
					);
				});
			})
			.addItem((item) =>
				item
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
			)
			.addItem((item) =>
				item
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
				item.setTitle("Copy property").setIcon("clipboard-type")
			)
			.addItem((item) => item.setTitle("Copy alias").setIcon("clipboard-list"))
			.addSeparator()
			.addItem((item) =>
				item
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
			)
			.addItem((item) =>
				item
					.setTitle("Delete property")
					.setIcon("trash")
					.setWarning(true)
					.onClick(() => {
						new PropertyDeleteModal(
							props.index,
							props.property,
							props.header,
							bctx
						).open();
					})
			);
	};

	createEffect(() => {
		createMenu();
	});

	return (
		<div
			onClick={(e) => {
				const attr = e.target.getAttribute(
					"data-dataedit-column-reorder-button"
				);
				if (attr !== null) return;

				!isDefaultIdCol() && menu.showAtMouseEvent(e);
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
					{...props}
					overrideIcon={overrideIcon()}
				/>
			</Show>
			<Markdown
				app={bctx.plugin.app}
				markdown={props.header}
				sourcePath={bctx.ctx.sourcePath}
				class='no-p-margin'
				style={{ "text-wrap": "nowrap" }}
			/>
			<Show when={bctx.config.typeIcons && !bctx.config.typeIconLeft}>
				<PropertyHeaderIcon
					{...props}
					overrideIcon={overrideIcon()}
				/>
			</Show>
		</div>
	);
};

const PropertyHeaderIcon = (
	props: PropertyHeaderProps & { overrideIcon?: string }
) => {
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