import type { APIRoute } from 'astro';
import { YoutubeTranscript, YoutubeTranscriptDisabledError, YoutubeTranscriptNotAvailableError, YoutubeTranscriptTooManyRequestError } from 'youtube-transcript';

export const prerender = false;

interface LanguageInfo {
  code: string;
  name: string;
}

async function getAvailableLanguages(videoId: string): Promise<LanguageInfo[]> {
  // Strategy 1: InnerTube API (most reliable, used by the library)
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; Android 13)',
      },
      body: JSON.stringify({
        context: {
          client: { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 33, hl: 'en', gl: 'US' },
        },
        videoId,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      const tracks = json?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(tracks) && tracks.length > 0) {
        const seen = new Set<string>();
        return tracks
          .filter((t: any) => { if (seen.has(t.languageCode)) return false; seen.add(t.languageCode); return true; })
          .map((t: any) => ({ code: t.languageCode, name: t.name?.simpleText || t.languageCode }));
      }
    }
  } catch (e) { console.error('InnerTube languages failed:', e); }

  // Strategy 2: HTML scraping via "captionTracks": direct JSON array
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)',
      },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const idx = html.indexOf('"captionTracks":');
    if (idx !== -1) {
      const start = idx + '"captionTracks":'.length;
      let depth = 0;
      let end = start;
      let found = false;
      for (let i = start; i < html.length; i++) {
        if (html[i] === '[') { depth++; found = true; }
        else if (html[i] === ']') { depth--; if (found && depth === 0) { end = i + 1; break; } }
      }
      if (found && depth === 0) {
        const tracks = JSON.parse(html.slice(start, end));
        if (Array.isArray(tracks) && tracks.length > 0) {
          const seen = new Set<string>();
          return tracks
            .filter((t: any) => { if (seen.has(t.languageCode)) return false; seen.add(t.languageCode); return true; })
            .map((t: any) => ({ code: t.languageCode, name: t.name?.simpleText || t.languageCode }));
        }
      }
    }
  } catch (e) { console.error('HTML captionTracks failed:', e); }

  // Strategy 3: HTML scraping via ytInitialPlayerResponse
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)',
      },
    });
    if (!res.ok) return [];
    const html = await res.text();

    const prefixes = ['var ytInitialPlayerResponse = ', 'window.ytInitialPlayerResponse = '];
    let jsonStr: string | null = null;
    for (const prefix of prefixes) {
      const si = html.indexOf(prefix);
      if (si === -1) continue;
      const js = si + prefix.length;
      let depth = 0;
      for (let i = js; i < html.length; i++) {
        if (html[i] === '{') depth++;
        else if (html[i] === '}') { depth--; if (depth === 0) { jsonStr = html.slice(js, i + 1); break; } }
      }
      if (jsonStr) break;
    }
    if (!jsonStr) return [];

    const data = JSON.parse(jsonStr);
    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(tracks) || tracks.length === 0) return [];

    const seen = new Set<string>();
    return tracks
      .filter((t: any) => { if (seen.has(t.languageCode)) return false; seen.add(t.languageCode); return true; })
      .map((t: any) => ({ code: t.languageCode, name: t.name?.simpleText || t.languageCode }));
  } catch (e) { console.error('ytInitialPlayerResponse failed:', e); }

  return [];
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
