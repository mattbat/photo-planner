import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** One button of a confirm sheet; `value` is what the question resolves to. */
export interface ConfirmChoice {
  label: string;
  value: string;
  destructive?: boolean;
}

export interface ConfirmSheetProps {
  title: string;
  body?: ReactNode;
  /** Top to bottom. The last is normally the cancel button. */
  choices: ConfirmChoice[];
  /** Backdrop tap and Escape. */
  onCancel: () => void;
  onChoose: (value: string) => void;
}

/** A small bottom sheet that asks one question, with full-width stacked buttons (iOS action-sheet style). */
export function ConfirmSheet({ title, body, choices, onCancel, onChoose }: ConfirmSheetProps) {
  const titleId = useId();
  const bodyId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onCancel();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      before?.focus?.();
    };
  }, [onCancel]);

  return createPortal(
    <div className="sheet-backdrop confirm-backdrop" onClick={onCancel}>
      <div
        ref={ref}
        className="sheet confirm-sheet"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={body ? bodyId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="confirm-title">
          {title}
        </h2>
        {body && (
          <p id={bodyId} className="confirm-body">
            {body}
          </p>
        )}
        <div className="confirm-actions">
          {choices.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`btn confirm-btn ${c.destructive ? 'destructive' : 'secondary'}`}
              onClick={() => onChoose(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  /** Label of the main button. Default "OK". */
  confirmLabel?: string;
  /** Show the main button in red. */
  destructive?: boolean;
  cancelLabel?: string;
}

export interface ChooseOptions {
  title: string;
  body?: ReactNode;
  choices: ConfirmChoice[];
}

interface Pending extends ChooseOptions {
  resolve: (value: string | null) => void;
}

/**
 * Promise-based confirms. Render `confirmSheet` once in the component.
 * `confirm` resolves true/false; `choose` resolves the chosen value, or null for Cancel, Escape or a tap outside.
 */
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);
  const resolveRef = useRef<Pending['resolve'] | null>(null);

  const choose = useCallback(
    (options: ChooseOptions) =>
      new Promise<string | null>((resolve) => {
        resolveRef.current?.(null);
        resolveRef.current = resolve;
        setPending({ ...options, resolve });
      }),
    [],
  );

  const confirm = useCallback(
    async ({ title, body, confirmLabel = 'OK', destructive = false, cancelLabel = 'Cancel' }: ConfirmOptions) =>
      (await choose({
        title,
        body,
        choices: [
          { label: confirmLabel, value: 'yes', destructive },
          { label: cancelLabel, value: 'cancel' },
        ],
      })) === 'yes',
    [choose],
  );

  const finish = useCallback((value: string | null) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setPending(null);
  }, []);
  const cancel = useCallback(() => finish(null), [finish]);

  useEffect(
    () => () => {
      resolveRef.current?.(null);
      resolveRef.current = null;
    },
    [],
  );

  const confirmSheet = pending ? (
    <ConfirmSheet
      title={pending.title}
      body={pending.body}
      choices={pending.choices}
      onCancel={cancel}
      onChoose={(v) => finish(v === 'cancel' ? null : v)}
    />
  ) : null;

  return { confirm, choose, confirmSheet };
}
