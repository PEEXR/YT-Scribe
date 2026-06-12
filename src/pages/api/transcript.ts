import type { APIRoute } from 'astro';
import { YoutubeTranscript, YoutubeTranscriptDisabledError, YoutubeTranscriptNotAvailableError, YoutubeTranscriptTooManyRequestError } from 'youtube-transcript';

export const prerender = false;

interface LanguageInfo {
  code: string;
  name: string;
}

async function getAvailableLanguages(videoId: string): Promise<LanguageInfo[]> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)',
      },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const match = html.match(/ytInitialPlayerResponse\s*=\s*({.*?});/);
    if (!match) return [];
    const data = JSON.parse(match[1]);
    const captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(captionTracks)) return [];
    const seen = new Set<string>();
    return captionTracks
      .filter((t: any) => {
        if (seen.has(t.languageCode)) return false;
        seen.add(t.languageCode);
        return true;
      })
      .map((t: any) => ({ code: t.languageCode, name: t.name?.simpleText || t.languageCode }));
  } catch {
    return [];
  }
}

function extractVideoId(url: string): string | null {
  const regexes = [
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/,
    /youtube\.com\/shorts\/([^"&?\/ ]{11})/,
    /youtube\.com\/live\/([^"&?\/ ]{11})/,
    /youtube\.com\/embed\/([^"&?\/ ]{11})/
  ];
  for (const regex of regexes) {
    const match = url.match(regex);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

async function fetchVideoTitle(videoId: string): Promise<string> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (res.ok) {
      const data = await res.json();
      return data.title?.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'") || 'YouTube Video';
    }
  } catch {}
  return 'YouTube Video';
}

export const POST: APIRoute = async ({ request }) => {
  try {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON request body.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { url, lang } = body;
    if (!url) {
      return new Response(JSON.stringify({ error: 'Missing "url" parameter in request body.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const videoId = extractVideoId(url.trim());
    if (!videoId) {
      return new Response(JSON.stringify({ error: 'Could not extract a valid 11-character YouTube video ID. Please check the URL format.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const availableLanguages = await getAvailableLanguages(videoId);

    const config = lang ? { lang } : undefined;
    const transcriptLines = await YoutubeTranscript.fetchTranscript(videoId, config);

    let lines = transcriptLines.map(line => ({
      text: line.text,
      start: line.offset,
      duration: line.duration,
    }));

    // Normalize ms to seconds (youtube-transcript returns ms for srv3 format)
    if (lines.length > 0 && lines[0].duration > 100) {
      lines = lines.map(l => ({ ...l, start: l.start / 1000, duration: l.duration / 1000 }));
    }

    const title = await fetchVideoTitle(videoId);

    const languageCode = transcriptLines[0]?.lang || 'en';
    const languageName = availableLanguages.find(l => l.code === languageCode)?.name || languageCode;

    return new Response(JSON.stringify({
      videoId,
      title,
      languageCode,
      languageName,
      lines,
      availableLanguages,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('API Error:', error);
    let message = error.message || 'An unexpected error occurred during transcript retrieval.';
    message = message.replace(/^\[YoutubeTranscript\] 🚨 /, '');

    if (error instanceof YoutubeTranscriptDisabledError) {
      return new Response(JSON.stringify({
        error: message,
        type: 'TRANSCRIPT_DISABLED',
        detail: 'This video does not have captions or transcripts available. The uploader may have disabled them.',
      }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    if (error instanceof YoutubeTranscriptNotAvailableError) {
      return new Response(JSON.stringify({
        error: message,
        type: 'TRANSCRIPT_NOT_AVAILABLE',
        detail: 'No transcript tracks were found for this video.',
      }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    if (error instanceof YoutubeTranscriptTooManyRequestError) {
      return new Response(JSON.stringify({
        error: message,
        type: 'RATE_LIMITED',
        detail: 'YouTube is rate-limiting requests. Please wait a moment and try again.',
      }), { status: 429, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: message, type: 'UNKNOWN' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
