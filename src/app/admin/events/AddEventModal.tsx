'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEventAdded: () => void;
}

type EventCategory =
  | 'music'
  | 'comedy'
  | 'art'
  | 'theater'
  | 'food_drink'
  | 'fitness'
  | 'community'
  | 'nightlife'
  | 'family'
  | 'sports'
  | 'film'
  | 'other';

interface AddEventFormState {
  title: string;
  venueName: string;
  address: string;
  startAt: string;
  ticketUrl: string;
  category: EventCategory | '';
}

interface FieldErrors {
  title?: string;
  venueName?: string;
  address?: string;
  startAt?: string;
  ticketUrl?: string;
}

type SubmitPhase = 'idle' | 'submitting' | 'success' | 'error';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS: Array<{ label: string; value: EventCategory }> = [
  { label: 'Music', value: 'music' },
  { label: 'Comedy', value: 'comedy' },
  { label: 'Art', value: 'art' },
  { label: 'Theater', value: 'theater' },
  { label: 'Food & Drink', value: 'food_drink' },
  { label: 'Fitness', value: 'fitness' },
  { label: 'Community', value: 'community' },
  { label: 'Nightlife', value: 'nightlife' },
  { label: 'Family', value: 'family' },
  { label: 'Sports', value: 'sports' },
  { label: 'Film', value: 'film' },
  { label: 'Other', value: 'other' },
];

const ADMIN_API_KEY = 'test-key-whim';

const EMPTY_FORM: AddEventFormState = {
  title: '',
  venueName: '',
  address: '',
  startAt: '',
  ticketUrl: '',
  category: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateForm(formState: AddEventFormState): FieldErrors {
  const errors: FieldErrors = {};

  if (!formState.title.trim()) {
    errors.title = 'Title is required.';
  }
  if (!formState.venueName.trim()) {
    errors.venueName = 'Venue name is required.';
  }
  if (!formState.address.trim()) {
    errors.address = 'Address is required.';
  }
  if (!formState.startAt) {
    errors.startAt = 'Start date/time is required.';
  } else if (new Date(formState.startAt) < new Date()) {
    errors.startAt = 'Start date must be in the future.';
  }
  if (
    formState.ticketUrl.trim() &&
    !/^https?:\/\/.+/.test(formState.ticketUrl.trim())
  ) {
    errors.ticketUrl = 'Must be a valid URL starting with http:// or https://';
  }

  return errors;
}

// ─── Field Component ──────────────────────────────────────────────────────────

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}

function FormField({ label, required, error, children }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AddEventModal({ isOpen, onClose, onEventAdded }: AddEventModalProps) {
  const [formState, setFormState] = useState<AddEventFormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // ── Close on Escape ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(evt: KeyboardEvent) {
      if (evt.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // ── Focus first input when panel opens ────────────────────────────────────
  useEffect(() => {
    if (isOpen && submitPhase === 'idle') {
      // Slight delay to allow the slide-in animation to start
      const timer = setTimeout(() => {
        firstInputRef.current?.focus();
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [isOpen, submitPhase]);

  // ── Reset form when modal closes ───────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      // Delay reset until after the close animation completes
      const timer = setTimeout(() => {
        setFormState(EMPTY_FORM);
        setFieldErrors({});
        setSubmitPhase('idle');
        setErrorMessage(null);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleBackdropClick = useCallback(
    (evt: React.MouseEvent<HTMLDivElement>) => {
      if (evt.target === evt.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  function handleFieldChange(field: keyof AddEventFormState, value: string) {
    setFormState((previous) => ({ ...previous, [field]: value }));
    // Clear error for this field on change
    if (fieldErrors[field as keyof FieldErrors]) {
      setFieldErrors((previous) => ({ ...previous, [field]: undefined }));
    }
  }

  async function handleSubmit(evt: React.FormEvent<HTMLFormElement>) {
    evt.preventDefault();

    const errors = validateForm(formState);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitPhase('submitting');
    setErrorMessage(null);

    try {
      // Step 1: Submit the event as a draft via the public submission endpoint
      const submitPayload = {
        title: formState.title.trim(),
        venueName: formState.venueName.trim(),
        address: formState.address.trim(),
        startAt: new Date(formState.startAt).toISOString(),
        ...(formState.ticketUrl.trim() ? { ticketUrl: formState.ticketUrl.trim() } : {}),
        ...(formState.category ? { category: formState.category } : {}),
        submitterEmail: 'admin@whim.internal',
      };

      const submitResponse = await fetch('/api/v1/submit-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitPayload),
      });

      if (!submitResponse.ok) {
        const errorBody = (await submitResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorBody.error ?? `Submit failed: HTTP ${submitResponse.status}`);
      }

      const submitData = (await submitResponse.json()) as { id: string };
      const newEventId = submitData.id;

      if (!newEventId) {
        throw new Error('No event ID returned from submission. Cannot publish.');
      }

      // Step 2: Immediately publish the draft so it skips the review queue
      const publishResponse = await fetch(`/api/v1/admin/events/${newEventId}/publish`, {
        method: 'PATCH',
        headers: {
          'x-api-key': ADMIN_API_KEY,
        },
      });

      if (!publishResponse.ok) {
        const errorBody = (await publishResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          errorBody.error ?? `Publish failed: HTTP ${publishResponse.status}`
        );
      }

      setSubmitPhase('success');
      onEventAdded();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.'
      );
      setSubmitPhase('error');
    }
  }

  function handleAddAnother() {
    setFormState(EMPTY_FORM);
    setFieldErrors({});
    setSubmitPhase('idle');
    setErrorMessage(null);
    // Re-focus the title field
    setTimeout(() => firstInputRef.current?.focus(), 80);
  }

  // ── Input class helper ─────────────────────────────────────────────────────
  function inputClass(hasError: boolean): string {
    return `bg-zinc-900 border ${
      hasError ? 'border-red-600' : 'border-zinc-700'
    } rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors w-full placeholder-zinc-600 disabled:opacity-50`;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={handleBackdropClick}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Slide-in panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add Event"
        className={`fixed top-0 right-0 h-full z-50 w-full max-w-[480px] flex flex-col
          bg-zinc-950/95 backdrop-blur-xl border-l border-zinc-800 shadow-2xl
          transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">Add Event</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Admin-created events are published immediately</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close add event panel"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors text-lg"
          >
            ×
          </button>
        </div>

        {/* Panel body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* ── Success state ──────────────────────────────────────────── */}
          {submitPhase === 'success' && (
            <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-900/40 border border-emerald-800/60 flex items-center justify-center text-3xl">
                ✓
              </div>
              <div>
                <p className="text-lg font-semibold text-white">Event Added</p>
                <p className="text-sm text-zinc-500 mt-1">
                  The event has been published and is now live.
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full">
                <button
                  onClick={handleAddAnother}
                  className="w-full px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
                >
                  + Add Another Event
                </button>
                <button
                  onClick={onClose}
                  className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* ── Form (idle or error state) ─────────────────────────────── */}
          {(submitPhase === 'idle' || submitPhase === 'error' || submitPhase === 'submitting') && (
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              {/* Error banner */}
              {submitPhase === 'error' && errorMessage && (
                <div className="rounded-lg border border-red-800/60 bg-red-950/30 px-4 py-3 text-sm text-red-300 flex items-start gap-2">
                  <span className="shrink-0 mt-0.5">⚠</span>
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Title */}
              <FormField label="Title" required error={fieldErrors.title}>
                <input
                  ref={firstInputRef}
                  type="text"
                  placeholder="e.g. Jazz Night at the Blue Note"
                  value={formState.title}
                  onChange={(evt) => handleFieldChange('title', evt.target.value)}
                  disabled={submitPhase === 'submitting'}
                  className={inputClass(!!fieldErrors.title)}
                  autoComplete="off"
                />
              </FormField>

              {/* Venue Name */}
              <FormField label="Venue Name" required error={fieldErrors.venueName}>
                <input
                  type="text"
                  placeholder="e.g. Blue Note Jazz Club"
                  value={formState.venueName}
                  onChange={(evt) => handleFieldChange('venueName', evt.target.value)}
                  disabled={submitPhase === 'submitting'}
                  className={inputClass(!!fieldErrors.venueName)}
                  autoComplete="off"
                />
              </FormField>

              {/* Address */}
              <FormField label="Address" required error={fieldErrors.address}>
                <input
                  type="text"
                  placeholder="e.g. 131 W 3rd St, New York, NY 10012"
                  value={formState.address}
                  onChange={(evt) => handleFieldChange('address', evt.target.value)}
                  disabled={submitPhase === 'submitting'}
                  className={inputClass(!!fieldErrors.address)}
                  autoComplete="street-address"
                />
              </FormField>

              {/* Start At */}
              <FormField label="Start Date &amp; Time" required error={fieldErrors.startAt}>
                <input
                  type="datetime-local"
                  value={formState.startAt}
                  onChange={(evt) => handleFieldChange('startAt', evt.target.value)}
                  disabled={submitPhase === 'submitting'}
                  className={`${inputClass(!!fieldErrors.startAt)} [color-scheme:dark]`}
                />
              </FormField>

              {/* Category */}
              <FormField label="Category">
                <select
                  value={formState.category}
                  onChange={(evt) => handleFieldChange('category', evt.target.value)}
                  disabled={submitPhase === 'submitting'}
                  className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors w-full disabled:opacity-50"
                >
                  <option value="">— Select category —</option>
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </FormField>

              {/* Ticket URL */}
              <FormField label="Ticket URL" error={fieldErrors.ticketUrl}>
                <input
                  type="url"
                  placeholder="https://dice.fm/event/..."
                  value={formState.ticketUrl}
                  onChange={(evt) => handleFieldChange('ticketUrl', evt.target.value)}
                  disabled={submitPhase === 'submitting'}
                  className={inputClass(!!fieldErrors.ticketUrl)}
                  autoComplete="off"
                />
              </FormField>

              {/* Info note */}
              <p className="text-xs text-zinc-600 leading-relaxed">
                Admin-created events are submitted as drafts and immediately published — they bypass
                the normal review queue. The event will appear on the map within seconds.
              </p>

              {/* Submit button */}
              <button
                type="submit"
                disabled={submitPhase === 'submitting'}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
              >
                {submitPhase === 'submitting' ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Publishing Event…
                  </>
                ) : (
                  '+ Publish Event'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
