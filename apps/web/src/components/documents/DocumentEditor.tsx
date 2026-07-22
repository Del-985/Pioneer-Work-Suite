import React, {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

export interface DocumentEditorHandle {
  getEditor: () => any;
  focus: () => void;
}

interface DocumentEditorProps {
  initialValue: string;
  documentTitle: string;
  onChange: (html: string) => void;
  onCursorChange: (position: {
    line: number;
    column: number;
  }) => void;
}

const DocumentEditor = forwardRef<
  DocumentEditorHandle,
  DocumentEditorProps
>(function DocumentEditor(
  {
    initialValue,
    documentTitle,
    onChange,
    onCursorChange,
  },
  forwardedRef
) {
  const quillRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useImperativeHandle(
    forwardedRef,
    () => ({
      getEditor: () => quillRef.current?.getEditor?.(),
      focus: () => quillRef.current?.getEditor?.()?.focus?.(),
    }),
    []
  );

  const modules = useMemo(
    () => ({
      toolbar: {
        container: [
          [{ header: [1, 2, 3, false] }],
          ["bold", "italic", "underline", "strike"],
          [{ background: [] }],
          [{ list: "ordered" }, { list: "bullet" }],
          [{ align: [] }],
          ["blockquote", "code-block"],
          ["link", "image"],
          ["checklist"],
          ["clean"],
          ["undo", "redo"],
        ],
        handlers: {
          undo: () => {
            quillRef.current?.getEditor?.()?.history?.undo();
          },
          redo: () => {
            quillRef.current?.getEditor?.()?.history?.redo();
          },
          image: () => {
            if (!fileInputRef.current) return;
            fileInputRef.current.value = "";
            fileInputRef.current.click();
          },
          checklist: () => {
            const editor = quillRef.current?.getEditor?.();
            if (!editor) return;

            const current = editor.getFormat()?.list;
            editor.format(
              "list",
              current === "checked" || current === "unchecked"
                ? false
                : "checked",
              "user"
            );
          },
        },
      },
      history: {
        delay: 500,
        maxStack: 150,
        userOnly: true,
      },
    }),
    []
  );

  const formats = useMemo(
    () => [
      "header",
      "font",
      "size",
      "bold",
      "italic",
      "underline",
      "strike",
      "background",
      "list",
      "bullet",
      "align",
      "blockquote",
      "code-block",
      "link",
      "image",
    ],
    []
  );

  function handleImageFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ): void {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const base64 = loadEvent.target?.result;
      const editor = quillRef.current?.getEditor?.();

      if (!editor || typeof base64 !== "string") return;

      const range = editor.getSelection(true);
      const index = range
        ? range.index
        : Math.max(0, editor.getLength() - 1);

      editor.insertEmbed(index, "image", base64, "user");
      editor.setSelection(index + 1, 0);
    };
    reader.readAsDataURL(file);
  }

  return (
    <section
      className="documents-v3-editor"
      aria-label={`Editing ${documentTitle || "Untitled document"}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleImageFileChange}
      />
      <ReactQuill
        ref={quillRef}
        defaultValue={initialValue}
        onChange={onChange}
        onChangeSelection={(range) => {
          if (!range) return;

          const textBeforeCursor =
            quillRef.current?.getEditor?.()?.getText?.(0, range.index) ?? "";
          const lines = textBeforeCursor.split("\n");

          onCursorChange({
            line: lines.length,
            column: (lines[lines.length - 1]?.length ?? 0) + 1,
          });
        }}
        placeholder="Start writing…"
        theme="snow"
        modules={modules}
        formats={formats}
      />
    </section>
  );
});

export default DocumentEditor;
