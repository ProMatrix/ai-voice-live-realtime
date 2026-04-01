import { Injectable } from '@angular/core';
import { IProfile, ConnectionState, ILiveAssistantService, IChatMessage } from 'llm-common';
import {
  VoiceLiveClient,
  VoiceLiveSession,
  type VoiceLiveSessionHandlers,
  type VoiceLiveSubscription,
  type ErrorEventArgs,
  type ConnectionContext,
  type SessionContext,
} from '@azure/ai-voicelive';
import { AzureKeyCredential } from '@azure/core-auth';

@Injectable({
  providedIn: 'root',
})
export class AzureLiveAssistantService implements ILiveAssistantService {
  private client: VoiceLiveClient | null = null;
  private session: VoiceLiveSession | null = null;
  private subscription: VoiceLiveSubscription | null = null;
  private profile: IProfile | null = null;
  private systemInstructions = '';
  private promptPreamble = '';
  config: any | null = null;
  private _connectionCallback: ((status: ConnectionState) => void) | null = null;
  private _messageCallback: ((msg: IChatMessage, isStreaming?: boolean) => void) | null = null;
  private _errorCallback: ((err: string) => void) | null = null;

  // Callbacks used by LiveInterfaceService
  public onAudioReceived: ((audio: ArrayBuffer) => void) | null = null;
  public onTranscriptionReceived: ((text: string) => void) | null = null;       

  constructor() {}

  public async initializeSession(
    profile: IProfile,
  ): Promise<void> {
    this.profile = profile;
    this.config = {}; // Can pull from environment / storage as needed
    // Configure and connect the Voice Live client/session.
    await this.connect();
  }

  public async initialize(
    profile: IProfile,
    systemInstructions: string,
    promptPreamble: string,
    config: IVoiceAssistantConfig,
  ): Promise<void> {
    this.profile = profile;
    this.systemInstructions = systemInstructions;
    this.promptPreamble = promptPreamble;
    this.config = config;
    // Configure and connect the Voice Live client/session.
    await this.connect();
  }

  private getCombinedInstructions(): string {
    if (!this.promptPreamble.trim()) {
      return this.systemInstructions;
    }

    return (
      this.systemInstructions +
      '\n\nThe following JSON dialogue script is the only source of truth for this profile. Use it to determine the intended conversation flow and respond with the same meaning as the next expected Output.\n\n' +
      this.promptPreamble
    );
  }

  private createEventHandlers(): VoiceLiveSessionHandlers {
    return {
      onError: async (args: ErrorEventArgs, _context: ConnectionContext) => {
        // Log full error details to help diagnose server-side disconnect reasons.
        console.error('[AzureVoiceLiveService] Service error:', args.error.message);
        console.error('[AzureVoiceLiveService] Service error details:', {
          name: args.error.name,
          code: (args.error as any).code,
          stack: args.error.stack,
        });
      },

      onResponseTextDelta: async (event, _context: SessionContext) => {
        if (!event.delta) {
          return;
        }

        if (this.onTranscriptionReceived) {
          this.onTranscriptionReceived(event.delta);
        }
      },

      onResponseAudioDelta: async (event, _context: SessionContext) => {
        if (!event.delta || event.delta.byteLength === 0) {
          return;
        }
        const audioData = event.delta;
        const buffer = audioData.buffer.slice(
          audioData.byteOffset,
          audioData.byteOffset + audioData.byteLength,
        );

        // Surface audio to the LiveInterfaceService, which forwards to ConversationAudioService.
        this.onAudioReceived?.(buffer as ArrayBuffer);
      },
    };
  }

  // config: IVoiceAssistantConfig
  public async connect(): Promise<void> {
    if (!this.profile) {
      console.error('[AzureVoiceLiveService] Profile not set; cannot connect.');
      return;
    }

    if (this.session) {
      return;
    }

    // NOTE: For speech streaming to work properly, the endpoint must be the same as the one
    // used to create the Voice Live session, and must be a valid Voice Live endpoint
    // provisioned in Azure. The key must also be valid for that endpoint.
    if (!this.config) {
      console.error('[AzureVoiceLiveService] Config not provided; cannot connect.');
      return;
    }

    if (!this.config?.voiceApiEndpoint || !this.config?.voiceApiKey) {
      console.error('[AzureVoiceLiveService] voiceApiEndpoint or API key not configured.');
      return;
    }

    try {
      const credential = new AzureKeyCredential(this.config.voiceApiKey);

      const sessionOptions: any = {
        connectionTimeoutInMs: 30000,
        enableDebugLogging: true,
      };

      this.client = new VoiceLiveClient(this.config.voiceApiEndpoint, credential, {
        apiVersion: '2025-10-01',
        defaultSessionOptions: sessionOptions,
      });

      // Use the Voice Live realtime model id, matching the SDK README.
      this.session = await this.client.startSession('gpt-4o-mini-realtime-preview', sessionOptions);
      this.subscription = this.session.subscribe(this.createEventHandlers());

      // Configure the session for audio-focused streaming.
      await this.session.updateSession({
        modalities: ['audio', 'text'],
        instructions: this.getCombinedInstructions(),
        voice: {
          type: 'azure-standard',
          name: this.profile.voice_name || 'en-US-AvaNeural',
        },
        inputAudioFormat: 'pcm16',
        outputAudioFormat: 'pcm16',
        turnDetection: {
          type: 'server_vad',
          threshold: 0.5,
        },
      });

      // Bind the session into the ConversationAudioService so microphone PCM can be forwarded.
      this.conversationAudioService.setSession(this.session);

      console.log('[AzureVoiceLiveService] Connected to Azure Voice Live.');
    } catch (error) {
      console.error('[AzureVoiceLiveService] Failed to connect:', error);
    }
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.subscription) {
        await this.subscription.close();
        this.subscription = null;
      }

      if (this.session) {
        await this.session.disconnect();
        await this.session.dispose();
        this.session = null;
      }

      console.log('[AzureVoiceLiveService] Disconnected from Azure Voice Live.');
    } catch (error) {
      console.error('[AzureVoiceLiveService] Error during disconnect:', error);
    }
  }

  public async sendMessage(text: string): Promise<void> {
    const trimmed = text.trim();

    if (!trimmed) {
      return;
    }

    if (!this.session) {
      console.error('[AzureVoiceLiveService] Cannot send text; session not connected.');
      return;
    }

    try {
      await this.session.addConversationItem({
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: trimmed,
          },
        ],
      } as any);

      await this.session.sendEvent({
        type: 'response.create',
      } as any);
    } catch (error) {
      console.error('[AzureVoiceLiveService] sendText failed:', error);
    }
  }

  public sendAudio(audio: ArrayBuffer): void {
    if (!this.session) {
      console.error('[AzureVoiceLiveService] Cannot send audio; session not connected.');
      return;
    }

    if (audio.byteLength === 0) {
      return;
    }

    const audioBytes = new Uint8Array(audio);
    this.session
      .sendAudio(audioBytes)
      .catch((error) => console.error('[AzureVoiceLiveService] sendAudio failed:', error));
  }

  public sendImage(_imageData: { base64: string; mimeType: string }) {
    // Image support can be added later; for now this is a placeholder.
  }

  // ILiveAssistantService Subscriptions
  public onConnectionStatusChange(callback: (status: ConnectionState) => void): void {
    this._connectionCallback = callback;
  }
  public onAudioLevelChange(callback: (level: number) => void): void {
    // Implement audio worklet metering here
  }
  public onMessageReceived(callback: (msg: IChatMessage, isStreaming?: boolean) => void): void {
    this._messageCallback = callback;
  }
  public onError(callback: (error: string) => void): void {
    this._errorCallback = callback;
  }
}
