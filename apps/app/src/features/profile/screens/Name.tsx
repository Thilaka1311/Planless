import React, { useState, useEffect, useRef } from "react";
import { ArrowLeft, Loader2, XCircle } from "lucide-react";
import { supabase } from "../../../../lib/supabaseClient";

const MAX_NAME_LENGTH = 40;

interface NameProps {
  activeUserUuid: string;
  currentValue: string;
  onBack: () => void;
  onSaveSuccess: (newName: string) => void;
}

export const Name = ({
  activeUserUuid,
  currentValue,
  onBack,
  onSaveSuccess,
}: NameProps) => {
  const [name, setName] = useState(currentValue);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasChanges = name.trim() !== currentValue;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (val.length > MAX_NAME_LENGTH) {
      setError("Name can't be this long.");
    } else if (val.trim().length > 0 && val.trim().length < 3) {
      setError("Name must be at least 3 characters.");
    } else {
      setError(null);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name cannot be empty.");
      return;
    }
    if (trimmed.length < 3) {
      setError("Name must be at least 3 characters.");
      return;
    }
    if (name.length > MAX_NAME_LENGTH) {
      setError("Name can't be this long.");
      return;
    }
    if (error) return;

    setIsSaving(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("users")
        .update({ full_name: trimmed })
        .eq("id", activeUserUuid);

      if (updateError) {
        setError("Failed to save name. Please try again.");
        setIsSaving(false);
        return;
      }

      onSaveSuccess(trimmed);
    } catch (err) {
      console.error(err);
      setError("Network error. Please try again.");
      setIsSaving(false);
    }
  };

  const isSaveDisabled = isSaving || name.trim().length < 3 || name.length > MAX_NAME_LENGTH || !!error || !hasChanges;

  return (
    <div className="absolute inset-0 bg-[#0C0C0E] z-50 flex flex-col animate-fade-in text-zinc-200 overflow-x-hidden">
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
            Name
          </h2>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 px-6 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] flex flex-col justify-between w-full overflow-y-auto">
        <form onSubmit={handleSave} className="w-full flex flex-col text-left space-y-2">
          <div className="relative flex items-center bg-[#0D0D10] border border-[#FF6B2C] rounded-xl px-4 py-3.5 transition w-full">
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={handleChange}
              placeholder="Enter your name"
              disabled={isSaving}
              className="flex-1 w-full bg-transparent text-sm text-zinc-200 focus:outline-none placeholder-zinc-700 font-medium pr-12"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
            />
            <span className="absolute right-3.5 bottom-2 text-[11px] text-zinc-500 font-sans font-normal tabular-nums select-none pointer-events-none">
              {name.length}/{MAX_NAME_LENGTH}
            </span>
          </div>

          <p className="text-zinc-500 text-xs leading-relaxed font-sans font-normal px-1 pt-1">
            This is how you will appear to your friends on Planless.
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
            disabled={isSaveDisabled}
            className="w-full bg-[#FF6B2C] hover:bg-[#FF8552] text-white py-3.5 rounded-xl font-bold text-xs tracking-wide transition shadow-lg shadow-[#FF6B2C]/10 active:scale-98 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
