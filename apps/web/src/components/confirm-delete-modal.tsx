import { ConfirmActionModal } from './confirm-action-modal';

/**
 * Destructive confirmation modal that requires the user to type the resource
 * name to enable the delete button. Reuses the GitHub-style pattern.
 */
export function ConfirmDeleteModal({
  open,
  onOpenChange,
  resourceName,
  resourceLabel,
  description,
  consequences,
  onConfirm,
  pending = false,
  error = null,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Exact name the user must type to confirm. */
  resourceName: string;
  /** Singular noun for the title, e.g. "proyecto" or "dominio". */
  resourceLabel: string;
  /** Optional description shown above the consequence list. */
  description?: string;
  /** Bullet list of what gets deleted alongside. */
  consequences?: string[];
  onConfirm: () => void;
  pending?: boolean;
  error?: string | null;
}) {
  return (
    <ConfirmActionModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Eliminar ${resourceLabel}`}
      description={description ?? 'Esta acción es permanente y no se puede deshacer.'}
      confirmationText={resourceName}
      confirmationLabel="Para confirmar, escribe"
      consequences={consequences}
      consequencesTitle="Se eliminará lo siguiente:"
      confirmLabel={`Eliminar ${resourceLabel}`}
      pendingLabel="Eliminando..."
      pending={pending}
      error={error}
      variant="danger"
      onConfirm={onConfirm}
    />
  );
}
