const videoId = 'dQw4w9WgXcQ'; // Rickroll video

async function testInnerTube() {
  try {
    console.log(`\n=== Testing InnerTube API ===`);
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; Android 13)'
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '19.09.37',
            androidSdkVersion: 33,
            hl: 'en',
            gl: 'US'
          }
        },
        videoId: videoId,
      }),
    };

    const res = await fetch('https://www.youtube.com/youtubei/v1/player', options);
    console.log(`InnerTube status: ${res.status} ${res.statusText}`);
    const json = await res.json();
    const captions = json?.captions?.playerCaptionsTracklistRenderer;
    
    if (!captions) {
      console.log('No captions in InnerTube response. Keys in response:', Object.keys(json));
      return;
    }
    
    console.log('Found caption tracks in InnerTube:', captions.captionTracks.map(t => ({ lang: t.languageCode, name: t.name?.simpleText })));
    const selectedTrack = captions.captionTracks.find(t => t.languageCode === 'en') || captions.captionTracks[0];
    
    console.log(`Fetching from InnerTube baseUrl: ${selectedTrack.baseUrl.substring(0, 100)}...`);
    const transcriptRes = await fetch(selectedTrack.baseUrl, {
      headers: {
        'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; Android 13)'
      }
    });
    
    console.log(`Transcript status: ${transcriptRes.status} ${transcriptRes.statusText}`);
    const text = await transcriptRes.text();
    console.log(`Transcript content length: ${text.length}`);
    console.log(`First 300 chars: ${text.substring(0, 300)}`);
  } catch (err) {
    console.error('InnerTube test failed:', err);
  }
}

async function testTimedTextUserAgents() {
  try {
    console.log(`\n=== Testing Web Scraping + User Agents ===`);
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    const html = await response.text();
    const index = html.indexOf('"captionTracks":');
    if (index === -1) {
      console.log('captionTracks not found in HTML');
      return;
    }

    const start = index + '"captionTracks":'.length;
    let bracketCount = 0;
    let end = start;
    let foundStart = false;

    while (end < html.length) {
      const char = html[end];
      if (char === '[') {
        bracketCount++;
        foundStart = true;
      } else if (char === ']') {
        bracketCount--;
        if (foundStart && bracketCount === 0) {
          end++;
          break;
        }
      }
      end++;
    }

    const jsonStr = html.slice(start, end).trim();
    const captionTracks = JSON.parse(jsonStr);
    const selectedTrack = captionTracks.find(t => t.languageCode === 'en') || captionTracks[0];
    
    const uas = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)',
      'com.google.android.youtube/19.09.37 (Linux; Android 13)',
      '', // No User Agent
    ];

    for (const ua of uas) {
      console.log(`\nFetching timedtext with UA: "${ua}"`);
      const headers = ua ? { 'User-Agent': ua } : {};
      const res = await fetch(selectedTrack.baseUrl, { headers });
      const text = await res.text();
      console.log(`Status: ${res.status}, Length: ${text.length}`);
      if (text.length > 0) {
        console.log(`Success with UA! First 100 chars: ${text.substring(0, 100)}`);
        break;
      }
    }

  } catch (err) {
    console.error('TimedText user agent test failed:', err);
  }
}

async function run() {
  await testInnerTube();
  await testTimedTextUserAgents();
}

run();
