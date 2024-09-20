import {
	DataviewAPI,
	DataviewLink,
	DataviewQueryResultValues,
	PropertyType,
} from "@/lib/types";
import {
	createContext,
	createEffect,
	createSignal,
	For,
	Index,
	JSX,
	onCleanup,
	onMount,
	Show,
	useContext,
} from "solid-js";
import { useBlock } from "../CodeBlock";
import { checkIfDataviewLink } from "@/lib/util";
import { Icon } from "@/components/Icon";
import { DOMElement } from "solid-js/jsx-runtime";
import { App, Modal, Notice, SearchComponent, Setting } from "obsidian";
import { createStore } from "solid-js/store";
import { PropertyHeader } from "../Property/Header";
import { FileFolderSuggest, PropertySuggest } from "@/classes";
import { PropertyData } from "../Property/PropertyData";
import { moveColumn } from "@/util/mutation";
import { getTableLine, splitBlock } from "@/util/pure";

type DragContextValue = {
	draggedIndex: number;
	draggedOverIndex: number;
};

const defaultDragContextValue: DragContextValue = {
	draggedIndex: -1,
	draggedOverIndex: -1,
};

type DragContextProps = {
	context: DragContextValue;
	setContext: (cb: (previous: DragContextValue) => DragContextValue) => void;
};

const DragContext = createContext<DragContextProps>({
	context: { ...defaultDragContextValue },
	setContext: () => {},
});

export const useDragContext = () => {
	const ctx = useContext(DragContext);

	if (!ctx) {
		throw new Error(
			"useDragContext must be used within a DragContext.Provider"
		);
	}

	return ctx;
};

export const Table = (props: {
	properties: string[];
	headers: string[];
	values: DataviewQueryResultValues;
	propertyTypes: PropertyType[];
	idColIndex: number;
	isDynamic: boolean;
}) => {
	const bctx = useBlock();
	const [dragContext, setDragContext] = createStore<DragContextValue>({
		...defaultDragContextValue,
	});
	const [boundsArr, setBoundsArr] = createSignal<
		[left: number, right: number][]
	>(props.properties.map(() => [0, 0]));

	const getVertical = () => {
		return bctx.config.verticalAlignment;
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

	const recordBounds = (left: number, right: number, index: number) => {
		setBoundsArr((prev) => {
			const copy = [...prev];
			copy[index] = [left, right];
			return copy;
		});
	};

	const getThClassList = (index: number) => {
		return {
			"top": true,
			"dataedit-is-selected": dragContext.draggedIndex === index,
			"dataedit-is-dragged-over": dragContext.draggedOverIndex === index,
			"right": dragContext.draggedIndex < index,
			"left": dragContext.draggedIndex > index,
		};
	};

	return (
		<DragContext.Provider
			value={{ context: dragContext, setContext: setDragContext }}
		>
			<div data-dataedit-scroll-el={true}>
				<div>
					<table
						class='dataedit-table'
						style={{ width: "fit-content" }}
					>
						<thead>
							<tr>
								<For each={props.properties}>
									{(item, index) => (
										<th
											classList={getThClassList(index())}
											style={{
												"vertical-align": getVertical(),
												"text-align": getHorizontal(),
												// ensure that column reorder buttons are able to style correctly
												"position": "relative",
												"overflow": "visible",
											}}
										>
											<PropertyHeader
												header={props.headers[index()]}
												property={item}
												propertyType={props.propertyTypes[index()]}
												index={index()}
											>
												<Show when={!props.isDynamic}>
													<ColumnReorderButton
														property={item}
														boundsArr={boundsArr()}
														index={index()}
														recordBounds={recordBounds}
													/>
												</Show>
											</PropertyHeader>
										</th>
									)}
								</For>
							</tr>
						</thead>
						<tbody>
							<For each={props.values}>
								{(row, rowIndex) => (
									<tr>
										<For each={row}>
											{(item, itemIndex) => (
												<td
													classList={{
														"dataedit-is-selected":
															dragContext.draggedIndex === itemIndex(),
														"bottom": rowIndex() === props.values.length - 1,
														"dataedit-is-dragged-over":
															dragContext.draggedOverIndex === itemIndex(),
														"right": dragContext.draggedIndex < itemIndex(),
														"left": dragContext.draggedIndex > itemIndex(),
													}}
													style={{
														"vertical-align": getVertical(),
														"text-align": getHorizontal(),
													}}
												>
													<PropertyData
														property={props.properties[itemIndex()]}
														value={item}
														propertyType={props.propertyTypes[itemIndex()]}
														header={props.headers[itemIndex()]}
														filePath={getFilePath(rowIndex())}
													/>
												</td>
											)}
										</For>
									</tr>
								)}
							</For>
						</tbody>
					</table>
					<Show when={!props.isDynamic}>
						<div
							class='dataedit-table-row-btn'
							aria-label='Add row after'
							onClick={() => {
								const modal = new AddRowModal(
									bctx.plugin.app,
									bctx.config.defaultFolder,
									bctx.config.defaultTemplate
								);
								modal.open();
							}}
						>
							<Icon iconId='plus' />
						</div>
						<div
							class='dataedit-table-col-btn'
							aria-label='Add column after'
							onClick={() => {
								const { lineStart, lineEnd } =
									bctx.ctx.getSectionInfo(bctx.el) ?? {};
								if (!lineStart || !lineEnd) {
									throw new Error("Could not find position of block");
								}
								const modal = new AddColumnModal(
									bctx.plugin.app,
									bctx.dataviewAPI,
									bctx.source,
									{ start: lineStart, end: lineEnd }
								);
								modal.open();
							}}
						>
							<Icon iconId='plus' />
						</div>
					</Show>
				</div>
			</div>
		</DragContext.Provider>
	);
};

const ColumnReorderButton = (props: {
	index: number;
	property: string;
	recordBounds: (left: number, right: number, index: number) => void;
	boundsArr: [left: number, right: number][];
}) => {
	// later this could probably just be in parent
	const dragCtx = useDragContext();
	const bctx = useBlock();

	const [isGrabbing, setGrabbing] = createSignal(false);
	const [transform, setTransform] = createSignal(0);
	let lastMousePos = 0;
	let ref: HTMLDivElement;

	const onmousemove = (e: MouseEvent) => {
		if (!isGrabbing()) return;

		// TODO it should probably scroll if moving column and hits edge of what's in view
		// const scrollerEl = ref.closest('div[data-dataedit-scroll-el]');
		// if (scrollerEl) {
		//   const left = scrollerEl.clientLeft;
		//   console.log('left: ', left);
		//   console.log('mouse: ', e.offsetX)
		// }

		const diff = e.pageX - lastMousePos;
		setTransform(diff);
		const [left, right] = props.boundsArr[props.index];
		const middle = (right + left) / 2 + transform();
		props.boundsArr.forEach((arr, index) => {
			if (!(middle >= arr[0] && middle <= arr[1])) return;
			if (dragCtx.context.draggedOverIndex === index) return;
			dragCtx.setContext((prev) => ({ ...prev, draggedOverIndex: index }));
			return;
		});
	};

	const onmouseup = () => {
		const cleanup = () => {
			lastMousePos = 0;
			setTransform(0);
			document.removeEventListener("mouseup", onmouseup);
			document.removeEventListener("mousemove", onmousemove);
			dragCtx.setContext(() => ({
				draggedIndex: -1,
				draggedOverIndex: -1,
			}));
			setGrabbing(false);
		};

		if (!isGrabbing()) return;
		const { draggedIndex, draggedOverIndex } = dragCtx.context;
		// console.log(draggedIndex, " ", draggedOverIndex);
		if (draggedIndex === -1 || draggedOverIndex === -1) return cleanup();
		if (draggedIndex === draggedOverIndex) return cleanup();

		moveColumn({
			indexFrom: props.index,
			indexTo: dragCtx.context.draggedOverIndex,
			blockContext: bctx,
		});

		cleanup();
	};

	const onMouseDown = (
		e: MouseEvent & {
			currentTarget: HTMLSpanElement;
			target: DOMElement;
		}
	) => {
		e.preventDefault();
		dragCtx.setContext(() => ({
			draggedIndex: props.index,
			draggedOverIndex: props.index,
		}));
		setGrabbing(true);
		setTransform(0);
		lastMousePos = e.pageX;
		document.addEventListener("mouseup", onmouseup);
		document.addEventListener("mousemove", onmousemove);
	};

	let timerRef = 0;

	createEffect(() => {
		dragCtx.context.draggedIndex;
		const { left, right } = ref.getBoundingClientRect();
		props.recordBounds(left, right, props.index);
	});

	const getGrabbingStyle: () => JSX.CSSProperties = () => {
		if (isGrabbing()) {
			return { translate: "calc(-50% + " + transform() + "px) 0%" };
		}
		return {};
	};

	onCleanup(() => {
		window.clearTimeout(timerRef);
		document.removeEventListener("mouseup", onmouseup);
		document.removeEventListener("mousemove", onmousemove);
	});

	return (
		<div
			ref={async (r) => (ref = r)}
			data-dataedit-column-reorder-button={true}
			class='dataedit-column-reorder-button'
			data-grabbing={isGrabbing().toString()}
			data-hidden={!isGrabbing() && dragCtx.context.draggedIndex !== -1}
			onMouseDown={onMouseDown}
			style={{
				...{
					position: "absolute",
					translate: "-50% 0%",
					bottom: "100%",
					left: "50%",
				},
				...getGrabbingStyle(),
			}}
		>
			<Icon
				iconId='grip-horizontal'
				style={{
					"display": "flex",
					"align-items": "end",
					"justify-content": "center",
					"pointer-events": "none",
				}}
			/>
		</div>
	);
};

class AddRowModal extends Modal {
	rowData: { folder: string; name: string; template: string }[] = [];

	defaultFolder: string | undefined;
	defaultTemplate: string | undefined;

	constructor(app: App, defaultFolder: string, defaultTemplate: string) {
		super(app);
		// this.createSettingRow.bind(this);
		if (defaultFolder) {
			this.defaultFolder = defaultFolder;
		}
		if (defaultTemplate) {
			this.defaultTemplate = defaultTemplate;
		}
	}

	createSettingRow(
		containerEl: HTMLElement
		// rowData: typeof this.rowData,
	): void {
		const index = this.rowData.push({ folder: "", name: "", template: "" }) - 1;
		const setting = new Setting(containerEl)
			.addSearch((cmp) => {
				cmp.setPlaceholder("folder");
				new FileFolderSuggest(this.app, cmp, "folders");
				cmp.onChange((v) => (this.rowData[index].folder = v));
				if (this.defaultFolder) {
					cmp.setValue(this.defaultFolder);
					cmp.onChanged();
				}
			})
			.addText((cmp) =>
				cmp
					.setPlaceholder("note name")
					.onChange((v) => (this.rowData[index].name = v))
			)
			.addSearch((cmp) => {
				cmp.setPlaceholder("template");
				new FileFolderSuggest(this.app, cmp, "files");
				cmp.onChange((v) => (this.rowData[index].template = v));
				if (this.defaultTemplate) {
					cmp.setValue(this.defaultTemplate);
					cmp.onChanged();
				}
			});
		setting.addExtraButton((cmp) =>
			cmp.setIcon("cross").onClick(() => {
				this.rowData = this.rowData.filter((_, i) => i !== index);
				setting.settingEl.remove();
			})
		);
	}

	onOpen(): void {
		this.setTitle("Create note");
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("p", {
			text: "Enter the details for a new note or notes. You can set default folder and template in the block configuration.",
		});

		const ul = contentEl.createEl("ul");
		ul.createEl("li", {
			text: "Duplicate folder  + note name combinations will not be created.",
		});
		ul.createEl("li", {
			text: "If note already exists, the creation of that note will fail.",
		});

		const rowContainer = contentEl.createDiv();

		this.createSettingRow(rowContainer);

		new Setting(contentEl).addButton((cmp) =>
			cmp.setIcon("plus").onClick(() => this.createSettingRow(rowContainer))
		);

		new Setting(contentEl).addButton((cmp) =>
			cmp
				.setCta()
				.setButtonText("create")
				.onClick(() => {
					this.createNotes();
				})
		);
	}

	async createNotes(): Promise<void> {
		const {
			app: { vault },
			rowData,
		} = this;
		const noteMap = new Map<string, (typeof this.rowData)[0]>();
		const templateSet = new Set<string>();

		rowData.forEach((o) => {
			if (!o.name) return;
			const folder = o.folder.endsWith("/") ? o.folder : o.folder + "/";
			const name = o.name.endsWith(".md") ? o.name : o.name + ".md";
			const template = o.template.endsWith(".md")
				? o.template
				: o.template + ".md";
			noteMap.set(folder + name, { folder, name, template });
			templateSet.add(template);
		});

		const templateMap = new Map<string, string>();
		await Promise.all(
			Array.from(templateSet).map(async (v) => {
				const file = vault.getFileByPath(v);
				if (!file) {
					return templateMap.set(v, "");
				}
				const content = await vault.cachedRead(file);
				templateMap.set(v, content);
			})
		);

		await Promise.all(
			Array.from(noteMap).map(async ([filepath, o]) => {
				try {
					await vault.create(filepath, templateMap.get(o.template) ?? "");
				} catch (e) {
					// file may already exist and will throw
					const msg = (e as Error).message + " -- " + filepath;
					new Notice(msg);
					console.error(msg);
				}
			})
		);

		this.close();
	}
}

class AddColumnModal extends Modal {
	dv: DataviewAPI;
	blockSource: string;
	blockPos: { start: number; end: number };

	rowData: { property: string; alias: string }[] = [];

	constructor(
		app: App,
		dv: DataviewAPI,
		blockSource: string,
		blockPos: { start: number; end: number }
	) {
		super(app);
		this.dv = dv;
		this.blockSource = blockSource;
		this.blockPos = blockPos;
	}

	createSettingRow(
		containerEl: HTMLElement,
		value?: (typeof this.rowData)[0]
	): void {
		const index = this.rowData.push({ property: "", alias: "" }) - 1;
		const setting = new Setting(containerEl)
			.addSearch((cmp) => {
				cmp.setPlaceholder("property-name");
				cmp.onChange((v) => (this.rowData[index].property = v));
				if (value) {
					cmp.setValue(value.property);
					cmp.onChanged();
				}
				new PropertySuggest(this.app, cmp);
			})
			.addText((cmp) => {
				cmp
					.setPlaceholder("Property Alias (optional)")
					.onChange((v) => (this.rowData[index].alias = v));
				if (value) {
					cmp.setValue(value.alias);
					cmp.onChanged();
				}
			});

		setting.addExtraButton((cmp) => {
			cmp.setIcon("cross").setTooltip("remove");
			cmp.onClick(() => {
				this.rowData = this.rowData.filter((_, i) => i !== index);
				setting.settingEl.remove();
			});
		});

		console.log("setting made");
	}

	onOpen(): void {
		this.setTitle("Add column");
		const { contentEl, app, dv } = this;
		contentEl.empty();

		contentEl.createEl("p", {
			text: 'Add additional columns to the table. Duplicates will not be removed. Do not include any double quotes (") in aliases.',
		});

		let templateCmp: SearchComponent;

		new Setting(contentEl)
			.setName("Import from note")
			.setDesc(
				"Find all properties in the given note and import them here to be added."
			)
			.addSearch((cmp) => {
				templateCmp = cmp;
				new FileFolderSuggest(app, cmp, "files");
			})
			.addButton((cmp) =>
				cmp.setButtonText("import").onClick(() => {
					const filepath = templateCmp.getValue();
					const data = dv.page(filepath);
					const keys = Object.keys(data).filter((k) => k !== "file");
					keys.forEach((key) =>
						this.createSettingRow(rowContainer, { property: key, alias: "" })
					);
				})
			);

		new Setting(contentEl).setName("Columns to add").setHeading();

		const rowContainer = contentEl.createDiv();
		this.createSettingRow(rowContainer);

		new Setting(contentEl).addButton((cmp) =>
			cmp.setIcon("plus").onClick(() => this.createSettingRow(rowContainer))
		);

		new Setting(contentEl).addButton((cmp) =>
			cmp
				.setCta()
				.setButtonText("add columns")
				.onClick(() => this.addColums())
		);
	}

	addColums(): void {
		const {
			app: { workspace },
			rowData,
			blockSource,
			blockPos: { start, end },
		} = this;
		if (!rowData.length) {
			return this.close();
		}
		const editor = workspace.activeEditor?.editor;
		if (!editor) {
			// TODO handle better?
			throw new Error("No editor for active editor found.");
		}
		const [query, config] = splitBlock(blockSource);
		console.log("got config: ", config);
		const { tableLine, rest } = getTableLine(query);
		const noCurrentCols = tableLine.trim().toLowerCase() === "table";
		const newCols = rowData.reduce((acc, { property, alias }, index) => {
			const str = alias ? property + ' AS "' + alias + '"' : property;
			if (index === 0 && noCurrentCols) {
				return acc + " " + str;
			}
			return acc + ", " + str;
		}, "");
		const newTable = tableLine + newCols;
		const configWithSeparator = config ? "\n---\n" + config : "";
		const newSource = newTable + rest + configWithSeparator;
		editor.replaceRange(
			newSource,
			{ line: start + 1, ch: 0 },
			{ line: end - 1, ch: NaN }
		);
		this.close();
	}
}
