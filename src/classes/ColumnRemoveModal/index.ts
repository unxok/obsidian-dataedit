import { BlockContext } from "@/components/CodeBlock";
import { renameColumn } from "@/util/mutation";
import { ConfirmationModal } from "../ConfirmationModal";

export class ColumnRemoveModal extends ConfirmationModal {
	private colIndex: number;
	private property: string;
	private alias: string;
	private blockContext: BlockContext;
	constructor(
		colIndex: number,
		property: string,
		alias: string,
		blockContext: BlockContext
	) {
		super(blockContext.plugin.app);
		this.colIndex = colIndex;
		this.property = property;
		this.alias = alias;
		this.blockContext = blockContext;
	}

	onOpen(): void {
		const { contentEl, colIndex, property, alias, blockContext } = this;
		const combined =
			property === alias ? property : property + ' AS "' + alias + '"';
		this.setTitle("Remove column: " + combined);
		contentEl.empty();
		contentEl.createEl("p").setText("Removes the column from the table.");
		contentEl
			.createEl("p")
			.setText("This will only affect the 'TABLE ...' line.");
		contentEl.createEl("p").setText("This will NOT update any notes metdata.");

		this.createButtonContainer();

		this.createCheckBox({
			text: "Don't ask again",
			defaultChecked: !blockContext.plugin.settings.warningRemoveColumn,
			onChange: async (b) =>
				await blockContext.plugin.updateSettings(async (prev) => ({
					...prev,
					warningRemoveColumn: !b,
				})),
		});

		this.createFooterButton((cmp) =>
			cmp.setButtonText("cancel").onClick(() => this.close())
		).createFooterButton((cmp) =>
			cmp
				.setWarning()
				.setButtonText("remove")
				.onClick(() => {
					const { property, alias } = this;

					renameColumn({
						propertyName: property,
						alias: alias,
						index: colIndex,
						blockContext: blockContext,
						remove: true,
					});
					this.close();
				})
		);

		// new Setting(contentEl).addButton((cmp) =>
		//   cmp
		//     .setButtonText("remove")
		//     .setWarning()
		//     .onClick(() => {
		//       const { property, alias, blockContext } = this;

		//       renameColumn({
		//         propertyName: property,
		//         alias: alias,
		//         index: colIndex,
		//         blockContext: blockContext,
		//         remove: true,
		//       });
		//       this.close();
		//     })
		//     .setCta(),
		// );
	}
}
