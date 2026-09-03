import { useRef } from "react";

export default function CameraButton({ onCapture, accept = "image/*" }) {
  const inputRef = useRef(null);
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="m-tap flex items-center gap-2 px-4 py-3 rounded-2xl border-2 border-dashed border-stone-300 text-sm font-semibold text-stone-700 active:bg-stone-50"
      >
        📷 Take photo
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onCapture?.(file);
          e.target.value = "";
        }}
      />
    </>
  );
}
