import { EventSubmissionForm } from './components/EventSubmissionForm';

export const metadata = {
  title: 'Add an event | Whim',
  description: 'List your New York event on Whim. Free for every venue and organizer.',
};

export default function SubmitEventPage() {
  return (
    <div className="min-h-full bg-ink text-moon pb-[calc(var(--bottom-nav-height)+2rem)] lg:pb-16">
      <div className="max-w-2xl mx-auto w-full px-4 sm:px-8 pt-10 sm:pt-16">
        <h1 className="type-headline text-[clamp(2.2rem,6vw,3.5rem)] leading-[1] text-balance">
          Add your event to the board
        </h1>
        <p className="mt-4 text-haze text-base sm:text-lg leading-relaxed max-w-[52ch]">
          For venues, promoters and organizers in New York. Listing is free. We review each
          submission before it goes live, usually within a day.
        </p>

        <div className="mt-10">
          <EventSubmissionForm />
        </div>
      </div>
    </div>
  );
}
