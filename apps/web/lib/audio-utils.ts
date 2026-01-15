/**
 * Gets the duration of an audio file in seconds.
 * Returns null if duration cannot be determined.
 */
export async function getAudioDuration(audioData: Blob | File | ArrayBuffer): Promise<number | null> {
  try {
    const blob = audioData instanceof ArrayBuffer ? new Blob([audioData]) : audioData;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    // Check if duration is already available
    if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
      URL.revokeObjectURL(url);
      return audio.duration;
    }

    // Wait for metadata to load
    return new Promise<number | null>((resolve) => {
      const timeout = setTimeout(() => {
        URL.revokeObjectURL(url);
        // Fallback: estimate based on file size if metadata doesn't load
        // Rough estimate: ~1 second per 16KB for MP3
        const size = blob instanceof File ? blob.size : (blob as Blob).size;
        const estimatedDuration = Math.max(3, size / 16384);
        resolve(estimatedDuration);
      }, 3000); // 3 second timeout

      audio.onloadedmetadata = () => {
        clearTimeout(timeout);
        const duration = audio.duration;
        URL.revokeObjectURL(url);
        if (duration && !isNaN(duration) && isFinite(duration) && duration > 0) {
          resolve(duration);
        } else {
          resolve(null);
        }
      };

      audio.onerror = () => {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        resolve(null);
      };

      // Try to load the audio
      audio.load();
    });
  } catch (error) {
    console.error('Error getting audio duration:', error);
    return null;
  }
}
