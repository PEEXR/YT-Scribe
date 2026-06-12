import type { APIRoute } from 'astro';

export const prerender = false;

// Robust parsing of YouTube Video ID from different URL types
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

    const { url } = body;
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

    // 1. Fetch YouTube Video Page
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Failed to load YouTube page: ${response.statusText}` }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const html = await response.text();

    // 2. Extract Title from metadata tags
    const titleMatch = html.match(/<meta\s+name="title"\s+content="([^"]+)"/i) || 
                       html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) || 
                       html.match(/<title>([^<]+)<\/title>/i);
    let title = titleMatch ? titleMatch[1] : 'YouTube Video';
    title = title.replace(' - YouTube', '').trim();
    title = title
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // 3. Find captionTracks in the page HTML
    const captionTracksIndex = html.indexOf('"captionTracks":');
    if (captionTracksIndex === -1) {
      return new Response(JSON.stringify({ 
        error: 'No transcripts found for this video. Captions/subtitles are likely disabled or unavailable.' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Bracket-balance logic to extract the JSON array matching the key "captionTracks"
    const jsonStrMatch = html.match(/"captionTracks":(\[[^]*?\])/);
    if (!jsonStrMatch) {
      return new Response(JSON.stringify({ error: 'Failed to extract transcript details. YouTube page layout might have changed.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const jsonStr = jsonStrMatch[1];
    let captionTracks;
    try {
      captionTracks = JSON.parse(jsonStr);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Failed to extract transcript details. YouTube page layout might have changed.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!captionTracks || captionTracks.length === 0) {
      return new Response(JSON.stringify({ error: 'No subtitles/transcripts available for this video.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Select the best caption track:
    // Try English manual first, then English auto-generated, then any manual, then first available
    let selectedTrack = captionTracks.find((track: any) => track.languageCode === 'en' && !track.kind);
    if (!selectedTrack) {
      selectedTrack = captionTracks.find((track: any) => track.languageCode === 'en');
    }
    if (!selectedTrack) {
      selectedTrack = captionTracks.find((track: any) => !track.kind);
    }
    if (!selectedTrack) {
      selectedTrack = captionTracks[0];
    }

    const baseUrl = selectedTrack.baseUrl;
    if (!baseUrl) {
      return new Response(JSON.stringify({ error: 'Transcript source URL is missing.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 5. Fetch the actual timed caption JSON using fmt=json3
    const urlObj = new URL(baseUrl);
    urlObj.searchParams.set('fmt', 'json3');

    const transcriptResponse = await fetch(urlObj.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });

    if (!transcriptResponse.ok) {
      return new Response(JSON.stringify({ error: 'Failed to download transcript tracks from YouTube.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const transcriptData = await transcriptResponse.json();
    if (!transcriptData.events || transcriptData.events.length === 0) {
      return new Response(JSON.stringify({ error: 'Transcript contains no caption events.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 6. Format the events into start time, duration, and clean text
    const lines = transcriptData.events
      .map((event: any) => {
        const startMs = event.tStartMs || 0;
        const durationMs = event.dDurationMs || 0;
        const text = event.segs ? event.segs.map((seg: any) => seg.utf8 || '').join('') : '';

        if (!text.trim()) return null;

        return {
          text: text.replace(/\s+/g, ' ').trim(),
          start: startMs / 1000,
          duration: durationMs / 1000,
        };
      })
      .filter((line: any) => line !== null);

    return new Response(JSON.stringify({
      videoId,
      title,
      languageCode: selectedTrack.languageCode,
      languageName: selectedTrack.name?.simpleText || selectedTrack.languageCode,
      lines,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred during transcript retrieval.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
