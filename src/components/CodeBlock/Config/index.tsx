import { FileFolderSuggest, PropertySuggest } from "@/classes";
import { SaveModal } from "@/classes/SaveModal";
import { setBlockConfig, SetBlockConfigProps } from "@/util/mutation";
import { toNumber } from "@/util/pure";
import { App, Modal, setIcon, Setting } from "obsidian";

export type ToolbarItemName =
	| "results"
	| "pagination"
	| "horizontal-alignment"
	| "vertical-alignment";

export type CodeBlockConfig = {
	toolbarOrder: ToolbarItemName[];
	containerClass: string;
	pageSize: number;
	// multiTextPerRow: number;
	verticalAlignment: "top" | "middle" | "bottom";
	horizontalAlignment: "left" | "center" | "right";
	useComboBox: boolean;
	typeIcons: boolean;
	typeIconLeft: boolean;
	dateLinkDaily: boolean;
	formatDates: boolean;
	showToolbar: boolean;
	frontmatterLinks: string;
	defaultFolder: string;
	defaultTemplate: string;
	/** Not meant to be modified in modal */
	currentPage: number;
	/* Cards */
	cardsView: boolean;
	cardsWrap: boolean;
	cardsWidth: string;
	cardsMinWidth: string;
	cardsMaxWidth: string;
};

export const defaultCodeBlockConfig: CodeBlockConfig = {
	toolbarOrder: [
		"results",
		"pagination",
		"horizontal-alignment",
		"vertical-alignment",
	],
	containerClass: "",
	pageSize: 10,
	// multiTextPerRow: 3,
	verticalAlignment: "top",
	horizontalAlignment: "left",
	useComboBox: true,
	typeIcons: true,
	typeIconLeft: true,
	dateLinkDaily: true,
	formatDates: false,
	currentPage: 0,
	showToolbar: true,
	frontmatterLinks: "",
	defaultFolder: "",
	defaultTemplate: "",
	// cards
	cardsView: false,
	cardsWrap: false,
	cardsWidth: "fit-content",
	cardsMinWidth: "unset",
	cardsMaxWidth: "unset",
};

export class CodeBlockConfigModal extends SaveModal {
	private form: CodeBlockConfig;
	// private setBlockConfigProps: Omit<SetBlockConfigProps, "newConfig">;
	private save: (form: CodeBlockConfig) => unknown;
	constructor(
		app: App,
		form: CodeBlockConfig,
		// setBlockConfigProps: Omit<SetBlockConfigProps, "newConfig">,
		save: (form: CodeBlockConfig) => unknown
	) {
		super(app);
		this.form = { ...form };
		// this.setBlockConfigProps = setBlockConfigProps;
		this.save = save;
	}

	onOpen(): void {
		this.setTitle("Configure block");
		const { contentEl } = this;
		contentEl
			.createEl("p")
			.setText("Modify the configuration options for this block.");

		this.createGeneral();
		this.createCards();
		this.createFooter();
	}

	onSave(): void {
		this.save(this.form);
	}

	updateConfig(): void {
		this.save(this.form);
		// so confirmation isn't triggered
		this.isChanged = false;
		this.close();
	}

	createSection(
		name: string,
		callback: (contentEl: HTMLElement) => void
	): void {
		const sectionSetting = new Setting(this.contentEl)
			.setHeading()
			.setName(name)
			.setClass("dataedit-setting-heading-collapsible");
		const sectionEl = this.contentEl.createDiv({
			attr: { style: "display: none;" },
		});
		const collapseIcon = createDiv();
		setIcon(collapseIcon, "chevron-right");
		sectionSetting.infoEl.insertAdjacentElement("afterbegin", collapseIcon);

		sectionSetting.settingEl.addEventListener("click", () => {
			const isHidden = sectionEl.style.display === "none";
			if (isHidden) {
				setIcon(collapseIcon, "chevron-down");
				return (sectionEl.style.display = "block");
			}
			setIcon(collapseIcon, "chevron-right");
			sectionEl.style.display = "none";
		});

		callback(sectionEl);
	}

	createGeneral(): void {
		const { form } = this;
		this.createSection("General", (contentEl) => {
			/* search */

			new Setting(contentEl)
				.setName("Default folder")
				.setDesc(
					"The full path to the default folder to use when creating new notes from the block."
				)
				.addSearch((cmp) => {
					cmp
						.setValue(form.defaultFolder)
						.setPlaceholder("path/to/folder")
						.onChange((v) => {
							form.defaultFolder = v;
							this.isChanged = true;
						});

					new FileFolderSuggest(this.app, cmp, "folders");
				});

			new Setting(contentEl)
				.setName("Default template")
				.setDesc(
					"The full path to the default template to use when creating new notes from the block."
				)
				.addSearch((cmp) => {
					cmp
						.setValue(form.defaultTemplate)
						.setPlaceholder("path/to/template.md")
						.onChange((v) => {
							form.defaultTemplate = v;
							this.isChanged = true;
						});

					new FileFolderSuggest(this.app, cmp, "files");
				});

			/* text */
			new Setting(contentEl)
				.setName("Container CSS class")
				.setDesc(
					"Append the code block container (div.block-language-dataedit) with additional CSS classes. To add multiple classes, just separate each name with a space."
				)
				.addText((cmp) =>
					cmp
						.setValue(form.containerClass)
						.setPlaceholder("cls-one clsTwo")
						.onChange((v) => {
							form.containerClass = v;
							this.isChanged = true;
						})
				);

			new Setting(contentEl)
				.setName("Frontmatter links property name")
				.setDesc(
					"If not blank, the block will update this note's frontmatter with links to all files returned in the query. The property it update's will be what you set here."
				)
				.addSearch((cmp) => {
					cmp.setValue(form.frontmatterLinks).onChange((v) => {
						form.frontmatterLinks = v;
						this.isChanged = true;
					});

					new PropertySuggest(this.app, cmp);
				})
				.then((s) => {
					s.descEl.createEl("br");
					s.descEl.createEl("br");
					s.descEl.createDiv({
						attr: { style: "color: var(--text-error)" },
						text: "Warning: If you have two blocks in the same note with the same property name for this setting, it will cause an inifinite loop and crash Obsidian!",
					});
				});
			const pageSizeParser = (v: unknown) => {
				const possibleNaN = Number(v);
				const possibleFloat = Number.isNaN(possibleNaN) ? 0 : possibleNaN;
				const integer = Math.floor(possibleFloat);
				if (integer < 0) return 0;
				return integer;
			};

			new Setting(contentEl)
				.setName("Page size")
				.setDesc(
					"Set the number of results that will display per page. Set to zero to have no limit and to hide pagination controls."
				)
				.addText((cmp) => {
					cmp
						.setValue(pageSizeParser(form.pageSize).toString())
						.onChange((v) => {
							form.pageSize = pageSizeParser(v);
							this.isChanged = true;
						})
						.setPlaceholder("unlimited");

					cmp.inputEl.setAttribute("type", "number");
					cmp.inputEl.setAttribute("min", "0");
					// for styling purposes
					cmp.inputEl.setAttribute("max", "100");
				});

			/* dropdowns */
			// form.verticalAlignment
			new Setting(contentEl)
				.setName("Vertical alignment")
				.setDesc("Set the vertical alignment of text")
				.addDropdown((cmp) =>
					cmp
						.addOptions({
							// value: label
							top: "top",
							middle: "middle",
							bottom: "bottom",
						} as Record<CodeBlockConfig["verticalAlignment"], string>)
						.setValue(this.form.verticalAlignment)
						.onChange((v) => {
							this.form.verticalAlignment =
								v as CodeBlockConfig["verticalAlignment"];
							this.isChanged = true;
						})
				);
			// form.horizontalAlignment
			new Setting(contentEl)
				.setName("Horizontal alignment")
				.setDesc("Set the horizontal alignment of text.")
				.addDropdown((cmp) =>
					cmp
						.addOptions({
							// value: label
							left: "left",
							center: "center",
							right: "right",
						} as Record<CodeBlockConfig["horizontalAlignment"], string>)
						.setValue(this.form.horizontalAlignment)
						.onChange((v) => {
							this.form.horizontalAlignment =
								v as CodeBlockConfig["horizontalAlignment"];
							this.isChanged = true;
						})
				);

			/* toggles */

			// form.useComboBox
			new Setting(contentEl)
				.setName("Use multi-select for lists")
				.setDesc(
					"Turn on to use a multi-select (really it's a combobox) for list property types. Otherwise, a standard vertical list editor will render."
				)
				.addToggle((cmp) => {
					cmp.setValue(form.useComboBox).onChange((b) => {
						this.form.useComboBox = b;
						this.isChanged = true;
					});
				});

			// form.typeIcons
			new Setting(contentEl)
				.setName("Show property type icons")
				.setDesc(
					"Turn on to display an icon corresponding with the property's type."
				)
				.addToggle((cmp) =>
					cmp.setValue(form.typeIcons).onChange((b) => {
						form.typeIcons = b;
						this.isChanged = true;
					})
				);

			// form.showToolbar
			new Setting(contentEl)
				.setName("Show toolbar")
				.setDesc(
					"You can also toggle visibility from the block config popup menu"
				)
				.addToggle((cmp) =>
					cmp.setValue(form.showToolbar).onChange((b) => {
						form.showToolbar = b;
						this.isChanged = true;
					})
				);

			// form.typeIconLeft
			new Setting(contentEl)
				.setName("Property type icon on left")
				.setDesc(
					"Turn on to display type icons to the left of the header text. Turn off to display on the right."
				)
				.addToggle((cmp) =>
					cmp.setValue(form.typeIconLeft).onChange((b) => {
						form.typeIconLeft = b;
						this.isChanged = true;
					})
				);

			// form.dateLinkDaily
			new Setting(contentEl)
				.setName("Link to daily note for dates")
				.setDesc(
					"Turn on to show an icon with a link to the dialy note for date properties."
				)
				.addToggle((cmp) =>
					cmp.setValue(form.dateLinkDaily).onChange((b) => {
						form.dateLinkDaily = b;
						this.isChanged = true;
					})
				);

			// form.formatDates
			new Setting(contentEl)
				.setName("Format dates from Dataview")
				.setDesc(
					"Turn on to format date and datetime properties according to your settings in the Dataview plugin when not actively editing the property."
				)
				.addToggle((cmp) =>
					cmp.setValue(form.formatDates).onChange((b) => {
						form.formatDates = b;
						this.isChanged = true;
					})
				);
		});
	}

	createCards(): void {
		const { form } = this;
		this.createSection("Cards", (contentEl) => {
			new Setting(contentEl)
				.setName("Cards view")
				.setDesc("Turn on to display cards rather than the default table view.")
				.addToggle((cmp) =>
					cmp.setValue(form.cardsView).onChange((b) => {
						form.cardsView = b;
						this.isChanged = true;
					})
				);

			new Setting(contentEl)
				.setName("Wrap lines")
				.setDesc(
					"Turn on to to allow the row of cards to wrap to new lines if needed. Otherwise it will always be on one line with a scrollbar if needed."
				)
				.addToggle((cmp) =>
					cmp.setValue(form.cardsWrap).onChange((b) => {
						form.cardsWrap = b;
						this.isChanged = true;
					})
				);

			new Setting(contentEl)
				.setName("Card width")
				.setDesc(
					"Set any valid CSS value for width to be set in the style attribute of every card. Leave blank to not set width in the style attribute at all."
				)
				.addText((cmp) =>
					cmp.setValue(form.cardsWidth).onChange((v) => {
						form.cardsWidth = v;
						this.isChanged = true;
					})
				);

			new Setting(contentEl)
				.setName("Card min width")
				.setDesc(
					"Set any valid CSS value for min-width to be set in the style attribute of every card. Leave blank to not set min-width in the style attribute at all."
				)
				.addText((cmp) =>
					cmp.setValue(form.cardsMinWidth).onChange((v) => {
						form.cardsMinWidth = v;
						this.isChanged = true;
					})
				);
			new Setting(contentEl)
				.setName("Card max width")
				.setDesc(
					"Set any valid CSS value for max-width to be set in the style attribute of every card. Leave blank to not set max-width in the style attribute at all."
				)
				.addText((cmp) =>
					cmp.setValue(form.cardsMaxWidth).onChange((v) => {
						form.cardsMaxWidth = v;
						this.isChanged = true;
					})
				);
		});
	}

	createFooter(): void {
		const { contentEl } = this;

		/* footer buttons */
		new Setting(contentEl)
			.addButton((cmp) =>
				cmp
					.setButtonText("reset")
					.setWarning()
					.onClick(() => {
						const onConfirm = () => {
							this.form = null as unknown as CodeBlockConfig;
							this.updateConfig();
						};
						new ConfirmationModal(
							this.app,
							"Are you absolutely sure?",
							"this will completely remove the configuration set for this block.",
							onConfirm
						).open();
					})
			)
			.addButton((cmp) =>
				cmp
					.setButtonText("save")
					.setCta()
					.onClick(() => this.updateConfig())
			);
	}
}

class ConfirmationModal extends Modal {
	private title: string;
	private description: string;
	private onConfirm: () => void;
	constructor(
		app: App,
		title: string,
		description: string,
		onConfirm: () => void
	) {
		super(app);
		this.title = title;
		this.description = description;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { title, description, onConfirm, contentEl } = this;
		this.setTitle(title);
		contentEl.createEl("p").setText(description);
		new Setting(contentEl)
			.addButton((cmp) =>
				cmp.setButtonText("cancel").onClick(() => this.close())
			)
			.addButton((cmp) =>
				cmp
					.setButtonText("confirm")
					.setWarning()
					.onClick(() => {
						onConfirm();
						this.close();
					})
			);
	}
}
