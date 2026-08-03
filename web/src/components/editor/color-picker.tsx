"use client"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { PRESET_COLORS } from "@/lib/constants"
import { cn } from "@/lib/utils"

interface Props {
  value?: string
  onChange: (color: string) => void
  className?: string
  title?: string
}

export function ColorPicker({ value = "#000000", onChange, className, title }: Props) {
  // the swatch's only content is its own background, so the colour has to be spoken;
  // callers that pass a title get "填充：#2563eb" rather than a bare hex
  const label = title ? `${title}：${value}` : `颜色 ${value}`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={title}
          aria-label={label}
          className={cn(
            "size-7 shrink-0 rounded-md border shadow-sm transition hover:scale-105",
            className,
          )}
          style={{ background: value }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <div className="grid grid-cols-6 gap-1.5">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              aria-label={color}
              aria-pressed={color.toLowerCase() === value.toLowerCase()}
              className="size-6 rounded border transition hover:scale-110"
              style={{ background: color }}
            />
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          自定义
          <input
            type="color"
            value={value.startsWith("#") ? value : "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 w-full cursor-pointer rounded border bg-transparent"
          />
        </label>
      </PopoverContent>
    </Popover>
  )
}
