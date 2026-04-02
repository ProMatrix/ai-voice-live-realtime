import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LiveInterfaceService,
  defaultProfile,
  IProfile,
  FIFTEEN_HUNDRED_MS,
  ONE_SECOND,
  PROFILES_URL,
  sleep,
} from 'llm-common';

import { version } from '../../../../package.json';

// Reference documents
// https://www.youtube.com/watch?v=ZORXxxP49G8
// https://www.youtube.com/watch?v=-k-PgvbktX4
// https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API
// https://cloud.google.com/dialogflow/cx/docs/concept/integration/dialogflow-messenger/javascript-functions

@Component({
  selector: 'app-root',
  imports: [CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  @ViewChild('sendIcon') sendIcon!: ElementRef;
  version: string = version;
  sessionTime = '00:00:00';
  private sessionInterval: any;
  private sessionSeconds = 0;
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
  showVideoButton: HTMLButtonElement | null | undefined;
  transcriptionButton: HTMLButtonElement | null | undefined;
  videoButton: HTMLButtonElement | null | undefined;
  audioButton: HTMLButtonElement | null | undefined;
  progressRadius = 0;
  visiblePanel: 'page-links' | 'text-input' | 'settings' = 'text-input';
  pdf_upload_completed: boolean = false;
  profile = defaultProfile;
  recordingButtons = [
    document.createElement('button'),
    document.createElement('button'),
    document.createElement('button'),
  ];
  isSpeakerOn = true;
  isTrashOn = false;
  isHelpOn = false;
  isChatbotHidden = false; // Chatbot images are visible by default
  isVideoHidden = false; // Video is showing by default
  isVideoOn = true;
  isAudioOn = true;

  private systemInstructions = '';
  private dataInstructions = '';
  private promptPreamble = '';
  private dataSummaryTemplate = '';

  constructor(public liveInterface: LiveInterfaceService) {}

  showPanel(panel: 'page-links' | 'text-input' | 'settings') {
    this.visiblePanel = panel;
  }

  isPanelVisible(panel: 'page-links' | 'text-input' | 'settings'): boolean {
    return this.visiblePanel === panel;
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

  showSidePanel(): boolean {
    if (this.profile.show_side_panel !== undefined) {
      return this.profile.show_side_panel;
    }
    return true;
  }

  showUploadButton(): boolean {
    if (
      this.profile.pdf_upload &&
      !this.pdf_upload_completed &&
      this.liveInterface.getChatHistoryCount === 0
    ) {
      return true;
    }
    return false;
  }

  showStartRecordButton(): boolean {
    if (this.profile.pre_recorded) {
      return false;
    }

    if (
      this.profile.pdf_upload &&
      !this.pdf_upload_completed &&
      this.liveInterface.getChatHistoryCount === 0
    ) {
      return false;
    }
    return true;
  }

  showStartPlaybackButton(): boolean {
    if (this.profile.pre_recorded) {
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
    if (this.profile.pdf_upload) {
      return 'visible';
    }
    return 'hidden';
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
    const urlParams = new URLSearchParams(window.location.search);
    const profileName = urlParams.get('profile');

    if (!profileName) {
      alert(`Error: QueryString "profile" is missing!`);
      throw Error(`Error: QueryString "profile" is missing!`);
    }
    await this.loadProfile(profileName);
    this.setProgress(this.liveInterface.appraisalCount, 100);

    if (this.profile.auto_start) {
      setTimeout(this.autoStartRecording.bind(this), this.profile.auto_start);
    }
    if (this.isTranscriptionOn === false) {
      this.toggleTranscriptions();
    }

    console.log(`[App] Initialization isTranscriptionOn: ${this.isTranscriptionOn}`);
  }

  private autoStartRecording() {
    if (this.profile.pre_recorded) {
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

    if (this.profile.pdf_upload) {
      this.pdf_upload_completed = false;
    }

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
    this.showVideoButton = document.getElementById('showVideoButton') as HTMLButtonElement;
    this.transcriptionButton = document.getElementById('transcriptionButton') as HTMLButtonElement;
    this.videoButton = document.getElementById('videoButton') as HTMLButtonElement;
    this.audioButton = document.getElementById('audioButton') as HTMLButtonElement;

    if (this.profile.pre_recorded) {
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
    } else {
      this.startRecordButton = document.getElementById('startRecordButton') as HTMLButtonElement;
      this.recordingButtons = [
        this.stopRecordingButton,
        this.pauseRecordingButton,
        this.startRecordButton,
      ];
    }

    // Fetch other profile properties
    const systemInstructionsResponse = await fetch(
      `${PROFILES_URL}/${this.profile.model_instructions}`,
    );
    this.systemInstructions = await systemInstructionsResponse.text();

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

    if (this.profile.dialogue_file?.length > 0) {
      const promptResponse = await fetch(`${PROFILES_URL}/${this.profile.dialogue_file}`);
      this.promptPreamble = await promptResponse.text();
    }

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

    this.trashButton.addEventListener('click', this.onTrashClick.bind(this));

    // Set initial state of speaker button to "on"
    this.speakerButton.classList.add('active');
    this.speakerButton.title = 'Audio Output: On';

    this.speakerButton.addEventListener('click', this.onSpeakerClick.bind(this));

    // Set initial state of chatbot button to "on"
    this.hideChatbotButton.classList.add('active');
    this.hideChatbotButton.title = 'Chatbot Images: On';

    this.hideChatbotButton.addEventListener('click', this.onHideChatbotClick.bind(this));

    // Set initial state of video button to "off" and disabled
    this.showVideoButton.setAttribute('disabled', 'true'); // Disable the active button
    this.showVideoButton.addEventListener('click', this.onShowVideoClick.bind(this));

    // this.transcriptionButton.classList.add('active');
    if (this.transcriptionButton) {
      this.transcriptionButton.classList.toggle('active', this.isTranscriptionOn);
      this.transcriptionButton.title = `Transcriptions: ${this.isTranscriptionOn ? 'On' : 'Off'}`;
    }

    this.videoButton.classList.add('active');
    this.audioButton.classList.add('active');

    this.transcriptionButton.addEventListener('click', this.onTranscriptionClick.bind(this));

    this.videoButton.addEventListener('click', this.onVideoClick.bind(this));

    this.audioButton.addEventListener('click', this.onAudioClick.bind(this));
  }

  private async onScreenShareClick() {
    if (this.screenShareButton) {
      this.liveInterface.isSharing = !this.liveInterface.isSharing;
      this.screenShareButton.classList.toggle('active', this.liveInterface.isSharing);
      this.screenShareButton.title = `Screen Sharing: ${this.liveInterface.isSharing ? 'On' : 'Off'}`;
      if (this.liveInterface.isSharing) {
        await this.liveInterface.startScreenShare();
        await this.fadeInScreenShareVideo();
        if (this.showVideoButton) {
          this.showVideoButton.style.visibility = 'visible';
          this.showVideoButton?.removeAttribute('disabled');
        }
      } else {
        if (this.showVideoButton) {
          this.showVideoButton.classList.remove('active');
          this.showVideoButton.title = 'Video: Off';
          this.showVideoButton.setAttribute('disabled', 'true'); // Disable the active button
        }
        await this.liveInterface.stopScreenShare();
      }
    }
  }

  private onUploadPdfClick() {
    this.uploadPdf();
  }

  private onRecordingButtonClick(button: HTMLButtonElement) {
    this.updateRecordingButtons(button); // Update button states on click
  }

  private async onTrashClick() {
    if (this.trashButton) {
      if (this.liveInterface.isRecording || this.liveInterface.isMuted)
        this.stopRecordingButton?.click();

      this.isTrashOn = !this.isTrashOn;
      this.trashButton.classList.toggle('active', this.isTrashOn);
      this.liveInterface.removeHtmlLinks();
      this.setProgress(0, 0);
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

  private async onShowVideoClick() {
    this.isVideoHidden = !this.isVideoHidden;
    if (this.showVideoButton) {
      this.showVideoButton.setAttribute('disabled', 'true');
      this.showVideoButton.classList.toggle('active', !this.isVideoHidden);
      this.showVideoButton.title = `Video: ${!this.isVideoHidden ? 'On' : 'Off'}`;
    }

    if (this.isVideoHidden) {
      await this.fadeOutScreenShareVideo();
    } else {
      await this.fadeInScreenShareVideo();
    }
    this.showVideoButton?.removeAttribute('disabled');
  }

  private onTranscriptionClick() {
    this.isTranscriptionOn = !this.isTranscriptionOn;
    if (this.transcriptionButton) {
      this.transcriptionButton.classList.toggle('active', this.isTranscriptionOn);
      this.transcriptionButton.title = `Transcriptions: ${this.isTranscriptionOn ? 'On' : 'Off'}`;
    }
    this.toggleTranscriptions();
  }

  private onVideoClick() {
    this.isVideoOn = !this.isVideoOn;
    if (this.videoButton) {
      this.videoButton.classList.toggle('active', this.isVideoOn);
      this.videoButton.title = `Video: ${this.isVideoOn ? 'On' : 'Off'}`;
    }
  }

  private onAudioClick() {
    this.isAudioOn = !this.isAudioOn;
    if (this.audioButton) {
      this.audioButton.classList.toggle('active', this.isAudioOn);
      this.audioButton.title = `Audio: ${this.isAudioOn ? 'On' : 'Off'}`;
    }
  }

  private uploadPdf() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/pdf';
    fileInput.multiple = true; // Allow multiple files to be selected
    fileInput.onchange = this.onPdfFileChange.bind(this);
    fileInput.click();
  }

  private async onPdfFileChange(event: any) {
    const files = event.target.files;
    if (files && files.length > 0) {
      this.liveInterface.setPdfFiles(files);
      const fileNames = Array.from(files)
        .map((file: any) => file.name)
        .join(', ');
      console.log('Files selected:', fileNames);
      this.pdf_upload_completed = true;
      if (this.startRecordButton) this.updateRecordingButtons(this.startRecordButton); // Enable the start recording button after PDF upload
    }
  }

  /**
   * Shows or hides the chatbot images with appropriate CSS class changes.
   * This toggles fade-in / fade-out classes for host, guest and side images.
   */
  toggleChatbotImages() {
    const hostbotImage = document.getElementById('hostbot-image');
    const guestbotImage = document.getElementById('guestbot-image');

    const userbotVumeter = document.getElementById('userbot-audio-level');
    const assistantbotVumeter = document.getElementById('assistantbot-audio-level');

    const elements = [hostbotImage, guestbotImage, userbotVumeter, assistantbotVumeter];

    elements.forEach((el) => {
      if (el) {
        if (this.isChatbotHidden) {
          el.classList.remove('fade-in');
          el.classList.add('fade-out');
        } else {
          el.classList.remove('fade-out');
          el.classList.add('fade-in');
        }
      }
    });
  }

  toggleTranscriptions() {
    if (!this.chatHistoryMessagesDiv) return;
    if (this.isTranscriptionOn) this.fadeOutScreen(this.chatHistoryMessagesDiv);
    else this.fadeInScreen(this.chatHistoryMessagesDiv);
  }

  /**
   * Gradually fades out the chat history container to reveal the screen-share video.
   * Uses small async sleeps to animate opacity.
   * @returns A Promise that resolves when the fade-in sequence completes.
   */
  async fadeInScreenShareVideo() {
    const htmlDivElement = document.querySelector('.chat-history-container') as HTMLDivElement;
    this.fadeInScreen(htmlDivElement);
  }

  /**
   * Gradually fades in the chat history container to hide the screen-share video.
   * Uses small async sleeps to animate opacity.
   * @returns A Promise that resolves when the fade-out sequence completes.
   */
  async fadeOutScreenShareVideo() {
    const htmlDivElement = document.querySelector('.chat-history-container') as HTMLDivElement;
    this.fadeOutScreen(htmlDivElement);
  }

  /**
   * Gradually fades out the chat history container to reveal the screen-share video.
   * Uses small async sleeps to animate opacity.
   * @returns A Promise that resolves when the fade-in sequence completes.
   */
  async fadeInScreen(htmlDivElement: HTMLDivElement) {
    htmlDivElement.style.visibility = 'visible';
    // The History Container layer will fade out.
    // This will make the video fade in.
    let opacity = 1;
    htmlDivElement.style.visibility = 'visible';
    while (opacity > 0) {
      htmlDivElement.style.opacity = opacity.toString();
      opacity -= 0.05;
      await sleep(50);
    }
    htmlDivElement.style.opacity = '0';
    if (this.showVideoButton) {
      this.showVideoButton.classList.add('active');
      this.showVideoButton.title = 'Video: On';
    }
  }

  /**
   * Gradually fades in the chat history container to hide the screen-share video.
   * Uses small async sleeps to animate opacity.
   * @returns A Promise that resolves when the fade-out sequence completes.
   */
  async fadeOutScreen(htmlDivElement: HTMLDivElement) {
    htmlDivElement.style.visibility = 'visible';
    // The History Container layer will fade in.
    // This will make the video fade out.
    let opacity = 0;
    htmlDivElement.style.visibility = 'visible';
    while (opacity < 1) {
      htmlDivElement.style.opacity = opacity.toString();
      opacity += 0.05;
      await sleep(50);
    }
    htmlDivElement.style.opacity = '1';
  }

  /**
   * Updates the visual state and behavior of recording control buttons.
   * Activates the provided button (disables it) and updates LiveInterfaceService state
   * according to the button id ('stopRecordingButton', 'pauseRecordingButton', 'startRecordButton').
   * @param activeButton The button element that was activated.
   */
  updateRecordingButtons(activeButton: HTMLButtonElement) {
    this.recordingButtons.forEach((button) => this.processRecordingButton(button, activeButton));

    // Disable the pause button if the stop button is active
    if (activeButton.id === 'stopRecordingButton') {
      const pauseButton = this.recordingButtons.find((b) => b.id === 'pauseRecordingButton');
      if (pauseButton) {
        pauseButton.setAttribute('disabled', 'true');
      }
    }
  }

  private async processRecordingButton(button: HTMLButtonElement, activeButton: HTMLButtonElement) {
    // This is the currently active button
    if (button === activeButton) {
      switch (button.id) {
        case 'stopRecordingButton':
          if (this.liveInterface.isRecording || this.liveInterface.isMuted)
            this.liveInterface.stopRecording();
          this.liveInterface.serviceMode = 'stopRecording';
          // this.pauseSessionTimer();
          if (!this.profile.pre_recorded) this.trashButton?.removeAttribute('disabled');
          break;
        case 'pauseRecordingButton':
          this.liveInterface.serviceMode = 'pauseRecording';
          this.liveInterface.muteMicrophone();
          // this.pauseSessionTimer();
          if (!this.profile.pre_recorded) this.trashButton?.removeAttribute('disabled');
          break;
        case 'startPlaybackButton':
        case 'startRecordButton':
          if (this.liveInterface.isMuted) {
            // is on pause
            this.liveInterface.unmuteMicrophone();
            this.startSessionTimer();
            if (button.id === 'startPlaybackButton') {
              this.liveInterface.continuePlayback();
            }

            if (button.id === 'startRecordButton') {
              this.liveInterface.continueRecording();
              if (this.screenShareButton) this.screenShareButton.style.visibility = 'visible';
            }
            break;
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
              this.liveInterface.initialize(
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
                this.systemInstructions,
                this.systemInstructions,
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
            // Resuming from pause
            this.startSessionTimer();
          }

          this.startRecordButton?.setAttribute('disabled', 'true');
          await this.liveInterface.startupPreRecorded();
          this.startRecordButton?.removeAttribute('disabled');
          await this.liveInterface.startRecording();
          this.trashButton?.setAttribute('disabled', 'true');
          break;
      }
      button.classList.add('active');
      button.setAttribute('disabled', 'true'); // Disable the active button
    }
    // This is not the active button
    else {
      button.classList.remove('active');
      button.removeAttribute('disabled'); // Enable other buttons
    }
  }

  private startSessionTimer() {
    if (this.sessionInterval) {
      clearInterval(this.sessionInterval);
    }
    this.sessionInterval = setInterval(() => {
      this.sessionSeconds++;
      this.sessionTime = this.formatTime(this.sessionSeconds);
    }, 1000);
  }

  private pauseSessionTimer() {
    clearInterval(this.sessionInterval);
  }

  private resetAndStartSessionTimer() {
    this.sessionSeconds = 0;
    this.sessionTime = '00:00:00';
    this.startSessionTimer();
  }

  private formatTime(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const paddedHours = hours.toString().padStart(2, '0');
    const paddedMinutes = minutes.toString().padStart(2, '0');
    const paddedSeconds = seconds.toString().padStart(2, '0');

    return `${paddedHours}:${paddedMinutes}:${paddedSeconds}`;
  }
}

