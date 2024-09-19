import { setIcon, ValueComponent } from "obsidian";

export class ComboBoxComponent extends ValueComponent<string[]> {
	containerEl: HTMLElement;
	multiSelectEl: HTMLElement;
	private inputEl: HTMLElement = createDiv();
	private value: string[] = [];
	private listeners: {
		change: ((value: string[]) => unknown)[];
	} = {
		change: [],
	};
	constructor(containerEl: HTMLElement, defaultValue: string[]) {
		super();
		containerEl.classList.add("metadata-property-value", "metadata-property");
		this.multiSelectEl = containerEl.createDiv({
			cls: "multi-select-container",
		});
		this.containerEl = containerEl;
		this.value = [...defaultValue];
		this.render();
	}

	getValue(): string[] {
		return [...this.value];
	}

	/**
	 * This will not cause a re-render on it's own.
	 */
	setValue(value: string[]): this {
		this.value = [...value];
		// if (!skipRerender) {
		// 	this.render(focusInput);
		// }
		this.onChanged();
		return this;
	}

	onChange(cb: (value: string[]) => unknown): this {
		this.listeners.change.push(cb);
		return this;
	}

	onChanged(): void {
		this.listeners.change.forEach((func) => func(this.getValue()));
	}

	updateDom(): void {
		const { multiSelectEl, inputEl } = this;
		const data = this.getValue();
		const pills = Array.from(multiSelectEl.children);
		data.forEach((value, index) => {
			const pillEl = pills[index];
			const pillContent = pillEl?.querySelector(
				"div.multi-select-pill-content"
			);
			if (!pillEl || !pillContent) {
				// new el needs to be added
				this.renderPill(multiSelectEl, value, index);
				return;
			}
			// pill hasn't changed
			if (pillContent.textContent === value) return;
			// value is different than current
			pillContent.textContent = value;
		});

		multiSelectEl.insertAdjacentElement("beforeend", inputEl);
	}

	render(): void {
		const { value, multiSelectEl } = this;
		multiSelectEl.empty();

		value.forEach((v, i) => this.renderPill(multiSelectEl, v, i));

		const inp = multiSelectEl.createDiv({
			cls: "multi-select-input",
			attr: {
				"contenteditable": "true",
				"tab-index": "0",
			},
		});

		this.inputEl = inp;

		inp.addEventListener("blur", () => {
			const data = this.getValue();
			const value = inp.textContent ?? "";
			if (!value) {
				return;
			}
			inp.textContent = "";
			this.renderPill(this.multiSelectEl, value, data.length);
			data.push(value);
			this.setValue(data);
			setTimeout(() => {
				inp.focus();
			}, 0);
		});

		multiSelectEl.addEventListener("click", () => {
			inp.focus();
		});
		inp.addEventListener("keydown", (e) => {
			if (e.key !== "Enter") return;
			inp.blur();
		});
	}

	renderPill(container: HTMLElement, value: string, index: number): void {
		const pill = container.createDiv({
			cls: "multi-select-pill",
			attr: { "tab-index": "0" },
		});
		const content = pill.createDiv({
			cls: "multi-select-pill-content",
			text: value,
			attr: {
				contenteditable: "false",
			},
		});
		this.inputEl.insertAdjacentElement("beforebegin", pill);
		content.addEventListener("dblclick", (e) => {
			e.stopPropagation();
			const isEditable = content.getAttribute("contenteditable");
			if (isEditable === "false") {
				content.setAttribute("contenteditable", "true");
				// place cursor within end of text in triggerEl
				const sel = window.getSelection();
				sel?.selectAllChildren(content);
				return;
			}
			content.setAttribute("contenteditable", "false");
		});
		content.addEventListener("keydown", (e) => {
			if (e.key !== "Enter") return;
			content.blur();
		});
		content.addEventListener("blur", () => {
			content.setAttribute("contenteditable", "false");
			const value = content.textContent ?? "";
			const data = this.getValue();
			data[index] = value;
			this.setValue(data);
		});
		const btn = pill.createDiv({ cls: "multi-select-pill-remove-button" });
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			pill.remove();
			const data = this.getValue().filter((_, i) => i !== index);
			this.setValue(data);
		});
		setIcon(btn, "x");
	}
}
