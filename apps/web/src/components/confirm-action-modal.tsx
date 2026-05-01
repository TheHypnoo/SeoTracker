import { useEffect, useState } from 'react';
import { Button } from './button';
import { Modal } from './modal';
import { Notice } from './notice';
import { TextInput } from './text-input';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function ConfirmActionModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  confirmationText,
  confirmationLabel,
  consequences,
  consequencesTitle = 'Se aplicará lo siguiente:',
  onConfirm,
  pending = false,
  error = null,
  variant = 'danger',
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  pendingLabel?: string;
  confirmationText?: string;
  confirmationLabel?: string;
  consequences?: string[];
  consequencesTitle?: string;
  onConfirm: () => void;
  pending?: boolean;
  error?: string | null;
  variant?: ButtonVariant;
}) {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!open) {
      setTyped('');
    }
  }, [open]);

  const requiresConfirmation = Boolean(confirmationText);
  const matches = !requiresConfirmation || typed.trim() === confirmationText;
  const buttonText = pending ? (pendingLabel ?? confirmLabel) : confirmLabel;

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="space-y-4">
        {consequences && consequences.length > 0 ? (
          <Notice tone={variant === 'danger' ? 'danger' : 'warning'}>
            <p className="font-semibold">{consequencesTitle}</p>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
              {consequences.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Notice>
        ) : null}

        {confirmationText ? (
          <div>
            <label className="block text-sm font-medium text-slate-700">
              {confirmationLabel ?? 'Para confirmar, escribe'}{' '}
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-900">
                {confirmationText}
              </span>
            </label>
            <TextInput
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={confirmationText}
              className="mt-2"
            />
          </div>
        ) : null}

        {error ? <Notice tone="danger">{error}</Notice> : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant={variant}
            disabled={!matches || pending}
            loading={pending}
            onClick={onConfirm}
          >
            {buttonText}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
