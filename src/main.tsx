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
	splitBlock,
	toNumber,
} from "./util/pure/index.ts";
import { updateMetadataProperty } from "./lib/util.ts";
import {
	DataEditSettings,
	defaultDataEditSettings,
	setSettingsSignal,
	settingsSignal,
} from "./classes/DataeditSettingTab/index.ts";

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
		// this.registerDropdowns();
		// this.registerMd();
		// this.registerSlider();
		// this.registerStars();
		// this.registerColor();
		// this.registerToggle();
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

	registerTestView(): void {
		this.registerView(TEST_VIEW, (leaf) => new TestView(leaf));

		this.addRibbonIcon("star", "uwu test view", () => this.activateTestView());
	}

	async activateTestView(): Promise<void> {
		const {
			app: { workspace },
		} = this;
		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(TEST_VIEW);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
		}
		await leaf?.setViewState({
			type: TEST_VIEW,
			active: true,
			state: { fizz: "buzz" },
		});

		await leaf?.view.setState({ foo: "bar" }, { history: true });
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

	registerDropdowns(
		dropdownsObject?: Record<DropdownRecordKey, DropdownRecord>
	): void {
		const {
			app: { metadataTypeManager },
			settings,
		} = this;
		let dropdowns = { ...dropdownsObject };
		if (!dropdownsObject) {
			// const settings = await this.loadSettings();
			if (!settings.hasOwnProperty("dropdowns")) return;
			dropdowns = settings.dropdowns;
		}
		const prefix = dataeditDropdownTypePrefix;
		const keys = Object.keys(dropdowns);
		const shouldDelete = Object.keys(metadataTypeManager.registeredTypeWidgets)
			// find types that belong to dataedit but are not in our present keys to register
			.filter((k, i) => k.startsWith(prefix) && !k.endsWith(keys[i]));
		shouldDelete.forEach(
			(k) => delete metadataTypeManager.registeredTypeWidgets[k]
		);
		const register = (k: string) => {
			const { defaultValue, description, label, options } = dropdowns[k];
			const typeKey = prefix + k;
			const optionsObj = options.reduce(
				(acc, curr) => {
					// this shouldn't every happen but still
					if (!curr.value) return acc;
					const label = curr.label ? curr.label : curr.value;
					acc[curr.value] = label;
					return acc;
				},
				{} as Record<string, string>
			);
			const validateFn = (v: string) =>
				options.some(({ value }) => v === value);
			const renderFn = (
				el: HTMLElement,
				data: PropertyEntryData<unknown>,
				ctx: PropertyRenderContext
			) => {
				const cmp = new DropdownComponent(el)
					.addOptions(optionsObj)
					.onChange(async (v) => {
						await this.updateProperty(
							data.key,
							v,
							ctx.sourcePath,
							data.value,
							undefined,
							true
						);
					});
				// incase it's invalid on render
				// const value = validateFn(data.value?.toString() ?? "")
				//   ? (data.value as string)
				//   : options[0].value;

				// Have to wait for the dropdown to finish rendering
				setTimeout(() => {
					cmp.setValue(data.value?.toString() ?? "");
					cmp.selectEl.classList.add("dataedit");
					cmp.selectEl.setAttribute("data-dataedit-dropdown-type", k);
					cmp.selectEl.setAttribute("aria-label", description);
				}, 0);
			};
			metadataTypeManager.registeredTypeWidgets[typeKey] = {
				default: () => defaultValue,
				icon: "chevron-down-circle",
				name: () => label,
				type: typeKey,
				validate: validateFn,
				render: renderFn,
			};

			this.app.workspace.iterateAllLeaves((leaf) => {
				if (!leaf.view.hasOwnProperty("metadataEditor")) return;
				const view = leaf.view as View & {
					metadataEditor: {
						onMetadataTypeChange: (property: string) => void;
					};
				};
				const propNames = Object.entries(
					this.app.metadataTypeManager.properties
				)
					.filter(([_, { type: t }]) => t === typeKey)
					.map(([_, { name }]) => name);
				propNames.forEach((p) => {
					// This is to force dropdowns to re-render with updated options
					// the easiest way I found was to emulate a type change
					view.metadataEditor.onMetadataTypeChange(p);
				});
			});
		};
		keys.forEach((k) => {
			register(k);
		});
	}

	registerSlider(): void {
		const typeKey = dataeditTypeKeyPrefix + "slider";
		const validateFn = (v: unknown) => !Number.isNaN(Number(v));
		this.app.metadataTypeManager.registeredTypeWidgets[typeKey] = {
			default: () => 0,
			validate: validateFn,
			icon: "git-commit-horizontal",
			name: () => "Slider",
			render: (el, data, ctx) => {
				new SliderComponent(el)
					.setLimits(0, 100, 1)
					.setDynamicTooltip()
					.setInstant(false)
					.onChange(async (v) => {
						await this.updateProperty(
							data.key,
							v,
							ctx.sourcePath,
							data.value,
							undefined,
							true
						);
					})
					.setValue(validateFn(data.value) ? (data.value as number) : 0);
			},
			type: typeKey,
		};
	}

	registerToggle(): void {
		const typeKey = dataeditTypeKeyPrefix + "toggle";
		const validateFn = (v: unknown) =>
			v === "true" || v === "false" || v === true || v === false;
		this.app.metadataTypeManager.registeredTypeWidgets[typeKey] = {
			default: () => 0,
			validate: validateFn,
			icon: "toggle-left",
			name: () => "Toggle",
			render: (el, data, ctx) => {
				new ToggleComponent(el)
					.onChange(async (v) => {
						await this.updateProperty(
							data.key,
							v,
							ctx.sourcePath,
							data.value,
							undefined,
							true
						);
					})
					.setValue(
						data.value === "false" || data.value === false ? false : true
					);
			},
			type: typeKey,
		};
	}

	registerColor(): void {
		const typeKey = dataeditTypeKeyPrefix + "color";
		const validateFn = () => true;
		this.app.metadataTypeManager.registeredTypeWidgets[typeKey] = {
			default: () => 0,
			validate: validateFn,
			icon: "palette",
			name: () => "Color",
			render: (el, data, ctx) => {
				const cmp = new ColorComponent(el).onChange(async (v) => {
					await this.updateProperty(
						data.key,
						v,
						ctx.sourcePath,
						data.value,
						undefined,
						true
					);
				});

				// Have to wait for the component to finish rendering
				setTimeout(() => {
					cmp.setValue(data.value as string);
				}, 0);
			},
			type: typeKey,
		};
	}

	registerStars(): void {
		const factory = (typeSuffix: string, typeName: string, max: number) => {
			const typeKey = dataeditTypeKeyPrefix + typeSuffix;
			const validateFn = (v: unknown) => !Number.isNaN(Number(v));
			this.app.metadataTypeManager.registeredTypeWidgets[typeKey] = {
				default: () => 0,
				type: typeKey,
				validate: validateFn,
				icon: "star",
				name: () => typeName,
				render: (el, data, ctx) => {
					const starCount = toNumber(data.value, 0, 0, max);

					const container = el.createDiv({
						cls: "dataedit-star-container",
						attr: { "data-stars": starCount },
					});

					for (let n = 1; n <= max; n++) {
						const starEl = container.createDiv({
							cls: "clickable-icon",
							attr: { "aria-label": n.toString() },
						});
						setIcon(starEl, "star");

						starEl.addEventListener("click", async () => {
							const count = toNumber(
								container.getAttribute("data-stars"),
								0,
								0,
								max
							);
							// "unclick" star
							if (count === n) {
								await this.updateProperty(
									data.key,
									n - 1,
									ctx.sourcePath,
									data.value,
									undefined,
									true
								);
								return;
							}

							await this.updateProperty(
								data.key,
								n,
								ctx.sourcePath,
								data.value,
								undefined,
								true
							);
						});

						if (n > starCount) continue;
						const svg = starEl.firstElementChild;
						if (!svg) continue;
						svg.setAttribute("fill", "currentColor");
					}

					// [1, 2, 3, 4, 5].forEach((n) => {

					// });

					// Have to wait for the component to finish rendering
					// setTimeout(() => {
					//   cmp.setValue(data.value as string);
					// }, 0);
				},
			};
		};

		factory("stars-x5", "Stars x5", 5);
		factory("stars-x10", "Stars x10", 10);
	}

	registerMd(): void {
		const typeKey = dataeditTypeKeyPrefix + "markdown";
		const validateFn = () => true;
		this.app.metadataTypeManager.registeredTypeWidgets[typeKey] = {
			default: () => "",
			validate: validateFn,
			icon: "m-square",
			name: () => "Markdown",
			render: (el, data, ctx) => {
				const container = el.createDiv({
					cls: "dataedit-property-markdown-div",
				});

				const emde = new EmbeddableMarkdownEditor(
					this.app,
					container,
					{
						value: data.value?.toString() ?? "",
						onBlur: async (editor) => {
							const value = editor.editor?.getValue();
							await this.updateProperty(
								data.key,
								value ?? "",
								ctx.sourcePath,
								data.value,
								undefined,
								true
							);
						},
					},
					ctx.sourcePath
				);

				ctx.metadataEditor.register(() => {
					emde.destroy();
				});

				ctx.metadataEditor.register(() => {
					container.remove();
				});

				// Have to wait for the component to finish rendering
				// setTimeout(() => {
				//   cmp.setValue(data.value as string);
				// }, 0);
			},
			type: typeKey,
		};
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

const TEST_VIEW = "test-view";
class TestView extends ItemView {
	state: Record<string, unknown> = { hello: "world" };
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return TEST_VIEW;
	}

	getDisplayText(): string {
		return "uwu";
	}

	async setState(state: unknown, result: unknown): Promise<void> {
		console.log("set state called: ", state);
		// console.trace();
		this.state = state as Record<string, unknown>;
	}

	getState(): typeof this.state {
		return { ...this.state };
	}

	protected async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: "uwu?" });
		contentEl
			.createEl("button", { text: "get state" })
			.addEventListener("click", () => {
				console.log(this.getState());
			});

		console.log(this.getState());
		console.log(this);
	}
}
