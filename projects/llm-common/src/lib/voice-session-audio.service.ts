// Voice-session microphone capture using Web Audio API for the Voice Live sample
export interface AudioCaptureOptions {
  sampleRate: number;
  channelCount: number;
}

export interface AudioLevelCallback {
  (level: number): void;
}

export interface AudioDataCallback {
  (audioData: ArrayBuffer): void;
}

interface AudioCaptureProcessorMessage {
  type: 'audio-data';
  audioData: Float32Array;
}

export class VoiceSessionAudioService {
  private static readonly processorName = 'voice-live-audio-capture-processor';

  private audioContext?: AudioContext;
  private mediaStream?: MediaStream;
  private sourceNode?: MediaStreamAudioSourceNode;
  private analyserNode?: AnalyserNode;
  private audioWorkletNode?: AudioWorkletNode;
  private silentGainNode?: GainNode;
  private workletModuleUrl?: string;
  private isCapturing = false;
  private isMuted = false;
  private levelCallback?: AudioLevelCallback;
  private dataCallback?: AudioDataCallback;

  // Voice Live requires 24kHz PCM16 mono
  private readonly targetSampleRate = 24000;
  private readonly targetChannels = 1;

  constructor() {
    // Initialize will be called when user activates
  }

  async initialize(): Promise<void> {
    try {
      if (this.isInitialized) {
        return;
      }

      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: this.targetChannels,
          sampleRate: this.targetSampleRate,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Create audio context
      this.audioContext = new AudioContext({ sampleRate: this.targetSampleRate });
      await this.ensureAudioWorkletModule(this.audioContext);

      // Create nodes
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;

      this.audioWorkletNode = new AudioWorkletNode(
        this.audioContext,
        VoiceSessionAudioService.processorName,
        {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: this.targetChannels,
          processorOptions: {
            channelCount: this.targetChannels,
          },
        },
      );
      this.audioWorkletNode.port.onmessage = (
        event: MessageEvent<AudioCaptureProcessorMessage>,
      ) => {
        this.handleWorkletMessage(event.data);
      };

      this.silentGainNode = this.audioContext.createGain();
      this.silentGainNode.gain.value = 0;

      // Connect the nodes
      this.sourceNode.connect(this.analyserNode);
      this.analyserNode.connect(this.audioWorkletNode);
      this.audioWorkletNode.connect(this.silentGainNode);
      this.silentGainNode.connect(this.audioContext.destination);
    } catch (error) {
      console.error('Failed to initialize audio capture:', error);
      this.cleanup();
      throw error;
    }
  }

  startCapture(levelCallback?: AudioLevelCallback, dataCallback?: AudioDataCallback): void {
    if (!this.audioContext || !this.audioWorkletNode) {
      throw new Error('Audio capture not initialized');
    }

    this.levelCallback = levelCallback;
    this.dataCallback = dataCallback;
    this.isCapturing = true;
    this.isMuted = false;

    // Resume audio context if suspended
    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }
  }

  stopCapture(): void {
    this.isCapturing = false;
    this.isMuted = false;
    this.levelCallback = undefined;
    this.dataCallback = undefined;
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }

    if (muted) {
      this.levelCallback?.(0);
    }
  }

  cleanup(): void {
    this.stopCapture();

    if (this.audioWorkletNode) {
      this.audioWorkletNode.port.onmessage = null;
      this.audioWorkletNode.disconnect();
      this.audioWorkletNode = undefined;
    }

    if (this.silentGainNode) {
      this.silentGainNode.disconnect();
      this.silentGainNode = undefined;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = undefined;
    }

    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = undefined;
    }

    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = undefined;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = undefined;
    }

    if (this.workletModuleUrl) {
      URL.revokeObjectURL(this.workletModuleUrl);
      this.workletModuleUrl = undefined;
    }
  }

  private async ensureAudioWorkletModule(audioContext: AudioContext): Promise<void> {
    if (!audioContext.audioWorklet) {
      throw new Error('AudioWorklet is not supported in this browser');
    }

    if (!this.workletModuleUrl) {
      const workletSource = `
        class VoiceLiveAudioCaptureProcessor extends AudioWorkletProcessor {
          process(inputs) {
            const inputChannel = inputs[0]?.[0];

            if (inputChannel?.length) {
              const audioData = new Float32Array(inputChannel.length);
              audioData.set(inputChannel);
              this.port.postMessage({ type: 'audio-data', audioData }, [audioData.buffer]);
            }

            return true;
          }
        }

        registerProcessor('${VoiceSessionAudioService.processorName}', VoiceLiveAudioCaptureProcessor);
      `;

      const workletBlob = new Blob([workletSource], { type: 'application/javascript' });
      this.workletModuleUrl = URL.createObjectURL(workletBlob);
    }

    await audioContext.audioWorklet.addModule(this.workletModuleUrl);
  }

  private handleWorkletMessage(message: AudioCaptureProcessorMessage | undefined): void {
    if (!message || message.type !== 'audio-data') {
      return;
    }

    if (!this.isCapturing) {
      return;
    }

    if (this.isMuted) {
      this.levelCallback?.(0);
      return;
    }

    const inputData = message.audioData;

    this.updateAudioLevel(inputData);

    if (!this.dataCallback) {
      return;
    }

    const pcm16Data = this.convertToPCM16(inputData);
    const pcmBytes = new Uint8Array(pcm16Data.byteLength);
    pcmBytes.set(new Uint8Array(pcm16Data.buffer, pcm16Data.byteOffset, pcm16Data.byteLength));
    this.dataCallback(pcmBytes.buffer);
  }

  private updateAudioLevel(audioData: Float32Array): void {
    if (!this.levelCallback) return;

    // Calculate RMS level
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    const rms = Math.sqrt(sum / audioData.length);

    // Convert to percentage and smooth
    const level = Math.min(100, rms * 100 * 5); // Amplify for better visualization
    this.levelCallback(level);
  }

  private convertToPCM16(floatData: Float32Array): Int16Array {
    const pcm16 = new Int16Array(floatData.length);

    for (let i = 0; i < floatData.length; i++) {
      // Convert float (-1 to 1) to int16 (-32768 to 32767)
      const sample = Math.max(-1, Math.min(1, floatData[i]));
      pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    return pcm16;
  }

  get isInitialized(): boolean {
    return !!this.audioContext && !!this.mediaStream;
  }

  get isActive(): boolean {
    return this.isCapturing;
  }
}
