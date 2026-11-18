import { useEffect } from 'react';

export interface DocumentSeoConfig {
  title: string;
  description: string;
  canonicalPath: string;
  keywords?: string[];
  jsonLd?: Record<string, any> | Record<string, any>[];
}

const SITE_ORIGIN = 'https://komu-forum.vercel.app';
const DEFAULT_TITLE = 'Komu Forum — Video Meetings, Whiteboards & Transcripts';
const DEFAULT_DESCRIPTION =
  'Encrypted browser video meetings with real-time whiteboards, speaker transcripts, isolated OBS feeds, and calendar scheduling.';

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(url: string) {
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', url);
}

export function useDocumentSeo({
  title,
  description,
  canonicalPath,
  keywords,
  jsonLd,
}: DocumentSeoConfig) {
  useEffect(() => {
    const cleanPath = canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`;
    const fullUrl = `${SITE_ORIGIN}${cleanPath}`;

    document.title = title;
    upsertMeta('name', 'description', description);
    if (keywords && keywords.length > 0) {
      upsertMeta('name', 'keywords', keywords.join(', '));
    }
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:url', fullUrl);
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:url', fullUrl);
    upsertCanonical(fullUrl);

    const scriptId = 'komu-dynamic-jsonld';
    let scriptEl = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (jsonLd) {
      if (!scriptEl) {
        scriptEl = document.createElement('script');
        scriptEl.id = scriptId;
        scriptEl.type = 'application/ld+json';
        document.head.appendChild(scriptEl);
      }
      scriptEl.textContent = JSON.stringify(jsonLd);
    } else if (scriptEl) {
      scriptEl.remove();
    }

    return () => {
      document.title = DEFAULT_TITLE;
      upsertMeta('name', 'description', DEFAULT_DESCRIPTION);
      upsertMeta('property', 'og:title', DEFAULT_TITLE);
      upsertMeta('property', 'og:description', DEFAULT_DESCRIPTION);
      upsertMeta('property', 'og:url', `${SITE_ORIGIN}/`);
      upsertMeta('name', 'twitter:title', DEFAULT_TITLE);
      upsertMeta('name', 'twitter:description', DEFAULT_DESCRIPTION);
      upsertMeta('name', 'twitter:url', `${SITE_ORIGIN}/`);
      upsertCanonical(`${SITE_ORIGIN}/`);
      const existing = document.getElementById(scriptId);
      if (existing) existing.remove();
    };
  }, [title, description, canonicalPath, JSON.stringify(keywords), JSON.stringify(jsonLd)]);
}
