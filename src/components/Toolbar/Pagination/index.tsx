import { Icon } from "@/components/Icon";
import { JSXElement } from "solid-js";

type PaginationProps = {
	toPrevious: () => void;
	toNext: () => void;
	showPagesMenu: (e: MouseEvent) => void;
	currentPageRef: (r: HTMLDivElement) => void;
	children: JSXElement;
};
export const Pagination = (props: PaginationProps) => (
	<div class='dataedit-pagination-container'>
		<Icon
			aria-label='Previous page'
			iconId='chevron-left'
			class='clickable-icon'
			onClick={() => props.toPrevious()}
		/>
		<div
			aria-label='Select page'
			ref={(r) => props.currentPageRef(r)}
			class='clickable-icon'
			onClick={(e) => props.showPagesMenu(e)}
		>
			{props.children}
		</div>
		<Icon
			aria-label='Next page'
			iconId='chevron-right'
			class='clickable-icon'
			onClick={() => props.toNext()}
		/>
	</div>
);
