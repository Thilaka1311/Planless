import React, { useState, useEffect, useRef } from "react";
import { ArrowLeft, Loader2, XCircle } from "lucide-react";
import { supabase } from "../../../../lib/supabaseClient";

const MAX_ABOUT_LENGTH = 140;

interface AboutProps {
  activeUserUuid: string;
  currentValue: string;
  onBack: () => void;
  onSaveSuccess: (newAbout: string) => void;
}

export const About = ({
  activeUserUuid,
  currentValue,
  onBack,
  onSaveSuccess,
}: AboutProps) => {
  const [about, setAbout] = useState(currentValue);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasChanges = about !== currentValue;

  // Autofocus and position cursor at the end on mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, []);

  // Auto-expand height smoothly as value changes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [about]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    let val = e.target.value;
    if (val.length > MAX_ABOUT_LENGTH) {
      val = val.slice(0, MAX_ABOUT_LENGTH);
    }
    setAbout(val);
    if (error) {
      setError(null);
    }
  };

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = about.trim();
    if (!trimmed) {
      setError("About cannot be empty.");
      return;
    }

    if (trimmed === currentValue.trim()) {
      onBack();
      return;
    }

    setError(null);
    onSaveSuccess(trimmed);
  };

  return (
    <div className="absolute inset-0 bg-black z-50 flex flex-col animate-fade-in text-zinc-200 overflow-x-hidden">
      {/* Header */}
      <div className="w-full select-none flex-shrink-0 pt-[env(safe-area-inset-top,0px)]">
        <div className="w-full px-6 py-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={isSaving}
            className="text-zinc-400 hover:text-white flex items-center justify-center transition active:scale-90 disabled:opacity-50 cursor-pointer -ml-1 p-1"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-sans font-semibold text-white tracking-wide">
            About
          </h2>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 px-6 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] flex flex-col justify-between w-full overflow-y-auto">
        <form onSubmit={handleSave} className="w-full flex flex-col text-left space-y-1.5">
          <div className="relative flex items-start bg-[#0D0D10] border border-[#FF6B2C] rounded-xl px-4 py-3.5 transition min-h-[72px] w-full">
            <textarea
              ref={textareaRef}
              value={about}
              maxLength={MAX_ABOUT_LENGTH}
              onChange={handleChange}
              disabled={isSaving}
              rows={2}
              className="flex-1 w-full bg-transparent text-sm text-zinc-200 focus:outline-none placeholder-zinc-700 font-medium resize-none max-h-[120px] overflow-y-auto leading-relaxed"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
            />
          </div>

          <div className="w-full flex justify-end px-1 pt-0.5">
            <span className="text-[11px] text-zinc-500 font-sans font-normal tabular-nums select-none">
              {about.length}/{MAX_ABOUT_LENGTH}
            </span>
          </div>

          <p className="text-zinc-500 text-xs leading-relaxed font-sans font-normal px-1">
            Write a short bio so friends know what you're up to.
          </p>

          {error && (
            <div className="px-1 pt-1 text-[11px] font-sans font-medium text-[#FF4F00] flex items-center gap-1.5 animate-fade-in select-none">
              <XCircle className="w-3.5 h-3.5 text-[#FF4F00] flex-shrink-0" />
              {error}
            </div>
          )}
        </form>

        <div className="w-full pt-6">
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={isSaving}
            className="w-full bg-[#FF6B2C] hover:bg-[#FF8552] text-white py-3.5 rounded-xl font-bold text-xs tracking-wide transition shadow-lg shadow-[#FF6B2C]/10 active:scale-98 cursor-pointer flex items-center justify-center gap-2"
          >
            {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
