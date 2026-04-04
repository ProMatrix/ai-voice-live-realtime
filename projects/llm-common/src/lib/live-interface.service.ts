// live-interface.service.ts
import { Injectable, Inject } from '@angular/core';
import { ConversationAudioService } from './conversation-audio.service';
import { PreRecordedAudioService } from './pre-recorded.audio.service';
import { ImageCaptureService } from './image-capture.service';
import { ILiveAssistantService, LIVE_ASSISTANT_SERVICE_TOKEN } from './ilive-assistant.service';
import { ChatHistoryService } from './chat-history.service';
import { SnapshotIndicatorService } from './snapshot-indicator.service';
import { PdfApiService } from './pdf-api-service';
import { VisionApiService } from './vision-api-service';
import { FoundryAgentService } from './foundry-agent.service';

import { sleep } from './utils';
import {
  MODEL_NAME,
  OUTPUT_TRANSCRIPTION_TIMEOUT,
  ANIMATION_DURATION,
  PROFILES_URL,
  SPLASH_FONT_EXPANDED,
  ONE_SECOND,
  TEN_SECONDS,
  FIVE_SECONDS,
  FIFTEEN_HUNDRED_MS,
} from './constants';
import {
  IAppraisalSummaryData,
  IDiscussionTopic,
  IFoundryAgentConfig,
  IHtmlPage,
  IPdfAssistantConfig,
  defaultProfile,
  IDiscussionAgentProfile,
  IProfile,
  IDialogue,
  IPropertyAppraisal,
  IVoiceAssistantConfig,
  IVoiceAssistantCallbacks,
  IVisionAssistantConfig,
} from './interfaces';

@Injectable({ providedIn: 'root' })
export class LiveInterfaceService {
  public showHostActive(): boolean {
    if (this.profile?.show_chatbots === false) return false;
    return (
      this.conversationAudioService.isUserSpeaking ||
      this.preRecordedAudioService.isPlayingPreRecorded
    );
  }
  public showGuestActive(): boolean {
    if (this.profile?.show_chatbots === false) return false;
    return this.outputAudioLevel > 0; // fallback since isPlayingAIaudio isn't directly exposed or outputAudioLevel works well
  }
  private videoElement: HTMLVideoElement | undefined;
  private canvasElement: HTMLCanvasElement | undefined;
  private imagePreviewDiv: HTMLDivElement | null = null;
  private imagePreview: HTMLImageElement | null = null;
  private userSpokenMessageDiv: HTMLDivElement | null | undefined;
  private aiSpokenMessageDiv: HTMLDivElement | null | undefined;
  private pauseRecordingButton: HTMLButtonElement | null | undefined;
  private stopRecordingButton: HTMLButtonElement | null | undefined;
  private sessionTitleDiv: HTMLDivElement | null | undefined;
  private screenShareButton: HTMLButtonElement | null | undefined;
  private speakerButton: HTMLButtonElement | null | undefined;
  private profile = defaultProfile;
  private dialogueUtterance: IDialogue[] | undefined;
  private dialogueIndex = 0;
  private dialogueInput = '';
  private dataInstructions = '';
  private dataSummaryTemplate = '';
  private voiceApiInstructions = '';
  private visionApiInstructions = '';
  private promptPreamble = '';
  private greetingsFromAiSpoken = false;
  private timeStartedEndurance = new Date();

  // Public property to hold the callback function from the component (app.ts)
  public onServiceCallback: ((message: string) => void) | undefined;
  public onProgressCallback: ((file: number, percent: number) => void) | undefined;
  public isRecording = false;
  public isMuted = false;
  public isSharing = false;
  public isInitialized = false;
  public aiVolume = 0.9;
  public aiFullVolume = 1.0;
  public simVolume = 0.6;
  public simFullVolume = 1.0;
  public audioLevel = 0;
  public outputAudioLevel = 0;

  gainNode: GainNode | null = null;
  serviceMode = 'stopRecording';
  private isSpeakerOutputEnabled = true;

  private logOutput = false;
  private spokenMessageTop = '260px';
  private outputTranscriptionTimeoutId: ReturnType<typeof setTimeout> | undefined;
  private inputTranscriptionTimerId: ReturnType<typeof setTimeout> | undefined;
  private inputFirstTimerId: ReturnType<typeof setTimeout> | undefined;
  private aiSpokenFadeTimeoutId: ReturnType<typeof setTimeout> | undefined;
  private userSpokenFadeTimeoutId: ReturnType<typeof setTimeout> | undefined;
  private animationFrameId = -1;
  private allowRudeInteruption = true;
  private resetSession = false; // Based on user input
  private isSpokenMessageHoldActive = false;
  private inputTranscription = '';
  private outputTranscription = '';
  private pendingPausedUserText = '';
  private pausedAssistantOutputPendingResume = false;
  private pausedUserResponsePendingSend = false;
  // If true, attempt to resume recording automatically after reconnect
  private resumeRecordingAfterReconnect = false;
  private inputMessageDiv: HTMLDivElement | null = null;
  private outputMessageDiv: HTMLDivElement | null = null;
  // private voiceAssistant: VoiceAssistant;
  // private userAssistant: VoiceAssistant;
  private assistantAgentInstructions = '';
  private userAgentInstructions = '';
  private pendingDiscussionSpeaker: 'assistant-agent' | 'user-agent' | null = null;
  private pendingDiscussionPrompt = '';
  private wrapUpRequested = false;
  private wrapUpTurnsCompleted = 0;
  private discussionTimerId: ReturnType<typeof setTimeout> | undefined;
  private lastDiscussionSpeaker: 'assistant-agent' | 'user-agent' | null = null;
  private discussionStarted = false;
  private isDualDiscussionPaused = false;
  private discussionTopics: IDiscussionTopic[] = [];
  private currentDiscussionTopic: IDiscussionTopic | null = null;
  private resumePreRecordedAfterInterruptedAssistant = false;
  private preRecordedAssistantTurnCompleting = false;
  private discardCompletedTurnByAgent: Record<'assistant-agent' | 'user-agent', boolean> = {
    'assistant-agent': false,
    'user-agent': false,
  };
  private pendingCompletedTurnByAgent: Record<'assistant-agent' | 'user-agent', string> = {
    'assistant-agent': '',
    'user-agent': '',
  };
  private pendingCompletedTurnTimeoutByAgent: Partial<
    Record<'assistant-agent' | 'user-agent', ReturnType<typeof setTimeout>>
  > = {};

  private handleTranscription(text: string) {
    if (this.outputMessageDiv) {
      // this.chatHistoryService.updateMessage(this.outputMessageDiv, text);
    } else {
      this.outputMessageDiv = this.chatHistoryService.createRealtimeMessage('assistant');
      // this.chatHistoryService.updateMessage(this.outputMessageDiv, text);
    }
  }

  constructor(
    private conversationAudioService: ConversationAudioService,
    public preRecordedAudioService: PreRecordedAudioService,
    private imageCaptureService: ImageCaptureService,
    @Inject(LIVE_ASSISTANT_SERVICE_TOKEN) private liveAssistantService: ILiveAssistantService,
    private chatHistoryService: ChatHistoryService,
    private snapshotIndicatorService: SnapshotIndicatorService,
    private pdfApiService: PdfApiService,
    private visionApiService: VisionApiService,
    private foundryAgentService: FoundryAgentService,
  ) {
    // this.voiceAssistant = new VoiceAssistant();
    // this.userAssistant = new VoiceAssistant();
    this.setupVoiceAssistantCallbacks();
  }

  private renderUserText(text: string) {
    this.inputMessageDiv = this.chatHistoryService.createRealtimeMessage('user');
    this.chatHistoryService.finalizeMessage(this.inputMessageDiv, text, 'user');

    // Drive the spoken user bubble from the finalized user text.
    if (this.userSpokenMessageDiv && this.profile.show_chatbots) {
      // Cancel any pending fade-out from a previous utterance.
      if (this.userSpokenFadeTimeoutId) {
        clearTimeout(this.userSpokenFadeTimeoutId);
        this.userSpokenFadeTimeoutId = undefined;
      }

      // Show/update the full user utterance.
      void this.updateSpokenMessage(text, this.userSpokenMessageDiv);

      // After a short period, fade out and hide the bubble.
      this.userSpokenFadeTimeoutId = setTimeout(() => {
        this.fadeOutSpokenMessage(this.userSpokenMessageDiv, 'user');
      }, FIFTEEN_HUNDRED_MS);
    }
  }

  private clearSpokenMessageHideTimers() {
    if (this.userSpokenFadeTimeoutId) {
      clearTimeout(this.userSpokenFadeTimeoutId);
      this.userSpokenFadeTimeoutId = undefined;
    }

    if (this.aiSpokenFadeTimeoutId) {
      clearTimeout(this.aiSpokenFadeTimeoutId);
      this.aiSpokenFadeTimeoutId = undefined;
    }

    if (this.outputTranscriptionTimeoutId) {
      clearTimeout(this.outputTranscriptionTimeoutId);
      this.outputTranscriptionTimeoutId = undefined;
    }
  }

  private getSpokenMessageTextElement(messageElement: HTMLDivElement): HTMLSpanElement | null {
    return messageElement.querySelector('.spoken-message-text');
  }

  private ensureSpokenMessageTextElement(messageElement: HTMLDivElement): HTMLSpanElement {
    const existingTextElement = this.getSpokenMessageTextElement(messageElement);
    if (existingTextElement) {
      return existingTextElement;
    }

    const textElement = document.createElement('span');
    textElement.classList.add('spoken-message-text');
    messageElement.appendChild(textElement);
    return textElement;
  }

  private getSpokenMessageText(messageElement: HTMLDivElement | null | undefined): string {
    if (!messageElement) {
      return '';
    }

    return this.getSpokenMessageTextElement(messageElement)?.textContent?.trim() ?? '';
  }

  private setSpokenMessageText(messageElement: HTMLDivElement, text: string) {
    const textElement = this.ensureSpokenMessageTextElement(messageElement);
    textElement.textContent = text;
  }

  private holdSpokenMessage(messageElement: HTMLDivElement | null | undefined) {
    if (!messageElement) {
      return;
    }

    if (!this.getSpokenMessageText(messageElement)) {
      return;
    }

    messageElement.classList.remove('fade-out', 'long-fade-out');
    messageElement.classList.add('fade-in');
    messageElement.style.display = 'block';
  }

  private fadeOutSpokenMessage(
    messageElement: HTMLDivElement | null | undefined,
    speaker: 'user' | 'ai',
  ) {
    if (!messageElement) {
      return;
    }

    if (this.isSpokenMessageHoldActive) {
      this.holdSpokenMessage(messageElement);
      return;
    }

    if (!this.getSpokenMessageText(messageElement)) {
      return;
    }

    messageElement.classList.remove('fade-in', 'long-fade-out');
    messageElement.classList.add('fade-out');
    messageElement.style.display = 'block';

    const hideTimeoutId = setTimeout(() => {
      if (this.isSpokenMessageHoldActive) {
        this.holdSpokenMessage(messageElement);
        return;
      }

      messageElement.style.display = 'none';
      this.setSpokenMessageText(messageElement, '');

      if (speaker === 'user') {
        this.userSpokenFadeTimeoutId = undefined;
      } else {
        this.aiSpokenFadeTimeoutId = undefined;
      }
    }, ONE_SECOND);

    if (speaker === 'user') {
      this.userSpokenFadeTimeoutId = hideTimeoutId;
    } else {
      this.aiSpokenFadeTimeoutId = hideTimeoutId;
    }
  }

  private holdVisibleSpokenMessages() {
    this.isSpokenMessageHoldActive = true;
    this.clearSpokenMessageHideTimers();
    this.holdSpokenMessage(this.userSpokenMessageDiv);
    this.holdSpokenMessage(this.aiSpokenMessageDiv);
  }

  private releaseHeldSpokenMessages() {
    const shouldHideUserMessage = !!this.getSpokenMessageText(this.userSpokenMessageDiv);
    const shouldHideAiMessage = !!this.getSpokenMessageText(this.aiSpokenMessageDiv);

    this.isSpokenMessageHoldActive = false;
    this.clearSpokenMessageHideTimers();

    if (shouldHideUserMessage) {
      this.fadeOutSpokenMessage(this.userSpokenMessageDiv, 'user');
    }

    if (shouldHideAiMessage) {
      this.fadeOutSpokenMessage(this.aiSpokenMessageDiv, 'ai');
    }
  }

  private isDualLiveDiscussionProfile(): boolean {
    return this.profile.discussion_mode === 'dual-live';
  }

  private isAssistantFlushOnPauseProfile(): boolean {
    const profileKey = this.profile.profile_id?.trim() || this.profile.profile_file?.trim() || '';

    return [
      'developer-assistant-session',
      'developer-assistant',
      'appraisal-session',
      'ai-tutor-gmail-session',
    ].includes(profileKey);
  }

  private getDiscussionAgents(): IDiscussionAgentProfile[] {
    return this.profile.assistants ?? [];
  }

  private getDiscussionAgent(
    agentId: 'assistant-agent' | 'user-agent',
  ): IDiscussionAgentProfile | undefined {
    return this.getDiscussionAgents().find((agent) => agent.id === agentId);
  }

  // private getDiscussionVoiceAssistant(agentId: 'assistant-agent' | 'user-agent'): VoiceAssistant {
  //   return agentId === 'assistant-agent' ? // this.voiceAssistant : // this.userAssistant;
  // }

  private getDiscussionInstruction(agentId: 'assistant-agent' | 'user-agent'): string {
    const baseInstructions =
      agentId === 'assistant-agent'
        ? this.assistantAgentInstructions || this.voiceApiInstructions
        : this.userAgentInstructions;

    const topicContext = this.getSelectedDiscussionTopicContext();
    if (!topicContext) {
      return baseInstructions;
    }

    return `${baseInstructions}\n\n${topicContext}`;
  }

  private async loadDiscussionTopics(): Promise<void> {
    if (!this.isDualLiveDiscussionProfile()) {
      return;
    }

    if (this.discussionTopics.length > 0) {
      return;
    }

    const topicsFile = this.profile.topics_file?.trim();
    if (!topicsFile) {
      return;
    }

    const response = await fetch(`${PROFILES_URL}/${topicsFile}`);
    if (!response.ok) {
      throw new Error(`Unable to load topics file "${topicsFile}".`);
    }

    const data = (await response.json()) as { topics?: IDiscussionTopic[] };
    if (!Array.isArray(data.topics) || data.topics.length === 0) {
      throw new Error(`Topics file "${topicsFile}" must contain a non-empty topics array.`);
    }

    this.discussionTopics = data.topics.filter(
      (topic) => !!topic?.id?.trim() && !!topic?.title?.trim() && !!topic?.summary?.trim(),
    );

    if (this.discussionTopics.length === 0) {
      throw new Error(`Topics file "${topicsFile}" does not contain any valid topics.`);
    }
  }

  private selectDiscussionTopic(): void {
    if (this.discussionTopics.length === 0) {
      this.currentDiscussionTopic = null;
      return;
    }

    const index = Math.floor(Math.random() * this.discussionTopics.length);
    this.currentDiscussionTopic = this.discussionTopics[index];
    console.log(
      `[LiveInterfaceService] Selected discussion topic: ${this.currentDiscussionTopic.title}`,
    );
  }

  private async prepareDiscussionTopic(): Promise<void> {
    await this.loadDiscussionTopics();
    this.selectDiscussionTopic();
  }

  private getSelectedDiscussionTopicContext(): string {
    if (!this.currentDiscussionTopic) {
      return '';
    }

    return [
      'Selected session topic:',
      `- Title: ${this.currentDiscussionTopic.title}`,
      `- Summary: ${this.currentDiscussionTopic.summary}`,
      '- Stay focused on this one topic for the full discussion unless the system explicitly tells you to wrap up.',
      '- Treat the exchange as a peer-to-peer coworker discussion with visible back-and-forth.',
      '- Regular turns must stay at 25 words or less.',
      '- Opening and wrap-up turns may be slightly longer, but should stay under 35 words.',
      '- Most turns should end as observations, recommendations, contrasts, or conclusions rather than questions.',
      '- Questions should be occasional, not the default ending for each utterance.',
      '- Keep the conversation discussion-oriented rather than turning it into a broad Q and A session.',
      '- Keep each turn short, cheerful, practical, and connected to the selected topic.',
    ].join('\n');
  }

  private async loadDiscussionAgentInstructions(): Promise<void> {
    if (!this.isDualLiveDiscussionProfile()) {
      return;
    }

    this.assistantAgentInstructions = this.voiceApiInstructions;
    const userAgent = this.getDiscussionAgent('user-agent');
    if (!userAgent?.voice_api_instructions?.trim()) {
      throw new Error('Dual-live discussion profiles require a user-agent voice instruction file.');
    }

    const response = await fetch(`${PROFILES_URL}/${userAgent.voice_api_instructions}`);
    if (!response.ok) {
      throw new Error(`Unable to load instruction file "${userAgent.voice_api_instructions}".`);
    }

    this.userAgentInstructions = await response.text();
  }

  private clearDiscussionTimer(): void {
    if (this.discussionTimerId) {
      clearTimeout(this.discussionTimerId);
      this.discussionTimerId = undefined;
    }
  }

  private startDiscussionTimer(): void {
    this.clearDiscussionTimer();

    const durationMinutes =
      this.profile.session_duration_minutes && this.profile.session_duration_minutes > 0
        ? this.profile.session_duration_minutes
        : 5;
    const durationMs = durationMinutes * 60 * 1000;

    this.discussionTimerId = setTimeout(() => {
      this.wrapUpRequested = true;
    }, durationMs);
  }

  private resetDualDiscussionState(): void {
    this.clearDiscussionTimer();
    for (const timeoutId of Object.values(this.pendingCompletedTurnTimeoutByAgent)) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
    this.pendingCompletedTurnTimeoutByAgent = {};
    this.pendingCompletedTurnByAgent = {
      'assistant-agent': '',
      'user-agent': '',
    };
    this.discardCompletedTurnByAgent = {
      'assistant-agent': false,
      'user-agent': false,
    };
    this.pendingDiscussionSpeaker = null;
    this.pendingDiscussionPrompt = '';
    this.wrapUpRequested = false;
    this.wrapUpTurnsCompleted = 0;
    this.lastDiscussionSpeaker = null;
    this.discussionStarted = false;
    this.isDualDiscussionPaused = false;
    this.currentDiscussionTopic = null;
    this.resumePreRecordedAfterInterruptedAssistant = false;
  }

  private clearPendingCompletedDiscussionTurn(agentId: 'assistant-agent' | 'user-agent'): void {
    const existingTimeout = this.pendingCompletedTurnTimeoutByAgent[agentId];
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      delete this.pendingCompletedTurnTimeoutByAgent[agentId];
    }

    this.pendingCompletedTurnByAgent[agentId] = '';
  }

  private finalizeInterruptedDiscussionMessage(
    agentId: 'assistant-agent' | 'user-agent',
    text: string,
  ): void {
    const trimmed = text.trim();

    if (agentId === 'user-agent') {
      if (trimmed && this.inputMessageDiv) {
        this.chatHistoryService.finalizeMessage(this.inputMessageDiv, trimmed, 'user');
      }
      this.inputMessageDiv = null;
      this.inputTranscription = '';

      if (this.userSpokenMessageDiv && this.profile.show_chatbots) {
        this.fadeOutSpokenMessage(this.userSpokenMessageDiv, 'user');
      }
      return;
    }

    if (trimmed && this.outputMessageDiv) {
      this.chatHistoryService.finalizeMessage(this.outputMessageDiv, trimmed, 'assistant');
    }
    this.outputMessageDiv = null;
    this.outputTranscription = '';

    if (this.aiSpokenMessageDiv && this.profile.show_chatbots) {
      this.fadeOutSpokenMessage(this.aiSpokenMessageDiv, 'ai');
    }
  }

  private async waitForDualDiscussionPlaybackFlush(): Promise<void> {
    while (
      /* this.voiceAssistant.isPlayingOutputAudio || this.userAssistant.isPlayingOutputAudio */ false
    ) {
      await sleep(25);
    }
  }

  private async pauseDualDiscussionPlayback(): Promise<void> {
    const interruptedSpeaker = this.lastDiscussionSpeaker;
    const interruptedText =
      interruptedSpeaker === 'user-agent'
        ? this.inputTranscription.trim()
        : interruptedSpeaker === 'assistant-agent'
          ? this.outputTranscription.trim()
          : '';

    this.isDualDiscussionPaused = true;
    this.audioLevel = 0;
    this.outputAudioLevel = 0;

    this.clearPendingCompletedDiscussionTurn('assistant-agent');
    this.clearPendingCompletedDiscussionTurn('user-agent');

    await Promise.all([
      // this.voiceAssistant.interruptOutputPlayback(),
      // this.userAssistant.interruptOutputPlayback(),
    ]);
    await this.waitForDualDiscussionPlaybackFlush();

    this.pendingDiscussionSpeaker = null;
    this.pendingDiscussionPrompt = '';

    if (interruptedSpeaker) {
      this.discardCompletedTurnByAgent[interruptedSpeaker] = true;
      this.finalizeInterruptedDiscussionMessage(interruptedSpeaker, interruptedText);

      const nextSpeaker = this.getNextDiscussionSpeaker(interruptedSpeaker);
      const nextPrompt = interruptedText
        ? this.buildDiscussionTurnPrompt(nextSpeaker, interruptedSpeaker, interruptedText)
        : this.buildDiscussionTurnPrompt(
            nextSpeaker,
            'system',
            'Continue the discussion with one short practical point about the selected topic.',
          );

      this.pendingDiscussionSpeaker = nextSpeaker;
      this.pendingDiscussionPrompt = nextPrompt;
    }

    if (this.onServiceCallback) {
      setTimeout(() => {
        this.onServiceCallback?.('allowPlayback');
      }, 0);
    }
  }

  private async waitForPreRecordedPlaybackFlush(): Promise<void> {
    while (
      /* this.voiceAssistant.isPlayingOutputAudio || */ this.preRecordedAudioService
        .isPlayingPreRecorded
    ) {
      await sleep(25);
    }
  }

  private async waitForLiveAssistantPlaybackFlush(): Promise<void> {
    while (/* this.voiceAssistant.isPlayingOutputAudio */ false) {
      await sleep(25);
    }
  }

  private async pauseLiveAssistantPlayback(): Promise<void> {
    const interruptedAssistantOutput =
      this.conversationAudioService.isPlayingAIaudio || this.outputTranscription.trim().length > 0;

    if (!interruptedAssistantOutput) {
      this.outputAudioLevel = 0;
      return;
    }

    this.pausedAssistantOutputPendingResume = true;
    this.conversationAudioService.clearAudioQueueAndStopPlayback();

    if (this.outputMessageDiv && this.outputTranscription.trim().length > 0) {
      this.chatHistoryService.finalizeMessage(
        this.outputMessageDiv,
        this.getPreferredAssistantFinalText(this.outputTranscription),
        'assistant',
      );
    }

    this.outputMessageDiv = null;
    this.outputTranscription = '';

    this.outputAudioLevel = 0;
    await this.waitForLiveAssistantPlaybackFlush();
  }

  private async pausePreRecordedPlayback(): Promise<void> {
    const interruptedAssistantOutput =
      this.conversationAudioService.isPlayingAIaudio || this.outputTranscription.trim().length > 0;
    this.resumePreRecordedAfterInterruptedAssistant =
      interruptedAssistantOutput && !this.preRecordedAssistantTurnCompleting;

    if (this.inputFirstTimerId) {
      clearTimeout(this.inputFirstTimerId);
      this.inputFirstTimerId = undefined;
    }

    this.preRecordedAudioService.stopPlaybackImmediately();

    if (interruptedAssistantOutput) {
      this.pausedAssistantOutputPendingResume = true;
      this.conversationAudioService.clearAudioQueueAndStopPlayback();

      if (this.outputMessageDiv && this.outputTranscription.trim().length > 0) {
        this.chatHistoryService.finalizeMessage(
          this.outputMessageDiv,
          this.getPreferredAssistantFinalText(this.outputTranscription),
          'assistant',
        );
      }
      this.outputMessageDiv = null;
      this.outputTranscription = '';
      if (this.aiSpokenMessageDiv && this.profile.show_chatbots) {
        this.fadeOutSpokenMessage(this.aiSpokenMessageDiv, 'ai');
      }
      this.outputAudioLevel = 0;
    }

    this.audioLevel = 0;
    await this.waitForPreRecordedPlaybackFlush();

    if (interruptedAssistantOutput) {
      await this.waitForLiveAssistantPlaybackFlush();
    }

    if (this.onServiceCallback) {
      setTimeout(() => {
        this.onServiceCallback?.('allowPlayback');
      }, 0);
    }
  }

  private async handleAssistantToolCall(name: string, rawArguments: string): Promise<string> {
    let question = '';

    try {
      const parsed = rawArguments ? (JSON.parse(rawArguments) as { question?: string }) : {};
      question = parsed.question?.trim() ?? '';
    } catch {
      question = '';
    }

    if (!question) {
      return JSON.stringify({ error: 'The tool requires a non-empty question.' });
    }

    if (this.isGeneratedSummaryQuestion(question)) {
      return JSON.stringify({ answer: this.getGeneratedSummaryRefusalMessage() });
    }

    if (name === 'analyze_uploaded_pdf') {
      try {
        if (this.usesNativePdfHandling()) {
          return JSON.stringify({
            error:
              'This profile already loads its PDF content directly into the live assistant session. Ask the question normally instead of calling analyze_uploaded_pdf.',
          });
        }

        if (this.hasFoundryAgentProfile()) {
          const answer = await this.foundryAgentService.askQuestion(question);
          return JSON.stringify({ answer });
        }

        const answer = await this.pdfApiService.askQuestionAboutUploadedPdf(
          question,
          this.getPdfToolInstructions(),
        );
        return JSON.stringify({ answer });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return JSON.stringify({ error: message });
      }
    }

    if (name !== 'analyze_current_image') {
      return JSON.stringify({ error: `Unsupported tool: ${name}` });
    }

    if (!this.isSharing) {
      return JSON.stringify({
        error: 'No shared image is available. Ask the user to turn on screen sharing first.',
      });
    }

    this.snapshotIndicatorService.triggerSnapshotCue();
    await this.imageCaptureService.snapshot();
    const imageDataUrl = this.imageCaptureService.getCurrentImageDataUrl();
    this.visionApiService.setCurrentImageDataUrl(imageDataUrl);

    if (!imageDataUrl) {
      return JSON.stringify({
        error:
          'I could not capture a frame from the shared screen yet. Please try again in a moment.',
      });
    }

    try {
      const answer = await this.visionApiService.askQuestionAboutCurrentImage(
        question,
        imageDataUrl,
        this.getVisionConfiguration().visionApiInstructions,
      );
      return JSON.stringify({ answer });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ error: message });
    }
  }

  private async streamDiscussionAgentOutput(
    agentId: 'assistant-agent' | 'user-agent',
    fullText: string,
  ): Promise<void> {
    if (agentId === 'user-agent') {
      if (this.userSpokenFadeTimeoutId) {
        clearTimeout(this.userSpokenFadeTimeoutId);
        this.userSpokenFadeTimeoutId = undefined;
      }

      this.inputTranscription = fullText;
      if (!this.inputMessageDiv) {
        this.inputMessageDiv = this.chatHistoryService.createRealtimeMessage('user');
      }
      this.chatHistoryService.updateChatHistoryDiv(this.inputMessageDiv, this.inputTranscription);
      if (this.userSpokenMessageDiv && this.profile.show_chatbots) {
        await this.updateSpokenMessage(this.inputTranscription, this.userSpokenMessageDiv);
      }
      return;
    }

    if (this.aiSpokenFadeTimeoutId) {
      clearTimeout(this.aiSpokenFadeTimeoutId);
      this.aiSpokenFadeTimeoutId = undefined;
    }

    this.outputTranscription = fullText;
    if (!this.outputMessageDiv) {
      this.outputMessageDiv = this.chatHistoryService.createRealtimeMessage('assistant');
    }
    this.chatHistoryService.updateChatHistoryDiv(this.outputMessageDiv, this.outputTranscription);
    if (this.aiSpokenMessageDiv && this.profile.show_chatbots) {
      await this.updateSpokenMessage(this.outputTranscription, this.aiSpokenMessageDiv);
    }
  }

  private finalizeDiscussionAgentOutput(
    agentId: 'assistant-agent' | 'user-agent',
    fullText: string,
  ): void {
    console.log(
      `[LiveInterfaceService] finalizeDiscussionAgentOutput(${agentId}) length=${fullText.length}`,
    );

    if (agentId === 'user-agent') {
      if (this.inputMessageDiv) {
        this.chatHistoryService.finalizeMessage(this.inputMessageDiv, fullText, 'user');
        this.inputMessageDiv = null;
      }
      this.pendingCompletedTurnByAgent[agentId] = fullText;
      console.log(
        `[LiveInterfaceService] queued completed turn for ${agentId}. waiting for listening status.`,
      );
      const existingTimeout = this.pendingCompletedTurnTimeoutByAgent[agentId];
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }
      this.pendingCompletedTurnTimeoutByAgent[agentId] = setTimeout(() => {
        if (this.pendingCompletedTurnByAgent[agentId]) {
          console.warn(
            `[LiveInterfaceService] ${agentId} did not report listening after completion. Forcing handoff.`,
          );
          const pendingText = this.pendingCompletedTurnByAgent[agentId];
          this.pendingCompletedTurnByAgent[agentId] = '';
          void this.completeDiscussionTurn(agentId, pendingText);
        }
      }, 20000);
      return;
    }

    if (this.outputMessageDiv) {
      this.chatHistoryService.finalizeMessage(this.outputMessageDiv, fullText, 'assistant');
      this.outputMessageDiv = null;
    }
    this.pendingCompletedTurnByAgent[agentId] = fullText;
    console.log(
      `[LiveInterfaceService] queued completed turn for ${agentId}. waiting for listening status.`,
    );
    const existingTimeout = this.pendingCompletedTurnTimeoutByAgent[agentId];
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    this.pendingCompletedTurnTimeoutByAgent[agentId] = setTimeout(() => {
      if (this.pendingCompletedTurnByAgent[agentId]) {
        console.warn(
          `[LiveInterfaceService] ${agentId} did not report listening after completion. Forcing handoff.`,
        );
        const pendingText = this.pendingCompletedTurnByAgent[agentId];
        this.pendingCompletedTurnByAgent[agentId] = '';
        void this.completeDiscussionTurn(agentId, pendingText);
      }
    }, 20000);
  }

  private getNextDiscussionSpeaker(
    lastSpeaker: 'assistant-agent' | 'user-agent',
  ): 'assistant-agent' | 'user-agent' {
    return lastSpeaker === 'assistant-agent' ? 'user-agent' : 'assistant-agent';
  }

  private buildWrapUpPrompt(
    speaker: 'assistant-agent' | 'user-agent',
    previousTurn: string,
  ): string {
    const topicLine = this.currentDiscussionTopic
      ? `Selected topic: ${this.currentDiscussionTopic.title}. ${this.currentDiscussionTopic.summary}`
      : '';

    if (this.wrapUpTurnsCompleted === 0) {
      return [
        topicLine,
        previousTurn,
        '',
        `System instruction: The ${this.profile.session_duration_minutes || 2.5}-minute discussion window has been reached. Begin wrapping up now. Offer a concise cheerful closing reflection on the selected topic in under 35 words, then say goodbye with courtesy and gratitude.`,
      ].join('\n');
    }

    return [
      topicLine,
      previousTurn,
      '',
      `System instruction: Deliver your final cheerful goodbye now as ${speaker}. Keep it concise, courteous, grateful, focused on the selected topic, and under 35 words so the session can end after your audio finishes.`,
    ].join('\n');
  }

  private buildDiscussionTurnPrompt(
    speaker: 'assistant-agent' | 'user-agent',
    previousSpeaker: 'assistant-agent' | 'user-agent' | 'system',
    previousTurn: string,
  ): string {
    const counterpart = speaker === 'assistant-agent' ? 'user-agent' : 'assistant-agent';
    const topicTitle = this.currentDiscussionTopic?.title ?? 'Selected Topic';
    const topicSummary =
      this.currentDiscussionTopic?.summary ??
      'Focus on the chosen topic from the railway document.';

    if (previousSpeaker === 'system') {
      return [
        `System instruction for ${speaker}:`,
        `Selected discussion topic: ${topicTitle}.`,
        `Topic summary: ${topicSummary}`,
        previousTurn,
        '',
        `Briefly announce the selected topic, then speak directly to ${counterpart} in one concise cheerful coworker turn. Prefer ending with an observation or recommendation, not a question. Keep it under 35 words.`,
      ].join('\n');
    }

    return [
      `System instruction for ${speaker}:`,
      `Selected discussion topic: ${topicTitle}.`,
      `Topic summary: ${topicSummary}`,
      `The previous completed turn came from ${previousSpeaker}.`,
      `Respond directly to ${previousSpeaker} in one concise cheerful coworker turn. Build on their latest point with an observation, recommendation, contrast, or conclusion. Use a question only occasionally. Keep it to 25 words or less.`,
      '',
      `${previousSpeaker} said:`,
      previousTurn,
    ].join('\n');
  }

  private async dispatchDiscussionTurn(
    speaker: 'assistant-agent' | 'user-agent',
    prompt: string,
  ): Promise<void> {
    const assistant = this.liveAssistantService;

    if (!prompt.trim() || !this.isRecording) {
      return;
    }

    if (this.isDualDiscussionPaused || this.serviceMode === 'pauseRecording') {
      this.pendingDiscussionSpeaker = speaker;
      this.pendingDiscussionPrompt = prompt;
      return;
    }

    this.pendingDiscussionSpeaker = null;
    this.pendingDiscussionPrompt = '';
    this.lastDiscussionSpeaker = speaker;
    this.discardCompletedTurnByAgent[speaker] = false;
    console.log(
      `[LiveInterfaceService] Dispatching dual discussion turn to ${speaker}. promptLength=${prompt.length}`,
    );
    await assistant.sendMessage(prompt);
  }

  private async completeDiscussionTurn(
    agentId: 'assistant-agent' | 'user-agent',
    fullText: string,
  ): Promise<void> {
    console.log(
      `[LiveInterfaceService] completeDiscussionTurn(${agentId}) length=${fullText.length} wrapUpRequested=${this.wrapUpRequested} wrapUpTurnsCompleted=${this.wrapUpTurnsCompleted}`,
    );

    const existingTimeout = this.pendingCompletedTurnTimeoutByAgent[agentId];
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      delete this.pendingCompletedTurnTimeoutByAgent[agentId];
    }

    if (agentId === 'user-agent') {
      if (this.userSpokenMessageDiv && this.profile.show_chatbots) {
        this.fadeOutSpokenMessage(this.userSpokenMessageDiv, 'user');
      }
      this.inputTranscription = '';
    } else {
      if (this.aiSpokenMessageDiv && this.profile.show_chatbots) {
        this.fadeOutSpokenMessage(this.aiSpokenMessageDiv, 'ai');
      }
      this.outputTranscription = '';
    }

    if (!this.isRecording || this.serviceMode === 'stopRecording') {
      console.warn(
        `[LiveInterfaceService] completeDiscussionTurn(${agentId}) exiting early. isRecording=${this.isRecording} serviceMode=${this.serviceMode}`,
      );
      return;
    }

    const nextSpeaker = this.getNextDiscussionSpeaker(agentId);
    let nextPrompt = this.buildDiscussionTurnPrompt(nextSpeaker, agentId, fullText);

    if (this.wrapUpRequested) {
      if (this.wrapUpTurnsCompleted >= 2) {
        await this.stopRecording();
        return;
      }

      nextPrompt = this.buildWrapUpPrompt(nextSpeaker, fullText);
      this.wrapUpTurnsCompleted += 1;
    }

    // Add a brief human-like pause before the next agent takes the floor.
    await sleep(1100);

    await this.dispatchDiscussionTurn(nextSpeaker, nextPrompt);
  }

  handleTextFromUser(text: string, forwardToAssistant: boolean = true) {
    if (forwardToAssistant) {
      this.pendingPausedUserText = '';
      this.pausedUserResponsePendingSend = false;
      this.pausedAssistantOutputPendingResume = false;
    }

    this.renderUserText(text);

    if (forwardToAssistant) {
      void this.liveAssistantService.sendMessage(text).catch((error) => {
        console.error('[LiveInterfaceService] Error sending text message:', error);
      });
    }
  }

  private normalizeDialogueDirection(direction: string | undefined): string {
    return direction?.trim().toLowerCase() ?? '';
  }

  private hasVisionInstructions(): boolean {
    return !!this.profile.vision_api_instructions?.trim() && !!this.visionApiInstructions.trim();
  }

  private getComposedVoiceInstructions(): string {
    let voiceApiInstructions = this.voiceApiInstructions;

    if (this.promptPreamble.trim()) {
      voiceApiInstructions +=
        '\n\nThe following JSON dialogue script is the only source of truth for this profile. Use it to determine the intended conversation flow and respond with the same meaning as the next expected Output.\n\n' +
        this.promptPreamble;
    }

    const history = this.chatHistoryService.getChatHistory();
    const shouldIncludeHistory = !(this.profile.pre_recorded && this.promptPreamble.trim());
    const maxMessages = 1000;

    if (shouldIncludeHistory && history && history.length > 0) {
      const recent = history.slice(-maxMessages);
      const serialized = recent.map((m) => `${m.sender}: ${m.text}`).join('\n');

      voiceApiInstructions +=
        '\n\nHere is the recent conversation history between the user and the assistant. Use it as context when responding in this new session:\n' +
        serialized;
    }

    return voiceApiInstructions;
  }

  private parseDialogueScript(dialogueText: string): IDialogue[] {
    let parsed: unknown;

    try {
      parsed = JSON.parse(dialogueText);
    } catch (error) {
      throw new Error('The dialogue file is not valid JSON.');
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('The dialogue file must contain a non-empty JSON array.');
    }

    const dialogue = parsed as IDialogue[];
    for (const item of dialogue) {
      const direction = this.normalizeDialogueDirection(item.direction);
      if (!direction || (direction !== 'input' && direction !== 'output')) {
        throw new Error('Each dialogue item must define direction as Input or Output.');
      }

      if (typeof item.utterance !== 'string' || item.utterance.trim().length === 0) {
        throw new Error('Each dialogue item must define a non-empty utterance.');
      }
    }

    return dialogue;
  }

  private async completeAssistantTurn(): Promise<void> {
    this.preRecordedAssistantTurnCompleting = true;

    try {
      while (false /*  */) {
        await sleep(ONE_SECOND);
      }

      await sleep(ONE_SECOND);

      if (this.aiSpokenMessageDiv && this.profile.show_chatbots) {
        this.fadeOutSpokenMessage(this.aiSpokenMessageDiv, 'ai');
      }

      this.greetingsFromAiSpoken = true;

      if (this.profile.pre_recorded && this.isRecording) {
        while (this.serviceMode === 'pauseRecording') {
          await sleep(ONE_SECOND);
        }

        if (this.serviceMode !== 'stopRecording') {
          await this.preRecordedDialogue();
        }
      }

      this.outputTranscription = '';
    } finally {
      this.preRecordedAssistantTurnCompleting = false;
    }
  }

  private startPreRecordedConversation(): void {
    if (!this.profile.pre_recorded || !this.dialogueUtterance?.length) {
      return;
    }

    const inputUtterances = this.dialogueUtterance.filter(
      (item) => this.normalizeDialogueDirection(item.direction) === 'input',
    );

    let dialogueIndex = this.dialogueUtterance.findIndex(
      (item) =>
        this.normalizeDialogueDirection(item.direction) === 'input' &&
        item.utterance.includes(this.profile.inputs_opening_utterance as string),
    );

    if (dialogueIndex === -1) {
      dialogueIndex = this.dialogueUtterance.findIndex(
        (item) => this.normalizeDialogueDirection(item.direction) === 'input',
      );
    }

    if (dialogueIndex === -1) {
      throw new Error('The dialogue file does not contain any Input utterances.');
    }

    const fileIndex = Math.max(
      0,
      inputUtterances.findIndex((item) =>
        item.utterance.includes(this.dialogueUtterance?.[dialogueIndex].utterance ?? ''),
      ),
    );

    this.dialogueIndex = dialogueIndex;
    this.preRecordedAudioService.setFileIndex(fileIndex);
    void this.preRecordedDialogue();
  }

  get appraisalCount(): number {
    const appraisalCountString = localStorage.getItem(this.profile.profile_id + 'appraisalCount');
    if (appraisalCountString) {
      const appraisalCount = JSON.parse(appraisalCountString);
      return appraisalCount;
    }
    return 0;
  }

  set appraisalCount(value: number) {
    const appraisalCountString = JSON.stringify(value);
    localStorage.setItem(this.profile.profile_id + 'appraisalCount', appraisalCountString);
  }

  get appraisalSummaryHtmls(): any[] {
    const appraisalSummaryHtmlsString = localStorage.getItem(
      this.profile.profile_id + 'appraisalSummaryHtmls',
    );
    if (appraisalSummaryHtmlsString) {
      const appraisalSummaryHtmls = JSON.parse(appraisalSummaryHtmlsString);
      return appraisalSummaryHtmls;
    }
    // Return an empty array if not found, to indicate an invalid or missing
    return [];
  }

  set appraisalSummaryHtmls(value: any[]) {
    const appraisalSummaryHtmlsString = JSON.stringify(value);
    localStorage.setItem(
      this.profile.profile_id + 'appraisalSummaryHtmls',
      appraisalSummaryHtmlsString,
    );
  }

  removeHtmlLinks() {
    const container = document.getElementById('page-links-container');
    if (container) {
      container.innerHTML = '';
    }
  }

  createHtmlLink(containerId: string, htmlContent: string, fileName: string) {
    // 1. Create the Blob with 'text/html' type
    const blob = new Blob([htmlContent], { type: 'text/html' });
    // 2. Generate the temporary URL
    const url = URL.createObjectURL(blob);
    // 3. Create and configure the anchor tag
    const link = document.createElement('a');
    link.href = url;
    link.textContent = `${fileName}`;
    link.target = '_blank'; // Ensures it opens in a new tab
    // Optional: Styling the link to look like a button
    link.style.display = 'flex';
    link.style.marginTop = '35px';
    link.style.marginRight = '10px';
    link.style.padding = '10px 10px 10px 10px';
    link.style.justifyContent = 'center';
    link.style.backgroundColor = '#323232';
    link.style.color = 'white';
    link.style.textDecoration = 'none';
    link.style.borderRadius = '5px';
    link.style.width = '175px';
    link.style.height = '20px';

    // Fade-in animation
    link.style.opacity = '0';
    link.style.transition = 'opacity 0.5s ease-in-out';

    const container = document.getElementById(containerId);
    if (container) {
      // container.innerHTML = ''; // Clear previous links
      container.appendChild(link);
      // Trigger the fade-in after the element is added to the DOM
      setTimeout(() => {
        link.style.opacity = '1';
      }, 10);
    }
  }

  private generateAppraisalSummaryHtml(propertyAppraisalHtmls: IHtmlPage[]) {
    for (const propertyAppraisalHtml of propertyAppraisalHtmls) {
      this.createHtmlLink(
        'page-links-container',
        propertyAppraisalHtml.html,
        propertyAppraisalHtml.pageTitle,
      );
    }
  }

  public renderAppraisalSummaryHtmls(
    propertyAppraisalHtmls: IHtmlPage[] = this.appraisalSummaryHtmls,
  ) {
    this.generateAppraisalSummaryHtml(propertyAppraisalHtmls);
  }

  public clearGeneratedAppraisalSummaries() {
    this.appraisalCount = 0;
    this.appraisalSummaryHtmls = [];
  }

  public async createAppraisalSummaryHtmls(): Promise<IHtmlPage[]> {
    if (!this.profile.pdf_summary) {
      return [];
    }

    const summaryResults = await this.pdfApiService.getAppraisalSummaryData(
      this.dataInstructions,
      (file, percent) => this.onProgress(file, percent),
    );

    const summaryHtmls = summaryResults.map(({ fileName, data }) =>
      this.createAppraisalSummaryHtmlPage(fileName, data),
    );

    this.appraisalSummaryHtmls = summaryHtmls;
    this.appraisalCount = summaryHtmls.length;
    this.onProgress(this.appraisalCount, 100);
    return summaryHtmls;
  }

  public async setPdfFiles(files: Array<File>) {
    const nativePdfAssistant = this.getNativePdfAssistant();
    if (nativePdfAssistant?.setPdfFiles) {
      nativePdfAssistant.setPdfFiles(files);
    } else {
      this.pdfApiService.setUploadedPdfFiles(files);
    }
    this.clearGeneratedAppraisalSummaries();
  }

  public clearPdfFiles(): void {
    const nativePdfAssistant = this.getNativePdfAssistant();
    if (nativePdfAssistant?.clearPdfFiles) {
      nativePdfAssistant.clearPdfFiles();
    } else {
      this.pdfApiService.clearUploadedPdfFiles();
    }
    this.clearGeneratedAppraisalSummaries();
  }

  private getNativePdfAssistant(): {
    setPdfFiles?: (files: File[]) => void;
    clearPdfFiles?: () => void;
  } | null {
    const liveAssistant = this.liveAssistantService as ILiveAssistantService & {
      setPdfFiles?: (files: File[]) => void;
      clearPdfFiles?: () => void;
    };

    if (
      typeof liveAssistant.setPdfFiles !== 'function' &&
      typeof liveAssistant.clearPdfFiles !== 'function'
    ) {
      return null;
    }

    return liveAssistant;
  }

  private usesNativePdfHandling(): boolean {
    return !this.hasFoundryAgentProfile() && this.getNativePdfAssistant() !== null;
  }

  private isGeneratedSummaryQuestion(question: string): boolean {
    const normalizedQuestion = question.trim().toLowerCase();

    if (!normalizedQuestion) {
      return false;
    }

    const summarySignals = [
      'summary',
      'summaries',
      'html summary',
      'html summaries',
      'output links',
      'output links panel',
      'generated html',
      'generated summary',
      'generated summaries',
      'appraisal summary',
      'appraisal summaries',
      'property appraisal summary',
      'property appraisal summaries',
    ];

    return summarySignals.some((signal) => normalizedQuestion.includes(signal));
  }

  private getGeneratedSummaryRefusalMessage(): string {
    return 'I cannot answer questions on the property appraisal summary, only the property appraisal document.';
  }

  private createAppraisalSummaryHtmlPage(
    fileName: string,
    summaryData: IAppraisalSummaryData,
  ): IHtmlPage {
    let html = this.dataSummaryTemplate;

    for (const [key, field] of Object.entries(summaryData)) {
      html = html.replaceAll(`{${key}}`, field.value || '');
      html = html.replaceAll(`{${key} Page}`, field.pageNumber || 'Unknown');
    }

    return {
      pageTitle: this.getAppraisalSummaryPageTitle(fileName),
      html,
    };
  }

  private getAppraisalSummaryPageTitle(fileName: string): string {
    return fileName.replace(/\.pdf$/i, '') || 'appraisal-summary';
  }

  get getChatHistoryCount() {
    return this.chatHistoryService.getChatHistory().length;
  }

  public getPendingPausedUserText(): string {
    return this.pendingPausedUserText;
  }

  private setupServiceCallbacks() {
    this.preRecordedAudioService.onLevelChange = (level: number) => {
      if (this.profile.pre_recorded) {
        this.audioLevel = level;
      }
    };

    this.liveAssistantService.onMessageReceived((msg: any, isStreaming?: boolean) => {
      console.log(`[LiveInterfaceService] onMessageReceived: sender=${msg.sender}, text="${msg.text?.substring(0,20)}...", isStreaming=${isStreaming}`);
      if (msg.sender === 'user') {
        const fullText = msg.text ?? '';
        let delta = fullText;
        if (fullText.startsWith(this.inputTranscription)) {
          delta = fullText.substring(this.inputTranscription.length);
        }

        if (delta.length > 0) {
          void this.onInputTranscription(delta);
        }
      }

      if (msg.sender === 'assistant') {
        const fullText = msg.text ?? '';
        let delta = fullText;
        if (fullText.startsWith(this.outputTranscription)) {
          delta = fullText.substring(this.outputTranscription.length);
        }

        if (delta.length > 0 || fullText.length === 0) {
          void this.onOutputTranscription(delta);
        }

        if (isStreaming === false) {
          if (this.outputMessageDiv) {
            this.chatHistoryService.finalizeMessage(
              this.outputMessageDiv,
              this.getPreferredAssistantFinalText(fullText),
              'assistant',
            );
            this.outputMessageDiv = null;
            this.outputTranscription = '';
          }
          void this.completeAssistantTurn();
        }
      }
    });

    // ConversationAudioService callbacks
    const history = this.chatHistoryService.getChatHistory();

    // this.geminiSessionService.setChatMessageHistory(history);
    this.conversationAudioService.onAudioDataReady = this.onAudioDataReady.bind(this);
    this.conversationAudioService.onPlaybackStarted = this.onPlaybackStarted.bind(this);
    this.conversationAudioService.onPlaybackStopped = this.onPlaybackStopped.bind(this);
    this.conversationAudioService.onAudioSystemError = this.onAudioSystemError.bind(this);
    this.conversationAudioService.onSpeechDetectedChange = this.onSpeechDetectedChange.bind(this);
    this.conversationAudioService.onOutputLevelChange = (level: number) => {
      this.outputAudioLevel = level;
    };
      this.conversationAudioService.onInputLevelChange = (level: number) => {
        this.audioLevel = level;
      };

    // ImageCaptureService Callbacks
    this.imageCaptureService.onImageReady = this.onImageReady.bind(this);

    // LiveAssistantService Audio Callback
    this.liveAssistantService.onAudioReceived((audio: ArrayBuffer) => {
      if (this.pausedAssistantOutputPendingResume || this.pausedUserResponsePendingSend) {
        return;
      }

      this.conversationAudioService.playAudio(audio);
    });

    this.liveAssistantService.onSetupComplete(this.onSetupComplete.bind(this));
  }

  private async onAudioDataReady(data: ArrayBuffer) {
    this.liveAssistantService.sendAudio(data);
  }

  private onPlaybackStarted() {
    // log playback started if needed
  }

  private onPlaybackStopped() {
    if (!this.isRecording) {
      console.log('[LiveInterfaceService] Audio playback stopped.');
    } else if (this.isRecording) {
      console.log('[LiveInterfaceService] Listening...');
    }
  }

  private onAudioSystemError(message: string) {
    console.error('[LiveInterfaceService] Audio system error:', message);
  }

  private async onSpeechDetectedChange(detected: boolean) {
    if (detected && this.allowRudeInteruption && this.conversationAudioService.isPlayingAIaudio) {
      this.conversationAudioService.clearAudioQueueAndStopPlayback();
    }

    // Use speech detection to drive the visibility of the user spoken-message bubble.
    if (!this.userSpokenMessageDiv || !this.profile.show_chatbots) {
      return;
    }

    const el = this.userSpokenMessageDiv;

    if (detected) {
      // User started (or continues) speaking: cancel any pending fade-out and ensure bubble is visible.
      if (this.userSpokenFadeTimeoutId) {
        clearTimeout(this.userSpokenFadeTimeoutId);
        this.userSpokenFadeTimeoutId = undefined;
      }

      el.classList.remove('fade-out', 'long-fade-out');
      el.classList.add('fade-in');
      if (el.textContent && el.textContent.trim() !== '') {
        el.style.display = 'block';
      }
    } else {
      // User stopped speaking: after a short delay, fade out and hide if no new speech starts.
      if (this.userSpokenFadeTimeoutId) {
        clearTimeout(this.userSpokenFadeTimeoutId);
      }

      this.userSpokenFadeTimeoutId = setTimeout(() => {
        // If speech restarted, don't hide.
        if (this.conversationAudioService.isUserSpeaking || !this.userSpokenMessageDiv) {
          return;
        }

        this.fadeOutSpokenMessage(this.userSpokenMessageDiv, 'user');
      }, FIFTEEN_HUNDRED_MS);
    }
  }

  private async onImageReady(imageData: { base64: string; mimeType: string }) {
    if (this.greetingsFromAiSpoken === false) {
      // Ignore data until greetings from AI have been spoken
      return;
    }
    this.liveAssistantService.sendImage(imageData);
  }

  private async onRestartRecording() {
    // Look like we are paused, but we are stop and ready to manually be restarted
    console.log('[LiveInterfaceService] onRestartRecording');
    this.stopRecording();
  }

  private onPauseRecording() {
    if (this.onServiceCallback) {
      this.onServiceCallback('pauseRecording');
    }
  }

  private onGetServiceMode() {
    return this.serviceMode;
  }

  private onProgress(file: number, percent: number) {
    if (this.onProgressCallback) {
      this.onProgressCallback(file, percent);
    }
  }

  private onCanCloseSession() {
    const isUserSideActive = this.isDualLiveDiscussionProfile()
      ? false // this.userAssistant.isPlayingOutputAudio || this.inputTranscription.trim().length > 0
      : this.conversationAudioService.isUserSpeaking ||
        this.preRecordedAudioService.isPlayingPreRecorded ||
        this.inputTranscription.trim().length > 0;

    const isAssistantSideActive =
      false /* this.voiceAssistant.isPlayingOutputAudio */ ||
      this.outputTranscription.trim().length > 0;

    if (isUserSideActive || isAssistantSideActive) {
      return false;
    }
    return true;
  }

  private isSeamlessReconnect(): boolean {
    return (this.liveAssistantService as { isAutoReconnecting?: boolean }).isAutoReconnecting === true;
  }

  private async onSetupComplete() {
    console.log('[LiveInterfaceService] Setup complete. Ready to talk or Upload Image');
    this.conversationAudioService.setIsSetupComplete(true);
    this.imageCaptureService.setIsSetupComplete(true);
    // If we intended to be recording before a disconnect, resume now
    if (this.resumeRecordingAfterReconnect) {
      console.log('[LiveInterfaceService] Resuming recording after reconnect...');
      try {
        this.conversationAudioService.setIsRecording(true);
        this.imageCaptureService.setIsRecording(true);
        this.isRecording = true;
      } catch (e) {
        console.warn(
          '[LiveInterfaceService] Error setting session on ConversationAudioService before resume:',
          e,
        );
      }

      this.resumeRecordingAfterReconnect = false;
    }

    console.log('[LiveInterfaceService] onSetupComplete state:', {
      isRecording: this.isRecording,
      hasImagePreview: !!this.imagePreview?.src,
      resumeRecordingAfterReconnect: this.resumeRecordingAfterReconnect,
    });

    if (this.isRecording) {
      const audioSystemReady = await this.conversationAudioService.initializeAudioSystem();
      if (!audioSystemReady) {
        console.warn('[LiveInterfaceService] Audio system failed to reinitialize after reconnect.');
        this.cleanupAfterErrorOrClose(true);
        return;
      }

      await this.conversationAudioService.startMicrophone();
      console.log('[LiveInterfaceService] Starting periodic image sending for active recording.');
      this.imageCaptureService.startPeriodicImageSending();
    } else if (this.imagePreview && this.imagePreview.src) {
      // Check if an image is loaded
      console.log('[LiveInterfaceService] Starting periodic image sending for loaded image preview.');
      this.imageCaptureService.startPeriodicImageSending();
    } else {
      console.warn('[LiveInterfaceService] Setup complete but periodic image sending was not started.');
    }
  }

  private onSessionResumptionUpdate(newHandle: any) {
    // Handle session resumption updates, e.g., save new handle to local storage
    this.chatHistoryService.saveChatHistory(); // Save chat history when session handle updates
  }

  private async onInputTranscription(text: string) {
    if (this.pausedUserResponsePendingSend && !this.isMuted && this.serviceMode === 'startRecording') {
      this.pendingPausedUserText = '';
      this.pausedUserResponsePendingSend = false;
    }

    // New user speech coming in: cancel any pending fade-out of the user bubble
    if (this.userSpokenFadeTimeoutId) {
      clearTimeout(this.userSpokenFadeTimeoutId);
      this.userSpokenFadeTimeoutId = undefined;
    }

    if (this.inputTranscriptionTimerId) {
      clearTimeout(this.inputTranscriptionTimerId);
    }
    this.inputTranscription += text;

    // Create message bubble on the first event
    if (!this.inputMessageDiv) {
      this.inputMessageDiv = this.chatHistoryService.createRealtimeMessage('user');
    }
    // Update the message bubble with new text
    this.chatHistoryService.updateChatHistoryDiv(this.inputMessageDiv, this.inputTranscription);
    if (this.userSpokenMessageDiv && this.profile.show_chatbots) {
      await this.updateSpokenMessage(this.inputTranscription, this.userSpokenMessageDiv);
    }

    this.inputTranscriptionTimerId = setTimeout(async () => {
      if (this.inputMessageDiv) {
        this.chatHistoryService.finalizeMessage(
          this.inputMessageDiv,
          this.inputTranscription,
          'user',
        );
        this.inputMessageDiv = null; // Clear the reference
        this.inputTranscription = '';

        // User has stopped speaking for FIFTEEN_HUNDRED_MS: fade out and hide the bubble
        if (this.userSpokenMessageDiv && this.profile.show_chatbots) {
          this.fadeOutSpokenMessage(this.userSpokenMessageDiv, 'user');
        }
      }
    }, FIFTEEN_HUNDRED_MS);
  }

  private async onOutputTranscription(text: string) {
    if (this.pausedAssistantOutputPendingResume || this.pausedUserResponsePendingSend) {
      return;
    }

    if (this.aiSpokenFadeTimeoutId) {
      clearTimeout(this.aiSpokenFadeTimeoutId);
      this.aiSpokenFadeTimeoutId = undefined;
    }

    if (this.outputTranscriptionTimeoutId) {
      clearTimeout(this.outputTranscriptionTimeoutId);
      this.outputTranscriptionTimeoutId = undefined;
    }

    this.outputTranscription += text;

    if (this.inputFirstTimerId) {
      clearTimeout(this.inputFirstTimerId);
      this.inputFirstTimerId = undefined;
    }

    // Create message bubble on the first event
    if (!this.outputMessageDiv) {
      this.outputMessageDiv = this.chatHistoryService.createRealtimeMessage('assistant');
    }
    // Update the message bubble with new text
    this.chatHistoryService.updateChatHistoryDiv(this.outputMessageDiv, this.outputTranscription);

    if (this.aiSpokenMessageDiv && this.profile.show_chatbots) {
      await this.updateSpokenMessage(this.outputTranscription, this.aiSpokenMessageDiv);
    }
  }

  private getPreferredAssistantFinalText(fullText: string): string {
    if (this.outputTranscription.length === 0) {
      return fullText;
    }

    if (fullText.length === 0) {
      return this.outputTranscription;
    }

    if (fullText.startsWith(this.outputTranscription)) {
      return fullText;
    }

    if (this.outputTranscription.startsWith(fullText)) {
      return this.outputTranscription;
    }

    return this.outputTranscription;
  }

  private onAudioData(audioBuffer: any) {
    if (this.pausedAssistantOutputPendingResume) {
      return;
    }

    this.conversationAudioService.enqueueAudio(audioBuffer);
  }

  private async onTurnComplete() {
    // This is where the pre_recorded magic happens
    // If there is more audio in the queue, we can process here. If not
    if (this.outputTranscription.length > 0) {
      // Finalize the output message
      if (this.outputMessageDiv) {
        this.chatHistoryService.finalizeMessage(
          this.outputMessageDiv,
          this.outputTranscription,
          'AI',
        );
        this.outputMessageDiv = null; // Clear the reference
        this.outputTranscription = '';
      }

      // Wait for recording to start again
      while (!this.isRecording) {
        await sleep(ONE_SECOND);
      }

      if (this.outputTranscription.length === 0) {
        return;
      }

      // pre-recorded dialogue handling a pause in playback
      while (this.serviceMode === 'pauseRecording') {
        await sleep(ONE_SECOND);
      }

      this.preRecordedDialogue();
      setTimeout(async () => {
        if (this.aiSpokenMessageDiv) {
          this.outputTranscription = '';
          await this.updateSpokenMessage(this.outputTranscription, this.aiSpokenMessageDiv);
          console.log('[LiveInterfaceService] Clear spoken message after turn complete.');
        }
      }, ONE_SECOND);
    }
    if (!this.isRecording) {
      console.log('[LiveInterfaceService] Ready to talk or Upload Image');
    }
    if (this.allowRudeInteruption) {
      if (this.conversationAudioService.isPlayingAIaudio) {
        this.conversationAudioService.clearAudioQueueAndStopPlayback();
      }
    }
  }

  private onError(message: string) {
    console.error('[LiveInterfaceService] Error:', message);
    this.cleanupAfterErrorOrClose(true);
  }

  private onClose(wasClean: boolean, code: number, reason: string) {
    let statusMsg = 'Disconnected.';
    const isSeamlessReconnect = this.isSeamlessReconnect();

    if (!wasClean && this.isRecording && !isSeamlessReconnect) {
      statusMsg = `Disconnected unexpectedly (Code: ${code})`;
      console.error('[LiveInterfaceService] Status update:', statusMsg, true);
    } else if (code === 1000 && !this.isRecording) {
      statusMsg = 'Call ended.';
      console.log('[LiveInterfaceService] Status update:', statusMsg);
    } else if (code !== 1000 && !isSeamlessReconnect) {
      statusMsg = `Disconnected (Code: ${code})`;
      console.log('[LiveInterfaceService] Status update:', statusMsg);
    } else if (!isSeamlessReconnect) {
      console.log('[LiveInterfaceService] Status update:', statusMsg);
    }

    if (code !== 1000 || wasClean !== true || isSeamlessReconnect) {
      this.resumeRecordingAfterReconnect = this.isRecording; // Preserve recording state
    }

    if (this.serviceMode === 'pauseRecording' && this.isRecording) {
      this.resumeRecordingAfterReconnect = true;
    }

    if (!isSeamlessReconnect && (code !== 1000 || wasClean !== true)) {
      if (!this.resumeRecordingAfterReconnect) {
        this.stopRecordingButton?.click();
      }
    }

    this.cleanupAfterErrorOrClose(false, isSeamlessReconnect);
  }

  get audioInterfacePlaying() {
    return this.preRecordedAudioService.isPlayingPreRecorded;
  }

  getElapsedTime(): string {
    // This function handles the endurance testing dialogue flow
    const now = new Date();
    const elapsedMilliseconds = now.getTime() - this.timeStartedEndurance.getTime();

    const hours = Math.floor(elapsedMilliseconds / 3600000);
    const minutes = Math.floor((elapsedMilliseconds % 3600000) / 60000);
    const seconds = Math.floor((elapsedMilliseconds % 60000) / 1000);
    const milliseconds = elapsedMilliseconds % 1000;
    const pad = (num: number, size: number) => num.toString().padStart(size, '0');
    const elapsedTime = `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(milliseconds, 3)}`;
    return elapsedTime;
  }

  private async preRecordedDialogue() {
    // This design assumes that the output from Gemini is a single utterance, but the input
    // may be multiple utterances in sequence before the next AI response.

    // Ensure pre-recorded dialogue is enabled
    if (!this.profile.pre_recorded) {
      return;
    }
    this.serviceMode = 'startPlayback';

    if (this.dialogueIndex === this.dialogueUtterance!.length - 1) {
      // Stop the recording if we've reached the end of the dialogue
      if (this.onServiceCallback) {
        this.onServiceCallback('stopRecording');
        if (this.profile.go_bridge) {
          this.onServiceCallback('goBridge');
        }
        return;
      }
    }

    // Check if a dialogue utterance array exists
    if (this.dialogueUtterance) {
      while (
        this.dialogueIndex < this.dialogueUtterance.length &&
        this.normalizeDialogueDirection(this.dialogueUtterance[this.dialogueIndex].direction) ===
          'output'
      ) {
        this.dialogueIndex++;
      }

      let inputChain = [];
      // Loop to find all consecutive 'input' utterances
      while (
        this.dialogueIndex < this.dialogueUtterance.length &&
        this.normalizeDialogueDirection(this.dialogueUtterance[this.dialogueIndex].direction) ===
          'input'
      ) {
        inputChain.push(this.dialogueUtterance[this.dialogueIndex]);
        this.dialogueIndex++;
      }

      // Process the chain of 'input' utterances if found
      if (inputChain.length > 0) {
        // Play each utterance's audio and add to chat history with a delay
        for (const dialogue of inputChain) {
          await sleep(dialogue.delay * ONE_SECOND);

          if (!this.inputMessageDiv) {
            this.inputMessageDiv = this.chatHistoryService.createRealtimeMessage('user');
          }
          // Update the message bubble with new text
          this.chatHistoryService.updateChatHistoryDiv(
            this.inputMessageDiv,
            this.inputTranscription,
          );
          if (this.userSpokenMessageDiv && this.profile.show_chatbots) {
            await this.updateSpokenMessage(dialogue.utterance, this.userSpokenMessageDiv);
          }
          await this.preRecordedAudioService.playNextAudio();
          const tempMessageDiv = this.chatHistoryService.createRealtimeMessage('user');
          this.chatHistoryService.updateChatHistoryDiv(tempMessageDiv, dialogue.utterance);
          this.chatHistoryService.finalizeMessage(tempMessageDiv, dialogue.utterance, 'user');
          this.dialogueInput = dialogue.utterance;

          while (this.preRecordedAudioService.isPlayingPreRecorded) {
            await sleep(ONE_SECOND);
          }

          while (this.serviceMode === 'pauseRecording') {
            await sleep(ONE_SECOND);
          }

          this.inputMessageDiv = null; // Clear the reference
          this.inputTranscription = '';
          if (this.userSpokenMessageDiv && this.profile.show_chatbots) {
            await this.updateSpokenMessage(this.inputTranscription, this.userSpokenMessageDiv);
          }
          // pre-recorded dialogue handling a pause in playback
          while (this.serviceMode === 'pauseRecording') {
            await sleep(ONE_SECOND);
          }
        }

        let delayBeforeOutput = this.dialogueUtterance[this.dialogueIndex].delay;
        await sleep(delayBeforeOutput * ONE_SECOND);
        // Wait for recording to start again
        while (!this.isRecording) {
          await sleep(ONE_SECOND);
        }
        if (this.dialogueInput.length === 0) {
          return;
        }

        // this is for the pre-recorded input to AI
        this.sendClientContentRedundant(this.dialogueInput);
      }
    }
  }

  private sendClientContentRedundant(clientContent: string) {
    if (this.inputFirstTimerId) {
      clearTimeout(this.inputFirstTimerId);
      this.inputFirstTimerId = undefined;
    }

    const sendPreRecordedInput = () => {
      void this.liveAssistantService.sendMessage(clientContent).catch((error) => {
        console.error('[LiveInterfaceService] Error sending pre-recorded input:', error);
      });
    };

    // This is for the pre-recorded input to AI.
    sendPreRecordedInput();

    this.inputFirstTimerId = setTimeout(async () => {
      this.inputFirstTimerId = undefined;

      const assistantAlreadyResponding =
        this.outputTranscription.trim().length > 0 ||
        !!this.outputMessageDiv ||
        this.conversationAudioService.isPlayingAIaudio;

      if (
        !this.isRecording ||
        this.serviceMode === 'stopRecording' ||
        this.serviceMode === 'pauseRecording' ||
        assistantAlreadyResponding
      ) {
        return;
      }

      // This timeout triggers if no output is received after input
      // within a reasonable time, to keep the dialogue flowing.
      // This seems only needed for the very first input in some cases.
      // And only necessary the first time, as subsequent inputs work fine.
      sendPreRecordedInput();
    }, FIVE_SECONDS);
  }
  /**
   * Performs UI-facing startup tasks after provider session initialization,
   * including volume setup, splash display, and session restoration.
   */
  private async systemStartup() {
    const profileTitle = this.profile.profile_title;
    this.aiFullVolume = this.profile.aiFullVolume;
    if (this.profile.isSpeakerOn) {
      this.aiVolume = this.profile.aiVolume;
      this.simVolume = this.profile.simVolume;
    } else {
      this.aiVolume = 0.0;
      this.simVolume = 0.0;
    }
    this.setSimVolume();

    console.log('[LiveInterfaceService] ' + profileTitle);
    if (this.sessionTitleDiv) this.sessionTitleDiv.textContent = profileTitle;
    this.displaySplash();
    this.restartSession(this.resetSession);

    this.setupVoiceAssistantCallbacks();
  }

  public async startupPreRecorded() {
    if (!this.profile.pre_recorded) {
      return;
    }

    this.timeStartedEndurance = new Date();
    if (!this.promptPreamble.trim()) {
      throw new Error('A dialogue file is required before playback can begin.');
    }

    this.dialogueUtterance = this.parseDialogueScript(this.promptPreamble);
    this.dialogueIndex = 0;
    this.dialogueInput = '';
  }

  public async setProfile(profile: IProfile) {
    this.profile = profile;
    this.isSpeakerOutputEnabled = profile.isSpeakerOn;
    this.foundryAgentService.resetConversation();
  }

  public initializeHistory(chatHistoryMessagesDiv: HTMLDivElement) {
    this.chatHistoryService.initialize(this.profile, chatHistoryMessagesDiv);
  }

  public async continuePlayback() {
    this.serviceMode = 'startPlayback';

    if (
      this.isDualLiveDiscussionProfile() &&
      this.pendingDiscussionSpeaker &&
      !this.isDualDiscussionPaused
    ) {
      const speaker = this.pendingDiscussionSpeaker;
      const prompt = this.pendingDiscussionPrompt;
      this.pendingDiscussionSpeaker = null;
      this.pendingDiscussionPrompt = '';
      await this.dispatchDiscussionTurn(speaker, prompt);
      return;
    }

    if (this.profile.pre_recorded && this.resumePreRecordedAfterInterruptedAssistant) {
      // Releasing pause is enough for any in-flight pre-recorded playback loop.
      // Do not force a new scripted step here, or pause/resume during an
      // interrupted assistant turn will incorrectly advance to the next input.
      this.resumePreRecordedAfterInterruptedAssistant = false;
    }
  }

  public async continueRecording() {
    // this.setupEventHandlers();

    this.serviceMode = 'startRecording';
    this.isMuted = false;

    // move this to initialize or systemStartup so it's only set once, not on every continueRecording which can cause multiple callbacks to be registered
    // this.setupVoiceAssistantCallbacks();

    this.setupServiceCallbacks();
    if (false /*  */) {
      await this.handleConnect();
    }
  }

  private setupDualDiscussionCallbacks(): void {
    const buildCallbacks = (
      agentId: 'assistant-agent' | 'user-agent',
    ): IVoiceAssistantCallbacks => ({
      onConnectionStatusChange: (status) => {
        console.log(`[LiveInterfaceService] ${agentId} connectionStatus=${status}`);
      },
      onAssistantStatusChange: (status) => {
        console.log(
          `[LiveInterfaceService] ${agentId} assistantStatus=${status} pendingLength=${this.pendingCompletedTurnByAgent[agentId]?.length ?? 0}`,
        );
        if (this.isDualDiscussionPaused) {
          return;
        }
        if (status !== 'listening') {
          return;
        }

        const pendingText = this.pendingCompletedTurnByAgent[agentId];
        if (!pendingText) {
          console.log(
            `[LiveInterfaceService] ${agentId} listening with no pending completed turn.`,
          );
          return;
        }

        this.pendingCompletedTurnByAgent[agentId] = '';
        console.log(
          `[LiveInterfaceService] ${agentId} listening with pending turn. advancing handoff.`,
        );
        void this.completeDiscussionTurn(agentId, pendingText);
      },
      onConversationMessage: () => {},
      onConversationMessageUpdate: (message) => {
        if (!message || message.role !== 'assistant') {
          return;
        }

        void this.streamDiscussionAgentOutput(agentId, message.content ?? '');

        if (message.isStreaming === false) {
          if (this.discardCompletedTurnByAgent[agentId]) {
            this.discardCompletedTurnByAgent[agentId] = false;
            return;
          }
          this.finalizeDiscussionAgentOutput(agentId, message.content ?? '');
        }
      },
      onEventReceived: () => {},
      onError: (error) => {
        console.error(`[LiveInterfaceService] ${agentId} session error:`, error);
      },
      onFunctionCall: async ({ name, arguments: rawArguments }) =>
        this.handleAssistantToolCall(name, rawArguments),
      onAudioLevel: () => {},
      onOutputAudioLevel: (level) => {
        if (this.isDualDiscussionPaused) {
          level = 0;
        }

        if (agentId === 'user-agent') {
          this.audioLevel = level;
          if (this.userSpokenMessageDiv && this.profile.show_chatbots && level > 5) {
            const placeholderOrText =
              this.inputTranscription.trim().length > 0 ? this.inputTranscription : '...';
            void this.updateSpokenMessage(placeholderOrText, this.userSpokenMessageDiv);
          }
          return;
        }

        this.outputAudioLevel = level;
        if (this.aiSpokenMessageDiv && this.profile.show_chatbots && level > 5) {
          const placeholderOrText =
            this.outputTranscription.trim().length > 0 ? this.outputTranscription : '...';
          void this.updateSpokenMessage(placeholderOrText, this.aiSpokenMessageDiv);
        }
      },
    });

    // this.voiceAssistant.setCallbacks(buildCallbacks('assistant-agent'));
    // this.userAssistant.setCallbacks(buildCallbacks('user-agent'));
  }

  private setupVoiceAssistantCallbacks(): void {
    if (this.isDualLiveDiscussionProfile()) {
      this.setupDualDiscussionCallbacks();
      return;
    }

    const callbacks: IVoiceAssistantCallbacks = {
      onConnectionStatusChange: (status) => {
        // this.updateConnectionStatus(status);
      },
      onAssistantStatusChange: (status) => {
        // this.updateAssistantStatus(status);
      },
      onConversationMessage: (message) => {
        if (!message) {
          return;
        }

        // For completed user transcriptions, mirror into chat history
        if (message.role === 'user' && message.content) {
          this.handleTextFromUser(message.content, false);
        }
      },
      onConversationMessageUpdate: (message) => {
        if (!message) {
          return;
        }

        // Stream user speech into the spoken-message bubble in real time.
        if (message.role === 'user') {
          const fullText = message.content ?? '';
          // Compute a delta vs what we've already accumulated, mirroring the assistant path.
          let delta = fullText;
          if (fullText.startsWith(this.inputTranscription)) {
            delta = fullText.substring(this.inputTranscription.length);
          }

          if (delta.length > 0) {
            void this.onInputTranscription(delta);
          }
        }

        // Stream assistant transcriptions into the existing
        // onOutputTranscription pipeline (chat bubble + spoken message).
        if (message.role === 'assistant') {
          const fullText = message.content ?? '';

          // VoiceAssistant callbacks send the accumulated message text
          // on every delta. Our onOutputTranscription expects just the
          // newly added portion, so compute a simple delta based on
          // what we've already shown.
          let delta = fullText;
          if (fullText.startsWith(this.outputTranscription)) {
            delta = fullText.substring(this.outputTranscription.length);
          }

          if (delta.length > 0 || fullText.length === 0) {
            void this.onOutputTranscription(delta);
          }

          // When streaming is marked complete, finalize the assistant
          // message in chat history and reset the transcription buffer.
          if (message.isStreaming === false) {
            if (this.outputMessageDiv) {
              this.chatHistoryService.finalizeMessage(
                this.outputMessageDiv,
                this.getPreferredAssistantFinalText(fullText),
                'assistant',
              );
              this.outputMessageDiv = null;
              this.outputTranscription = '';
            }
            void this.completeAssistantTurn();
          }
        }
      },
      onEventReceived: (event) => {
        if (!event) {
          return;
        }

        // Ensure the user spoken bubble appears as soon as speech is detected,
        // even before any transcription text arrives.
        if (event.type === 'speech.started') {
          if (this.userSpokenMessageDiv && this.profile.show_chatbots) {
            const el = this.userSpokenMessageDiv;

            if (this.userSpokenFadeTimeoutId) {
              clearTimeout(this.userSpokenFadeTimeoutId);
              this.userSpokenFadeTimeoutId = undefined;
            }

            el.classList.remove('fade-out', 'long-fade-out');
            el.classList.add('fade-in');
            this.setSpokenMessageText(el, '');
            el.style.display = 'block';
          }
        }
        // We rely on onInputTranscription timing for fade-out; no extra
        // handling needed here for 'speech.stopped'.
      },
      onError: () => {},
      onFunctionCall: async ({ name, arguments: rawArguments }) =>
        this.handleAssistantToolCall(name, rawArguments),
      onAudioLevel: (level) => {
        if (this.profile.pre_recorded) {
          return;
        }

        this.audioLevel = level;

        // Ensure the user spoken bubble appears as soon as the
        // microphone detects non-trivial audio, even before the
        // service starts returning transcription text.
        if (this.userSpokenMessageDiv && this.profile.show_chatbots && level > 5) {
          if (this.userSpokenFadeTimeoutId) {
            clearTimeout(this.userSpokenFadeTimeoutId);
            this.userSpokenFadeTimeoutId = undefined;
          }

          // Use the shared helper so positioning and classes are
          // consistent with all other spoken-message updates.
          const placeholderOrText =
            this.inputTranscription && this.inputTranscription.trim().length > 0
              ? this.inputTranscription
              : '...';
          void this.updateSpokenMessage(placeholderOrText, this.userSpokenMessageDiv);
        }
      },
      onOutputAudioLevel: (level) => {
        this.outputAudioLevel = level;
      },
    };

    // this.voiceAssistant.setCallbacks(callbacks);
  }

  private async handleConnect() {
    try {
      // Configuration moved to ILiveAssistantService implementation
      await this.liveAssistantService.connect();
    } catch (error) {}
  }

  private async handleDualConnect(): Promise<void> {
    // Configuration moved to ILiveAssistantService implementation
    try {
      await this.liveAssistantService.connect();
    } catch (error) {}
    // The dual assistant logic (assistantConfig and userConfig) should be handled
    // by a specialized service if needed, this uses a unified connection for now.
  }

  private async handleDisconnect(): Promise<void> {
    try {
      await this.liveAssistantService.disconnect();
    } catch (error) {}
  }

  private createAssistantToolDefinitions(): Array<Record<string, unknown>> {
    const tools: Array<Record<string, unknown>> = [];

    if (this.hasVisionInstructions()) {
      tools.push({
        type: 'function',
        name: 'analyze_current_image',
        description:
          "Analyze the currently shared image or screen and answer the user's question using the latest captured frame.",
        parameters: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description:
                'The exact question the user is asking about the current image or shared screen.',
            },
          },
          required: ['question'],
        },
      });
    }

    if (
      this.hasFoundryAgentProfile() ||
      ((this.profile.pdf_file?.trim() || this.profile.pdf_upload) && !this.usesNativePdfHandling())
    ) {
      tools.push({
        type: 'function',
        name: 'analyze_uploaded_pdf',
        description: this.hasFoundryAgentProfile()
          ? "Answer the user's question using the grounded Azure AI Foundry agent configured for this profile."
          : "Answer the user's question using the active uploaded PDF document or documents for this session.",
        parameters: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'The exact question the user is asking about the uploaded PDF document.',
            },
          },
          required: ['question'],
        },
      });
    }

    return tools;
  }

  private getVoiceConfigurationForDiscussionAgent(
    agentId: 'assistant-agent' | 'user-agent',
  ): IVoiceAssistantConfig {
    const defaultVoiceApiKey = '';
    const defaultVoiceApiEndpoint = '';
    const voiceApiKey = localStorage.getItem('voiceApiKey') ?? defaultVoiceApiKey;
    const voiceApiEndpoint = localStorage.getItem('voiceApiEndpoint') ?? defaultVoiceApiEndpoint;
    const agent = this.getDiscussionAgent(agentId);
    const voiceApiVoice = agent?.voice_name?.trim() || this.profile.voice_name;
    const voiceApiInstructions = this.getDiscussionInstruction(agentId);
    const tools = this.createAssistantToolDefinitions();
    const toolChoice: 'auto' = 'auto';
    const debugMode = false;
    const useTokenCredential = false;

    if (!voiceApiEndpoint) {
      alert('Error: Voice API Endpoint is required!');
      throw new Error('Voice API Endpoint is required!');
    }

    if (!useTokenCredential && !voiceApiKey) {
      alert('Error: Voice API Key is required!');
      throw new Error('Voice API Key is required!');
    }

    return {
      voiceApiEndpoint,
      voiceApiKey,
      voiceApiVoice,
      voiceApiInstructions,
      enableInputAudio: false,
      tools,
      toolChoice,
      debugMode,
      useTokenCredential,
    };
  }

  private getVoiceConfiguration(): IVoiceAssistantConfig {
    const defaultVoiceApiKey = '';
    const defaultVoiceApiEndpoint = '';
    const voiceApiKey = localStorage.getItem('voiceApiKey') ?? defaultVoiceApiKey;
    const voiceApiEndpoint = localStorage.getItem('voiceApiEndpoint') ?? defaultVoiceApiEndpoint;
    const voiceApiVoice = this.profile.voice_name;
    let voiceApiInstructions = this.getComposedVoiceInstructions();
    const tools = this.createAssistantToolDefinitions();
    const toolChoice: 'auto' = 'auto';

    const debugMode = false;
    const useTokenCredential = false;

    if (!voiceApiEndpoint) {
      alert(`Error: Voice API Endpoint is required!`);
      throw new Error('Voice API Endpoint is required!');
    }

    if (!useTokenCredential && !voiceApiKey) {
      alert(`Error: Voice API Key is required!`);
      throw new Error('Voice API Key is required!');
    }
    return {
      voiceApiEndpoint,
      voiceApiKey,
      voiceApiVoice,
      voiceApiInstructions,
      tools,
      toolChoice,
      debugMode,
      useTokenCredential,
    };
  }

  private getPdfConfiguration(): IPdfAssistantConfig {
    const defaultPdfApiKey = '';
    const defaultPdfApiEndpoint = '';
    const pdfApiKey = localStorage.getItem('visionApiKey') ?? defaultPdfApiKey;
    const pdfApiEndpoint = localStorage.getItem('visionApiEndpoint') ?? defaultPdfApiEndpoint;
    const pdfApiModel =
      localStorage.getItem('visionApiDeployment')?.trim() ||
      this.profile.model_name?.trim() ||
      MODEL_NAME;
    const debugMode = false;

    if (!pdfApiKey) {
      alert('Error: Vision API Key is required for PDF upload and analysis.');
      throw new Error('Vision API Key is required for PDF upload and analysis.');
    }

    if (!pdfApiEndpoint) {
      alert('Error: Vision API Endpoint is required for PDF upload and analysis.');
      throw new Error('Vision API Endpoint is required for PDF upload and analysis.');
    }

    return { pdfApiEndpoint, pdfApiKey, pdfApiModel, debugMode };
  }

  private getFoundryConfiguration(): IFoundryAgentConfig {
    const debugMode = false;

    return {
      proxyEndpoint: this.getFoundryProxyEndpoint(),
      debugMode,
    };
  }

  private getFoundryProxyEndpoint(): string {
    const configuredEndpoint = localStorage.getItem('foundryProxyEndpoint')?.trim();
    if (configuredEndpoint) {
      return configuredEndpoint;
    }

    const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (isLocalHost) {
      return 'http://127.0.0.1:5001/azure-voice-live/us-central1/foundryAgentProxy';
    }

    return '/api/foundry-agent';
  }

  private hasFoundryAgentProfile(): boolean {
    return !!(
      this.profile.project_endpoint?.trim() &&
      this.profile.agent_name?.trim() &&
      this.profile.agent_version?.trim()
    );
  }

  private getPdfToolInstructions(): string {
    return [
      'Answer only from the uploaded PDF document.',
      'If the user asks about the generated property appraisal summary or HTML summary, respond: "I cannot answer questions on the property appraisal summary, only the property appraisal document."',
      'If the document does not contain enough information to support the answer, say so explicitly.',
      'Be concise, factual, and practical.',
      'Respond in plain English.',
    ].join(' ');
  }

  private getVisionConfiguration(): IVisionAssistantConfig {
    const defaultVisionApiKey = '';
    const defaultVisionApiEndpoint = '';
    const defaultVisionApiDeployment = '';
    const visionApiKey = localStorage.getItem('visionApiKey') ?? defaultVisionApiKey;
    const visionApiEndpoint = localStorage.getItem('visionApiEndpoint') ?? defaultVisionApiEndpoint;
    const visionApiDeployment =
      localStorage.getItem('visionApiDeployment') ?? defaultVisionApiDeployment;
    const visionApiInstructions = this.visionApiInstructions;
    const debugMode = false;

    if (!visionApiKey) {
      alert(`Error: Vision API Key is required!`);
      throw new Error('Vision API Key is required!');
    }

    if (!visionApiEndpoint) {
      alert(`Error: Vision API Endpoint is required!`);
      throw new Error('Vision API Endpoint is required!');
    }

    if (!visionApiDeployment) {
      alert(`Error: Vision API Deployment is required!`);
      throw new Error('Vision API Deployment is required!');
    }
    return {
      visionApiEndpoint,
      visionApiKey,
      visionApiDeployment,
      visionApiInstructions,
      debugMode,
    };
  }

  /**
   * Initializes the LiveInterface with UI elements.
   * It now accepts a callback function for service events.
   */
  public async initialize(
    videoElement: HTMLVideoElement,
    canvasElement: HTMLCanvasElement,
    imagePreviewDiv: HTMLDivElement,
    imagePreview: HTMLImageElement,
    userSpokenMessageDiv: HTMLDivElement,
    aiSpokenMessageDiv: HTMLDivElement,
    pauseRecordingButton: HTMLButtonElement,
    stopRecordingButton: HTMLButtonElement,
    screenShareButton: HTMLButtonElement,
    sessionTitleDiv: HTMLDivElement,
    speakerButton: HTMLButtonElement,
    profile: IProfile,
    voiceApiInstructions: string,
    visionApiInstructions: string,
    dataInstructions: string,
    dataSummaryTemplate: string,
    promptPreamble: string,
    // Add the new callback parameter
    onServiceCallback: (message: string) => void,
    onProgressCallback: (file: number, percent: number) => void,
  ) {
    this.inputTranscription = '';
    this.outputTranscription = '';
    this.videoElement = videoElement;
    this.canvasElement = canvasElement;
    this.imagePreviewDiv = imagePreviewDiv;
    this.imagePreview = imagePreview;
    this.userSpokenMessageDiv = userSpokenMessageDiv;
    this.aiSpokenMessageDiv = aiSpokenMessageDiv;
    this.pauseRecordingButton = pauseRecordingButton;
    this.stopRecordingButton = stopRecordingButton;
    this.sessionTitleDiv = sessionTitleDiv;
    this.speakerButton = speakerButton;
    this.profile = profile;
    this.onServiceCallback = onServiceCallback;
    this.onProgressCallback = onProgressCallback;
    this.voiceApiInstructions = voiceApiInstructions;
    this.visionApiInstructions = visionApiInstructions;
    this.dataInstructions = dataInstructions;
    this.dataSummaryTemplate = dataSummaryTemplate;
    this.promptPreamble = promptPreamble;
    await this.loadDiscussionAgentInstructions();

    if (!this.isDualLiveDiscussionProfile()) {
      await this.liveAssistantService.initializeSession(this.profile, {
        systemInstructions: this.voiceApiInstructions,
        promptPreamble: this.promptPreamble,
      });
    }

    this.imageCaptureService.initialize(
      videoElement,
      canvasElement,
      imagePreviewDiv,
      imagePreview,
      profile,
    );
    this.conversationAudioService.initialize(this.profile);
    this.conversationAudioService.setInputSampleRate(
      this.liveAssistantService.getInputAudioSampleRate(),
    );
    this.preRecordedAudioService.initialize(this.profile);
    if (this.hasFoundryAgentProfile()) {
      this.foundryAgentService.initialize(this.profile, this.getFoundryConfiguration());
    }
    if ((this.profile.pdf_file?.trim() || this.profile.pdf_upload) && !this.usesNativePdfHandling()) {
      this.pdfApiService.initialize(this.profile, this.getPdfConfiguration());
    }
    if (this.hasVisionInstructions()) {
      this.visionApiService.initialize(this.profile, this.getVisionConfiguration());
    }
    this.setupServiceCallbacks();
    // Perform general system startup (autostart, UI initialization)
    await this.systemStartup();

    // Explicitly await pre-recorded audio loading after system startup to ensure audio is ready
    await this.startupPreRecorded();
    this.isInitialized = true;
    console.log('[LiveInterfaceService] Initialization complete.');
  }

  /**
   * Restarts or reloads chat history and Gemini session state.
   * @param resetSession If true, clears persisted chat history and stored session handle.
   */
  public resetRecordingCycleCount() {
    const assistantWithReset = this.liveAssistantService as ILiveAssistantService & {
      resetRecordingCycleCount?: () => void;
    };
    assistantWithReset.resetRecordingCycleCount?.();
  }

  public restartSession(resetSession?: boolean) {
    if (resetSession) {
      localStorage.removeItem(`${this.profile?.profile_title} - geminiMessages`);
      localStorage.removeItem(this.profile?.profile_id + 'geminiSession');
      localStorage.removeItem(this.profile?.profile_id + 'sessionLatestTicks');
      this.chatHistoryService.resetChatHistory();
      this.foundryAgentService.resetConversation();
      const assistantWithHistoryReset = this.liveAssistantService as ILiveAssistantService & {
        resetChatHistory?: () => void;
      };
      assistantWithHistoryReset.resetChatHistory?.();
    } else {
      this.chatHistoryService.loadChatHistory();
    }
  }

  private clearPersistedLiveSessionHandle(): void {
    const profileId = this.profile?.profile_id?.trim();
    if (!profileId) {
      return;
    }

    localStorage.removeItem(profileId + 'geminiSession');
    localStorage.removeItem(profileId + 'sessionLatestTicks');
  }

  /**
   * Updates a spoken-message UI element's text and visibility.
   * @param text The text to display.
   * @param messageElement The DIV element used to show the spoken text.
   */
  private async updateSpokenMessage(text: string, messageElement: HTMLDivElement) {
    if (text.length === 0) {
      console.log('[LiveInterfaceService] Remove this Bubble!');
    }

    // Reset any fade-out state when updating the text
    messageElement.classList.remove('fade-out', 'long-fade-out');

    this.setSpokenMessageText(messageElement, text);
    if (text.trim() === '') {
      messageElement.style.display = 'none'; // Hide if no text
    } else {
      messageElement.style.display = 'block'; // Show if text exists
      messageElement.classList.add('fade-in');
    }
    messageElement.style.top = this.spokenMessageTop;
  }

  /**
   * Displays the application splash/title animation by expanding and then shrinking the title text.
   */
  private displaySplash() {
    this.expandTitleText();
    setTimeout(() => {
      // Show the app title as a Splash message
      setTimeout(() => {
        // Show the app title as a Splash message
        this.shrinkTitleText();
      }, ANIMATION_DURATION);
    }, ANIMATION_DURATION);
  }

  /**
   * Animates the session title font size from startSize to endSize over duration milliseconds.
   * Uses requestAnimationFrame for smooth animation and updates `this.animationFrameId`.
   * @param startSize Starting font size in pixels.
   * @param endSize Target font size in pixels.
   * @param duration Duration of the animation in milliseconds.
   */
  private animateTitleTextFontSize(startSize: number, endSize: number, duration: number) {
    const startTime = performance.now(); // Get the current time in milliseconds
    const step = (currentTime: number) => {
      const elapsedTime = currentTime - startTime;
      const progress = Math.min(elapsedTime / duration, 1); // Ensure progress doesn't exceed 1

      // Calculate the new font size using linear interpolation
      const newSize = startSize + (endSize - startSize) * progress;
      if (this.sessionTitleDiv) this.sessionTitleDiv.style.fontSize = newSize + 'px';

      if (progress < 1) {
        this.animationFrameId = requestAnimationFrame(step); // Continue animation
      } else {
        // Animation finished, ensure it's at the exact endSize
        if (this.sessionTitleDiv) this.sessionTitleDiv.style.fontSize = endSize + 'px';
        this.animationFrameId = -1; // Clear the animation ID
      }
    };

    // Cancel any existing animation to prevent conflicts
    if (this.animationFrameId > -1) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.animationFrameId = requestAnimationFrame(step); // Start the animation
  }

  /**
   * Expands the title text toward the splash expanded size.
   */
  private expandTitleText = () => {
    if (this.sessionTitleDiv) {
      let currentSize = parseFloat(getComputedStyle(this.sessionTitleDiv).fontSize);
      if (currentSize < SPLASH_FONT_EXPANDED) {
        this.animateTitleTextFontSize(currentSize, SPLASH_FONT_EXPANDED, ANIMATION_DURATION);
      }
    }
  };

  /**
   * Shrinks the title text back to zero to hide the splash.
   */
  private shrinkTitleText = () => {
    if (this.sessionTitleDiv) {
      const currentSize = parseFloat(getComputedStyle(this.sessionTitleDiv).fontSize);
      const targetSize = 0;
      if (currentSize > targetSize) {
        this.animateTitleTextFontSize(currentSize, targetSize, ANIMATION_DURATION);
      }
    }
  };

  /**
   * Mutes the microphone by suspending it.
   */
  public async muteMicrophone() {
    if (this.isDualLiveDiscussionProfile()) {
      this.holdVisibleSpokenMessages();
      this.isMuted = true;
      await this.pauseDualDiscussionPlayback();
      // this.voiceAssistant.setOutputMuted(true);
      // this.userAssistant.setOutputMuted(true);
      this.audioLevel = 0;
      this.outputAudioLevel = 0;
      return;
    }

    this.holdVisibleSpokenMessages();
    this.isMuted = true;
    this.audioLevel = 0;
    this.outputAudioLevel = 0;

    if (this.inputTranscriptionTimerId) {
      clearTimeout(this.inputTranscriptionTimerId);
      this.inputTranscriptionTimerId = undefined;
    }

    const pausedUserText =
      this.inputTranscription.trim() || this.getSpokenMessageText(this.userSpokenMessageDiv);
    if (pausedUserText) {
      if (!this.inputMessageDiv) {
        this.inputMessageDiv = this.chatHistoryService.createRealtimeMessage('user');
      }

      this.chatHistoryService.updateChatHistoryDiv(this.inputMessageDiv, pausedUserText);
      this.chatHistoryService.finalizeMessage(this.inputMessageDiv, pausedUserText, 'user');
      this.inputMessageDiv = null;
      this.inputTranscription = '';
      this.pendingPausedUserText = pausedUserText;
      this.pausedUserResponsePendingSend = true;
    }

    if (this.profile.pre_recorded) {
      await this.pausePreRecordedPlayback();
    } else if (this.isAssistantFlushOnPauseProfile()) {
      await this.pauseLiveAssistantPlayback();
      // this.voiceAssistant.setOutputMuted(true);
    }

    // this.voiceAssistant.setInputMuted(true);
    this.conversationAudioService.enableMicStream(false);
    this.conversationAudioService.suspendMicrophone();
    console.log('[LiveInterfaceService] Microphone muted, or pause recording.');
  }

  /**
   * Unmutes the microphone by resuming it.
   */
  public unmuteMicrophone() {
    if (this.isDualLiveDiscussionProfile()) {
      this.releaseHeldSpokenMessages();
      this.isMuted = false;
      this.isDualDiscussionPaused = false;
      // this.voiceAssistant.setOutputMuted(!this.isSpeakerOutputEnabled);
      // this.userAssistant.setOutputMuted(!this.isSpeakerOutputEnabled);
      return;
    }

    this.releaseHeldSpokenMessages();
    this.isMuted = false;
    this.serviceMode = 'startRecording';

    if (this.profile.pre_recorded) {
      this.pendingPausedUserText = '';
      this.pausedUserResponsePendingSend = false;
    }

    this.pausedAssistantOutputPendingResume = false;
    if (this.isAssistantFlushOnPauseProfile()) {
      // this.voiceAssistant.setOutputMuted(!this.isSpeakerOutputEnabled);
    }
    // this.voiceAssistant.setInputMuted(false);
    this.conversationAudioService.enableMicStream(true);
    this.conversationAudioService.resumeMicrophone();
    console.log('[LiveInterfaceService] Microphone unmuted, or resume recording.');
  }

  /**
   * Delegates starting screen share to the ImageCaptureService and marks state accordingly.
   */
  public async startScreenShare() {
    this.isSharing = true;
    await this.imageCaptureService.startScreenShare();
    if (this.isRecording) {
      this.imageCaptureService.startPeriodicImageSending();
    }
    this.visionApiService.resetConversation();
  }

  /**
   * Delegates stopping screen share to the ImageCaptureService and marks state accordingly.
   */
  public async stopScreenShare() {
    this.isSharing = false;
    await this.imageCaptureService.stopScreenShare();
    this.visionApiService.resetConversation();
  }

  /**
   * Starts recording by initializing audio system, ensuring Gemini session connection,
   * and enabling periodic image sending where appropriate.
   * Handles errors by updating status and rolling back state.
   * @returns Promise that resolves when recording has successfully started.
   */
  public async startRecording(): Promise<void> {
    if (this.isRecording) {
      return;
    }

    if (this.isDualLiveDiscussionProfile()) {
      this.isRecording = true;
      this.serviceMode = 'startPlayback';
      this.isMuted = false;
      this.audioLevel = 0;
      this.outputAudioLevel = 0;
      this.resetDualDiscussionState();
      this.setupServiceCallbacks();
      this.setupVoiceAssistantCallbacks();
      await this.prepareDiscussionTopic();
      await this.handleDualConnect();
      this.startDiscussionTimer();
      this.discussionStarted = true;

      const starter = (
        this.profile.conversation_starter === 'user-agent' ? 'user-agent' : 'assistant-agent'
      ) as 'assistant-agent' | 'user-agent';
      const starterPrompt = this.buildDiscussionTurnPrompt(
        starter,
        'system',
        this.profile.default_text_message?.trim() ||
          'Begin the discussion now by focusing on the railway timetabling and capacity document.',
      );
      await this.dispatchDiscussionTurn(starter, starterPrompt);
      return;
    }

    this.isRecording = true;
    this.pausedAssistantOutputPendingResume = false;
    this.conversationAudioService.setIsRecording(true);
    this.imageCaptureService.setIsRecording(true);
    this.imageCaptureService.setIsSetupComplete(false);
    this.audioLevel = 0;

    this.setupServiceCallbacks();
    await this.handleConnect();

    // this.voiceAssistant.setInputMuted(this.profile.pre_recorded);

    if (!this.profile.pre_recorded && this.profile.conversation_starter === 'assistant-agent') {
      const openingPrompt = this.profile.default_text_message?.trim() || 'Are you ready?';
      console.log(`[LiveInterfaceService] Sending opening prompt to liveAssistantService: "${openingPrompt}"`);
      await this.liveAssistantService.sendMessage(openingPrompt)
        .then(() => console.log('[LiveInterfaceService] Successfully sent opening prompt.'))
        .catch(err => console.error('[LiveInterfaceService] Error sending opening prompt:', err));
    }

    if (this.profile.pre_recorded) {
      this.startPreRecordedConversation();
    }

    // Ensure the audio system and microphone are active before streaming to Azure Voice Live.
    await this.conversationAudioService.initializeAudioSystem();
    await this.conversationAudioService.startMicrophone();
    console.log('[LiveInterfaceService] Recording started.');
  }

  public async prepareProfilePdfForSession(): Promise<void> {
    if (!this.profile.pdf_file?.trim() && !this.profile.pdf_upload) {
      return;
    }

    if (this.usesNativePdfHandling()) {
      return;
    }

    await this.pdfApiService.prepareProfilePdfForSession((fileNumber, percent) => {
      this.onProgress(fileNumber, percent);
    });
  }

  /**
   * Stops recording and playback, finalizes any pending real-time messages,
   * stops periodic image sending and closes the session if present.
   */
  public async stopRecording() {
    if (!this.isRecording && !this.isMuted) {
      return;
    }

    this.pendingPausedUserText = '';
    this.pausedAssistantOutputPendingResume = false;
    this.pausedUserResponsePendingSend = false;
    this.serviceMode = 'stopRecording';

    if (this.isDualLiveDiscussionProfile()) {
      this.releaseHeldSpokenMessages();
      this.isRecording = false;
      this.isMuted = false;
      this.audioLevel = 0;
      this.outputAudioLevel = 0;
      this.inputTranscription = '';
      this.outputTranscription = '';
      this.resetDualDiscussionState();
      await this.handleDisconnect();
      return;
    }

    if (this.userSpokenMessageDiv && this.aiSpokenMessageDiv) {
      await this.updateSpokenMessage('', this.userSpokenMessageDiv);
      await this.updateSpokenMessage('', this.aiSpokenMessageDiv);
    }

    this.conversationAudioService.clearAudioQueueAndStopPlayback();

    if (this.inputMessageDiv) {
      const finalUserText = this.inputTranscription.trim() || this.getSpokenMessageText(this.userSpokenMessageDiv);
      if (finalUserText) {
        this.chatHistoryService.finalizeMessage(this.inputMessageDiv, finalUserText, 'user');
      }
      this.inputMessageDiv = null;
    }

    if (this.outputMessageDiv) {
      const finalAssistantText = this.getPreferredAssistantFinalText(this.outputTranscription).trim();
      if (finalAssistantText) {
        this.chatHistoryService.finalizeMessage(this.outputMessageDiv, finalAssistantText, 'assistant');
      }
      this.outputMessageDiv = null;
    }

    this.releaseHeldSpokenMessages();
    this.isRecording = false;
    this.isMuted = false;
    this.conversationAudioService.setIsRecording(false);
    this.imageCaptureService.setIsRecording(false);
    this.audioLevel = 0;
    this.outputAudioLevel = 0;
    this.dialogueIndex = 0;
    this.dialogueInput = '';
    this.inputTranscription = '';
    this.outputTranscription = '';

    this.imageCaptureService.stopPeriodicImageSending();
    this.conversationAudioService.stopMicrophone();
    this.conversationAudioService.setIsSetupComplete(false);
    this.imageCaptureService.setIsSetupComplete(false);
    await this.handleDisconnect();
    this.clearPersistedLiveSessionHandle();
    this.resetRecordingCycleCount();
  }

  /**
   * Performs cleanup after an error or connection close. Resets recording/playing flags,
   * stops periodic image sending, and clears audio nodes and queues.
   * @param isErrorOrigin True when cleanup is triggered by an error origin.
   */
  private cleanupAfterErrorOrClose(
    isErrorOrigin: boolean = false,
    isSeamlessReconnect: boolean = false,
  ) {
    if (isSeamlessReconnect) {
      this.conversationAudioService.setIsRecording(false);
      this.conversationAudioService.setIsSetupComplete(false);
      this.imageCaptureService.setIsRecording(false);
      this.imageCaptureService.setIsSetupComplete(false);
      this.imageCaptureService.stopPeriodicImageSending();
      this.conversationAudioService.cleanupAudioNodes();
      this.conversationAudioService.clearAudioQueueAndStopPlayback();
      return;
    }

    this.isRecording = false;
    this.isMuted = false;
    this.isSharing = false;
    this.conversationAudioService.setIsRecording(false);
    this.conversationAudioService.setIsSetupComplete(false);
    this.imageCaptureService.setIsRecording(false);
    this.imageCaptureService.setIsSetupComplete(false);
    this.imageCaptureService.stopPeriodicImageSending();
    this.conversationAudioService.cleanupAudioNodes();
    this.conversationAudioService.clearAudioQueueAndStopPlayback();
    // Do not close session here, as it's handled by GeminiSessionService's onclose/onerror
  }

  /**
   * Enables or disables verbose logging across multiple internal services.
   * @param logOutput True to enable debug logging.
   */
  public setLogOutput(logOutput: boolean) {
    this.logOutput = logOutput;
    this.conversationAudioService.setLogOutput(logOutput);
    this.imageCaptureService.setLogOutput(logOutput);
    // this.geminiSessionService.setLogOutput(logOutput);
  }

  /**
   * Configures whether AI playback may be interrupted by new incoming audio/events.
   * @param allow True to permit rude interruption.
   */
  public setAllowRudeInteruption(allow: boolean) {
    this.allowRudeInteruption = allow;
    // this.geminiSessionService.setAllowRudeInteruption(allow);
  }

  /**
   * Applies the configured AI volume to the ConversationAudioService gain node.
   */
  public setAiVolume() {
    this.conversationAudioService.setAiVolume(this.aiVolume);
    // this.voiceAssistant.setOutputVolume(this.aiVolume);
    if (this.isDualLiveDiscussionProfile()) {
      // this.userAssistant.setOutputVolume(this.aiVolume);
    }
  }

  public updateSpeakerState(isSpeakerOn: boolean) {
    this.isSpeakerOutputEnabled = isSpeakerOn;
    // this.voiceAssistant.setOutputMuted(!isSpeakerOn);
    if (this.isDualLiveDiscussionProfile()) {
      // this.userAssistant.setOutputMuted(!isSpeakerOn);
    }
  }

  /**
   * Sets the simulation (user) audio gain value on the audio interface.
   */
  public setSimVolume() {
    this.preRecordedAudioService.gainValue = this.simVolume;
    if (this.isDualLiveDiscussionProfile()) {
      // this.userAssistant.setOutputVolume(this.simVolume);
    }
  }

  /**
   * Returns whether the audio service currently detects speech (and audio playback is not active).
   * @returns True when speech is detected and not overridden by playback state.
   */
  public getIsSpeechDetected(): boolean {
    return this.conversationAudioService.isAIspeechDetected;
  }
}
