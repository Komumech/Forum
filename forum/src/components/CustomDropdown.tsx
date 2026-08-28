import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export interface DropdownOption {
  value: string;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
}

interface CustomDropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export default function CustomDropdown({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
  className,
  id
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={cn("relative w-full", className)} id={id}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          "w-full min-h-[48px] px-3.5 py-2.5 bg-white border rounded-xl text-left flex items-center justify-between gap-3 transition-all cursor-pointer select-none",
          isOpen ? "border-[#1a73e8] ring-2 ring-[#1a73e8]/20 shadow-xs" : "border-gray-300 hover:border-gray-400 hover:bg-gray-50/50",
          disabled && "opacity-50 cursor-not-allowed bg-gray-50"
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {selectedOption?.icon && (
            <span className="shrink-0 text-gray-500">{selectedOption.icon}</span>
          )}
          <div className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-gray-900 truncate">
              {selectedOption?.label || placeholder}
            </span>
            {selectedOption?.sublabel && (
              <span className="block text-xs text-gray-500 truncate">
                {selectedOption.sublabel}
              </span>
            )}
          </div>
        </div>
        <ChevronDown
          size={18}
          className={cn(
            "text-gray-500 shrink-0 transition-transform duration-200",
            isOpen && "rotate-180 text-[#1a73e8]"
          )}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto custom-scroll p-1"
          >
            {options.length === 0 ? (
              <div className="px-3.5 py-3 text-xs text-gray-500 text-center">
                No options available
              </div>
            ) : (
              options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between gap-2.5 transition-colors cursor-pointer",
                      isSelected
                        ? "bg-[#e8f0fe] text-[#1a73e8] font-medium"
                        : "text-gray-700 hover:bg-gray-100/70"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {option.icon && (
                        <span className={cn("shrink-0", isSelected ? "text-[#1a73e8]" : "text-gray-400")}>
                          {option.icon}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="block truncate">{option.label}</span>
                        {option.sublabel && (
                          <span className="block text-[11px] text-gray-500 truncate">
                            {option.sublabel}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <Check size={16} className="text-[#1a73e8] shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
