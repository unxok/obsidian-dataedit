import { setIcon, ValueComponent } from "obsidian";

export class ComboBoxComponent extends ValueComponent<string[]> {
	private containerEl: HTMLElement;
	private value: string[] = [];
	private listeners: {
		change: ((value: string[]) => unknown)[];
	} = {
		change: [],
	};
	constructor(containerEl: HTMLElement) {
		super();
		this.containerEl = containerEl;
		this.render();
	}

	getValue(): string[] {
		return [...this.value];
	}

	setValue(value: string[]): this {
		this.value = [...value];
		this.render();
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

	render(): void {
		const { containerEl, value } = this;
		containerEl.empty();
		containerEl.classList.add("metadata-property-value", "metadata-property");
		const container = containerEl.createDiv({ cls: "multi-select-container" });
		value.forEach((v, i) => this.renderPill(container, v, i));

		const inp = container.createDiv({
			cls: "multi-select-input",
			attr: {
				"contenteditable": "true",
				"tab-index": "0",
			},
		});
		inp.addEventListener("blur", () => {
			const data = this.getValue();
			const value = inp.textContent ?? "";
			if (!value) {
				return;
			}
			data.push(value);
			this.setValue(data);
		});

		container.addEventListener("click", () => {
			inp.focus();
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
		content.addEventListener("dblclick", () => {
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
		content.addEventListener("blur", () => {
			content.setAttribute("contenteditable", "false");
			const value = content.textContent ?? "";
			const data = this.getValue();
			data[index] = value;
			this.setValue(data);
		});
		const btn = pill.createDiv({ cls: "multi-select-pill-remove-button" });
		btn.addEventListener("click", () => {
			const data = this.getValue().filter((_, i) => i !== index);
			this.setValue(data);
		});
		setIcon(btn, "x");
	}
}
