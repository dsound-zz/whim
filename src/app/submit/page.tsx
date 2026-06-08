import { EventSubmissionForm } from './components/EventSubmissionForm';

export const metadata = {
  title: 'Submit an Event | Whim',
  description: 'Submit your local event to be listed as a draft on Whim.',
};

export default function SubmitEventPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8 font-sans antialiased text-slate-100">
      <div className="max-w-2xl mx-auto w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-400 to-cyan-400 bg-clip-text text-transparent sm:text-5xl">
            Submit Your Event
          </h1>
          <p className="mt-3 text-slate-400 text-lg font-normal">
            Are you a venue owner or event promoter? Fill out the details below to list your event on Whim.
          </p>
        </div>

        <EventSubmissionForm />
      </div>

      <footer className="mt-16 text-center text-slate-600 text-sm font-light">
        &copy; {new Date().getFullYear()} Whim Inc. All rights reserved.
      </footer>
    </div>
  );
}
