/**
 * Records the current scroll on instantiation, and provides the `fix()` method to revert back to that scroll position.
 *
 * Editing a note with the `Editor` API will usually result in a weird scroll down. Not sure why, but this class can be used to fix that.
 *
 * Having to do this feels like I am doing something wrong but for now it works.
 */
export class ScrollFixer {
	private scroller: HTMLElement | undefined;
	private prevScroll: number | undefined;

	constructor(el: HTMLElement) {
		const scroller = el.closest(".cm-scroller") as HTMLElement | null;
		if (!scroller) {
			// console.error("Could not find scroller");
			return;
		}
		this.scroller = scroller;
		this.prevScroll = scroller.scrollTop;
	}

	/**
	 * Restores scroll position back to the previously recorded position.
	 */
	fix(): void {
		const { scroller, prevScroll } = this;
		if (!scroller || !prevScroll) {
			return;
		}
		// this will be used after a immediately after a DOM mutation so we run this next in the event queue to give it time to update
		setTimeout(() => {
			scroller.scrollTo({ top: prevScroll, behavior: "instant" });
		}, 0);
	}
}
