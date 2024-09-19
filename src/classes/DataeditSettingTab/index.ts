import DataEdit from "@/main";
import { PluginSettingTab, App, Setting, debounce } from "obsidian";
import { DropdownRecord, DropdownWidgetManager } from "@/classes";
import { createSignal } from "solid-js";
import { toNumber } from "@/util/pure";
import {
	CodeBlockConfig,
	CodeBlockConfigModal,
	defaultCodeBlockConfig,
} from "@/components/CodeBlock/Config";

export type DataEditSettings = {
	dropdowns: Record<string, DropdownRecord>;
	defaultConfig: CodeBlockConfig;
	refreshInterval: number;
	updatesLimit: number;
};

export const defaultDataEditSettings: DataEditSettings = {
	dropdowns: {},
	defaultConfig: { ...defaultCodeBlockConfig },
	refreshInterval: 250,
	updatesLimit: 20,
};

export const [settingsSignal, setSettingsSignal] =
	createSignal<DataEditSettings>({ ...defaultDataEditSettings });

export class DataeditSettingTab extends PluginSettingTab {
	plugin: DataEdit;

	async updateSettings<T extends keyof DataEditSettings>(
		key: T,
		value: DataEditSettings[T]
	): Promise<void> {
		const { plugin } = this;
		const newSettings = { ...plugin.settings, [key]: value };
		await plugin.saveSettings(newSettings);
	}

	debouncedUpdateSettings = debounce(
		(...params: Parameters<typeof this.updateSettings>) =>
			this.updateSettings(...params),
		250,
		true
	);

	constructor(app: App, plugin: DataEdit) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Dropdowns")
			.setDesc(
				"Click the button to open the Dropdown Manager where you can add, edit, and delete custom dropdown configurations for use in frontmatter properties and Dataedit blocks."
			)
			.addButton((cmp) =>
				cmp.setButtonText("manage").onClick(() => {
					new DropdownWidgetManager(this.plugin).open();
				})
			);

		new Setting(containerEl)
			.setName("Default block config")
			.setDesc(
				"Click the button to configure the default options for Dataedit blocks. These defaults will only apply when no configs are set specifically for a given block."
			)
			.addButton((cmp) =>
				cmp.setButtonText("configure").onClick(() => {
					new CodeBlockConfigModal(
						this.app,
						settingsSignal().defaultConfig,
						async (form) => {
							await this.updateSettings("defaultConfig", form);
							// so codeblocks get re-rendered with updated settings
							this.plugin.devReload();
						}
					).open();
				})
			);

		new Setting(containerEl)
			.setName("Refresh interval")
			.setDesc(
				"In milliseconds, how long to wait after metadata changes before updating the rendered view."
			)
			.addText((cmp) => {
				cmp
					.setValue(settingsSignal().refreshInterval.toString())
					.onChange((v) =>
						this.debouncedUpdateSettings("refreshInterval", toNumber(v, 0, 0))
					);
			})
			.then((setting) => {
				setting.descEl.createEl("br");
				setting.descEl.createEl("br");
				setting.descEl.createDiv({
					text: "Setting to zero may cause noticeable lag on opening notes which contain blocks that query lots of data.",
				});
			});

		new Setting(containerEl)
			.setName("Update history limit")
			.setDesc(
				"How many updates to remember for being able to undo and redo. There is a single history shared between all dataedit blocks."
			)
			.addText((cmp) => {
				cmp
					.setValue(settingsSignal().updatesLimit.toString())
					.onChange((v) =>
						this.debouncedUpdateSettings("updatesLimit", toNumber(v, 20, 0))
					);
			})
			.then((setting) => {
				setting.descEl.createEl("br");
				setting.descEl.createEl("br");
				setting.descEl.createDiv({
					text: "While the default is 20, I'm guessing you can have a pretty high limit without noticing any performance issues (I haven't tested it yet).",
				});
			});

		new Setting(containerEl).setHeading().setName("Resources");

		new Setting(containerEl)
			.setName("Dataview docs")
			.setDesc("The offical documentation for the Dataview plugin.")
			.addButton((cmp) => {
				cmp.setButtonText("open").setCta();
				const link = cmp.buttonEl.createEl("a", {
					attr: {
						style: "display: none;",
					},
					href: "https://blacksmithgu.github.io/obsidian-dataview/",
				});
				link.addEventListener("click", () => link.remove());

				cmp.onClick(() => {
					link.click();
				});
			});

		new Setting(containerEl)
			.setName("Dataedit docs")
			.setDesc(
				"Right now it's just the github repository, but actual docs may be coming soon!"
			)
			.addButton((cmp) => {
				cmp.setButtonText("open").setCta();
				const link = cmp.buttonEl.createEl("a", {
					attr: {
						style: "display: none;",
					},
					href: "https://github.com/unxok/obsidian-dataedit/",
				});
				link.addEventListener("click", () => link.remove());

				cmp.onClick(() => {
					link.click();
				});
			});

		new Setting(containerEl)
			.setName("Support me!")
			.setDesc(
				"Love this plugin? Well show some love to Dataview first. Then if you feel like buying me a coffee, I won't say no!"
			)
			.addButton((cmp) => {
				cmp
					.setButtonText("Buy me a coffee ☕")
					.setClass("dataedit-buy-me-coffee");
				const link = cmp.buttonEl.createEl("a", {
					attr: {
						style: "display: none;",
					},
					href: "https://buymeacoffee.com/unxok",
				});
				link.addEventListener("click", () => link.remove());

				cmp.onClick(() => {
					link.click();
				});
			});
	}
}
