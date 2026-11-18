import React, { useState } from 'react';
import { Link, useNavigate, useParams, Navigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Minus, Plus } from 'lucide-react';
import { findSeoPage, SeoCategory } from '../data/seoPages';
import { useDocumentSeo } from '../utils/useDocumentSeo';
import { cn } from '../lib/utils';

interface ProgrammaticSeoPageProps {
  category: SeoCategory;
}

export default function ProgrammaticSeoPage({ category }: ProgrammaticSeoPageProps) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const entry = findSeoPage(category, slug);

  useDocumentSeo({
    title: entry?.seoTitle || 'Komu Forum — Solutions & Workflows',
    description:
      entry?.metaDescription ||
      'Explore browser-first video meetings, whiteboards, and transcripts built for calm collaboration.',
    canonicalPath: entry ? `/${entry.category}/${entry.slug}` : '/solutions',
    keywords: entry?.keywords,
    jsonLd: entry
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Komu Forum',
            applicationCategory: 'CommunicationApplication',
            operatingSystem: 'Web Browser',
            url: `https://komu-forum.vercel.app/${entry.category}/${entry.slug}`,
            description: entry.metaDescription,
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'USD',
            },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              {
                '@type': 'ListItem',
                position: 1,
                name: 'Home',
                item: 'https://komu-forum.vercel.app/',
              },
              {
                '@type': 'ListItem',
                position: 2,
                name: 'Solutions',
                item: 'https://komu-forum.vercel.app/solutions',
              },
              {
                '@type': 'ListItem',
                position: 3,
                name: entry.headline,
                item: `https://komu-forum.vercel.app/${entry.category}/${entry.slug}`,
              },
            ],
          },
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: entry.faqs.map((faq) => ({
              '@type': 'Question',
              name: faq.q,
              acceptedAnswer: {
                '@type': 'Answer',
                text: faq.a,
              },
            })),
          },
        ]
      : undefined,
  });

  if (!entry) {
    return <Navigate to="/solutions" replace />;
  }

  const handleLaunchInstantRoom = () => {
    const code = Math.random().toString(36).substring(2, 10);
    try {
      localStorage.setItem(`forum_room_host_${code}`, 'true');
    } catch {}
    navigate(`/meeting/${code}`);
  };

  return (
    <div className="min-h-screen bg-[#FBFBFA] text-slate-900 font-sans flex flex-col">
      {/* Minimalist Top Bar */}
      <header className="sticky top-0 z-40 bg-[#FBFBFA]/90 backdrop-blur-md border-b border-neutral-200/70 px-6 lg:px-16 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Link
              to="/"
              className="flex items-center gap-2.5 text-slate-900 hover:opacity-80 transition-opacity shrink-0"
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
            <span className="text-neutral-300 hidden sm:inline">/</span>
            <Link
              to="/solutions"
              className="text-xs font-medium text-slate-500 hover:text-slate-900 hidden sm:inline whitespace-nowrap"
            >
              Solutions
            </Link>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <Link
              to="/solutions"
              className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 border border-neutral-200 rounded-xl bg-white transition-colors whitespace-nowrap truncate"
            >
              All Workflows
            </Link>
            <button
              type="button"
              onClick={handleLaunchInstantRoom}
              className="px-4 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-colors whitespace-nowrap truncate cursor-pointer"
            >
              Start Meeting
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 lg:px-16 py-12 sm:py-16">
        <div className="max-w-5xl mx-auto space-y-16">
          {/* Hero Section */}
          <section className="space-y-6">
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <Link to="/" className="hover:text-slate-900 transition-colors inline-flex items-center gap-1">
                <ArrowLeft size={13} />
                <span>Home</span>
              </Link>
              <span>·</span>
              <span>{entry.categoryLabel}</span>
              <span>·</span>
              <span className="text-slate-700 truncate">{entry.audience}</span>
            </div>

            <div className="space-y-4 max-w-3xl">
              <h1 className="text-3xl sm:text-5xl font-light text-slate-900 tracking-tight leading-[1.12]">
                {entry.headline}
              </h1>
              <p className="text-base sm:text-lg text-slate-600 leading-relaxed font-normal">
                {entry.summary}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleLaunchInstantRoom}
                className="px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-xl transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap truncate"
              >
                <span>Start Instant Room</span>
                <ArrowRight size={15} />
              </button>
              <Link
                to="/dashboard"
                className="px-5 py-3.5 bg-white hover:bg-stone-50 text-slate-800 border border-neutral-200 hover:border-slate-400 text-sm font-medium rounded-xl transition-colors whitespace-nowrap truncate"
              >
                Open Dashboard
              </Link>
            </div>
          </section>

          {/* Key Capabilities */}
          <section className="space-y-6">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Core Capabilities
              </p>
              <h2 className="text-2xl font-light text-slate-900 tracking-tight">
                Designed specifically for {entry.audience.toLowerCase()}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {entry.keyHighlights.map((item, idx) => (
                <article
                  key={idx}
                  className="bg-white rounded-2xl border border-neutral-200/70 p-6 sm:p-7 space-y-2.5"
                >
                  <div className="w-8 h-8 rounded-xl bg-stone-100 text-slate-800 flex items-center justify-center text-xs font-semibold">
                    0{idx + 1}
                  </div>
                  <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{item.detail}</p>
                </article>
              ))}
            </div>
          </section>

          {/* Workflow Walkthrough */}
          {entry.workflowSteps && entry.workflowSteps.length > 0 && (
            <section className="bg-white rounded-2xl border border-neutral-200/70 p-7 sm:p-10 space-y-6">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Step-by-Step Setup
                </p>
                <h2 className="text-2xl font-light text-slate-900 tracking-tight">
                  How this workflow runs in Komu Forum
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-2">
                {entry.workflowSteps.map((ws) => (
                  <div key={ws.step} className="space-y-2 border-t border-neutral-200/70 pt-4">
                    <span className="text-xs font-mono font-medium text-slate-400">{ws.step}</span>
                    <h3 className="text-sm font-semibold text-slate-900">{ws.title}</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">{ws.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Structured Comparison Matrix */}
          <section className="space-y-5">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Side-by-Side Specs
              </p>
              <h2 className="text-2xl font-light text-slate-900 tracking-tight">
                Practical differences in daily sessions
              </h2>
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200/70 overflow-hidden">
              <div className="grid grid-cols-12 border-b border-neutral-200/70 bg-stone-50/70 px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <div className="col-span-4">Capability</div>
                <div className="col-span-4 text-slate-900">
                  {entry.comparisonHeader?.left || 'Komu Forum'}
                </div>
                <div className="col-span-4">
                  {entry.comparisonHeader?.right || 'Alternative'}
                </div>
              </div>
              <div className="divide-y divide-neutral-200/60">
                {entry.comparisonRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-6 py-4 text-sm items-center"
                  >
                    <div className="sm:col-span-4 font-medium text-slate-900">{row.criterion}</div>
                    <div className="sm:col-span-4 flex items-start gap-2 text-slate-800">
                      <Check size={15} className="text-slate-900 shrink-0 mt-0.5" />
                      <span>{row.komuValue}</span>
                    </div>
                    <div className="sm:col-span-4 text-slate-500">{row.alternativeValue}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Frequently Asked Questions */}
          <section className="space-y-5">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Questions & Details
              </p>
              <h2 className="text-2xl font-light text-slate-900 tracking-tight">
                Frequently asked questions
              </h2>
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200/70 divide-y divide-neutral-200/60 px-6 sm:px-8">
              {entry.faqs.map((faq, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div key={idx} className="py-5">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      className="w-full flex items-center justify-between gap-4 text-left cursor-pointer"
                    >
                      <span className="text-sm sm:text-base font-medium text-slate-900">
                        {faq.q}
                      </span>
                      <span
                        className={cn(
                          'w-7 h-7 rounded-xl border flex items-center justify-center shrink-0 transition-colors',
                          isOpen
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-500 border-neutral-200'
                        )}
                      >
                        {isOpen ? <Minus size={14} /> : <Plus size={14} />}
                      </span>
                    </button>
                    {isOpen && (
                      <p className="pt-3 text-sm text-slate-600 leading-relaxed max-w-3xl">
                        {faq.a}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Related Guides */}
          <section className="pt-4 border-t border-neutral-200/70 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Related Workflows
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {entry.relatedSlugs.map((rel) => (
                <Link
                  key={`${rel.category}/${rel.slug}`}
                  to={`/${rel.category}/${rel.slug}`}
                  className="p-4 bg-white rounded-2xl border border-neutral-200/70 hover:border-slate-400 transition-colors flex items-center justify-between gap-2"
                >
                  <span className="text-sm font-medium text-slate-900 truncate">{rel.label}</span>
                  <ArrowRight size={14} className="text-slate-400 shrink-0" />
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-neutral-200/70 bg-white py-8 px-6 lg:px-16">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <span>Komu Forum — Browser Video Meetings & Collaborative Workspace</span>
          <div className="flex items-center gap-5">
            <Link to="/" className="hover:text-slate-900 transition-colors">Home</Link>
            <Link to="/solutions" className="hover:text-slate-900 transition-colors">Solutions</Link>
            <Link to="/dashboard" className="hover:text-slate-900 transition-colors">Dashboard</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
