import { JSXElement, Show } from "solid-js";

type ResultsProps = {
	resultDivRef: (r: HTMLDivElement) => void;
	onClick: (e: MouseEvent) => void;
	pageSize: number;
	resultCount: number;
	children: JSXElement;
};

export const Results = (props: ResultsProps) => (
	<div
		aria-label='Set page size'
		class='clickable-icon'
		ref={(r) => props.resultDivRef(r)}
		onClick={props.onClick}
	>
		<Show
			when={props.pageSize > 0}
			fallback={<>{props.resultCount} results</>}
		>
			{props.children}
		</Show>
	</div>
);
