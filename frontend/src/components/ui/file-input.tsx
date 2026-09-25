import * as React from "react"
import { Upload, X } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * File picker that reads as one control: a real button segment, a divider, and
 * the chosen filename.
 *
 * The native input is kept in the DOM as `sr-only` rather than replaced by a
 * click-through button, so it stays focusable, Space/Enter opens the OS dialog
 * exactly as on a bare `<input type="file">`, and assistive tech still sees a
 * file upload control. The wrapper mirrors its focus ring with `has-`.
 */
function FileInput({
  id,
  className,
  value,
  onValueChange,
  buttonLabel = "Choose file",
  placeholder = "No file selected",
  disabled,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "value" | "onChange"> & {
  value: File | null
  onValueChange: (file: File | null) => void
  buttonLabel?: string
  placeholder?: string
}) {
  const generatedId = React.useId()
  const inputId = id ?? generatedId
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Clearing only the React value would leave the native FileList in place, so
  // re-picking the same file afterwards would not fire `change`.
  React.useEffect(() => {
    if (!value && inputRef.current?.value) inputRef.current.value = ""
  }, [value])

  return (
    <div
      data-slot="file-input"
      className={cn(
        "border-input dark:bg-input/30 flex h-9 w-full min-w-0 items-center border transition-colors",
        "has-[:focus-visible]:border-ring has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-1",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <input
        {...props}
        ref={inputRef}
        id={inputId}
        type="file"
        disabled={disabled}
        className="peer sr-only"
        onChange={(event) => onValueChange(event.target.files?.[0] ?? null)}
      />
      <label
        htmlFor={inputId}
        className={cn(
          "border-input bg-muted text-foreground hover:bg-muted/70 dark:hover:bg-input/60 inline-flex h-full shrink-0 cursor-pointer items-center gap-1.5 border-r px-3 text-xs font-medium transition-colors",
          disabled && "pointer-events-none"
        )}
      >
        <Upload className="h-3.5 w-3.5" />
        {buttonLabel}
      </label>
      <span
        className={cn(
          "min-w-0 flex-1 truncate px-3 text-xs",
          value ? "text-foreground" : "text-muted-foreground"
        )}
        title={value?.name}
      >
        {value ? value.name : placeholder}
      </span>
      {value && !disabled ? (
        <button
          type="button"
          aria-label="Clear selected file"
          onClick={() => onValueChange(null)}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mr-1 shrink-0 p-1 transition-colors focus-visible:outline-none focus-visible:ring-1"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
}

export { FileInput }
