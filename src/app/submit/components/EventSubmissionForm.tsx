"use client";

import { useState } from 'react';

interface FormFields {
  title: string;
  venueName: string;
  address: string;
  startAt: string;
  ticketUrl: string;
  submitterEmail: string;
}

interface FormErrors {
  title?: string[];
  venueName?: string[];
  address?: string[];
  startAt?: string[];
  ticketUrl?: string[];
  submitterEmail?: string[];
  global?: string;
}

export function EventSubmissionForm() {
  const [formData, setFormData] = useState<FormFields>({
    title: '',
    venueName: '',
    address: '',
    startAt: '',
    ticketUrl: '',
    submitterEmail: '',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear errors for this field as the user types
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({
        ...prev,
        [name]: undefined,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrors({});

    try {
      const response = await fetch('/api/v1/submit-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 400 && data.details) {
          setErrors(data.details);
        } else {
          setErrors({ global: data.error || 'Whim couldn’t save this event. Wait a minute, then send it again.' });
        }
      } else {
        setIsSuccess(true);
        setFormData({
          title: '',
          venueName: '',
          address: '',
          startAt: '',
          ticketUrl: '',
          submitterEmail: '',
        });
      }
    } catch (error) {
      console.error('Submission error:', error);
      setErrors({ global: 'Couldn’t reach Whim. Check your connection and send again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="border-t-[3px] border-mint pt-6" role="status">
        <h2 className="type-headline text-2xl text-moon mb-2">Event received</h2>
        <p className="text-haze mb-6 max-w-[48ch] leading-relaxed">
          We&rsquo;ll review it and put it on the board, usually within a day. We&rsquo;ll email you if anything needs fixing.
        </p>
        <button
          onClick={() => setIsSuccess(false)}
          className="py-2.5 px-5 border border-seam rounded-md text-sm font-semibold text-moon hover:bg-ink-raised transition-colors"
        >
          Add another event
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8 border-t border-seam pt-8">
      {errors.global && (
        <div className="border-l-[3px] border-alarm bg-ink-raised text-moon px-4 py-3 rounded-sm text-sm" role="alert">
          {errors.global}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Title */}
        <div className="sm:col-span-2">
          <label htmlFor="title" className="block text-sm font-semibold text-moon mb-1.5">
            Event name
          </label>
          <input
            type="text"
            name="title"
            id="title"
            required
            value={formData.title}
            onChange={handleChange}
            placeholder="Late set with the Rotary Trio"
            className="w-full bg-ink-sunken border border-seam rounded-md px-3.5 py-2.5 text-moon placeholder:text-dim focus:outline-none focus:border-sodium transition-colors [color-scheme:dark]"
          />
          {errors.title && (
            <p className="mt-1.5 text-sm text-alarm">{errors.title[0]}</p>
          )}
        </div>

        {/* Venue */}
        <div>
          <label htmlFor="venueName" className="block text-sm font-semibold text-moon mb-1.5">
            Venue
          </label>
          <input
            type="text"
            name="venueName"
            id="venueName"
            required
            value={formData.venueName}
            onChange={handleChange}
            placeholder="Blue Note"
            className="w-full bg-ink-sunken border border-seam rounded-md px-3.5 py-2.5 text-moon placeholder:text-dim focus:outline-none focus:border-sodium transition-colors [color-scheme:dark]"
          />
          {errors.venueName && (
            <p className="mt-1.5 text-sm text-alarm">{errors.venueName[0]}</p>
          )}
        </div>

        {/* Address */}
        <div>
          <label htmlFor="address" className="block text-sm font-semibold text-moon mb-1.5">
            Address
          </label>
          <input
            type="text"
            name="address"
            id="address"
            required
            value={formData.address}
            onChange={handleChange}
            placeholder="131 W 3rd St, New York, NY"
            className="w-full bg-ink-sunken border border-seam rounded-md px-3.5 py-2.5 text-moon placeholder:text-dim focus:outline-none focus:border-sodium transition-colors [color-scheme:dark]"
          />
          {errors.address && (
            <p className="mt-1.5 text-sm text-alarm">{errors.address[0]}</p>
          )}
        </div>

        {/* Start At */}
        <div>
          <label htmlFor="startAt" className="block text-sm font-semibold text-moon mb-1.5">
            Starts
          </label>
          <input
            type="datetime-local"
            name="startAt"
            id="startAt"
            required
            value={formData.startAt}
            onChange={handleChange}
            className="w-full bg-ink-sunken border border-seam rounded-md px-3.5 py-2.5 text-moon placeholder:text-dim focus:outline-none focus:border-sodium transition-colors [color-scheme:dark]"
          />
          {errors.startAt && (
            <p className="mt-1.5 text-sm text-alarm">{errors.startAt[0]}</p>
          )}
        </div>

        {/* Ticket or event link */}
        <div>
          <label htmlFor="ticketUrl" className="block text-sm font-semibold text-moon mb-1.5">
            Ticket or event link
          </label>
          <input
            type="url"
            name="ticketUrl"
            id="ticketUrl"
            required
            value={formData.ticketUrl}
            onChange={handleChange}
            placeholder="https://"
            className="w-full bg-ink-sunken border border-seam rounded-md px-3.5 py-2.5 text-moon placeholder:text-dim focus:outline-none focus:border-sodium transition-colors [color-scheme:dark]"
          />
          {errors.ticketUrl && (
            <p className="mt-1.5 text-sm text-alarm">{errors.ticketUrl[0]}</p>
          )}
        </div>

        {/* Submitter Email */}
        <div className="sm:col-span-2">
          <label htmlFor="submitterEmail" className="block text-sm font-semibold text-moon mb-1.5">
            Your email
          </label>
          <input
            type="email"
            name="submitterEmail"
            id="submitterEmail"
            required
            value={formData.submitterEmail}
            onChange={handleChange}
            placeholder="you@venue.com"
            className="w-full bg-ink-sunken border border-seam rounded-md px-3.5 py-2.5 text-moon placeholder:text-dim focus:outline-none focus:border-sodium transition-colors [color-scheme:dark]"
          />
          {errors.submitterEmail && (
            <p className="mt-1.5 text-sm text-alarm">{errors.submitterEmail[0]}</p>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full sm:w-auto sm:self-start inline-flex justify-center items-center py-3.5 px-8 rounded-md text-base font-bold text-ink bg-sodium hover:bg-sodium-deep transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? (
          <>
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-ink" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Sending…
          </>
        ) : (
          'Send for review'
        )}
      </button>
    </form>
  );
}
