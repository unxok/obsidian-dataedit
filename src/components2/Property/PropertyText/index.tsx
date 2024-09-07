import { EmbeddableMarkdownEditor } from "@/components/Markdown/EmbeddableMarkdownEditor";
import { useBlock } from "@/components2/CodeBlock";
import { onMount, onCleanup } from "solid-js";
import { PropertyCommonProps } from "..";

export const PropertyText = (props: PropertyCommonProps) => {
  const bctx = useBlock();
  let ref: HTMLDivElement;
  let emde: EmbeddableMarkdownEditor;

  onMount(() => {
    emde = new EmbeddableMarkdownEditor(bctx.plugin.app, ref, {
      value: props.value?.toString(),
      onBlur: async (editor) => {
        const value = editor.editor?.getValue();
        props.updateProperty(value);
      },
    });
  });

  onCleanup(() => {
    emde.destroy();
  });

  return (
    <>
      <div
        class="property-text-div"
        ref={(r) => (ref = r)}
        style={{
          "text-align": bctx.config.horizontalAlignment,
        }}
      ></div>
    </>
  );
};
