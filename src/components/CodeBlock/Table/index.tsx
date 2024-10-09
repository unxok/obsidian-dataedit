import {
	DataviewLink,
	DataviewQueryResultValues,
	PropertyType,
} from "@/lib/types";
import {
	createContext,
	createEffect,
	createSignal,
	For,
	JSX,
	onCleanup,
	Show,
	useContext,
} from "solid-js";
import { useBlock } from "..";
import { checkIfDataviewLink } from "@/lib/util";
import { Icon } from "@/components/Icon";
import { DOMElement } from "solid-js/jsx-runtime";
import { Notice } from "obsidian";
import { createStore } from "solid-js/store";
import { PropertyHeader } from "../../Property/Header";
import { AddColumnModal, AddRowModal } from "@/classes";
import { PropertyData } from "../../Property/PropertyData";
import { moveColumn } from "@/util/mutation";
import { PropertyWidget } from "obsidian-typings";

type DragContextValue = {
	draggedIndex: number;
	draggedOverIndex: number;
};

const defaultDragContextValue: DragContextValue = {
	draggedIndex: -1,
	draggedOverIndex: -1,
};

type DragContextProps = {
	context: DragContextValue;
	setContext: (cb: (previous: DragContextValue) => DragContextValue) => void;
};

const DragContext = createContext<DragContextProps>({
	context: { ...defaultDragContextValue },
	setContext: () => {},
});

export const useDragContext = () => {
	const ctx = useContext(DragContext);

	if (!ctx) {
		throw new Error(
			"useDragContext must be used within a DragContext.Provider"
		);
	}

	return ctx;
};

export const Table = (props: {
	properties: string[];
	headers: string[];
	values: DataviewQueryResultValues;
	propertyTypes: PropertyType[];
	propertyTypeWidgets: PropertyWidget<unknown>[];
	idColIndex: number;
	isDynamic: boolean;
}) => {
	const bctx = useBlock();
	const [dragContext, setDragContext] = createStore<DragContextValue>({
		...defaultDragContextValue,
	});
	const [boundsArr, setBoundsArr] = createSignal<
		[left: number, right: number][]
	>(props.properties.map(() => [0, 0]));

	const getVertical = () => {
		return bctx.config.verticalAlignment;
	};
	const getHorizontal = () => {
		return bctx.config.horizontalAlignment;
	};

	const getJustify = () => {
		const hor = getHorizontal();
		if (hor === "left") return "start";
		if (hor === "right") return "end";
		return "center";
	};

	const getFilePath = (rowIndex: number) => {
		const fileColValue = props.values[rowIndex][props.idColIndex];

		let filePath = "";
		if (checkIfDataviewLink(fileColValue)) {
			filePath = (fileColValue as DataviewLink).path;
		}
		return filePath;
	};

	const recordBounds = (left: number, right: number, index: number) => {
		setBoundsArr((prev) => {
			const copy = [...prev];
			copy[index] = [left, right];
			return copy;
		});
	};

	const getThClassList = (index: number) => {
		return {
			"top": true,
			"dataedit-is-selected": dragContext.draggedIndex === index,
			"dataedit-is-dragged-over": dragContext.draggedOverIndex === index,
			"right": dragContext.draggedIndex < index,
			"left": dragContext.draggedIndex > index,
		};
	};

	return (
		<DragContext.Provider
			value={{ context: dragContext, setContext: setDragContext }}
		>
			<div data-dataedit-scroll-el={true}>
				<div>
					<table
						class='dataedit-table'
						style={{ width: "fit-content" }}
					>
						<thead>
							<tr>
								<For each={props.properties}>
									{(item, index) => (
										<th
											classList={getThClassList(index())}
											style={{
												"vertical-align": getVertical(),
												"text-align": getHorizontal(),
												"justify-content": getJustify(),
												// ensure that column reorder buttons are able to style correctly
												"position": "relative",
												"overflow": "visible",
											}}
										>
											<PropertyHeader
												header={props.headers[index()]}
												property={item}
												propertyType={props.propertyTypes[index()]}
												index={index()}
											>
												<Show when={!props.isDynamic}>
													<ColumnReorderButton
														property={item}
														boundsArr={boundsArr()}
														index={index()}
														recordBounds={recordBounds}
													/>
												</Show>
											</PropertyHeader>
										</th>
									)}
								</For>
							</tr>
						</thead>
						<tbody>
							<For each={props.values}>
								{(row, rowIndex) => (
									<tr>
										<For each={row}>
											{(item, itemIndex) => (
												<td
													classList={{
														"dataedit-is-selected":
															dragContext.draggedIndex === itemIndex(),
														"bottom": rowIndex() === props.values.length - 1,
														"dataedit-is-dragged-over":
															dragContext.draggedOverIndex === itemIndex(),
														"right": dragContext.draggedIndex < itemIndex(),
														"left": dragContext.draggedIndex > itemIndex(),
													}}
													style={{
														"vertical-align": getVertical(),
														"text-align": getHorizontal(),
														"justify-content": getJustify(),
													}}
												>
													<PropertyData
														property={props.properties[itemIndex()]}
														value={item}
														propertyType={props.propertyTypes[itemIndex()]}
														propertyTypeWidget={
															props.propertyTypeWidgets[itemIndex()]
														}
														header={props.headers[itemIndex()]}
														filePath={getFilePath(rowIndex())}
													/>
												</td>
											)}
										</For>
									</tr>
								)}
							</For>
						</tbody>
					</table>
					<Show when={!props.isDynamic}>
						<div
							class='dataedit-table-row-btn'
							aria-label='Add row after'
							onClick={() => {
								const modal = new AddRowModal(
									bctx.plugin.app,
									bctx.config.defaultFolder,
									bctx.config.defaultTemplate
								);
								modal.open();
							}}
						>
							<Icon iconId='plus' />
						</div>
						<div
							class='dataedit-table-col-btn'
							aria-label='Add column after'
							onClick={() => {
								const isReading = bctx.checkForReading();
								if (isReading) {
									new Notice("Feature not available in reading mode");
									return;
								}
								const { lineStart, lineEnd } =
									bctx.ctx.getSectionInfo(bctx.el) ?? {};
								if (!lineStart || !lineEnd) {
									throw new Error("Could not find position of block");
								}
								const modal = new AddColumnModal(
									bctx.plugin.app,
									bctx.dataviewAPI,
									bctx.source,
									{ start: lineStart, end: lineEnd }
								);
								modal.open();
							}}
						>
							<Icon iconId='plus' />
						</div>
					</Show>
				</div>
			</div>
		</DragContext.Provider>
	);
};

const ColumnReorderButton = (props: {
	index: number;
	property: string;
	recordBounds: (left: number, right: number, index: number) => void;
	boundsArr: [left: number, right: number][];
}) => {
	// later this could probably just be in parent
	const dragCtx = useDragContext();
	const bctx = useBlock();

	const [isGrabbing, setGrabbing] = createSignal(false);
	const [transform, setTransform] = createSignal(0);
	let lastMousePos = 0;
	let ref: HTMLDivElement;

	const onmousemove = (e: MouseEvent) => {
		if (!isGrabbing()) return;

		// TODO it should probably scroll if moving column and hits edge of what's in view
		// const scrollerEl = ref.closest('div[data-dataedit-scroll-el]');
		// if (scrollerEl) {
		//   const left = scrollerEl.clientLeft;
		//   console.log('left: ', left);
		//   console.log('mouse: ', e.offsetX)
		// }

		const diff = e.pageX - lastMousePos;
		setTransform(diff);
		const [left, right] = props.boundsArr[props.index];
		const middle = (right + left) / 2 + transform();
		props.boundsArr.forEach((arr, index) => {
			if (!(middle >= arr[0] && middle <= arr[1])) return;
			if (dragCtx.context.draggedOverIndex === index) return;
			dragCtx.setContext((prev) => ({ ...prev, draggedOverIndex: index }));
			return;
		});
	};

	const onmouseup = () => {
		const cleanup = () => {
			lastMousePos = 0;
			setTransform(0);
			document.removeEventListener("mouseup", onmouseup);
			document.removeEventListener("mousemove", onmousemove);
			dragCtx.setContext(() => ({
				draggedIndex: -1,
				draggedOverIndex: -1,
			}));
			setGrabbing(false);
		};

		if (!isGrabbing()) return;
		const { draggedIndex, draggedOverIndex } = dragCtx.context;
		// console.log(draggedIndex, " ", draggedOverIndex);
		if (draggedIndex === -1 || draggedOverIndex === -1) return cleanup();
		if (draggedIndex === draggedOverIndex) return cleanup();

		moveColumn({
			indexFrom: props.index,
			indexTo: dragCtx.context.draggedOverIndex,
			blockContext: bctx,
		});

		cleanup();
	};

	const onMouseDown = (
		e: MouseEvent & {
			currentTarget: HTMLSpanElement;
			target: DOMElement;
		}
	) => {
		e.preventDefault();

		const isReading = bctx.checkForReading();
		if (isReading) {
			new Notice("Feature not available in reading mode");
			return;
		}

		dragCtx.setContext(() => ({
			draggedIndex: props.index,
			draggedOverIndex: props.index,
		}));
		setGrabbing(true);
		setTransform(0);
		lastMousePos = e.pageX;
		document.addEventListener("mouseup", onmouseup);
		document.addEventListener("mousemove", onmousemove);
	};

	let timerRef = 0;

	createEffect(() => {
		dragCtx.context.draggedIndex;
		const { left, right } = ref.getBoundingClientRect();
		props.recordBounds(left, right, props.index);
	});

	const getGrabbingStyle: () => JSX.CSSProperties = () => {
		if (isGrabbing()) {
			return { translate: "calc(-50% + " + transform() + "px) 0%" };
		}
		return {};
	};

	onCleanup(() => {
		window.clearTimeout(timerRef);
		document.removeEventListener("mouseup", onmouseup);
		document.removeEventListener("mousemove", onmousemove);
	});

	return (
		<div
			ref={async (r) => (ref = r)}
			data-dataedit-column-reorder-button={true}
			class='dataedit-column-reorder-button'
			data-grabbing={isGrabbing().toString()}
			data-hidden={!isGrabbing() && dragCtx.context.draggedIndex !== -1}
			onMouseDown={onMouseDown}
			style={{
				...{
					position: "absolute",
					translate: "-50% 0%",
					bottom: "100%",
					left: "50%",
				},
				...getGrabbingStyle(),
			}}
		>
			<Icon
				iconId='grip-horizontal'
				style={{
					"display": "flex",
					"align-items": "end",
					"justify-content": "center",
					"pointer-events": "none",
				}}
			/>
		</div>
	);
};
