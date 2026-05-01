import * as React from 'react';
import { Select } from '@base-ui/react';
import { Check, ChevronDown } from 'lucide-react';
import { FieldShell, useFieldShell } from './field-shell';
import { cn } from './utils';

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

function SelectInputInner({
  value,
  onValueChange,
  options,
  placeholder = 'Selecciona una opción',
  disabled = false,
  name,
  id,
  triggerClassName,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: React.ReactNode;
  disabled?: boolean;
  name?: string;
  id?: string;
  triggerClassName?: string;
}) {
  const field = useFieldShell();
  const effectiveId = id ?? field?.id;
  const invalid = field?.invalid ?? false;
  return (
    <Select.Root<string>
      name={name}
      id={effectiveId}
      disabled={disabled}
      value={value || null}
      onValueChange={(nextValue) => onValueChange(nextValue ?? '')}
    >
      <Select.Trigger
        aria-invalid={invalid || undefined}
        aria-describedby={field?.describedBy}
        aria-required={field?.required || undefined}
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-800 transition hover:border-slate-300 focus-visible:border-brand-500 focus-visible:ring-1 focus-visible:ring-brand-200 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70 aria-invalid:border-rose-400',
          triggerClassName,
        )}
      >
        <Select.Value placeholder={placeholder}>
          {(selectedValue) =>
            options.find((option) => option.value === selectedValue)?.label ?? placeholder
          }
        </Select.Value>
        <Select.Icon
          className="inline-flex shrink-0 items-center text-slate-400"
          aria-hidden="true"
        >
          <ChevronDown size={16} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner side="bottom" align="start" sideOffset={8} className="z-50">
          <Select.Popup className="max-h-[min(24rem,calc(var(--available-height,18rem)))] min-w-[var(--anchor-width)] overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg outline-none">
            <Select.List className="space-y-1">
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className="flex cursor-default items-center justify-between gap-3 rounded-md px-3 py-2.5 text-sm text-slate-700 outline-none transition data-[highlighted]:bg-brand-50 data-[highlighted]:text-brand-500 data-[selected]:font-semibold data-[disabled]:opacity-50"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator
                    className="inline-flex shrink-0 items-center text-brand-500"
                    aria-hidden="true"
                  >
                    <Check size={14} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

export function SelectInput({
  label,
  description,
  error,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  name,
  id,
  className,
  triggerClassName,
}: {
  label?: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: React.ReactNode;
  disabled?: boolean;
  name?: string;
  id?: string;
  className?: string;
  triggerClassName?: string;
}) {
  return (
    <FieldShell
      label={label}
      description={description}
      error={error}
      htmlFor={id}
      className={className}
    >
      <SelectInputInner
        value={value}
        onValueChange={onValueChange}
        options={options}
        placeholder={placeholder}
        disabled={disabled}
        name={name}
        id={id}
        triggerClassName={triggerClassName}
      />
    </FieldShell>
  );
}
