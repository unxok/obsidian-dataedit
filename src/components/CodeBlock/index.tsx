import { DataviewAPI, DataviewQueryResult, PropertyType } from "@/lib/types";
import { Table } from "@/components/Table";
import { debounce, MarkdownPostProcessorContext } from "obsidian";
import {
	onMount,
	Show,
	createSignal,
	createContext,
	useContext,
	onCleanup,
	createUniqueId,
	createMemo,
} from "solid-js";
import {
	getIdColumnIndex,
	getPropertyTypes,
	registerDataviewEvents,
	unregisterDataviewEvents,
} from "@/lib/util";
import { CodeBlockConfig } from "./Config";
import DataEdit from "@/main";
import { overrideEditButton, setBlockConfig } from "@/util/mutation";
import { Pagination, Toolbar } from "../Toolbar";
import { Icon } from "../Icon";
import { settingsSignal } from "@/classes/DataeditSettingTab";

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
	const [idColIndex, setIdColIndex] = createSignal(0);
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

	const updateIdColIndex = (dataviewResult: DataviewQueryResult) => {
		if (!dataviewResult.successful) return;
		const id = getIdColumnIndex(
			dataviewResult.value.headers,
			props.dataviewAPI.settings.tableIdColumnName
		);
		setIdColIndex(id);
	};

	// memoizing isn't playing nice with dataview event callbacks...?
	// for now it doesn't matter since these props should never actually change without obsidian causing a rerender automatically
	const updateResults = async () => {
		const { pageSize, currentPage: preCurrentPage } = props.config;
		const results = await props.dataviewAPI.query(props.query);

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
		updateIdColIndex(results);
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
			{/* ID: {uid} */}
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
						idColIndex={idColIndex()}
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
