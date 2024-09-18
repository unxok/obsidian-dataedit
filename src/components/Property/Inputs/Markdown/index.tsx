import { EmbeddableMarkdownEditor } from "@/classes";
import { useBlock } from "@/components/CodeBlock";
import { MarkdownRenderChild } from "obsidian";
import { onMount, onCleanup } from "solid-js";
import { PropertyCommonProps } from "../../PropertySwitch";

export const PropertyMarkdown = (props: PropertyCommonProps) => {
  const bctx = useBlock();
  let ref: HTMLDivElement;
  let emde: EmbeddableMarkdownEditor;

  onMount(() => {
    // TODO causing error that I am unsure if I can fix
    // event waiting a long time like 3 seconds won't prevent it so IDK
    emde = new EmbeddableMarkdownEditor(
      bctx.plugin.app,
      ref,
      {
        value: props.value?.toString(),
        onBlur: async (editor) => {
          const value = editor.editor?.getValue();
          props.updateProperty(value);
        },
      },
      bctx.ctx.sourcePath,
    );

    /*
        Despite the emde indicating it can be used as a Component
        and thus lifecylcle managed by Contexts, doing that causes
        obsidian to lag immensely.
        */
    // bctx.ctx.addChild(emde);
    const mdrc = new MarkdownRenderChild(ref);
    mdrc.register(() => emde.destroy());
    bctx.ctx.addChild(mdrc);
  });

  onCleanup(() => {
    emde.destroy();
  });

  return (
    <>
      <div
        class="dataedit-property-markdown-div"
        ref={(r) => (ref = r)}
        style={{
          "text-align": bctx.config.horizontalAlignment,
        }}
      ></div>
    </>
  );
};