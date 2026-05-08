import * as React from 'react';
import { cn } from './utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';
type ButtonProps = React.ComponentProps<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
};

const buttonVariantClasses: Record<ButtonVariant, string> = {
  danger:
    'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:outline-none',
  ghost:
    'bg-transparent text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none',
  primary:
    'bg-brand-500 text-white shadow-brand hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none',
  secondary:
    'border border-slate-200 bg-white text-slate-800 hover:border-brand-200 hover:bg-brand-subtle focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none',
};

const buttonSizeClasses: Record<ButtonSize, string> = {
  lg: 'px-5 py-3 text-base',
  md: 'px-4 py-2.5 text-sm',
  sm: 'px-3 py-2 text-sm',
};

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled,
  type = 'button',
  children,
  ref,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const classes = cn(
    'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
    buttonVariantClasses[variant],
    buttonSizeClasses[size],
    fullWidth && 'w-full',
    className,
  );
  const content = (
    <>
      {loading ? (
        <span
          aria-hidden="true"
          className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </>
  );
  const sharedProps: React.ComponentProps<'button'> = {
    'aria-busy': loading || undefined,
    'aria-disabled': isDisabled || undefined,
    className: classes,
    disabled: isDisabled,
    ref,
    ...props,
  };

  if (type === 'submit') {
    return (
      <button type="submit" {...sharedProps}>
        {content}
      </button>
    );
  }
  if (type === 'reset') {
    return (
      <button type="reset" {...sharedProps}>
        {content}
      </button>
    );
  }
  return (
    <button type="button" {...sharedProps}>
      {content}
    </button>
  );
}
