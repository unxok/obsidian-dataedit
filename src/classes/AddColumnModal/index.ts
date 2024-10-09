import { DataviewAPI } from "@/lib/types";
import { splitBlock, getTableLine } from "@/util/pure";
import { Modal, App, Setting, SearchComponent } from "obsidian";
import { FileFolderSuggest } from "../FileFolderSuggest";
import { PropertySuggest } from "../PropertySuggest";

export class AddColumnModal extends Modal {
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
