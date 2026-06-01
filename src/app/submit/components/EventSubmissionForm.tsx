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
          setErrors({ global: data.error || 'Something went wrong. Please try again.' });
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
      setErrors({ global: 'Network error. Please verify your connection and try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="glass rounded-2xl p-8 text-center border border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.1)] transition-all duration-500 scale-100 animate-in fade-in zoom-in-95">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-emerald-500/10 text-emerald-400 mb-6 animate-bounce">
          <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2 font-sans">Submission Received!</h2>
        <p className="text-slate-300 mb-6 max-w-md mx-auto text-base font-normal">
          Thank you for submitting your event. It has been successfully registered as a draft and will be reviewed by our team shortly.
        </p>
        <button
          onClick={() => setIsSuccess(false)}
          className="inline-flex justify-center py-2.5 px-6 border border-transparent rounded-xl text-sm font-semibold text-white bg-accent hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent transition-all duration-300 shadow-[0_4px_20px_rgba(59,130,246,0.25)] hover:shadow-[0_4px_25px_rgba(59,130,246,0.35)]"
        >
          Submit Another Event
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass rounded-2xl p-8 border border-slate-800 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] transition-all duration-300 flex flex-col space-y-6">
      {errors.global && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm font-medium animate-in fade-in">
          {errors.global}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Title */}
        <div className="sm:col-span-2">
          <label htmlFor="title" className="block text-sm font-semibold text-slate-300 mb-1.5">
            Event Title
          </label>
          <input
            type="text"
            name="title"
            id="title"
            required
            value={formData.title}
            onChange={handleChange}
            placeholder="e.g. Summer Jazz Festival"
            className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-all duration-300 font-sans"
          />
          {errors.title && (
            <p className="mt-1.5 text-xs font-semibold text-red-400">{errors.title[0]}</p>
          )}
        </div>

        {/* Venue Name */}
        <div>
          <label htmlFor="venueName" className="block text-sm font-semibold text-slate-300 mb-1.5">
            Venue Name
          </label>
          <input
            type="text"
            name="venueName"
            id="venueName"
            required
            value={formData.venueName}
            onChange={handleChange}
            placeholder="e.g. Blue Note Jazz Club"
            className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-all duration-300 font-sans"
          />
          {errors.venueName && (
            <p className="mt-1.5 text-xs font-semibold text-red-400">{errors.venueName[0]}</p>
          )}
        </div>

        {/* Address */}
        <div>
          <label htmlFor="address" className="block text-sm font-semibold text-slate-300 mb-1.5">
            Address
          </label>
          <input
            type="text"
            name="address"
            id="address"
            required
            value={formData.address}
            onChange={handleChange}
            placeholder="e.g. 131 W 3rd St, New York, NY"
            className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-all duration-300 font-sans"
          />
          {errors.address && (
            <p className="mt-1.5 text-xs font-semibold text-red-400">{errors.address[0]}</p>
          )}
        </div>

        {/* Start At */}
        <div>
          <label htmlFor="startAt" className="block text-sm font-semibold text-slate-300 mb-1.5">
            Start Date & Time
          </label>
          <input
            type="datetime-local"
            name="startAt"
            id="startAt"
            required
            value={formData.startAt}
            onChange={handleChange}
            className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-all duration-300 font-sans"
          />
          {errors.startAt && (
            <p className="mt-1.5 text-xs font-semibold text-red-400">{errors.startAt[0]}</p>
          )}
        </div>

        {/* Ticket URL */}
        <div>
          <label htmlFor="ticketUrl" className="block text-sm font-semibold text-slate-300 mb-1.5">
            Ticket URL
          </label>
          <input
            type="url"
            name="ticketUrl"
            id="ticketUrl"
            required
            value={formData.ticketUrl}
            onChange={handleChange}
            placeholder="e.g. https://ticketlink.com/event"
            className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-all duration-300 font-sans"
          />
          {errors.ticketUrl && (
            <p className="mt-1.5 text-xs font-semibold text-red-400">{errors.ticketUrl[0]}</p>
          )}
        </div>

        {/* Submitter Email */}
        <div className="sm:col-span-2">
          <label htmlFor="submitterEmail" className="block text-sm font-semibold text-slate-300 mb-1.5">
            Your Email Address
          </label>
          <input
            type="email"
            name="submitterEmail"
            id="submitterEmail"
            required
            value={formData.submitterEmail}
            onChange={handleChange}
            placeholder="e.g. contact@venue.com"
            className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-all duration-300 font-sans"
          />
          {errors.submitterEmail && (
            <p className="mt-1.5 text-xs font-semibold text-red-400">{errors.submitterEmail[0]}</p>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full inline-flex justify-center items-center py-3 px-6 border border-transparent rounded-xl text-base font-semibold text-white bg-accent hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(59,130,246,0.25)] hover:shadow-[0_4px_25px_rgba(59,130,246,0.35)]"
      >
        {isSubmitting ? (
          <>
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Submitting event...
          </>
        ) : (
          'Submit Event'
        )}
      </button>
    </form>
  );
}
