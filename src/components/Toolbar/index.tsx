import { toNumber } from "@/util/pure";
import { App, Menu, Modal, TextComponent, Setting } from "obsidian";
import { createMemo, For, Match, Show, Switch } from "solid-js";
import { CodeBlockConfig, ToolbarItemName } from "../CodeBlock/Config";
import { HorizontalAlignmentButton } from "./HorizontalAlignmentButton";
import { VerticalAlignmentButton } from "./VerticalAlignmentButton";
import { Pagination } from "./Pagination";
import { Results } from "./Results";

export type Pagination = {
	/**
	 * zero-based index
	 */
	shownStart: number;
	/**
	 * zero-based index
	 */
	shownEnd: number;
	resultCount: number;
	pageCount: number;
};

type ToolbarProps = Pagination & {
	app: App;
	config: CodeBlockConfig;
	updateBlockConfig: (cb: (config: CodeBlockConfig) => CodeBlockConfig) => void;
};

export const Toolbar = (props: ToolbarProps) => {
	let pageNumberDiv: HTMLDivElement;
	let pageResultDiv: HTMLDivElement;

	const trueCurrentPage = createMemo(() => {
		const {
			config: { currentPage },
			pageCount,
		} = props;
		if (currentPage > pageCount) return 0;
		return currentPage;
	}, props.config.currentPage);

	const changePage = (isForward: boolean) => {
		const currentPage = trueCurrentPage();
		const offset = isForward ? 1 : -1;
		const newPage = currentPage + offset;
		props.updateBlockConfig((prev) => ({ ...prev, currentPage: newPage }));
	};

	const setPage = (n: number) => {
		props.updateBlockConfig((prev) => ({ ...prev, currentPage: n }));
	};

	const createPageNumberMenu = (e: MouseEvent) => {
		if (!pageNumberDiv) {
			throw new Error("No div found for page number div");
		}

		const currentPage = trueCurrentPage();

		const menu = new Menu().setNoIcon();
		for (let i = 0; i < props.pageCount; i++) {
			menu.addItem((cmp) => {
				// cmp.iconEl.remove();
				cmp
					.setTitle((i + 1).toString())
					.setChecked(i === currentPage)
					.onClick(() => setPage(i));
			});
		}

		menu.showAtMouseEvent(e);
	};

	const createPageResultMenu = (e: MouseEvent) => {
		if (!pageResultDiv) {
			throw new Error("No div found for page result div");
		}

		const modal = new Modal(props.app).setTitle("Update page size");

		let inputCmp: TextComponent;
		new Setting(modal.contentEl)
			.setName("Page size")
			.setDesc("Must be zero or greater. If zero, no page size will be set.")
			.addText((cmp) => {
				cmp.inputEl.setAttribute("type", "number");
				cmp.inputEl.setAttribute("min", "0");
				cmp.setValue(props.config.pageSize.toString());
				cmp.setPlaceholder("unlimited");
				inputCmp = cmp;
			});

		new Setting(modal.contentEl)
			.addButton((cmp) =>
				cmp.setButtonText("cancel").onClick(() => modal.close())
			)
			.addButton((cmp) =>
				cmp
					.setCta()
					.setButtonText("update")
					.onClick(() => {
						const newPageSize = toNumber(inputCmp.getValue(), 0, 0);
						props.updateBlockConfig((prev) => ({
							...prev,
							pageSize: newPageSize,
						}));
						modal.close();
					})
			);

		modal.open();
	};

	return (
		<div class='dataedit-toolbar'>
			<For each={props.config.toolbarOrder}>
				{(item, index) => (
					<Switch>
						<Match when={item === "results"}>
							<Results
								resultDivRef={(r) => (pageResultDiv = r)}
								onClick={(e) => createPageResultMenu(e)}
								pageSize={props.config.pageSize}
								resultCount={props.resultCount}
							>
								{props.shownStart + 1} - {props.shownEnd} of {props.resultCount}
							</Results>
						</Match>
						<Match when={item === "pagination"}>
							<Show when={props.config.pageSize > 0}>
								<Pagination
									toPrevious={() => changePage(false)}
									toNext={() => changePage(true)}
									showPagesMenu={(e) => createPageNumberMenu(e)}
									currentPageRef={(r) => (pageNumberDiv = r)}
								>
									{trueCurrentPage() + 1} of {props.pageCount}
								</Pagination>
							</Show>
						</Match>
						<Match when={item === "horizontal-alignment"}>
							<HorizontalAlignmentButton
								app={props.app}
								alignment={props.config.horizontalAlignment}
								updateBlockConfig={props.updateBlockConfig}
							/>
						</Match>
						<Match when={item === "vertical-alignment"}>
							<VerticalAlignmentButton
								app={props.app}
								alignment={props.config.verticalAlignment}
								updateBlockConfig={props.updateBlockConfig}
							/>
						</Match>
					</Switch>
				)}
			</For>
		</div>
	);
};
