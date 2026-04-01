// constants.ts
export const MODEL_NAME = 'gpt-4o';
// Azure Voice Live expects 24kHz PCM16 mono for streaming audio.
// Keep the worklet target sample rate aligned with that.
export const TARGET_SAMPLE_RATE = 24000;
export const WORKLET_BUFFER_SIZE = 2048; // Number of 24kHz samples the worklet buffers before sending
export const IMAGE_SEND_INTERVAL_MS = 1000; // Send image every 1 second
export const IMAGE_UPDATE_INTERVAL = IMAGE_SEND_INTERVAL_MS; // Video to image update rate
export const FIFTEEN_HUNDRED_MS = 1500;
export const ONE_SECOND = 1000;
export const ONE_MINUTE = 60 * 1000;
export const ONE_HOUR = 60 * ONE_MINUTE;
export const NINETY_MINUTES = 90 * ONE_MINUTE;
export const FIVE_MINUTES = 5 * ONE_MINUTE;
export const EIGHT_MINUTES = 8 * ONE_MINUTE;
export const TEN_MINUTES = 10 * ONE_MINUTE;
export const FIVE_SECONDS = 5 * 1000;
export const TEN_SECONDS = 10 * 1000;
export const TWENTY_SECONDS = 20 * 1000;
export const THIRTY_SECONDS = 30 * 1000;
export const NO_TIMEOUT = 100000000;
export const ANIMATION_DURATION = 1000;
export const OUTPUT_TRANSCRIPTION_TIMEOUT = 5000;
export const PROFILES_URL = '/assets/profiles';
export const SESSION_EXPIRATION = NINETY_MINUTES;
export const SPLASH_FONT_EXPANDED = 60;
