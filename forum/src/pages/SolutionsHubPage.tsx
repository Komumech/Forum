import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { getSeoPagesByCategory, SeoPageEntry } from '../data/seoPages';
import { useDocumentSeo } from '../utils/useDocumentSeo';

export default function SolutionsHubPage() {
  const navigate = useNavigate();

  const useCases = getSeoPagesByCategory('use-cases');
  const comparisons = getSeoPagesByCategory('compare');
  const integrations = getSeoPagesByCategory('integrations');

  useDocumentSeo({
    title: 'Komu Forum Solutions — Use Cases, Comparisons & Integrations',
    description:
      'Browse dedicated Komu Forum workflows for remote standups, music lessons, client consultations, OBS clean feeds, and platform comparisons.',
    canonicalPath: '/solutions',
    keywords: [
      'komu forum use cases',
      'video conferencing comparisons',
      'obs browser source video meeting',
      'meeting transcript export software',
    ],
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Komu Forum Solutions & Workflows',
      url: 'https://komu-forum.vercel.app/solutions',
      description:
        'Explore browser-first video meeting use cases, product comparisons, and studio integrations in Komu Forum.',
    },
  });

  const handleLaunchInstantRoom = () => {
    const code = Math.random().toString(36).substring(2, 10);
    try {
      localStorage.setItem(`forum_room_host_${code}`, 'true');
    } catch {}
    navigate(`/meeting/${code}`);
  };

  const renderSection = (title: string, subtitle: string, items: SeoPageEntry[]) => (
    <section className="space-y-5">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</p>
        <h2 className="text-2xl font-light text-slate-900 tracking-tight">{subtitle}</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((item) => (
          <Link
            key={`${item.category}/${item.slug}`}
            to={`/${item.category}/${item.slug}`}
            className="group bg-white rounded-2xl border border-neutral-200/70 hover:border-slate-400 p-6 space-y-3 transition-colors flex flex-col justify-between"
          >
            <div className="space-y-2">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                {item.audience}
              </span>
              <h3 className="text-base font-semibold text-slate-900 group-hover:text-slate-700 leading-snug">
                {item.headline}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed line-clamp-3">{item.summary}</p>
            </div>
            <div className="pt-2 flex items-center gap-1.5 text-xs font-medium text-slate-900">
              <span>Explore guide</span>
              <ArrowRight size={13} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );

  return (
    <div className="min-h-screen bg-[#FBFBFA] text-slate-900 font-sans flex flex-col">
      <header className="sticky top-0 z-40 bg-[#FBFBFA]/90 backdrop-blur-md border-b border-neutral-200/70 px-6 lg:px-16 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-slate-900 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center border border-neutral-200 p-1">
              <img
                src="https://komuhost.vercel.app/favicon.ico"
                alt="Komu Forum"
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <span className="text-base font-semibold tracking-tight">Komu Forum</span>
          </Link>

          <button
            type="button"
            onClick={handleLaunchInstantRoom}
            className="px-4 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-colors whitespace-nowrap truncate cursor-pointer"
          >
            Start Meeting
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 lg:px-16 py-12 sm:py-16">
        <div className="max-w-6xl mx-auto space-y-16">
          <section className="space-y-4 max-w-3xl">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft size={13} />
              <span>Back to Home</span>
            </Link>
            <h1 className="text-3xl sm:text-5xl font-light text-slate-900 tracking-tight leading-tight">
              Every way teams run sessions on Komu Forum
            </h1>
            <p className="text-base text-slate-600 leading-relaxed">
              Explore structured guides, technical comparisons, and studio integrations for teams, educators, consultants, and live producers.
            </p>
          </section>

          {renderSection('Use Cases', 'Focused meeting workflows', useCases)}
          {renderSection('Comparisons', 'How Komu compares to legacy meeting tools', comparisons)}
          {renderSection('Integrations & Exports', 'Connect calendars, OBS, RTMP & transcripts', integrations)}
        </div>
      </main>
    </div>
  );
}
