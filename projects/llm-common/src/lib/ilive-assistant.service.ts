import { IProfile, IChatMessage } from './interfaces';
import { InjectionToken } from '@angular/core';

/**
 * The standard connection state of the LLM Audio Assistant.
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

/**
 * ILiveAssistantService defines the strict contract that any LLM provider
 * (Azure, Google) must implement. The Shared UX library will inject this
 * token to interact with the chosen provider without knowing which SDK is in use.
 */
export interface ILiveAssistantService {
  /**
   * Initializes the session using the unified profile settings.
   */
  initializeSession(profile: IProfile): Promise<void>;

  /**
   * Connects to the LLM backend (starts microphone worklets, opens sockets).
   */
  connect(): Promise<void>;

  /**
   * Disconnects from the LLM backend and closes streams.
   */
  disconnect(): Promise<void>;

  /**
   * Sends a raw text message to the assistant as if spoken.
   */
  sendMessage(message: string): Promise<void>;

  /**
   * Streams raw audio buffer bytes to the backend.
   */
  sendAudio(audio: ArrayBuffer): void;

  /**
   * Subscribes to changes in the overall connection state.
   */
  onConnectionStatusChange(callback: (status: ConnectionState) => void): void;

  /**
   * Subscribes to incoming audio volume levels (for visualizers).
   */
  onAudioLevelChange(callback: (level: number) => void): void;

  /**
   * Subscribes to completed or streaming text messages.
   */
  onMessageReceived(callback: (msg: IChatMessage, isStreaming?: boolean) => void): void;

  /**
   * Handle errors globally.
   */
  onError(callback: (error: string) => void): void;
}

/**
 * The InjectionToken used by Angular DI to provide the implementation.
 */
export const LIVE_ASSISTANT_SERVICE_TOKEN = new InjectionToken<ILiveAssistantService>(
  'LIVE_ASSISTANT_SERVICE_TOKEN',
);
