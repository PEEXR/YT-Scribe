const https = require('https');

const videoId = 'dQw4w9WgXcQ';
const videoUrl = 'https://www.youtube.com/watch?v=' + videoId;

const options = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
  }
};

https.get(videoUrl, options, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', JSON.stringify(res.headers, null, 2));
  
  let html = '';
  res.on('data', (chunk) => {
    html += chunk;
  });
  
  res.on('end', () => {
    console.log('HTML length:', html.length);
    console.log('First 1000 chars:', html.substring(0, 1000));
    
    const captionTracksIndex = html.indexOf('"captionTracks":');
    console.log('captionTracks index:', captionTracksIndex);
    
    if (captionTracksIndex === -1) {
      console.log('captionTracks not found in HTML');
      return;
    }
    
    const start = captionTracksIndex + '"captionTracks":'.length;
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
    console.log('Extracted JSON string length:', jsonStr.length);
    console.log('First 500 chars of JSON:', jsonStr.substring(0, 500));
    
    try {
      const captionTracks = JSON.parse(jsonStr);
      console.log('Successfully parsed JSON. Caption tracks:', captionTracks.length);
    } catch (e) {
      console.log('JSON Parse Error:', e.message);
      console.log('Error at position:', e.at ? e.at : 'unknown');
      console.log('JSON string:', jsonStr);
    }
  });
});