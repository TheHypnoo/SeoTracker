import * as React from 'react';
import { Tabs as BaseTabs } from '@base-ui/react';
import { cn } from './utils';

export interface TabItem {
  value: string;
  label: React.ReactNode;
  content: React.ReactNode;
  disabled?: boolean;
}

export function Tabs({
  items,
  value,
  onValueChange,
  defaultValue,
  listClassName,
  panelClassName,
  className,
}: {
  items: TabItem[];
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
  listClassName?: string;
  panelClassName?: string;
  className?: string;
}) {
  return (
    <BaseTabs.Root
      value={value}
      defaultValue={defaultValue ?? items[0]?.value}
      onValueChange={(next) => onValueChange?.(String(next ?? ''))}
      className={cn('flex flex-col gap-4', className)}
    >
      <BaseTabs.List
        className={cn(
          'relative inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-xs',
          listClassName,
        )}
      >
        {items.map((item) => (
          <BaseTabs.Tab
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className="relative z-10 cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold text-slate-600 transition data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[selected]:text-white hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          >
            {item.label}
          </BaseTabs.Tab>
        ))}
        <BaseTabs.Indicator className="absolute top-1 bottom-1 left-0 z-0 rounded-full bg-brand-500 transition-all duration-200 data-[activation-direction='right']:[transition-property:width,transform] data-[activation-direction='left']:[transition-property:width,transform] w-[var(--active-tab-width)] translate-x-[var(--active-tab-left)]" />
      </BaseTabs.List>
      {items.map((item) => (
        <BaseTabs.Panel
          key={item.value}
          value={item.value}
          className={cn('outline-none', panelClassName)}
        >
          {item.content}
        </BaseTabs.Panel>
      ))}
    </BaseTabs.Root>
  );
}
