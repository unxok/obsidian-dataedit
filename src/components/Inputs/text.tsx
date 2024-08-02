import { updateMetadataProperty } from "@/lib/util";
import { createSignal } from "solid-js";
import { TableDataEditProps } from "../Table/TableData";
import { autofocus } from "@solid-primitives/autofocus";
import { useCodeBlock } from "@/hooks/useDataEdit";
import { PromptComboBox } from "../ui/combo-box";
import {
  EmbeddableMarkdownEditor,
  MarkdownEditor,
} from "../Markdown/EmbeddableMarkdownEditor";
// To prevent treeshaking
autofocus;

export const TextInput = (
  props: TableDataEditProps & {
    updateProperty?: (val: unknown) => Promise<void>;
  },
) => {
  // el.ActiveElement() wasn't working right
  const [isFocused, setFocused] = createSignal(false);
  const [size, setSize] = createSignal(props.value?.toString().length ?? 5);
  const { plugin, el } = useCodeBlock();

  const updateProperty = async (editor: EmbeddableMarkdownEditor) => {
    const value = editor.editor.getValue();
    if (props.updateProperty) {
      await props.updateProperty(value);
    } else {
      await updateMetadataProperty(
        props.property,
        value,
        props.filePath,
        plugin,
        el,
        props.value,
      );
    }
    props.setEditing(false);
  };

  return (
    <MarkdownEditor
      app={plugin.app}
      options={{
        focus: true,
        value: props.value?.toString(),
        onFocus: () => {
          // console.log("focused");
          setFocused(true);
        },
        onBlur: async (editor) => updateProperty(editor),
        // onChange: async (_, editor) => {
        //   console.log("change: ", editor.editor.getValue());
        // },
        onEditorClick: (e, editor, el) => {
          // without this, clicking the 'edit block' button won't work
          setTimeout(() => {
            editor.editor.cm.contentDOM.focus();
          }, 0);
        },
      }}
      onMount={(eme) => {
        eme.containerEl.addEventListener("mouseleave", (e) => {
          if (isFocused()) return;
          props.setEditing(false);
        });
      }}
    />
    // <input
    //   use:autofocus
    //   autofocus
    //   class="h-auto rounded-none border-none bg-transparent p-0 !shadow-none"
    //   // style={{ "box-shadow": "none" }}
    //   size={size()}
    //   type="text"
    //   value={props.value?.toString() ?? ""}
    //   onBlur={async (e) => {
    //     if (props.updateProperty) {
    //       await props.updateProperty(e.target.value);
    //     } else {
    //       await updateMetadataProperty(
    //         props.property,
    //         e.target.value,
    //         props.filePath,
    //         plugin,
    //         props.value,
    //       );
    //     }
    //     props.setEditing(false);
    //   }}
    //   onInput={(e) => {
    //     setSize(e.target.value.length);
    //   }}
    // />
  );
};
