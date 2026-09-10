import React from 'react';
import { Search, X } from 'lucide-react';

export interface SearchBarProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  id = "search-input",
  name = "searchInput",
  value,
  onChange,
  placeholder = "Search...",
  className = "",
  autoFocus = false,
}) => {
  return (
    <div
      className={`w-full flex items-center rounded-full bg-[#18181B] border border-white/[0.08] px-3.5 transition-all focus-within:border-white/20 focus-within:bg-[#202024] ${className}`}
      style={{ height: '46px' }}
    >
      {/* SEARCH ICON */}
      <Search className="w-5 h-5 text-white/50 stroke-[2] mr-2.5 shrink-0" />

      {/* SEARCH INPUT */}
      <input
        id={id}
        name={name}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        style={{
          width: '100%',
          background: 'transparent',
          fontSize: 15,
          fontWeight: 500,
          color: '#FFFFFF',
          border: 'none',
          outline: 'none',
          fontFamily: 'Inter, sans-serif',
        }}
        className="placeholder-zinc-500 min-w-0 select-text"
      />

      {/* CLEAR SEARCH BUTTON */}
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="p-1 text-zinc-400 hover:text-white transition shrink-0 mr-1.5 cursor-pointer"
          aria-label="Clear search"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
