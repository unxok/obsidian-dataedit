import { App, Modal, Notice, Setting } from "obsidian";
import { FileFolderSuggest } from "../FileFolderSuggest";

export class AddRowModal extends Modal {
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
