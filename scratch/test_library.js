import { YoutubeTranscript } from '@danielxceron/youtube-transcript';

async function test() {
  try {
    console.log("Fetching transcript using @danielxceron/youtube-transcript...");
    const transcript = await YoutubeTranscript.fetchTranscript('dQw4w9WgXcQ');
    console.log("Success!");
    console.log("Total lines:", transcript.length);
    console.log("First 3 lines:", transcript.slice(0, 3));
  } catch (err) {
    console.error("Library failed:", err);
  }
}

test();
