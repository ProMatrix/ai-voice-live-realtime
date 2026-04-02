// conversation-audio.service.ts
import { Injectable } from '@angular/core';
import {
  TARGET_SAMPLE_RATE,
  WORKLET_BUFFER_SIZE,
  FIFTEEN_HUNDRED_MS,
  ONE_SECOND,
} from './constants';
import { arrayBufferToBase64 } from './utils';
import { defaultProfile, IProfile } from './interfaces';

@Injectable({ providedIn: 'root' })
export class ConversationAudioService {
  private aiAudioContext: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private audioWorkletNode: AudioWorkletNode | null = null;
  private aiAudioQueue: ArrayBuffer[] = [];
  private _isPlayingAIaudio = false;
  private gainNode: GainNode | null = null;
  private micGainNode: GainNode | null = null;
  private aiVolume = 0.2; // normal range: 0.0 - 1.0
  private logOutput = false;
  private session: any | null = null;
  private isRecording = false; // To be set by LiveInterfaceService
  private isSetupComplete = false; // To be set by LiveInterfaceService
  private profile = defaultProfile;
  private detectSpeechTimer: any = null;
  // Speech detection state
  private analyserNode: AnalyserNode | null = null;
  private speechDetected = false;
  private aboveThresholdStart: number | null = null;
  private belowThresholdStart: number | null = null;
  private readonly speechDetectionSensitivity = 3.5; // Adjust as needed. 2 is more sensitive than 1.
  private readonly speechMinStartDuration = 250; // ms
  private readonly speechMinStopDuration = ONE_SECOND; // ms
  private readonly extendDetectedDuration = ONE_SECOND + ONE_SECOND; // ms
  private speechDetectionDataArray: Uint8Array | null = null;
  public onSpeechDetectedChange: ((detected: boolean) => void) | null = null;
  // public isAIPlayingAudio = false;
  // public isAudioFromUser = false;

  // Output audio detection
  private outputAnalyserNode: AnalyserNode | null = null;
  private outputDataArray: Uint8Array | null = null;
  private isAudioFromAI = false;
  private outputDetectionLoopRunning = false;

  // Callbacks to communicate with LiveInterfaceService
  public onAudioDataReady: ((data: ArrayBuffer) => void) | null = null;
  public onPlaybackStarted: (() => void) | null = null;
  public onPlaybackStopped: (() => void) | null = null;
  public onAudioSystemError: ((message: string) => void) | null = null;
    public onOutputLevelChange: ((level: number) => void) | null = null;
    public onInputLevelChange: ((level: number) => void) | null = null;
  private jitterBuffer: ArrayBuffer[] = [];
  private jitterBufferDelay = 100; // ms, tune this value
  private playbackStartTime: number | null = null;
  private _isBuffering = true;
  private audioQueueTimer: any = null;

  constructor() {}

  public initialize(profile: IProfile) {
    this.profile = profile;
  }

  /**
   * Initializes the ConversationAudioService with a profile.
   * @param profile The active profile settings used for audio configuration.
   */

  public setSession(session: any | null) {
    this.session = session;
  }

  /**
   * Sets the active GenAI session instance used for realtime input/output.
   * @param session The Session object from the GenAI client, or null to clear.
   */

  public setIsRecording(isRecording: boolean) {
    this.isRecording = isRecording;
  }

  /**
   * Updates the internal recording flag to indicate whether microphone capture
   * should be considered active.
   * @param isRecording True when recording, false otherwise.
   */

  public setIsSetupComplete(isSetupComplete: boolean) {
    this.isSetupComplete = isSetupComplete;
  }

  /**
   * Sets whether audio setup has completed. Used to gate audio operations.
   * @param isSetupComplete True if setup is complete.
   */

  public setLogOutput(logOutput: boolean) {
    this.logOutput = logOutput;
  }

  /**
   * Enable or disable verbose logging from the ConversationAudioService.
   * @param logOutput True to enable debug logging.
   */

  public setAiVolume(volume: number) {
    this.aiVolume = volume;
    if (this.gainNode) {
      this.gainNode.gain.value = this.aiVolume;
    }
  }

  /**
   * Suspends the microphone by setting the gain to 0.
   */
  public suspendMicrophone() {
    if (this.micGainNode) {
      this.micGainNode.gain.value = 0;
    }
  }

  /**
   * Resumes the microphone by setting the gain to 1.
   */
  public resumeMicrophone() {
    if (this.micGainNode) {
      this.micGainNode.gain.value = 1;
    }
  }

  /**
   * Sets the AI playback volume and updates the WebAudio GainNode if available.
   * @param volume Volume level between 0.0 and 1.0.
   */

  public enableMicStream(enabled: boolean) {
    if (this.micStream) {
      this.micStream.getAudioTracks()[0].enabled = enabled;
    }
  }

  /**
   * Enables or disables the microphone MediaStream tracks without tearing down the stream.
   * @param enabled True to enable mic audio, false to disable.
   */

  /**
   * Initializes the Web Audio API AudioContext and adds the AudioWorklet processor.
   * @returns A Promise that resolves to true if the audio system is successfully initialized, false otherwise.
   */
  async initializeAudioSystem(): Promise<boolean> {
    if (!this.aiAudioContext) {
      try {
        this.aiAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 48000,
          latencyHint: 'balanced',
        });

        // Initialize the GainNode here
        this.gainNode = this.aiAudioContext.createGain();
        if (this.profile.isSpeakerOn) {
          this.gainNode.gain.value = this.profile.aiVolume;
        } else {
          this.gainNode.gain.value = 0.0;
        }
        this.gainNode.connect(this.aiAudioContext.destination); // Connect it to the speakers

        // Setup analyser for output monitoring
        this.outputAnalyserNode = this.aiAudioContext.createAnalyser();
        this.outputAnalyserNode.fftSize = 256;
        this.outputDataArray = new Uint8Array(this.outputAnalyserNode.frequencyBinCount);
        this.gainNode.connect(this.outputAnalyserNode);
        this.startOutputDetectionLoop();

        try {
          const workletCode = `
                class AudioProcessor extends AudioWorkletProcessor {
                  constructor(options) {
                    super();
                    this.sampleRate = sampleRate;
                    this.targetSampleRate = options.processorOptions.targetSampleRate || 16000;
                    this.bufferSize = options.processorOptions.bufferSize || 4096;
                    this.resampleRatio = this.sampleRate / this.targetSampleRate;

                    // Buffer to hold raw audio from the microphone.
                    // Let's make it large enough to hold a few chunks of incoming data to prevent overflow.
                    this._internalBuffer = new Float32Array(this.bufferSize * 4);
                    this._internalBufferIndex = 0;
                    
                    // A flag to prevent re-entrant processing.
                    this.isProcessing = false;

                    this.port.postMessage({ 
                      debug: \`Worklet Initialized. NativeSR: \${this.sampleRate}, TargetSR: \${this.targetSampleRate}, Ratio: \${this.resampleRatio}\` 
                    });
                  }

                  process(inputs, outputs, parameters) {
                    const inputChannel = inputs[0] && inputs[0][0];

                    if (inputChannel && inputChannel.length > 0) {
                      // Append new audio data to our internal buffer.
                      if (this._internalBufferIndex + inputChannel.length <= this._internalBuffer.length) {
                        this._internalBuffer.set(inputChannel, this._internalBufferIndex);
                        this._internalBufferIndex += inputChannel.length;
                      } else {
                        // This is a critical issue, it means we're receiving audio faster than we can process it.
                        // A larger internal buffer might be needed. For now, we'll just log it.
                        this.port.postMessage({ debug: "Worklet buffer overflow. Dropping oldest audio."});
                        // Shift buffer and append new data to avoid complete loss.
                        const spaceToKeep = this._internalBuffer.length - inputChannel.length;
                        this._internalBuffer.copyWithin(0, this._internalBuffer.length - spaceToKeep);
                        this._internalBuffer.set(inputChannel, spaceToKeep);
                        this._internalBufferIndex = this._internalBuffer.length;
                      }
                    }

                    // Check if we have enough data to produce a full output buffer.
                    const requiredInputSamples = Math.ceil(this.bufferSize * this.resampleRatio);
                    if (this._internalBufferIndex >= requiredInputSamples && !this.isProcessing) {
                      this.sendResampledBuffer(requiredInputSamples);
                    }

                    return true; // Keep the processor alive.
                  }

                  sendResampledBuffer(requiredInputSamples) {
                    this.isProcessing = true;
                    
                    const outputBuffer = new Float32Array(this.bufferSize);
                    let outputIndex = 0;

                    // Linear interpolation for smoother resampling.
                    for (let i = 0; i < this.bufferSize; i++) {
                      const p = i * this.resampleRatio;
                      const k = Math.floor(p);
                      const t = p - k; // Fractional part

                      if (k + 1 < this._internalBufferIndex) {
                        // Standard linear interpolation
                        outputBuffer[outputIndex++] = this._internalBuffer[k] * (1 - t) + this._internalBuffer[k + 1] * t;
                      } else {
                        // Not enough data for interpolation, break the loop.
                        break;
                      }
                    }
                    
                    const finalOutputBuffer = outputBuffer.slice(0, outputIndex);

                    if (finalOutputBuffer.length > 0) {
                        const pcmData = new Int16Array(finalOutputBuffer.length);
                        for (let i = 0; i < finalOutputBuffer.length; i++) {
                            const sample = Math.max(-1, Math.min(1, finalOutputBuffer[i]));
                            pcmData[i] = sample * 32767;
                        }
                        this.port.postMessage({ pcmData: pcmData.buffer }, [pcmData.buffer]);
                    }

                    // Calculate how many input samples were actually consumed.
                    const consumedInputSamples = Math.floor(outputIndex * this.resampleRatio);

                    // Shift the remaining unprocessed samples to the beginning of the buffer.
                    if (consumedInputSamples > 0) {
                        this._internalBuffer.copyWithin(0, consumedInputSamples, this._internalBufferIndex);
                        this._internalBufferIndex -= consumedInputSamples;
                    }
                    
                    this.isProcessing = false;
                  }
                }
                registerProcessor('audio-processor', AudioProcessor);
            `;
          const blob = new Blob([workletCode], {
            type: 'application/javascript',
          });
          const workletURL = URL.createObjectURL(blob);
          await this.aiAudioContext.audioWorklet.addModule(workletURL);
          URL.revokeObjectURL(workletURL);
        } catch (e) {
          console.error('[ConversationAudioService] Failed to add AudioWorklet module:', e);
          this.onAudioSystemError?.('Error loading audio processor.');
          return false;
        }
      } catch (e) {
        console.error('[ConversationAudioService] Failed to create or resume AudioContext:', e);
        this.onAudioSystemError?.('Error initializing audio system.');
        return false;
      }
    } else if (this.aiAudioContext.state === 'suspended') {
      try {
        await this.aiAudioContext.resume();
      } catch (e) {
        console.error('[ConversationAudioService] Failed to resume existing AudioContext:', e);
        this.onAudioSystemError?.('Error resuming audio system.');
        return false;
      }
    }
    return true;
  }

  /**
   * Starts recording microphone input.
   */
  async startMicrophone(): Promise<void> {
    if (!this.aiAudioContext) {
      this.onAudioSystemError?.('Audio system not ready.');
      return;
    }

    try {
      // Querying permissions may throw or be unsupported in some browsers.
      // Allow 'prompt' to proceed (getUserMedia will prompt the user) and
      // only fail early if the permission is explicitly 'denied'.
      let permissionStatus: PermissionStatus | null = null;
      try {
        if ((navigator as any).permissions && (navigator as any).permissions.query) {
          // Some environments may not support this API or may throw.
          permissionStatus = await navigator.permissions.query({
            name: 'microphone' as PermissionName,
          });
        }
      } catch (e) {
        permissionStatus = null;
      }
      if (permissionStatus && permissionStatus.state === 'denied') {
        this.onAudioSystemError?.('Microphone permission denied.');
        return;
      }

      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
        },
      });
      this.micSourceNode = this.aiAudioContext.createMediaStreamSource(this.micStream);
      // Setup analyser node for speech detection
      this.analyserNode = this.aiAudioContext.createAnalyser();
      this.analyserNode.fftSize = 2048;
      // Use correct constructor for Uint8Array
      this.speechDetectionDataArray = new Uint8Array(this.analyserNode.fftSize);

      this.micGainNode = this.aiAudioContext.createGain();
      this.micSourceNode.connect(this.micGainNode);
      this.micGainNode.connect(this.analyserNode);

      this.startSpeechDetectionLoop();
      this.audioWorkletNode = new AudioWorkletNode(this.aiAudioContext, 'audio-processor', {
        processorOptions: {
          targetSampleRate: TARGET_SAMPLE_RATE,
          bufferSize: WORKLET_BUFFER_SIZE,
        },
      });
      this.audioWorkletNode.port.onmessage = this.onAudioWorkletMessage.bind(this);
      // Connect micSourceNode to both analyserNode and audioWorkletNode
      this.micGainNode.connect(this.audioWorkletNode);
    } catch (error) {
      console.error('[ConversationAudioService] Error in mic/worklet setup:', error);
      this.onAudioSystemError?.(
        `Mic/AudioWorklet error: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.cleanupAudioNodes();
    }
  }

  private onAudioWorkletMessage(event: MessageEvent) {
    if (event.data.pcmData) {
      if (!this.session) {
        console.warn(
          '[ConversationAudioService] Worklet produced pcmData but session is null. Dropping audio until session is set.',
        );
        return;
      }
      if (!this.isRecording) {
        console.warn(
          '[ConversationAudioService] Worklet produced pcmData but isRecording is false. Dropping audio.',
        );
        return;
      }
      // If we reach here, session and recording are available
      // todo
      // console.log('[ConversationAudioService] Forwarding pcmData to onAudioDataReady.');
    }
    if (event.data.pcmData && this.session && this.isRecording) {
      const pcmArrayBuffer = event.data.pcmData as ArrayBuffer;
      if (pcmArrayBuffer.byteLength === 0) {
        return;
      }
      this.onAudioDataReady?.(pcmArrayBuffer);
    }
  }

  /**
   * Stops recording microphone input.
   */
  stopMicrophone() {
    this.cleanupAudioNodes();
  }

  /**
   * Cleans up audio-related Web Audio API nodes and streams.
   */
  cleanupAudioNodes() {
    if (this.audioWorkletNode) {
      this.audioWorkletNode.port.onmessage = null;
      this.audioWorkletNode.disconnect();
      this.audioWorkletNode = null;
    }
    if (this.micGainNode) {
      this.micGainNode.disconnect();
      this.micGainNode = null;
    }
    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }
    if (this.micSourceNode) {
      this.micSourceNode.disconnect();
      this.micSourceNode = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }
    this.speechDetectionDataArray = null;
    this.speechDetected = false;
    this.aboveThresholdStart = null;
    this.belowThresholdStart = null;
  }
  /**
   * Starts the speech detection loop using the analyser node.
   */
  private startSpeechDetectionLoop() {
    if (!this.analyserNode || !this.speechDetectionDataArray) return;
    const detect = () => {
      if (!this.analyserNode || !this.speechDetectionDataArray) return;

      // @ts-ignore
      this.analyserNode.getByteTimeDomainData(this.speechDetectionDataArray);
      const avg =
        this.speechDetectionDataArray.reduce((sum, val) => sum + Math.abs(val - 128), 0) /
        this.speechDetectionDataArray.length;
      const now = performance.now();
      if (avg > this.speechDetectionSensitivity) {
        this.belowThresholdStart = null;
        if (this.aboveThresholdStart === null) this.aboveThresholdStart = now;
        if (!this.speechDetected && now - this.aboveThresholdStart >= this.speechMinStartDuration) {
          this.speechDetected = true;
          if (this.onSpeechDetectedChange) this.onSpeechDetectedChange(true);
        }
      } else {
        this.aboveThresholdStart = null;
        if (this.belowThresholdStart === null) this.belowThresholdStart = now;
        if (this.speechDetected && now - this.belowThresholdStart >= this.speechMinStopDuration) {
          // This is where we extend the true state for a short duration
          setTimeout(() => {
            this.speechDetected = false;
            if (this.onSpeechDetectedChange) this.onSpeechDetectedChange(false);
          }, this.extendDetectedDuration);
        }
      }
      requestAnimationFrame(detect);
    };
    requestAnimationFrame(detect);
  }

  get isUserSpeaking(): boolean {
    if (this._isPlayingAIaudio) return false;
    return this.speechDetected;
  }

  /**
   * Returns the current speech detection state.
   */
  get isAIspeechDetected(): boolean {
    return this.isAudioFromAI;
  }

  /**
   * Adds an audio ArrayBuffer to the playback queue and starts playback if not already playing.
   * @param audioArrayBuffer The audio data as an ArrayBuffer.
   */
  enqueueAudio(audioArrayBuffer: ArrayBuffer) {
    this.jitterBuffer.push(audioArrayBuffer);

    if (this._isBuffering && this.jitterBuffer.length > 0 && !this.playbackStartTime) {
      this.playbackStartTime = performance.now() + this.jitterBufferDelay;
      this._isBuffering = false;
      this.processJitterBuffer();
    }
  }

  private processJitterBuffer() {
    if (this.audioQueueTimer) {
      clearTimeout(this.audioQueueTimer);
    }

    if (performance.now() >= (this.playbackStartTime ?? 0)) {
      if (this.jitterBuffer.length > 0) {
        const audioData = this.jitterBuffer.shift()!;
        this.aiAudioQueue.push(audioData);

        if (!this._isPlayingAIaudio) {
          this.playNextInQueue();
        }
      } else {
        // Buffer is empty, reset for next time
        this._isBuffering = true;
        this.playbackStartTime = null;
        return; // Stop processing
      }
    }

    // Continue processing the jitter buffer
    this.audioQueueTimer = setTimeout(() => this.processJitterBuffer(), 10); // Check every 10ms
  }

  /**
   * Plays the next audio buffer in the queue.
   */
  async playNextInQueue(): Promise<void> {
    if (this.aiAudioQueue.length === 0) {
      this._isPlayingAIaudio = false;
      this.onPlaybackStopped?.();
      return;
    }
    this._isPlayingAIaudio = true;
    const audioArrayBuffer = this.aiAudioQueue.shift()!;

    if (audioArrayBuffer.byteLength < 2) {
      console.warn(
        `[ConversationAudioService] audioArrayBuffer is too short. Skipping.`,
        this.logOutput,
      );
      this._isPlayingAIaudio = false;
      this.playNextInQueue();
      return;
    }
    if (!this.aiAudioContext || this.aiAudioContext.state !== 'running') {
      const audioSystemReady = await this.initializeAudioSystem();
      if (!audioSystemReady || !this.aiAudioContext) {
        this.onAudioSystemError?.('AudioContext not available for playback.');
        this._isPlayingAIaudio = false;
        this.aiAudioQueue.unshift(audioArrayBuffer); // Put it back if we couldn't play
        return;
      }
    }
    try {
      // Gemini's audio is 24kHz
      const PLAYBACK_SAMPLE_RATE = 24000;
      const int16Array = new Int16Array(audioArrayBuffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }
      const audioBuffer = this.aiAudioContext.createBuffer(
        1,
        float32Array.length,
        PLAYBACK_SAMPLE_RATE,
      );
      audioBuffer.copyToChannel(float32Array, 0);
      const source = this.aiAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      // Connect the source to the gainNode instead of directly to the destination
      if (this.gainNode) {
        source.connect(this.gainNode);
      } else {
        // Fallback if gainNode somehow isn't initialized (shouldn't happen with the new init logic)
        source.connect(this.aiAudioContext.destination);
      }

      source.start();
      this.onPlaybackStarted?.();
      source.onended = () => {
        this.playNextInQueue();
      };
    } catch (error) {
      console.error('[ConversationAudioService] Error playing audio:', error);
      this.onAudioSystemError?.(
        `Error playing audio: ${error instanceof Error ? error.message : String(error)}`,
      );
      this._isPlayingAIaudio = false;
      this.playNextInQueue();
    }
  }

  /**
   * Starts the output detection loop.
   */
  private startOutputDetectionLoop() {
    if (this.outputDetectionLoopRunning || !this.outputAnalyserNode || !this.outputDataArray) {
      return;
    }
    this.outputDetectionLoopRunning = true;
    const detect = () => {
      if (!this.outputAnalyserNode || !this.outputDataArray) {
        this.outputDetectionLoopRunning = false;
        return;
      }
      this.outputAnalyserNode.getByteFrequencyData(this.outputDataArray as Uint8Array<ArrayBuffer>);
      let sum = 0;
      for (const amplitude of this.outputDataArray) {
        sum += amplitude;
      }
      const average = sum / this.outputDataArray.length;

      // Map average amplitude (0-255) to a 0-100 level for visualization
      let level = 0;

      // A small threshold to account for noise
      if (average > 1) {
        this.isAudioFromAI = true;
        if (this.detectSpeechTimer) {
          clearTimeout(this.detectSpeechTimer);
        }
        this.detectSpeechTimer = setTimeout(() => {
          this.isAudioFromAI = false;
          this.detectSpeechTimer = null;
        }, this.extendDetectedDuration);

        // Scale average up slightly for a more responsive meter
        level = Math.min(100, (average / 255) * 100 * 1.5);
      }

      if (this.onOutputLevelChange) {
        this.onOutputLevelChange(level);
      }
      requestAnimationFrame(detect);
    };
    detect();
  }

  /**
   * Clears the audio playback queue and stops any ongoing playback.
   */
  clearAudioQueueAndStopPlayback() {
    this.aiAudioQueue = [];
    this._isPlayingAIaudio = false;
  }

  private updateIsPlayingAIaudioState(isPlayingAIaudio: boolean) {
    if (!isPlayingAIaudio) {
      setTimeout(() => {
        this._isPlayingAIaudio = false;
      }, ONE_SECOND);
    } else {
      this._isPlayingAIaudio = isPlayingAIaudio;
    }
  }

  public get isPlayingAIaudio(): boolean {
    return this._isPlayingAIaudio;
  }

  /**
   * Stops all audio processing, clears the session, and resets internal state.
   */
  stopAudioProcessing() {
    this.cleanupAudioNodes();
    if (this.aiAudioContext) {
      this.aiAudioContext.close();
    }
    this.isAudioFromAI = false;
  }

  public playAudio(audio: ArrayBuffer) {
    this.aiAudioQueue.push(audio);
    if (!this._isPlayingAIaudio) {
      this.playNextInQueue();
    }
  }
}

