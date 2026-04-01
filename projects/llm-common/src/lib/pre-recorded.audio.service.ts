import { Injectable } from '@angular/core';
import { ONE_SECOND } from './constants';
import { defaultProfile, IProfile } from './interfaces';
// Using ElevenLabs
// https://gemini.google.com/app/223b48b60bc0ff24
@Injectable({ providedIn: 'root' })
export class PreRecordedAudioService {
  private profile = defaultProfile;
  private _isPlayingUserAudio = false;
  private audioContext!: AudioContext;
  private fileIndex: number = 0;
  private currentSource: AudioBufferSourceNode | null = null;
  private gainNode!: GainNode;
  private analyserNode!: AnalyserNode;
  private levelDataArray: Uint8Array | null = null;
  private levelDetectionLoopRunning = false;

  public onLevelChange: ((level: number) => void) | null = null;

  constructor() {}

  public initialize(profile: IProfile) {
    this.profile = profile;
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.gainNode = this.audioContext.createGain();
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.levelDataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.gainNode.gain.value = this.profile.simVolume;
    this.gainNode.connect(this.audioContext.destination);
    this.analyserNode.connect(this.gainNode);
    this.startLevelDetectionLoop();
  }

  get isPlayingPreRecorded() {
    return this._isPlayingUserAudio;
  }

  /**
   * Sets the internal playing state for the audio interface.
   * @param isPlaying True when audio playback has started, false when stopped.
   */

  set gainValue(gain: number) {
    if (this.gainNode) {
      this.gainNode.gain.value = gain;
    }
  }

  /**
   * Sets the gain (volume) value applied to simulated audio playback.
   * @param gain A number between 0.0 and 1.0 representing the gain.
   */

  get gainValue() {
    return this.gainNode.gain.value;
  }

  /**
   * Gets the current gain (volume) applied to simulated audio playback.
   * @returns The current gain value (0.0 - 1.0).
   */

  resetAudioIndex() {
    this.fileIndex = 0;
  }

  /**
   * Resets the internal audio playback index to the first file.
   */

  private async getAudioArrayFromFile(fileName: string): Promise<ArrayBuffer> {
    try {
      const audioPath = `assets/profiles/${this.profile.profile_file}/audio/${fileName}`;
      const response = await fetch(audioPath);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} for ${fileName}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return arrayBuffer;
    } catch (error) {
      return new ArrayBuffer();
    }
  }

  /**
   * Fetches an audio file from the local `assets` folder and returns it as an ArrayBuffer.
   * @param fileName The filename relative to the assets folder (e.g. 'audio.wav').
   * @returns A Promise resolving to the fetched ArrayBuffer or an empty ArrayBuffer on error.
   */

  /**
   * Plays the next audio file in sequence from the assets folder.
   */

  public setFileIndex(fileIndex: number) {
    this.fileIndex = fileIndex;
  }

  public async playNextAudio(): Promise<void> {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    if (this.currentSource) {
      this.currentSource.stop();
      this.currentSource.disconnect();
      this.currentSource = null;
    }

    this.fileIndex++;
    const fileName = `${this.pad(this.fileIndex, 3)}.mp3`;

    try {
      const arrayBuffer = await this.getAudioArrayFromFile(fileName);
      if (arrayBuffer.byteLength === 0) {
        // console.log(`Audio file not found or empty: ${fileName}. Resetting index.`);
        this.resetAudioIndex();
        return;
      }

      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer).catch((error) => {
        console.error('Error decoding audio data:', error);
        throw error;
      });

      this.currentSource = this.audioContext.createBufferSource();
      this.currentSource.buffer = audioBuffer;
      this.currentSource.connect(this.analyserNode);
      this.currentSource.onended = () => {
        setTimeout(() => {
          this.currentSource = null;
          this._isPlayingUserAudio = false;
          this.onLevelChange?.(0);
        }, ONE_SECOND);
      };
      this.currentSource.start(0);
      this._isPlayingUserAudio = true;
    } catch (error) {
      console.error(`Error playing audio file ${fileName}:`, error);
      this.resetAudioIndex();
    }
  }

  public stopPlaybackImmediately(): void {
    if (this.currentSource) {
      this.currentSource.onended = null;
      this.currentSource.stop();
      this.currentSource.disconnect();
      this.currentSource = null;
    }

    this._isPlayingUserAudio = false;
    this.onLevelChange?.(0);
  }

  private pad(num: number, size: number): string {
    let s = num + '';
    while (s.length < size) s = '0' + s;
    return s;
  }

  private startLevelDetectionLoop() {
    if (this.levelDetectionLoopRunning || !this.analyserNode || !this.levelDataArray) {
      return;
    }

    this.levelDetectionLoopRunning = true;
    const detect = () => {
      if (!this.analyserNode || !this.levelDataArray) {
        this.levelDetectionLoopRunning = false;
        return;
      }

      this.analyserNode.getByteFrequencyData(this.levelDataArray as Uint8Array<ArrayBuffer>);
      let sum = 0;
      for (const amplitude of this.levelDataArray) {
        sum += amplitude;
      }

      const average = sum / this.levelDataArray.length;
      let level = 0;
      if (average > 1) {
        level = Math.min(100, (average / 255) * 100 * 1.5);
      }

      this.onLevelChange?.(level);
      requestAnimationFrame(detect);
    };

    requestAnimationFrame(detect);
  }
}

