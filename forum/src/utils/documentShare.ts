import * as pdfjsLib from 'pdfjs-dist';
import { db } from '../firebase';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
}

export interface StageDocumentPageData {
  pageNumber: number;
  kind: 'image' | 'text';
  imageUrl?: string;
  heading?: string;
  text?: string;
}

export interface StageDocumentState {
  docId: string;
  title: string;
  sourceType: 'pages' | 'embed';
  totalPages: number;
  currentPage: number;
  embedUrl?: string;
  embedProvider?: 'google-slides' | 'google-docs' | 'google-drive' | 'pdf' | 'canva' | 'figma' | 'web';
  externalUrl?: string;
  inlinePages?: StageDocumentPageData[];
  pageStorage?: 'inline' | 'firestore';
}

// Fast client-side cache for rendered document pages: key = `${docId}:${pageNumber}`
const localPageCache = new Map<string, StageDocumentPageData>();

export function cacheDocumentPagesLocally(docId: string, pages: StageDocumentPageData[]) {
  for (const page of pages) {
    localPageCache.set(`${docId}:${page.pageNumber}`, page);
  }
}

export function getCachedDocumentPage(docId: string, pageNumber: number): StageDocumentPageData | null {
  return localPageCache.get(`${docId}:${pageNumber}`) || null;
}

export async function saveDocumentPagesToFirestore(
  roomId: string,
  docId: string,
  pages: StageDocumentPageData[]
): Promise<void> {
  cacheDocumentPagesLocally(docId, pages);
  if (!roomId || !docId || pages.length === 0) return;

  const batchSize = 4;
  for (let i = 0; i < pages.length; i += batchSize) {
    const chunk = pages.slice(i, i + batchSize);
    await Promise.all(
      chunk.map((page) =>
        setDoc(
          doc(db, 'rooms', roomId, 'stageDocs', docId, 'pages', String(page.pageNumber)),
          {
            pageNumber: page.pageNumber,
            kind: page.kind,
            imageUrl: page.imageUrl || null,
            heading: page.heading || null,
            text: page.text || null,
          }
        )
      )
    );
  }
}

export async function fetchDocumentPage(
  roomId: string,
  docId: string,
  pageNumber: number
): Promise<StageDocumentPageData | null> {
  const cached = getCachedDocumentPage(docId, pageNumber);
  if (cached) return cached;
  if (!roomId || !docId) return null;

  try {
    const snap = await getDoc(
      doc(db, 'rooms', roomId, 'stageDocs', docId, 'pages', String(pageNumber))
    );
    if (snap.exists()) {
      const data = snap.data() as StageDocumentPageData;
      const normalized: StageDocumentPageData = {
        pageNumber: data.pageNumber || pageNumber,
        kind: data.kind || 'image',
        imageUrl: data.imageUrl || undefined,
        heading: data.heading || undefined,
        text: data.text || undefined,
      };
      localPageCache.set(`${docId}:${pageNumber}`, normalized);
      return normalized;
    }
  } catch {}
  return null;
}

export async function preloadAllDocumentPages(
  roomId: string,
  docId: string
): Promise<void> {
  if (!roomId || !docId) return;
  try {
    const snap = await getDocs(collection(db, 'rooms', roomId, 'stageDocs', docId, 'pages'));
    snap.forEach((d) => {
      const data = d.data() as StageDocumentPageData;
      const pNum = Number(data.pageNumber || d.id);
      if (pNum > 0) {
        localPageCache.set(`${docId}:${pNum}`, {
          pageNumber: pNum,
          kind: data.kind || 'image',
          imageUrl: data.imageUrl || undefined,
          heading: data.heading || undefined,
          text: data.text || undefined,
        });
      }
    });
  } catch {}
}

function encodeCanvasUnderBudget(canvas: HTMLCanvasElement, maxChars = 145_000): string {
  let quality = 0.84;
  let result = canvas.toDataURL('image/jpeg', quality);
  while (result.length > maxChars && quality > 0.42) {
    quality -= 0.1;
    result = canvas.toDataURL('image/jpeg', quality);
  }
  if (result.length > maxChars) {
    const scaled = document.createElement('canvas');
    scaled.width = Math.max(480, Math.round(canvas.width * 0.72));
    scaled.height = Math.max(270, Math.round(canvas.height * 0.72));
    const sctx = scaled.getContext('2d');
    if (sctx) {
      sctx.fillStyle = '#ffffff';
      sctx.fillRect(0, 0, scaled.width, scaled.height);
      sctx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
      result = scaled.toDataURL('image/jpeg', 0.72);
    }
  }
  return result;
}

async function renderPdfBufferToPages(
  buffer: ArrayBuffer,
  maxPages = 40,
  onProgress?: (rendered: number, total: number) => void
): Promise<StageDocumentPageData[]> {
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const total = Math.min(pdf.numPages, maxPages);
  const pages: StageDocumentPageData[] = [];

  for (let p = 1; p <= total; p++) {
    const page = await pdf.getPage(p);
    const baseViewport = page.getViewport({ scale: 1 });
    const targetMaxWidth = 1280;
    const scale = Math.min(2.2, Math.max(1, targetMaxWidth / Math.max(1, baseViewport.width)));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    } as any).promise;

    const imageUrl = encodeCanvasUnderBudget(canvas);
    pages.push({
      pageNumber: p,
      kind: 'image',
      imageUrl,
    });
    onProgress?.(p, total);
  }

  return pages;
}

function readImageFileAsPage(file: File, pageNumber: number): Promise<StageDocumentPageData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error(`Invalid image: ${file.name}`));
      img.onload = () => {
        const maxSide = 1280;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ pageNumber, kind: 'image', imageUrl: String(reader.result) });
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({
          pageNumber,
          kind: 'image',
          imageUrl: encodeCanvasUnderBudget(canvas),
        });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function paginateTextContent(title: string, rawText: string): StageDocumentPageData[] {
  const normalized = rawText.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [{ pageNumber: 1, kind: 'text', heading: title, text: '(Empty document)' }];
  }

  const lines = normalized.split('\n');
  const linesPerSlide = 14;
  const pages: StageDocumentPageData[] = [];

  for (let i = 0; i < lines.length; i += linesPerSlide) {
    const slice = lines.slice(i, i + linesPerSlide).join('\n').trim();
    if (slice) {
      pages.push({
        pageNumber: pages.length + 1,
        kind: 'text',
        heading: title,
        text: slice,
      });
    }
  }

  return pages.length > 0
    ? pages
    : [{ pageNumber: 1, kind: 'text', heading: title, text: normalized }];
}

export async function processUploadedDocuments(
  files: FileList | File[],
  roomId: string,
  onProgress?: (status: string) => void
): Promise<StageDocumentState> {
  const fileArr = Array.from(files);
  if (fileArr.length === 0) {
    throw new Error('No file selected.');
  }

  const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const primary = fileArr[0];
  const lowerName = primary.name.toLowerCase();

  let pages: StageDocumentPageData[] = [];
  let title = primary.name;

  if (fileArr.length === 1 && (primary.type === 'application/pdf' || lowerName.endsWith('.pdf'))) {
    onProgress?.('Reading PDF document…');
    const buffer = await primary.arrayBuffer();
    pages = await renderPdfBufferToPages(buffer, 40, (done, total) => {
      onProgress?.(`Preparing page ${done} of ${total}…`);
    });
  } else if (fileArr.every((f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(f.name))) {
    title = fileArr.length > 1 ? `${fileArr[0].name} (+${fileArr.length - 1} slides)` : primary.name;
    onProgress?.(`Preparing ${fileArr.length} slide${fileArr.length > 1 ? 's' : ''}…`);
    pages = await Promise.all(fileArr.map((f, idx) => readImageFileAsPage(f, idx + 1)));
  } else if (
    fileArr.length === 1 &&
    (primary.type.startsWith('text/') || /\.(txt|md|markdown|csv|json|log)$/i.test(lowerName))
  ) {
    onProgress?.('Formatting document pages…');
    const text = await primary.text();
    pages = paginateTextContent(primary.name, text);
  } else {
    throw new Error(
      'Supported uploads: PDF (.pdf), slide images (.png, .jpg, .webp), or text/markdown (.txt, .md, .csv). For PowerPoint/Keynote, export to PDF or paste a Google Slides / Canva link.'
    );
  }

  if (pages.length === 0) {
    throw new Error('Could not extract any pages from this file.');
  }

  onProgress?.('Syncing pages to room…');
  await saveDocumentPagesToFirestore(roomId, docId, pages);

  return {
    docId,
    title,
    sourceType: 'pages',
    totalPages: pages.length,
    currentPage: 1,
    pageStorage: 'firestore',
    inlinePages: pages.slice(0, 2), // first page cached immediately
  };
}

export async function processDocumentLink(
  rawUrl: string,
  roomId: string,
  onProgress?: (status: string) => void
): Promise<StageDocumentState> {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('Please paste a document or presentation link.');
  }

  const normalizedUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    throw new Error('Please enter a valid http:// or https:// URL.');
  }

  const docId = `link_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const href = parsed.toString();

  // 1. Direct PDF link — attempt native client-side PDF rendering first so Next/Back arrows work seamlessly
  if (/\.pdf(\?|$|#)/i.test(parsed.pathname)) {
    try {
      onProgress?.('Fetching PDF from link…');
      const res = await fetch(href);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const pages = await renderPdfBufferToPages(buf, 40, (done, total) => {
          onProgress?.(`Rendering PDF page ${done} of ${total}…`);
        });
        if (pages.length > 0) {
          await saveDocumentPagesToFirestore(roomId, docId, pages);
          const fileName = decodeURIComponent(parsed.pathname.split('/').pop() || 'Shared PDF');
          return {
            docId,
            title: fileName,
            sourceType: 'pages',
            totalPages: pages.length,
            currentPage: 1,
            externalUrl: href,
            pageStorage: 'firestore',
            inlinePages: pages.slice(0, 2),
          };
        }
      }
    } catch {
      // CORS blocked direct fetch; gracefully fall through to embedded PDF viewer
    }

    return {
      docId,
      title: decodeURIComponent(parsed.pathname.split('/').pop() || 'PDF Document'),
      sourceType: 'embed',
      totalPages: 1,
      currentPage: 1,
      embedUrl: `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(href)}`,
      embedProvider: 'pdf',
      externalUrl: href,
    };
  }

  // 2. Google Slides
  const slidesMatch = href.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/i);
  if (slidesMatch) {
    const id = slidesMatch[1];
    return {
      docId,
      title: 'Google Slides Presentation',
      sourceType: 'embed',
      totalPages: 1,
      currentPage: 1,
      embedUrl: `https://docs.google.com/presentation/d/${id}/embed?start=false&loop=false&delayms=3000`,
      embedProvider: 'google-slides',
      externalUrl: href,
    };
  }

  // 3. Google Docs
  const docsMatch = href.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/i);
  if (docsMatch) {
    const id = docsMatch[1];
    return {
      docId,
      title: 'Google Document',
      sourceType: 'embed',
      totalPages: 1,
      currentPage: 1,
      embedUrl: `https://docs.google.com/document/d/${id}/preview`,
      embedProvider: 'google-docs',
      externalUrl: href,
    };
  }

  // 4. Google Sheets
  const sheetsMatch = href.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/i);
  if (sheetsMatch) {
    const id = sheetsMatch[1];
    return {
      docId,
      title: 'Google Sheet',
      sourceType: 'embed',
      totalPages: 1,
      currentPage: 1,
      embedUrl: `https://docs.google.com/spreadsheets/d/${id}/preview`,
      embedProvider: 'google-docs',
      externalUrl: href,
    };
  }

  // 5. Google Drive File
  const driveMatch = href.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (driveMatch) {
    const id = driveMatch[1];
    return {
      docId,
      title: 'Google Drive Document',
      sourceType: 'embed',
      totalPages: 1,
      currentPage: 1,
      embedUrl: `https://drive.google.com/file/d/${id}/preview`,
      embedProvider: 'google-drive',
      externalUrl: href,
    };
  }

  // 6. Canva
  if (/canva\.com\/design\//i.test(href)) {
    const cleanBase = href.split('?')[0].replace(/\/(edit|view).*$/, '/view');
    return {
      docId,
      title: 'Canva Presentation',
      sourceType: 'embed',
      totalPages: 1,
      currentPage: 1,
      embedUrl: `${cleanBase}?embed`,
      embedProvider: 'canva',
      externalUrl: href,
    };
  }

  // 7. Figma
  if (/figma\.com\/(file|design|proto|slides)\//i.test(href)) {
    return {
      docId,
      title: 'Figma Presentation',
      sourceType: 'embed',
      totalPages: 1,
      currentPage: 1,
      embedUrl: `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(href)}`,
      embedProvider: 'figma',
      externalUrl: href,
    };
  }

  // 8. Generic web link or direct image URL
  if (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(parsed.pathname)) {
    return {
      docId,
      title: decodeURIComponent(parsed.pathname.split('/').pop() || 'Shared Slide'),
      sourceType: 'pages',
      totalPages: 1,
      currentPage: 1,
      pageStorage: 'inline',
      inlinePages: [{ pageNumber: 1, kind: 'image', imageUrl: href }],
      externalUrl: href,
    };
  }

  return {
    docId,
    title: parsed.hostname.replace(/^www\./, ''),
    sourceType: 'embed',
    totalPages: 1,
    currentPage: 1,
    embedUrl: href,
    embedProvider: 'web',
    externalUrl: href,
  };
}
