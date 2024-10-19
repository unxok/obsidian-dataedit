// @refresh reload

import { render } from "solid-js/web";
import "./index.css";
import {
	Notice,
	Plugin,
	MarkdownRenderChild,
	parseYaml,
	setIcon,
	DropdownComponent,
	SliderComponent,
	ColorComponent,
	ToggleComponent,
	View,
	ItemView,
	WorkspaceLeaf,
	ViewStateResult,
} from "obsidian";
import { CodeBlock } from "./components/CodeBlock";
import {
	CodeBlockConfig,
	defaultCodeBlockConfig,
} from "./components/CodeBlock/Config";
import {
	dataeditDropdownTypePrefix,
	dataeditTypeKeyPrefix,
} from "./lib/constants.ts";
import { PropertyEntryData, PropertyRenderContext } from "obsidian-typings";
import {
	EmbeddableMarkdownEditor,
	DropdownWidgetManager,
	DropdownRecord,
	DropdownRecordKey,
	DataeditSettingTab,
} from "@/classes";
import {
	clampNumber,
	getColumnPropertyNames,
	getDataviewAPI,
	getTableLine,
	splitBlock,
	splitTableKeyword,
	toNumber,
} from "./util/pure/index.ts";
import { updateMetadataProperty } from "./lib/util.ts";
import {
	DataEditSettings,
	defaultDataEditSettings,
	setSettingsSignal,
	settingsSignal,
} from "./classes/DataeditSettingTab/index.ts";
import { REGEX_COMMA_NOT_IN_DOUBLE_QUOTES } from "./util/regex/index.ts";

type PropertyUpdateRecord = {
	property: string;
	filePath: string;
	oldValue: unknown;
	newValue: unknown;
	itemIndex?: number;
};

export default class DataEdit extends Plugin {
	settings: DataEditSettings = { ...defaultDataEditSettings };
	propertyUpdates: PropertyUpdateRecord[] = [];
	// used to track the current position in undo/redo history
	propertyUpdatesIndex: number = 0;
	async onload(): Promise<void> {
		// this.registerCodeBlockTester();
		// this.registerTestView();
		this.registerCommands();

		await this.loadSettings();
		this.addSettingTab(new DataeditSettingTab(this.app, this));
		this.registerMdCBP();
		this.devReload(); // TODO comment out when releasing
	}

	async updateSettings(
		cb: (prev: DataEditSettings) => Promise<DataEditSettings>
	): Promise<void> {
		const s = await cb(this.settings);
		await this.saveSettings(s);
	}

	registerCodeBlockTester(): void {
		this.registerMarkdownCodeBlockProcessor(
			"line-number",
			(source, el, ctx) => {
				// console.log("register called");
				const initial = ctx.getSectionInfo(el);
				const str =
					"initial lines: " + initial?.lineStart + ", " + initial?.lineEnd;
				el.setAttribute(
					"style",
					"display: flex; flex-direction: column; align-items: start; justify-content: start; border: 1px solid var(--interactive-accent); border-radius: var(--radius-m); padding: 5px;"
				);
				el.createEl("h5", { text: "Line number codeblock" });
				el.createDiv({ text: source + str, cls: "clickable-icon" });
				el.createEl("br");
				el.createEl("button", { text: "get line numbers" }).addEventListener(
					"click",
					() => {
						const info = ctx.getSectionInfo(el);
						new Notice("start: " + info?.lineStart + ", end: " + info?.lineEnd);
					}
				);
			}
		);
	}

	// registerSettingTab(): void {}

	registerCommands(): void {
		this.addCommand({
			id: "manage-dropdowns",
			name: "Manage dropdowns",
			callback: () => new DropdownWidgetManager(this).open(),
		});
		this.addCommand({
			id: "undo-update",
			name: "Undo update",
			callback: async () => await this.undoUpdate(),
		});
		this.addCommand({
			id: "redo-update",
			name: "Redo update",
			callback: async () => await this.redoUpdate(),
		});
	}

	async loadSettings(): Promise<DataEditSettings> {
		const s = (await this.loadData()) as Record<string, unknown>;
		s.defaultConfig =
			s.defaultConfig && typeof s.defaultConfig === "object"
				? { ...defaultCodeBlockConfig, ...s.defaultConfig }
				: { ...defaultCodeBlockConfig };
		const settings = { ...defaultDataEditSettings, ...s };
		this.settings = settings;
		setSettingsSignal(() => settings);
		return settings;
	}

	async saveSettings(settings: DataEditSettings): Promise<void> {
		this.settings = settings;
		setSettingsSignal(() => settings);
		await this.saveData(settings);
	}

	recordUpdate(update: PropertyUpdateRecord): void {
		const limit = this.settings.updatesLimit;
		const arr = [...this.propertyUpdates].slice(this.propertyUpdatesIndex);
		this.propertyUpdatesIndex = 0;
		if (arr.length === limit) {
			arr.pop();
		}
		if (arr.length > limit) {
			arr.slice(0, limit - arr.length);
		}
		arr.unshift(update);
		this.propertyUpdates = arr;
		// console.log(arr);
	}

	async getUpdate(): Promise<
		[index: number, limit: number, update?: PropertyUpdateRecord]
	> {
		const {
			settings: { updatesLimit: limit },
			propertyUpdatesIndex: preIndex,
			propertyUpdates,
		} = this;
		const index = clampNumber(preIndex, 0, limit, true);
		const update = propertyUpdates[index];
		if (!update) return [index, limit];
		return [index, limit, update];
	}

	async undoUpdate(): Promise<void> {
		const [index, limit, update] = await this.getUpdate();
		if (update) {
			const { property, filePath, oldValue, newValue, itemIndex } = update;
			await this.updateProperty(
				property,
				oldValue, // swapped with newValue since undoing
				filePath,
				newValue,
				itemIndex,
				true
			);
		}

		if (index < limit) {
			this.propertyUpdatesIndex = index + 1;
		}
	}

	async redoUpdate(): Promise<void> {
		const preIndex = this.propertyUpdatesIndex;
		if (preIndex > 0) {
			this.propertyUpdatesIndex = preIndex - 1;
		}

		const [_, __, update] = await this.getUpdate();
		if (update) {
			const { property, filePath, oldValue, newValue, itemIndex } = update;
			await this.updateProperty(
				property,
				newValue,
				filePath,
				oldValue,
				itemIndex,
				true
			);
		}
	}

	devReload(): void {
		this.app.workspace.iterateAllLeaves((leaf) => {
			// @ts-expect-error Private API not documented in obsidian-typings
			leaf.rebuildView && leaf.rebuildView();
		});
	}

	async updateProperty(
		property: string,
		newValue: unknown,
		filePath: string,
		oldValue: unknown,
		itemIndex?: number,
		skipRecord?: boolean
	): Promise<void> {
		if (!skipRecord) {
			this.recordUpdate({ property, filePath, newValue, oldValue, itemIndex });
		}
		await updateMetadataProperty(
			property,
			newValue,
			filePath,
			this,
			null,
			oldValue,
			itemIndex
		);
	}

	registerMdCBP(): void {
		this.registerMarkdownCodeBlockProcessor("dataedit", (source, el, ctx) => {
			// const isReading = el.closest("");

			const [query, configStr] = splitBlock(source);

			const propertyNames = getColumnPropertyNames(source);

			const preConfig = parseYaml(configStr) ?? {};
			// preConfig is not actually type safe... might use zod later
			const config = {
				...this.settings.defaultConfig,
				...preConfig,
			} as CodeBlockConfig;

			const dataviewAPI = getDataviewAPI(this.app);
			if (!dataviewAPI) {
				const msg =
					"Dataedit: Failed to get Dataview API. Is Dataview installed & enabled?";
				new Notice(msg, 5000);
				return;
			}

			el.className += " dataedit " + config.containerClass;
			// best practice by Obsidian, but solid may do this anyway
			el.empty();
			// since mouse will often be inside table, the box shadow is annoying to me
			// I guess I should make this a confi option eventually?
			el.parentElement!.style.boxShadow = "none";

			// entrypoint for Solid
			const dispose = render(
				() => (
					<CodeBlock
						plugin={this}
						source={source}
						el={el}
						ctx={ctx}
						query={query}
						config={config}
						dataviewAPI={dataviewAPI}
						propertyNames={propertyNames}
					/>
				),
				el
			);

			// ensures solid disposes of itself properly when element is unloaded
			const mdr = new MarkdownRenderChild(el);
			mdr.register(dispose);
			ctx.addChild(mdr);
		});
	}
}

type EnsureFileCol = (query: string) => { query: string; shouldHide: boolean };
export const ensureFileCol: EnsureFileCol = (query) => {
	const { tableLine, rest } = getTableLine(query);
	// if not "TABLE WITHOUT ID" then file col is included automatically
	if (!tableLine.toLowerCase().includes("without id"))
		return { query, shouldHide: false };
	const { keyword, rest: restTableLine } = splitTableKeyword(tableLine);
	const colsText = restTableLine
		.split(REGEX_COMMA_NOT_IN_DOUBLE_QUOTES)
		.map((s) => s.trim());

	const cols = colsText.map((s) => s.split(/\sAS\s/i));
	// query does have file col specified
	if (cols.some(([prop]) => prop === "file.link"))
		return { query, shouldHide: false };

	colsText.push("file.link");
	const newRestTableLine = colsText.join(", ");
	const newTableLine = keyword + newRestTableLine;
	const newQuery = newTableLine + rest;
	return { query: newQuery, shouldHide: true };
};
