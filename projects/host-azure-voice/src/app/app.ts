import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LiveInterfaceService,
  SnapshotIndicatorService,
  SessionTimer,
  formatElapsedTime,
  fadeInOverlay,
  fadeOutOverlay,
  toggleFadeClasses,
  sleep,
  defaultProfile,
  IProfile,
  FIFTEEN_HUNDRED_MS,
  ONE_SECOND,
  PROFILES_URL,
} from 'llm-common';

import { version } from '../../../../package.json';

// References
// https://github.com/Azure/azure-sdk-for-js/tree/@azure/ai-voicelive_1.0.0-beta.3/sdk/ai/ai-voicelive/samples
// https://github.com/Azure/azure-sdk-for-js/tree/%40azure/ai-voicelive_1.0.0-beta.3/sdk/ai/ai-voicelive/samples/basic-web-voice-assistant

@Component({
  selector: 'app-root',
  imports: [CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  private readonly defaultVoiceApiEndpoint =
    'https://eastus2.api.cognitive.microsoft.com/sts/v1.0/issuetoken';
  private readonly defaultVisionApiEndpoint =
    'https://px-gpt4o-vision-resource.openai.azure.com/openai/v1/';
  private readonly defaultVisionApiDeployment =
    'https://px-gpt4o-vision-resource.openai.azure.com/openai/v1/deployments/';
  @ViewChild('sendIcon') sendIcon!: ElementRef;
  version: string = version;
  sessionTime = formatElapsedTime(0);
  private readonly sessionTimer = new SessionTimer((formattedTime: string) => {
    this.sessionTime = formattedTime;
  });
  videoElement: HTMLVideoElement | null | undefined;
  canvasElement: HTMLCanvasElement | null | undefined;
  imagePreviewDiv: HTMLDivElement | null | undefined;
  progressRingDiv: SVGCircleElement | null | undefined;
  progressTextDiv: HTMLDivElement | null | undefined;
  imagePreview: HTMLImageElement | null | undefined;
  userSpokenMessageDiv: HTMLDivElement | null | undefined;
  aiSpokenMessageDiv: HTMLDivElement | null | undefined;
  chatHistoryMessagesDiv: HTMLDivElement | null | undefined;
  sessionTitleDiv: HTMLDivElement | null | undefined;
  screenShareButton: HTMLButtonElement | null | undefined;
  stopRecordingButton: HTMLButtonElement | null | undefined;
  pauseRecordingButton: HTMLButtonElement | null | undefined;
  startRecordButton: HTMLButtonElement | null | undefined;
  startPlaybackButton: HTMLButtonElement | null | undefined;
  uploadPdfButton: HTMLButtonElement | null | undefined;
  speakerButton: HTMLButtonElement | null | undefined;
  trashButton: HTMLButtonElement | null | undefined;
  // helpButton: HTMLButtonElement | null | undefined;
  hideChatbotButton: HTMLButtonElement | null | undefined;
  showVisionButton: HTMLButtonElement | null | undefined;
  transcriptionButton: HTMLButtonElement | null | undefined;

  progressRadius = 0;
  visiblePanel: 'page-links' | 'voice-text-input' | 'settings' = 'voice-text-input';
  pdf_upload_completed: boolean = false;
  pdf_documents_ready = false;
  profile = defaultProfile;
  voiceApiKey = '';
  voiceApiEndpoint = '';
  visionApiKey = '';
  visionApiEndpoint = '';
  visionApiDeployment = '';

  apiKeySaved = false;
  private saveSettingsFeedbackTimeout: ReturnType<typeof setTimeout> | null = null;
  recordingButtons = [
    document.createElement('button'),
    document.createElement('button'),
    document.createElement('button'),
  ];
  isSpeakerOn = true;
  isTrashOn = false;
  isHelpOn = false;
  isChatbotHidden = false; // Chatbot images are visible by default
  isVisionHidden = false; // Vision is visible by default
  isVisionOn = true;
  isAudioOn = true;
  isShowVisionButtonVisible = false;
  showSpokenCopyButtons = false;
  summaryGenerationInProgress = false;
  playbackReady = false;
  private isSelectingPdfFiles = false;

  private voiceApiInstructions = '';
  private visionApiInstructions = '';
  private dataInstructions = '';
  private promptPreamble = '';
  private dataSummaryTemplate = '';
  private readonly beforeUnloadHandler = () => {
    if (this.liveInterface.isRecording || this.liveInterface.isMuted) {
      this.liveInterface.stopRecording();
    }

    this.liveInterface.serviceMode = 'stopRecording';
  };

  constructor(
    public liveInterface: LiveInterfaceService,
    public snapshotIndicatorService: SnapshotIndicatorService,
  ) {}

  showPanel(panel: 'page-links' | 'voice-text-input' | 'settings') {
    this.visiblePanel = panel;
  }

  canOpenOutputLinksPanel(): boolean {
    return (
      this.profile.pdf_summary && this.pdf_documents_ready && !this.summaryGenerationInProgress
    );
  }

  isPanelVisible(panel: 'page-links' | 'voice-text-input' | 'settings'): boolean {
    return this.visiblePanel === panel;
  }

  async onOutputLinksPanelClick() {
    if (!this.canOpenOutputLinksPanel()) {
      return;
    }

    this.summaryGenerationInProgress = true;
    this.setProgress(0, 0);

    try {
      const summaryHtmls = await this.liveInterface.createAppraisalSummaryHtmls();
      this.showPanel('page-links');
      await sleep(0);
      this.liveInterface.removeHtmlLinks();
      this.liveInterface.renderAppraisalSummaryHtmls(summaryHtmls);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[App] Failed to create appraisal summary HTML pages:', error);
      alert(message);
    } finally {
      this.summaryGenerationInProgress = false;
      if (this.pdf_documents_ready) {
        this.setProgress(this.liveInterface.appraisalCount, 100);
      }
    }
  }

  get isTranscriptionOn(): boolean {
    const isTranscriptionOnString = localStorage.getItem(
      this.profile.profile_id + 'isTranscriptionOn',
    );
    if (isTranscriptionOnString) {
      const isTranscriptionOn = JSON.parse(isTranscriptionOnString);
      return isTranscriptionOn;
    }
    return true;
  }

  set isTranscriptionOn(value: boolean) {
    localStorage.setItem(this.profile.profile_id + 'isTranscriptionOn', JSON.stringify(value));
  }

  showUploadButton(): boolean {
    return false;
  }

  private usesPlaybackButton(): boolean {
    return this.profile.pre_recorded || this.profile.start_button_mode === 'playback';
  }

  showStartRecordButton(): boolean {
    if (this.usesPlaybackButton()) {
      return false;
    }
    return true;
  }

  showStartPlaybackButton(): boolean {
    if (this.usesPlaybackButton()) {
      return true;
    }
    return false;
  }

  onSendText(text: string) {
    if (text && text.trim().length > 0) {
      this.liveInterface.handleTextFromUser(text);

      // Temporarily change the icon color
      if (this.sendIcon) {
        const iconElement = this.sendIcon.nativeElement;
        iconElement.style.color = '#00BFFF'; // DeepSkyBlue
        setTimeout(() => {
          iconElement.style.color = 'currentColor'; // Revert to original color
        }, 2000);
      }
    }
  }

  getProgressIndicatorVisibility(): string {
    if (this.profile.pdf_upload || !!this.profile.pdf_file?.trim()) {
      return 'visible';
    }
    return 'hidden';
  }

  async copySpokenMessage(messageType: 'user' | 'ai', event: MouseEvent) {
    event.stopPropagation();

    const messageTextElement = document.getElementById(
      messageType === 'user' ? 'userSpokenMessageText' : 'aiSpokenMessageText',
    );
    const messageText = messageTextElement?.textContent?.trim() ?? '';

    if (!messageText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(messageText);
    } catch (error) {
      console.error(`[App] Failed to copy ${messageType} spoken message:`, error);
    }
  }

  /**
   * Handles a callback from the LiveInterfaceService, receiving a string message.
   * @param message The string message from the service.
   */

  // TODO: Expand callback handling as needed with StartPlayback
  async handleServiceCallback(message: string) {
    console.log(`[App] Service callback received: ${message}`);
    if (message === 'stopRecording') {
      if (this.stopRecordingButton) {
        this.updateRecordingButtons(this.stopRecordingButton);
      }
    }

    if (message === 'pauseRecording') {
      if (this.pauseRecordingButton) {
        this.updateRecordingButtons(this.pauseRecordingButton);
      }
    }

    if (message === 'startRecording') {
      if (this.startRecordButton) {
        this.updateRecordingButtons(this.startRecordButton);
      }
    }

    if (message === 'startPlayback') {
      if (this.startPlaybackButton) {
        this.updateRecordingButtons(this.startPlaybackButton);
      }
    }

    if (message === 'goBridge') {
      if (this.profile.go_bridge) {
        const screen = document.querySelector('.prototype.screen');
        if (screen) {
          screen.classList.add('screen-implode');
        }
        await sleep(FIFTEEN_HUNDRED_MS);
        window.location.href = `${window.location.origin}${window.location.pathname}?profile=${this.profile.go_bridge}`;
      }
    }

    if (message === 'allowRecording') {
      if (this.startRecordButton) {
        this.startRecordButton.removeAttribute('disabled');
      }
    }

    if (message === 'allowPlayback') {
      if (this.startPlaybackButton) {
        this.startPlaybackButton.removeAttribute('disabled');
      }
    }
  }

  /**
   * Handles callbacks from LiveInterfaceService when inactivity is detected.
   * @param message A string message describing the callback reason.
   */

  /**
   * Angular lifecycle hook that initializes DOM element references, loads the selected profile,
   * configures UI event handlers, and initializes the LiveInterfaceService.
   */
  async ngOnInit() {
    localStorage.removeItem('foundryAccessToken');
    this.voiceApiKey = localStorage.getItem('voiceApiKey') ?? '';
    this.voiceApiEndpoint =
      localStorage.getItem('voiceApiEndpoint') ?? this.defaultVoiceApiEndpoint;
    this.visionApiKey = localStorage.getItem('visionApiKey') ?? '';
    this.visionApiEndpoint =
      localStorage.getItem('visionApiEndpoint') ?? this.defaultVisionApiEndpoint;
    this.visionApiDeployment =
      localStorage.getItem('visionApiDeployment') ?? this.defaultVisionApiDeployment;
    const urlParams = new URLSearchParams(window.location.search);
    const profileName = urlParams.get('profile');

    if (!profileName) {
      alert(`Error: Missing App Profile!`);
      throw Error(`Error: Missing App Profile!`);
    }
    await this.loadProfile(profileName);
    this.setProgress(this.liveInterface.appraisalCount, 100);

    if (this.profile.auto_start) {
      setTimeout(this.autoStartRecording.bind(this), this.profile.auto_start);
    }
    if (this.isTranscriptionOn === false) {
      this.toggleTranscriptions();
    }
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
    console.log(`[App] Initialization isTranscriptionOn: ${this.isTranscriptionOn}`);
  }

  ngOnDestroy() {
    window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    this.sessionTimer.dispose();
    this.snapshotIndicatorService.disable();

    if (this.saveSettingsFeedbackTimeout) {
      clearTimeout(this.saveSettingsFeedbackTimeout);
      this.saveSettingsFeedbackTimeout = null;
    }
  }

  onApiKeyInput(value: string) {
    this.voiceApiKey = value;
    this.persistSetting('voiceApiKey', value);
  }

  onApiEndpointInput(value: string) {
    this.voiceApiEndpoint = value;
    this.persistSetting('voiceApiEndpoint', value);
  }

  onVisionApiKeyInput(value: string) {
    this.visionApiKey = value;
    this.persistSetting('visionApiKey', value);
  }

  onVisionApiEndpointInput(value: string) {
    this.visionApiEndpoint = value;
    this.persistSetting('visionApiEndpoint', value);
  }

  onVisionApiDeploymentInput(value: string) {
    this.visionApiDeployment = value;
    this.persistSetting('visionApiDeployment', value);
  }

  onSaveSettings() {
    this.persistSetting('voiceApiKey', this.voiceApiKey);
    this.persistSetting('voiceApiEndpoint', this.voiceApiEndpoint);
    this.persistSetting('visionApiKey', this.visionApiKey);
    this.persistSetting('visionApiEndpoint', this.visionApiEndpoint);
    this.persistSetting('visionApiDeployment', this.visionApiDeployment);

    if (this.saveSettingsFeedbackTimeout) {
      clearTimeout(this.saveSettingsFeedbackTimeout);
    }

    this.apiKeySaved = true;
    this.saveSettingsFeedbackTimeout = setTimeout(() => {
      this.apiKeySaved = false;
      this.saveSettingsFeedbackTimeout = null;
    }, 2000);
  }

  private persistSetting(key: string, value: string) {
    const trimmedValue = value.trim();

    if (trimmedValue) {
      localStorage.setItem(key, trimmedValue);
    } else {
      localStorage.removeItem(key);
    }

    this.apiKeySaved = false;
  }

  private autoStartRecording() {
    if (this.usesPlaybackButton()) {
      if (this.startPlaybackButton) {
        this.updateRecordingButtons(this.startPlaybackButton);
      }
    } else {
      if (this.startRecordButton) {
        this.updateRecordingButtons(this.startRecordButton);
      }
    }
  }

  private setProgress(file: number, percent: number) {
    if (this.progressRingDiv && this.progressTextDiv) {
      const clampedPercent = Math.min(Math.max(percent, 0), 100);
      const offset =
        this.progressCircumference - (clampedPercent / 100) * this.progressCircumference;
      // Update the circle stroke
      this.progressRingDiv.style.strokeDashoffset = offset.toString();
      // Update the text value
      this.progressTextDiv.textContent = file.toString();
    }
  }

  get progressCircumference(): number {
    return 2 * Math.PI * this.progressRadius;
  }

  private setPlaybackButtonReady(isReady: boolean) {
    if (!this.usesPlaybackButton() || !this.startPlaybackButton) {
      return;
    }

    if (isReady) {
      this.startPlaybackButton.removeAttribute('disabled');
      return;
    }

    this.startPlaybackButton.setAttribute('disabled', 'true');
  }

  private hasVisionInstructions(): boolean {
    return !!this.profile.vision_api_instructions?.trim();
  }

  private validateDialogueScript(dialogueText: string): void {
    let parsed: unknown;

    try {
      parsed = JSON.parse(dialogueText);
    } catch (error) {
      throw new Error(
        `The dialogue file for profile "${this.profile.profile_file}" is not valid JSON.`,
      );
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error(
        `The dialogue file for profile "${this.profile.profile_file}" must contain a non-empty JSON array.`,
      );
    }
  }

  private async loadDialogueFile(): Promise<void> {
    this.promptPreamble = '';
    this.playbackReady = !this.usesPlaybackButton() || !this.profile.dialogue_file?.trim();

    if (!this.profile.dialogue_file?.trim()) {
      if (this.profile.pre_recorded) {
        throw new Error(
          `Profile "${this.profile.profile_file}" requires a dialogue_file before playback can begin.`,
        );
      }

      return;
    }

    const dialogueResponse = await fetch(`${PROFILES_URL}/${this.profile.dialogue_file}`);
    if (!dialogueResponse.ok) {
      throw new Error(
        `Unable to load dialogue file "${this.profile.dialogue_file}" for profile "${this.profile.profile_file}".`,
      );
    }

    const dialogueText = await dialogueResponse.text();

    if (this.profile.pre_recorded) {
      this.validateDialogueScript(dialogueText);
      this.playbackReady = true;
    }

    this.promptPreamble = dialogueText;
  }

  async loadProfile(profileName: string) {
    const profileResponse = await fetch(`${PROFILES_URL}/${profileName}.json`);
    if (!profileResponse.ok) {
      alert(
        `Error: Unable to load profile "${profileName}".\nCheck the "profile" query string value and ensure the file exists in the profiles directory.`,
      );
      return;
    }

    this.profile = (await profileResponse.json()) as IProfile;
    this.profile.profile_file = profileName;
    this.pdf_documents_ready = false;
    this.summaryGenerationInProgress = false;
    this.playbackReady = !this.usesPlaybackButton() || !this.profile.dialogue_file?.trim();

    // Initialize speaker state from profile so the button reflects isSpeakerOn
    this.isSpeakerOn = this.profile.isSpeakerOn;

    if (this.profile.pdf_upload || this.profile.pdf_file?.trim()) {
      this.pdf_upload_completed = false;
    }

    this.liveInterface.clearPdfFiles();

    await sleep(ONE_SECOND); // wait for DOM to be ready

    // Initialize DOM element references
    this.progressRingDiv = document.getElementById(
      'progress-indicator',
    ) as unknown as SVGCircleElement;
    this.progressTextDiv = document.getElementById('progress-text') as HTMLDivElement;
    this.progressRadius = this.progressRingDiv.r.baseVal.value;
    // Initialize SVG
    this.progressRingDiv.style.strokeDasharray = `${this.progressCircumference} ${this.progressCircumference}`;
    this.progressRingDiv.style.strokeDashoffset = this.progressCircumference.toString();
    this.videoElement = document.getElementById('screen-view') as HTMLVideoElement;
    this.canvasElement = document.getElementById('capture-canvas') as HTMLCanvasElement;
    this.imagePreviewDiv = document.getElementById('imagePreviewContainer') as HTMLDivElement;
    this.imagePreview = document.getElementById('imagePreview') as HTMLImageElement;
    this.userSpokenMessageDiv = document.getElementById('userSpokenMessage') as HTMLDivElement;
    this.aiSpokenMessageDiv = document.getElementById('aiSpokenMessage') as HTMLDivElement;
    this.chatHistoryMessagesDiv = document.getElementById(
      'chat-history-messages',
    ) as HTMLDivElement;
    this.sessionTitleDiv = document.getElementById('session-title') as HTMLDivElement;
    this.screenShareButton = document.getElementById('screenShareButton') as HTMLButtonElement;
    // this.screenShareButton.setAttribute('disabled', 'false');
    this.stopRecordingButton = document.getElementById('stopRecordingButton') as HTMLButtonElement;
    this.pauseRecordingButton = document.getElementById(
      'pauseRecordingButton',
    ) as HTMLButtonElement;
    this.startPlaybackButton = document.getElementById('startPlaybackButton') as HTMLButtonElement;
    this.uploadPdfButton = document.getElementById('uploadPdfButton') as HTMLButtonElement;
    this.trashButton = document.getElementById('trashButton') as HTMLButtonElement;
    this.speakerButton = document.getElementById('speakerButton') as HTMLButtonElement;
    this.hideChatbotButton = document.getElementById('hideChatbotButton') as HTMLButtonElement;
    this.showVisionButton = document.getElementById('showVisionButton') as HTMLButtonElement | null;
    this.transcriptionButton = document.getElementById(
      'transcriptionButton',
    ) as HTMLButtonElement | null;
    // If the profile defines a default text message, preload it into the text input
    const textInputElement = document.getElementById('textInput') as HTMLTextAreaElement | null;
    if (textInputElement && this.profile.default_text_message) {
      textInputElement.value = this.profile.default_text_message;
    }

    if (this.usesPlaybackButton()) {
      this.startPlaybackButton = document.getElementById(
        'startPlaybackButton',
      ) as HTMLButtonElement;
      this.recordingButtons = [
        this.stopRecordingButton,
        this.pauseRecordingButton,
        this.startPlaybackButton,
      ];
      if (this.trashButton) {
        this.trashButton.setAttribute('disabled', 'true');
      }
      this.setPlaybackButtonReady(false);
    } else {
      this.startRecordButton = document.getElementById('startRecordButton') as HTMLButtonElement;
      this.recordingButtons = [
        this.stopRecordingButton,
        this.pauseRecordingButton,
        this.startRecordButton,
      ];
    }

    // Fetch other profile properties
    const voiceApiInstructionsResponse = await fetch(
      `${PROFILES_URL}/${this.profile.voice_api_instructions}`,
    );
    this.voiceApiInstructions = await voiceApiInstructionsResponse.text();

    if (this.hasVisionInstructions()) {
      const visionApiInstructionsResponse = await fetch(
        `${PROFILES_URL}/${this.profile.vision_api_instructions}`,
      );
      this.visionApiInstructions = await visionApiInstructionsResponse.text();
    } else {
      this.visionApiInstructions = '';
    }

    if (this.profile.data_instructions?.length > 0) {
      const dataInstructionsResponse = await fetch(
        `${PROFILES_URL}/${this.profile.data_instructions}`,
      );
      this.dataInstructions = await dataInstructionsResponse.text();
    }

    if (this.profile.data_summary_template?.length > 0) {
      const summaryTemplateResponse = await fetch(
        `${PROFILES_URL}/${this.profile.data_summary_template}`,
      );
      this.dataSummaryTemplate = await summaryTemplateResponse.text();
    }

    await this.loadDialogueFile();

    this.liveInterface.setProfile(this.profile);
    this.liveInterface.initializeHistory(this.chatHistoryMessagesDiv!);

    // update page title
    document.title = profileName;

    if (this.profile.clear_session_on_startup) {
      this.liveInterface.restartSession(true);
    }

    this.screenShareButton.addEventListener('click', this.onScreenShareClick.bind(this));

    this.uploadPdfButton?.addEventListener('click', this.onUploadPdfClick.bind(this));

    this.recordingButtons.forEach((button) => {
      button.addEventListener('click', () => this.onRecordingButtonClick(button));
    });
    // Initialize "Stop" as active and disabled when the page loads
    this.updateRecordingButtons(this.stopRecordingButton);
    this.setPlaybackButtonReady(this.playbackReady);

    this.trashButton.addEventListener('click', this.onTrashClick.bind(this));
    // Set initial state of speaker button to reflect profile.isSpeakerOn
    if (this.speakerButton) {
      this.speakerButton.classList.toggle('active', this.isSpeakerOn);
      this.speakerButton.title = `Audio Output: ${this.isSpeakerOn ? 'On' : 'Off'}`;
      this.speakerButton.addEventListener('click', this.onSpeakerClick.bind(this));
    }

    // Set initial state of chatbot button to "on"
    this.hideChatbotButton.classList.add('active');
    this.hideChatbotButton.title = 'Chatbot Images: On';

    this.hideChatbotButton.addEventListener('click', this.onHideChatbotClick.bind(this));

    // Set initial state of vision button to "off" and disabled
    if (this.showVisionButton) {
      this.showVisionButton.setAttribute('disabled', 'true');
      this.showVisionButton.addEventListener('click', this.onShowVisionClick.bind(this));
    }

    // this.transcriptionButton.classList.add('active');
    if (this.transcriptionButton) {
      this.transcriptionButton.classList.toggle('active', this.isTranscriptionOn);
      this.transcriptionButton.title = `Transcriptions: ${this.isTranscriptionOn ? 'On' : 'Off'}`;
    }

    this.transcriptionButton?.addEventListener('click', this.onTranscriptionClick.bind(this));
  }

  private async onScreenShareClick() {
    if (this.screenShareButton) {
      this.liveInterface.isSharing = !this.liveInterface.isSharing;
      this.screenShareButton.classList.toggle('active', this.liveInterface.isSharing);
      this.screenShareButton.title = `Screen Sharing: ${this.liveInterface.isSharing ? 'On' : 'Off'}`;
      if (this.liveInterface.isSharing) {
        await this.liveInterface.startScreenShare();
        await this.fadeInScreenShareVision();
        this.isShowVisionButtonVisible = true;
        this.snapshotIndicatorService.enable();
        if (this.showVisionButton) {
          this.showVisionButton?.removeAttribute('disabled');
        }
      } else {
        this.isShowVisionButtonVisible = false;
        if (this.showVisionButton) {
          this.showVisionButton.classList.remove('active');
          this.showVisionButton.title = 'Vision: Off';
          this.showVisionButton.setAttribute('disabled', 'true'); // Disable the active button
        }
        await this.liveInterface.stopScreenShare();
      }
    }
  }

  private onUploadPdfClick() {
    void this.handleManualPdfUpload();
  }

  private onRecordingButtonClick(button: HTMLButtonElement) {
    void this.updateRecordingButtons(button);
  }

  private async onTrashClick() {
    if (this.trashButton) {
      if (this.liveInterface.isRecording || this.liveInterface.isMuted)
        this.stopRecordingButton?.click();

      this.isTrashOn = !this.isTrashOn;
      this.trashButton.classList.toggle('active', this.isTrashOn);
      this.liveInterface.removeHtmlLinks();
      this.liveInterface.clearGeneratedAppraisalSummaries();
      this.summaryGenerationInProgress = false;
      this.pdf_documents_ready = false;
      this.showPanel('voice-text-input');
      this.setProgress(0, 0);
      if (this.profile.pdf_upload && !this.profile.pdf_file?.trim()) {
        this.liveInterface.clearPdfFiles();
        this.pdf_upload_completed = false;
      }
      this.liveInterface.restartSession(true);
      this.liveInterface.resetRecordingCycleCount();
      if (this.isTrashOn) {
        setTimeout(() => {
          this.trashButton?.click();
        }, 1000);
      }
    }
  }

  private onSpeakerClick() {
    this.isSpeakerOn = !this.isSpeakerOn; // Toggle the speaker state
    if (this.speakerButton) {
      this.speakerButton.classList.toggle('active', this.isSpeakerOn); // Add 'active' class if isSpeakerOn is true
      this.speakerButton.title = `Audio Output: ${this.isSpeakerOn ? 'On' : 'Off'}`; // Update tooltip

      if (this.isSpeakerOn) {
        this.liveInterface.aiVolume = this.profile.aiVolume;
        this.liveInterface.simVolume = this.profile.simVolume;
      } else {
        this.liveInterface.aiVolume = 0.0;
        this.liveInterface.simVolume = 0.0;
      }
      this.liveInterface.setAiVolume();
      this.liveInterface.setSimVolume();
      this.liveInterface.updateSpeakerState(this.isSpeakerOn);
    }
  }

  private onHideChatbotClick() {
    this.isChatbotHidden = !this.isChatbotHidden;
    if (this.hideChatbotButton) {
      this.hideChatbotButton.classList.toggle('active', !this.isChatbotHidden);
      this.hideChatbotButton.title = `Chatbot Images: ${!this.isChatbotHidden ? 'On' : 'Off'}`;
      this.toggleChatbotImages();
    }
  }

  private async onShowVisionClick() {
    this.isVisionHidden = !this.isVisionHidden;
    if (this.showVisionButton) {
      this.showVisionButton.setAttribute('disabled', 'true');
      this.showVisionButton.classList.toggle('active', !this.isVisionHidden);
      this.showVisionButton.title = `Vision: ${!this.isVisionHidden ? 'On' : 'Off'}`;
    }

    if (this.isVisionHidden) {
      await this.fadeOutScreenShareVision();
    } else {
      await this.fadeInScreenShareVision();
    }
    this.showVisionButton?.removeAttribute('disabled');
  }

  private onTranscriptionClick() {
    this.isTranscriptionOn = !this.isTranscriptionOn;
    if (this.transcriptionButton) {
      this.transcriptionButton.classList.toggle('active', this.isTranscriptionOn);
      this.transcriptionButton.title = `Transcriptions: ${this.isTranscriptionOn ? 'On' : 'Off'}`;
    }
    this.toggleTranscriptions();
  }

  private async handleManualPdfUpload(): Promise<void> {
    const files = await this.uploadPdf();

    if (!files || files.length === 0) {
      return;
    }

    await this.handleSelectedPdfFiles(files);
  }

  private uploadPdf(): Promise<File[] | null> {
    if (this.isSelectingPdfFiles) {
      return Promise.resolve(null);
    }

    this.isSelectingPdfFiles = true;

    return new Promise((resolve) => {
      const fileInput = document.createElement('input');
      let focusTimeoutId: ReturnType<typeof setTimeout> | null = null;
      let settled = false;

      const finish = (files: File[] | null) => {
        if (settled) {
          return;
        }

        settled = true;
        this.isSelectingPdfFiles = false;
        if (focusTimeoutId) {
          clearTimeout(focusTimeoutId);
          focusTimeoutId = null;
        }
        window.removeEventListener('focus', onWindowFocus);
        fileInput.remove();
        resolve(files);
      };

      const onWindowFocus = () => {
        focusTimeoutId = setTimeout(() => {
          const selectedFiles = fileInput.files ? Array.from(fileInput.files) : [];
          if (!settled && selectedFiles.length === 0) {
            finish(null);
          }
        }, 500);
      };

      fileInput.type = 'file';
      fileInput.accept = 'application/pdf';
      fileInput.multiple = true;
      fileInput.style.display = 'none';
      fileInput.onchange = () => {
        const files = fileInput.files ? Array.from(fileInput.files) : [];
        finish(files.length > 0 ? files : null);
      };
      fileInput.addEventListener('cancel', () => finish(null), { once: true });
      document.body.appendChild(fileInput);
      window.addEventListener('focus', onWindowFocus, { once: true });
      fileInput.click();
    });
  }

  private async handleSelectedPdfFiles(files: File[]): Promise<void> {
    await this.liveInterface.setPdfFiles(files);
    const fileNames = files.map((file) => file.name).join(', ');
    console.log('Files selected:', fileNames);
    this.pdf_upload_completed = true;
    this.pdf_documents_ready = false;
    this.summaryGenerationInProgress = false;
    this.liveInterface.removeHtmlLinks();
    this.showPanel('voice-text-input');
    this.setProgress(0, 0);
  }

  private shouldSelectPdfFilesOnStart(): boolean {
    return this.profile.pdf_upload && !this.profile.pdf_file?.trim() && !this.pdf_upload_completed;
  }

  /**
   * Shows or hides the chatbot images with appropriate CSS class changes.
   * This toggles fade-in / fade-out classes for user, assistant and side images.
   */
  toggleChatbotImages() {
    const userbotImage = document.getElementById('userbot-image');
    const assistantbotImage = document.getElementById('assistantbot-image');

    const userbotVumeter = document.getElementById('userbot-audio-level');
    const assistantbotVumeter = document.getElementById('assistantbot-audio-level');

    toggleFadeClasses(
      [userbotVumeter, assistantbotVumeter, userbotImage, assistantbotImage],
      this.isChatbotHidden,
    );
  }

  toggleTranscriptions() {
    if (!this.chatHistoryMessagesDiv) return;
    if (this.isTranscriptionOn) {
      void fadeInOverlay(this.chatHistoryMessagesDiv);
      return;
    }

    void fadeOutOverlay(this.chatHistoryMessagesDiv);
  }

  /**
   * Gradually fades out the chat history container to reveal the screen-share vision panel.
   * Uses small async sleeps to animate opacity.
   * @returns A Promise that resolves when the fade-in sequence completes.
   */
  async fadeInScreenShareVision() {
    const htmlDivElement = document.querySelector('.chat-history-container') as HTMLDivElement;
    if (!htmlDivElement) {
      return;
    }

    await fadeOutOverlay(htmlDivElement);
    if (this.showVisionButton) {
      this.showVisionButton.classList.add('active');
      this.showVisionButton.title = 'Vision: On';
    }
  }

  /**
   * Gradually fades in the chat history container to hide the screen-share vision panel.
   * Uses small async sleeps to animate opacity.
   * @returns A Promise that resolves when the fade-out sequence completes.
   */
  async fadeOutScreenShareVision() {
    const htmlDivElement = document.querySelector('.chat-history-container') as HTMLDivElement;
    if (!htmlDivElement) {
      return;
    }

    await fadeInOverlay(htmlDivElement);
  }

  /**
   * Updates the visual state and behavior of recording control buttons.
   * Activates the provided button (disables it) and updates LiveInterfaceService state
   * according to the button id ('stopRecordingButton', 'pauseRecordingButton', 'startRecordButton').
   * @param activeButton The button element that was activated.
   */
  async updateRecordingButtons(activeButton: HTMLButtonElement) {
    if (activeButton.id === 'startRecordButton' && this.shouldSelectPdfFilesOnStart()) {
      const files = await this.uploadPdf();

      if (!files || files.length === 0) {
        await this.stopSessionFromUi();
        this.syncRecordingButtons(this.stopRecordingButton!);
        return;
      }

      await this.handleSelectedPdfFiles(files);
    }

    if (activeButton.id === 'pauseRecordingButton') {
      this.setPlaybackButtonReady(false);
    }

    await this.processRecordingButtonAction(activeButton);
    this.syncRecordingButtons(activeButton);

    if (activeButton.id === 'stopRecordingButton') {
      const pauseButton = this.recordingButtons.find((b) => b.id === 'pauseRecordingButton');
      if (pauseButton) {
        pauseButton.setAttribute('disabled', 'true');
      }
    }
  }

  private syncRecordingButtons(activeButton: HTMLButtonElement) {
    this.recordingButtons.forEach((button) => {
      if (button === activeButton) {
        button.classList.add('active');
        button.setAttribute('disabled', 'true');
        return;
      }

      button.classList.remove('active');

      if (
        activeButton.id === 'pauseRecordingButton' &&
        button.id === 'startPlaybackButton' &&
        this.usesPlaybackButton()
      ) {
        button.setAttribute('disabled', 'true');
        return;
      }

      button.removeAttribute('disabled');
    });
  }

  private async processRecordingButtonAction(activeButton: HTMLButtonElement) {
    switch (activeButton.id) {
      case 'stopRecordingButton':
        await this.stopSessionFromUi();
        break;
      case 'pauseRecordingButton':
        this.showSpokenCopyButtons = true;
        this.liveInterface.serviceMode = 'pauseRecording';
        await this.liveInterface.muteMicrophone();
        if (!this.profile.pre_recorded) {
          this.trashButton?.removeAttribute('disabled');
        }
        break;
      case 'startPlaybackButton':
      case 'startRecordButton':
        await this.startSessionFromUi(activeButton);
        break;
    }
  }

  private async stopSessionFromUi(): Promise<void> {
    this.showSpokenCopyButtons = false;
    if (this.liveInterface.isRecording || this.liveInterface.isMuted) {
      await this.liveInterface.stopRecording();
    }

    this.liveInterface.serviceMode = 'stopRecording';
    if (!this.profile.pre_recorded) {
      this.trashButton?.removeAttribute('disabled');
    }
  }

  private async startSessionFromUi(button: HTMLButtonElement): Promise<void> {
    this.showSpokenCopyButtons = false;
    if (this.liveInterface.isMuted) {
      this.liveInterface.unmuteMicrophone();
      this.startSessionTimer();
      if (button.id === 'startPlaybackButton') {
        this.liveInterface.continuePlayback();
      }

      if (button.id === 'startRecordButton' && this.screenShareButton) {
        this.screenShareButton.style.visibility = 'visible';
      }
      return;
    }

    if (this.screenShareButton) {
      this.screenShareButton.style.visibility = 'visible';
    }

    if (!this.liveInterface.isInitialized) {
      if (
        this.videoElement &&
        this.canvasElement &&
        this.imagePreviewDiv &&
        this.imagePreview &&
        this.userSpokenMessageDiv &&
        this.aiSpokenMessageDiv &&
        this.chatHistoryMessagesDiv &&
        this.pauseRecordingButton &&
        this.stopRecordingButton &&
        this.screenShareButton &&
        this.sessionTitleDiv &&
        this.speakerButton
      ) {
        await this.liveInterface.initialize(
          this.videoElement,
          this.canvasElement,
          this.imagePreviewDiv,
          this.imagePreview,
          this.userSpokenMessageDiv,
          this.aiSpokenMessageDiv,
          this.pauseRecordingButton,
          this.stopRecordingButton,
          this.screenShareButton,
          this.sessionTitleDiv,
          this.speakerButton,
          this.profile,
          this.voiceApiInstructions,
          this.visionApiInstructions,
          this.dataInstructions,
          this.dataSummaryTemplate,
          this.promptPreamble,
          (message: string) => this.handleServiceCallback(message),
          (file: number, percent: number) => this.setProgress(file, percent),
        );
      }
    } else {
      this.liveInterface.removeHtmlLinks();
      this.setProgress(0, 0);
    }

    if (this.liveInterface.serviceMode === 'stopRecording') {
      this.resetAndStartSessionTimer();
    } else {
      this.startSessionTimer();
    }

    if (button.id === 'startPlaybackButton') {
      this.startPlaybackButton?.setAttribute('disabled', 'true');
    } else {
      this.startRecordButton?.setAttribute('disabled', 'true');
    }
    try {
      await this.liveInterface.prepareProfilePdfForSession();
      if (this.profile.pdf_upload || this.profile.pdf_file?.trim()) {
        this.pdf_upload_completed = true;
        this.pdf_documents_ready = true;
      }
      await this.liveInterface.startupPreRecorded();
      await this.liveInterface.startRecording();
      this.trashButton?.setAttribute('disabled', 'true');
    } finally {
      if (button.id === 'startPlaybackButton') {
        this.startPlaybackButton?.removeAttribute('disabled');
      } else {
        this.startRecordButton?.removeAttribute('disabled');
      }
    }
  }

  private startSessionTimer() {
    this.sessionTimer.start();
  }

  private resetAndStartSessionTimer() {
    this.sessionTimer.resetAndStart();
  }
}
