import { EventFeed } from "@/components/EventFeed";

export default function Home() {
  return (
    <main className="min-h-screen pb-20 relative">
      {/* Abstract Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-accent rounded-full mix-blend-multiply filter blur-[128px] opacity-20"></div>
      <div className="absolute top-[20%] right-[-10%] w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-[128px] opacity-20"></div>
      
      {/* Hero Section */}
      <section className="relative pt-24 pb-16 px-6 overflow-hidden z-10">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 mb-6">
            Spontaneous going out. <br className="hidden md:block"/> Zero friction.
          </h1>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10">
            What&apos;s happening near you tonight? We aggregated everything so you don&apos;t have to plan weeks ahead.
          </p>
        </div>
      </section>

      {/* Feed Section */}
      <section className="px-6 max-w-7xl mx-auto relative z-10">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-white">Trending Tonight</h2>
          <div className="glass px-4 py-2 rounded-full text-sm font-medium text-slate-300">
            New York
          </div>
        </div>
        <EventFeed />
      </section>
    </main>
  );
}
