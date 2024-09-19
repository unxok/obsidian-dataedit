import {
	DataviewAPI,
	DataviewLink,
	DataviewQueryResult,
	PropertyType,
} from "@/lib/types";
import { Table } from "@/components/Table";
import { debounce, MarkdownPostProcessorContext, Notice } from "obsidian";
import {
	onMount,
	Show,
	createSignal,
	createContext,
	useContext,
	onCleanup,
	createUniqueId,
} from "solid-js";
import {
	getIdColumnIndex,
	getPropertyTypes,
	registerDataviewEvents,
	tryDataviewLinkToMarkdown,
	unregisterDataviewEvents,
} from "@/lib/util";
import { CodeBlockConfig } from "./Config";
import DataEdit from "@/main";
import { overrideEditButton, setBlockConfig } from "@/util/mutation";
import { Pagination, Toolbar } from "../Toolbar";
import { Icon } from "../Icon";
import { settingsSignal } from "@/classes/DataeditSettingTab";
import { ComboBoxComponent } from "@/classes/ComboBoxComponent";

type CodeBlockProps = {
	plugin: DataEdit;
	source: string;
	el: HTMLElement;
	ctx: MarkdownPostProcessorContext;
	query: string;
	config: CodeBlockConfig;
	dataviewAPI: DataviewAPI;
	propertyNames: string[];
};

export type BlockContext = {
	plugin: DataEdit;
	el: HTMLElement;
	ctx: MarkdownPostProcessorContext;
	source: string;
	query: string;
	config: CodeBlockConfig;
	dataviewAPI: DataviewAPI;
	uid: string;
	hideLastId: boolean;
};
const defaultBlockContext: BlockContext = {
	plugin: {} as DataEdit,
	el: {} as HTMLElement,
	ctx: {} as MarkdownPostProcessorContext,
	source: "",
	query: "",
	config: {} as CodeBlockConfig,
	dataviewAPI: {} as DataviewAPI,
	uid: "",
	hideLastId: false,
};
const BlockContext = createContext<BlockContext>({ ...defaultBlockContext });

export const useBlock = () => useContext(BlockContext);

export const CodeBlock = (props: CodeBlockProps) => {
	const uid = createUniqueId();
	const [propertyTypes, setPropertyTypes] = createSignal<PropertyType[]>([]);
	// const [idColIndex, setIdColIndex] = createSignal(0);
	const [dataviewResult, setDataviewResult] = createSignal<DataviewQueryResult>(
		{
			successful: true,
			value: { headers: [], values: [], type: "table" },
		}
	);
	const [pagination, setPagination] = createSignal<Pagination>({
		shownStart: 0,
		shownEnd: 0,
		resultCount: 0,
		pageCount: 0,
	});

	const updatePropertyTypes = () => {
		// registerDropdownType();
		const arr = getPropertyTypes(
			props.propertyNames,
			props.plugin.app.metadataCache
		);
		setPropertyTypes(() => arr);
	};

	// TODO pretty sure this doesn't need to be a signal since if this ever changes, obsidian will have rerendered the block
	// const updateIdColIndex = (dataviewResult: DataviewQueryResult) => {
	// 	if (!dataviewResult.successful) return;
	// 	const id = getIdColumnIndex(
	// 		dataviewResult.value.headers,
	// 		props.dataviewAPI.settings.tableIdColumnName
	// 	);
	// 	setIdColIndex(id);
	// };

	const findIdColIndex = (dataviewResult: DataviewQueryResult) => {
		if (!dataviewResult.successful) return 0;
		const id = getIdColumnIndex(
			dataviewResult.value.headers,
			props.dataviewAPI.settings.tableIdColumnName
		);
		return id;
	};

	const updateResultLinks = (results: DataviewQueryResult) => {
		if (!results.successful) return;
		const idColIndex = findIdColIndex(results);
		const newResultLinks = results.value.values
			.map((arr) => (arr[idColIndex] as DataviewLink).markdown())
			.toSorted();

		const {
			ctx: { sourcePath },
			config: { frontmatterLinks },
			plugin: {
				app: { fileManager, vault, metadataCache, metadataTypeManager },
			},
		} = props;
		if (!frontmatterLinks) return;
		// Make sure property is an array type
		metadataTypeManager.setType(frontmatterLinks, "multitext");
		const file = vault.getFileByPath(sourcePath);
		if (!file) {
			const msg = "Could not find current file form source path";
			new Notice(msg);
			throw new Error(msg);
		}
		const preCurrentLinksArr =
			metadataCache.getCache(sourcePath)?.frontmatter?.[frontmatterLinks];
		const currentLinksArr = Array.isArray(preCurrentLinksArr)
			? preCurrentLinksArr
			: [];
		const currentLinks = currentLinksArr
			.map((v) => tryDataviewLinkToMarkdown(v))
			.toSorted();
		if (!currentLinks.length || currentLinks.length !== newResultLinks.length) {
			fileManager.processFrontMatter(
				file,
				(fm) => (fm[frontmatterLinks] = newResultLinks)
			);
		}
		// if they are the same length, check that each value is the same
		const isSame = currentLinksArr.every((v, i) => v === newResultLinks[i]);
		if (isSame) return;
		// They aren't the same, so overwrite it
		fileManager.processFrontMatter(
			file,
			(fm) => (fm[frontmatterLinks] = newResultLinks)
		);
	};

	// memoizing isn't playing nice with dataview event callbacks...?
	// for now it doesn't matter since these props should never actually change without obsidian causing a rerender automatically
	const updateResults = async () => {
		const { pageSize, currentPage: preCurrentPage } = props.config;
		const results = await props.dataviewAPI.query(
			props.query,
			props.ctx.sourcePath
		);

		console.log("results: ", results);

		updateResultLinks(results);

		const defaultEditButton = props.el.parentElement!.querySelector(
			"div.edit-block-button[data-dataedit-edit-button=false]"
		);
		const customEditButton = props.el.parentElement!.querySelector(
			'div.edit-block-button[data-dataedit-edit-button="true"]'
		);

		if (defaultEditButton && customEditButton) {
			if (results.successful) {
				defaultEditButton.setAttribute("style", "display: none;");
				customEditButton.setAttribute("style", "display: flex;");
			} else {
				defaultEditButton.setAttribute("style", "display: flex;");
				customEditButton.setAttribute("style", "display: none;");
			}
		}

		if (results.value?.values) {
			const resultCount = results.value.values.length;
			const pageCount = Math.ceil(resultCount / pageSize);
			const currentPage = preCurrentPage > pageCount ? 0 : preCurrentPage;
			const start = pageSize * currentPage;
			const preEnd = pageSize * (currentPage + 1);
			const end = preEnd > resultCount ? resultCount : preEnd;

			setPagination(() => ({
				shownStart: start,
				shownEnd: end,
				resultCount: resultCount,
				pageCount: pageCount,
			}));

			if (pageSize > 0) {
				const paginated = results.value?.values.filter(
					(_, i) => i >= start && i < end
				);
				results.value.values = paginated;
			}
		}
		setDataviewResult(results);
		// updateIdColIndex(results);
		updatePropertyTypes();
	};

	const debounceUpdateResults = debounce(
		() => updateResults(),
		settingsSignal().refreshInterval,
		true
	);

	onMount(() => {
		overrideEditButton({
			config: props.config,
			ctx: props.ctx,
			el: props.el,
			plugin: props.plugin,
			source: props.source,
		});
		debounceUpdateResults();
		registerDataviewEvents(props.plugin, debounceUpdateResults);
		props.plugin.app.metadataTypeManager.on(
			"changed",
			updatePropertyTypes,
			props.ctx
		);
	});

	onCleanup(() => {
		unregisterDataviewEvents(props.plugin, debounceUpdateResults);
		props.plugin.app.metadataTypeManager.off("changed", updatePropertyTypes);
	});

	return (
		<Show
			when={
				dataviewResult().successful && dataviewResult().value!.headers.length
			}
			fallback={<ErrorBlock results={dataviewResult()} />}
		>
			{/* <ComboBox /> */}
			<BlockContext.Provider
				value={{
					plugin: props.plugin,
					// plugin: pluginSignal(),
					el: props.el,
					ctx: props.ctx,
					source: props.source,
					query: props.query,
					config: props.config,
					dataviewAPI: props.dataviewAPI,
					uid: uid,
					hideLastId: false,
				}}
			>
				<div style={{ "overflow-x": "auto", "height": "fit-content" }}>
					<Table
						properties={props.propertyNames}
						headers={dataviewResult().value!.headers}
						values={dataviewResult().value!.values}
						propertyTypes={propertyTypes()}
						// idColIndex={idColIndex()}
						idColIndex={findIdColIndex(dataviewResult())}
					/>
					<Show when={props.config.showToolbar}>
						<Toolbar
							{...pagination()}
							app={props.plugin.app}
							config={props.config}
							updateBlockConfig={(
								cb: (config: CodeBlockConfig) => CodeBlockConfig
							) => {
								const { ctx, el, plugin, source } = props;
								const newConfig = cb(props.config);
								setBlockConfig({
									newConfig,
									ctx,
									el,
									plugin,
									source,
								});
							}}
						/>
					</Show>
				</div>
			</BlockContext.Provider>
		</Show>
	);
};

type ErrorBlockProps = {
	results: DataviewQueryResult;
};
const ErrorBlock = (props: ErrorBlockProps) => {
	const getMsg = () => {
		const { results } = props;
		if (results.successful) {
			const msg = "";
			// console.error(msg);
			return msg;
		}
		// console.error(results.error);
		return results.error;
	};

	return (
		<Show
			when={getMsg()}
			fallback={
				<div class='dataedit-loading-block'>
					<Icon
						iconId='loader-2'
						class='dataedit-loader'
					/>
				</div>
			}
		>
			<DataviewError msg={getMsg()} />
		</Show>
	);
};

type DataviewErrorProps = {
	msg: string;
};
const DataviewError = (props: DataviewErrorProps) => {
	return (
		<div class='dataedit-dataview-error'>
			<span class='dataedit-error-badge'>dataedit</span>
			<h2>Dataview error</h2>
			<p>
				Uh oh! Dataview didn't like that query when we tried passing it over :(
			</p>
			<pre>
				<code>{props.msg}</code>
			</pre>
		</div>
	);
};

// const ComboBox = () => {
// 	const value = ["apples", "oranges"];

// 	let ref: HTMLDivElement;
// 	let cmp: ComboBoxComponent;

// 	onMount(() => {
// 		cmp = new ComboBoxComponent(ref).setValue(value).onChange((v) => {
// 			console.log("value is: ", v);
// 		});
// 	});

// 	return (
// 		<>
// 			<div ref={(r) => (ref = r)}></div>
// 			<button onClick={() => console.log(cmp.getValue())}>get value</button>
// 		</>
// 	);
// };
