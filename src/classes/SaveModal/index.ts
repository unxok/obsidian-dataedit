import { App, Modal, Setting } from "obsidian";

export class SaveModal extends Modal {
	/** Update this to true when changes that should be saved are made */
	isChanged: boolean = false;

	constructor(app: App) {
		super(app);
	}

	onSave(): void {}

	/**
	 * Will check if changed, and will open a confirmation modal if so.
	 * Otherwise, the regular `Modal.close()` method is called.
	 */
	close(): void {
		const { isChanged, app } = this;
		if (!isChanged) return super.close();
		// new ConfirmationModal(app, options).open();
		const confirmation = new Modal(app);
		confirmation.onOpen = () => {
			confirmation.setTitle("Unsaved changes");
			confirmation.contentEl.empty();
			confirmation.contentEl.createEl("p", {
				text: "Did you mean to save first?",
			});
			new Setting(confirmation.contentEl)
				.addButton((btn) =>
					btn
						.setWarning()
						.setButtonText("close")
						.onClick(() => {
							confirmation.close();
							super.close();
						})
				)
				.addButton((btn) =>
					btn.setButtonText("go back").onClick(() => confirmation.close())
				)
				.addButton((btn) =>
					btn
						.setCta()
						.setButtonText("save and close")
						.onClick(() => {
							confirmation.close();
							super.close();
							this.onSave();
						})
				);
		};
		confirmation.open();
	}
}
