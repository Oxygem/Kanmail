import React from "react";
import { BlockPicker } from "react-color";

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  colors?: string[];
  showClear?: boolean;
  onClear?: () => void;
}

export default function ColorPicker({
  color,
  onChange,
  isOpen,
  onToggle,
  onClose,
  colors,
  showClear,
  onClear,
}: ColorPickerProps) {
  return (
    <div className="color-picker-wrapper">
      <div className="color-picker-swatch" onClick={onToggle}>
        <div
          className="color-picker-swatch-color"
          style={{ backgroundColor: color || "transparent" }}
        />
      </div>
      {isOpen && (
        <div className="color-picker-popover">
          <div className="color-picker-cover" onClick={onClose} />
          <BlockPicker
            color={color || "transparent"}
            colors={colors}
            onChange={(newColor) => onChange(newColor.hex)}
          />
        </div>
      )}
      {showClear && color && (
        <button
          type="button"
          className="cancel small"
          onClick={(ev) => {
            ev.preventDefault();
            onClear?.();
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
