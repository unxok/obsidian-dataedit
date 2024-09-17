import { dataeditDropdownTypePrefix } from "@/lib/constants";
import DataEdit from "@/main";
import {
	ButtonComponent,
	MarkdownEditView,
	MarkdownView,
	Modal,
	Notice,
	Setting,
	TextComponent,
} from "obsidian";
import { SaveModal } from "../SaveModal";

export type DropdownRecordKey = string;
export type DropdownRecord = {
	description: string;
	label: string;
	options: {
		label: string;
		value: string;
	}[];
	defaultValue: string;
};

const defaultDropdownRecord: DropdownRecord = {
	description: "",
	label: "",
	options: [{ label: "Label", value: "value" }],
	defaultValue: "value",
};

export class DropdownWidgetManager extends SaveModal {
	private plugin: DataEdit;
	private dropdowns: Record<DropdownRecordKey, DropdownRecord> = {};

	constructor(plugin: DataEdit) {
		super(plugin.app);
		this.plugin = plugin;
	}

	async onSave(): Promise<void> {
		const settings = (await this.plugin.loadData()) ?? {};
		const { dropdowns } = this;
		Object.keys(dropdowns).forEach((key) => {
			const filtered = dropdowns[key].options.filter(({ value }) => !!value);
			dropdowns[key].options = filtered;
		});
		settings.dropdowns = dropdowns;
		await this.plugin.saveSettings(settings);
		this.plugin.registerDropdowns(dropdowns);
	}

	async onOpen(): Promise<void> {
		const { plugin, contentEl } = this;
		const settings = (await plugin.loadData()) ?? { dropdowns: {} };
		if (!settings.hasOwnProperty("dropdowns")) {
			settings.dropdowns = {};
		}
		this.dropdowns = settings.dropdowns as Record<
			DropdownRecordKey,
			DropdownRecord
		>;
		console.log("settings loaded: ", settings);
		this.setTitle("Dropdown manager");
		contentEl.createEl("p", {
			text: "Manage custom dropdowns for metadata properties. These dropdowns are shared globally with all Dataedit blocks.",
		});
		contentEl.createEl("p").createEl("em", {
			text: "Simply close the modal to save.",
		});
		const duplicateErrorEl = contentEl.createEl("p", {
			text: "Dropdown ID already in use!",
			attr: { style: "color: var(--text-error); display: none;" },
		});
		let addIdTextComponent: TextComponent;
		let addIdDescriptionTextComponent: TextComponent;
		let addIdButtonComponent: ButtonComponent;
		new Setting(contentEl).setHeading().setName("Create new dropdown");
		new Setting(contentEl)
			.setName("Unique id")
			.setDesc(
				"Enter a unique name for your dropdown. This name will only be visible in these settings."
			)
			.addText((cmp) => (addIdTextComponent = cmp));
		new Setting(contentEl)
			.setName("Description (optional)")
			.setDesc(
				"Optional description of your dropdown. This will only be visible in these settings."
			)
			.addText((cmp) => (addIdDescriptionTextComponent = cmp));
		const createButtonSetting = new Setting(contentEl);

		new Setting(contentEl)
			.setHeading()
			.setName("Registered dropdowns")
			.setDesc("Click on a dropdown record to view and edit it.");

		const dropdownContainer = contentEl.createDiv();

		createButtonSetting.addButton((cmp) => {
			addIdButtonComponent = cmp;
			cmp
				.setCta()
				.setButtonText("create")
				.onClick(() => {
					this.isChanged = true;
					const id = addIdTextComponent.getValue();
					const description = addIdDescriptionTextComponent.getValue() ?? "";
					const record = { ...defaultDropdownRecord, description, label: id };
					this.dropdowns[id] = record;
					this.createDropdownSetting(id, dropdownContainer);
					addIdTextComponent.setValue("");
				})
				.setDisabled(true);
		});

		addIdTextComponent!.onChange((v) => {
			if (!v) return addIdButtonComponent.setDisabled(true);
			if (!this.dropdowns.hasOwnProperty(v)) {
				duplicateErrorEl.style.display = "none";
				addIdButtonComponent.setDisabled(false);
				return;
			}
			duplicateErrorEl.style.display = "block";
			addIdButtonComponent.setDisabled(true);
		});

		Object.keys(this.dropdowns).forEach((id) =>
			this.createDropdownSetting(id, dropdownContainer)
		);

		new Setting(contentEl).addButton((cmp) =>
			cmp.setCta().setButtonText("save")
		);
	}

	private createDropdownSetting(
		id: string,
		dropdownContainer: HTMLElement
	): void {
		const record = this.dropdowns[id];
		if (!record) {
			const msg = "Couldn't find dropdown record. This should never happen";
			new Notice(msg);
			throw new Error(msg);
		}
		const { description, defaultValue, label, options } = record;
		const setting = new Setting(dropdownContainer)
			.setName(id)
			.setDesc(description);
		setting.settingEl.classList.add("dataedit-setting-item");
		const container = dropdownContainer.createDiv({
			cls: "dataedit-nested-setting-container",
			attr: { style: "display: none;" },
		});

		setting.addExtraButton((cmp) =>
			cmp.setIcon("pencil").onClick(async () => {
				await this.modifyDropdownDetails(id, description);
			})
		);
		setting.addExtraButton((cmp) =>
			cmp.setIcon("trash").onClick(() => {
				this.isChanged = true;
				delete this.dropdowns[id];
				setting.settingEl.remove();
				container.remove();
			})
		);

		setting.settingEl.addEventListener("click", (e) => {
			// prevents clicks on extra buttons to trigger this
			if ((e.target as HTMLElement).tagName.toLowerCase() !== "div") return;
			const display = container.style.display ?? "block";
			if (display === "block") {
				return (container.style.display = "none");
			}
			container.style.display = "block";
		});

		new Setting(container)
			.setName("Label")
			.setDesc(
				"This is what will show when selecting the property type from menus."
			)
			.addText((cmp) =>
				cmp.setValue(label).onChange((v) => {
					this.dropdowns[id].label = v;
					this.isChanged = true;
				})
			);

		// TOOD setting a default value in dropdown component elsewhere isn't working
		// new Setting(container)
		//   .setName("Default value")
		//   .setDesc(
		//     "The default value of the dropdown. Make sure this value is also listed in your options.",
		//   )
		//   .addText((cmp) =>
		//     cmp
		//       .setValue(defaultValue)
		//       .onChange((v) => (this.dropdowns[id].defaultValue = v)),
		//   );

		new Setting(container)
			.setName("Options")
			.setDesc(
				"Available options for your dropdown, the first being the default option."
			)
			.addButton((cmp) =>
				cmp
					.setCta()
					.setIcon("plus")
					.setTooltip("add new option")
					.onClick(() => {
						this.isChanged = true;
						const len = this.dropdowns[id].options.push({
							label: "",
							value: "",
						});
						this.createOptionSetting(id, container, len - 1);
					})
			);

		options.forEach((_, i) => this.createOptionSetting(id, container, i));
	}

	private createOptionSetting(
		dropdownId: string,
		container: HTMLElement,
		index: number
	): void {
		const record = this.dropdowns[dropdownId];
		if (!record) {
			const msg = "Couldn't find dropdown record. This should never happen";
			new Notice(msg);
			throw new Error(msg);
		}
		const { label, value } = record.options[index];

		const setting = new Setting(container)
			.addText((cmp) =>
				cmp
					.setValue(value)
					.setPlaceholder("value (required)")
					.onChange((v) => {
						this.isChanged = true;
						this.dropdowns[dropdownId].options[index].value = v;
					})
			)
			.addText((cmp) =>
				cmp
					.setValue(label)
					.setPlaceholder("label (optional)")
					.onChange((v) => {
						this.isChanged = true;
						this.dropdowns[dropdownId].options[index].label = v;
					})
			);

		setting.addExtraButton((cmp) =>
			cmp.setIcon("cross").onClick(() => {
				this.isChanged = true;
				this.dropdowns[dropdownId].options[index].value = "";
				setting.settingEl.remove();
			})
		);

		setting.settingEl.style.borderTopWidth = "0px";
	}

	private async modifyDropdownDetails(
		id: string,
		description: string
	): Promise<void> {
		const modal = new Modal(this.app);
		modal.setTitle("Edit dropdown ID: " + id);

		modal.onOpen = () => {
			const { contentEl } = modal;
			contentEl.createEl("p", {
				text: "Edit the id and description of your dropdown. Properties with the type corresponding to the old ID will be updated to use this new ID automatically.",
			});

			let idTextComponent: TextComponent;
			let descriptionTextComponent: TextComponent;
			let addIdButtonComponent: ButtonComponent;
			new Setting(contentEl)
				.setName("Unique id")
				.setDesc(
					"Enter a unique name for your dropdown. This name will only be visible in these settings."
				)
				.addText((cmp) => {
					idTextComponent = cmp;
					cmp.setValue(id);
				});
			new Setting(contentEl)
				.setName("Description (optional)")
				.setDesc(
					"Optional description of your dropdown. This will only be visible in these settings."
				)
				.addText((cmp) => {
					descriptionTextComponent = cmp;
					cmp.setValue(description);
				});
			new Setting(contentEl).addButton((cmp) => {
				addIdButtonComponent = cmp;
				cmp
					.setCta()
					.setButtonText("update")
					.onClick(async () => {
						this.isChanged = true;
						const newId = idTextComponent.getValue();
						const newTypeKey = dataeditDropdownTypePrefix + newId;
						const oldTypeKey = dataeditDropdownTypePrefix + id;

						const description = descriptionTextComponent.getValue() ?? "";
						const existing = this.dropdowns[id];
						const record = { ...existing, description };
						delete this.dropdowns[id];
						this.dropdowns[newId] = record;
						const { properties } = this.app.metadataTypeManager;
						const propNames = Object.keys(properties).filter((key) => {
							return properties[key].type === oldTypeKey;
						});
						// this saves the settings and re-registeres type widgets
						await this.onClose();

						// update the types for properties that had the oldTypeKey
						await Promise.all(
							propNames.map(async (key) => {
								await this.app.metadataTypeManager.setType(key, newTypeKey);
							})
						);

						// re-open the main modal to ensure fresh data is loaded
						this.contentEl.empty();
						await this.onOpen();
						modal.close();
					});
			});

			idTextComponent!.onChange((v) => {
				if (!v) return addIdButtonComponent.setDisabled(true);
				addIdButtonComponent.setDisabled(false);
			});
		};

		modal.open();
	}
}
