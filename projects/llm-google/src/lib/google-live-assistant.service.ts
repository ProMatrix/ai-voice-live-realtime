// gemini-session.service.ts
import { Injectable } from '@angular/core';
import { GoogleGenAI, Modality, Session, Blob as GenAIBlobType, Content } from '@google/genai';
import {
  EIGHT_MINUTES,
  FIVE_MINUTES,
  FIVE_SECONDS,
  MODEL_NAME,
  ONE_HOUR,
  ONE_MINUTE,
  ONE_SECOND,
  PROFILES_URL,
  SESSION_EXPIRATION,
  TEN_MINUTES,
  TEN_SECONDS,
  TARGET_SAMPLE_RATE,
} from './constants';
import { base64ToArrayBuffer, sleep } from './utils';
import { defaultProfile } from 'llm-common';
import {
  IProfile,
  IChatMessage,
  IDialogue,
  ILiveAssistantService,
  ILiveAssistantSessionOptions,
  ConnectionState,
} from 'llm-common';
import { convertPdfFileToJpg, convertPdfUrlToJpg } from './pdf-2-jpgs';

@Injectable({ providedIn: 'root' })
export class GoogleLiveAssistantService implements ILiveAssistantService {
  private logOutput = false;
  private _connectionCallback: ((status: ConnectionState) => void) | null = null;
  private _messageCallback: ((msg: IChatMessage, isStreaming?: boolean) => void) | null = null;
  private _errorCallback: ((err: string) => void) | null = null;
  private allowRudeInteruption = true; // To be set by LiveInterfaceService
  private genAI: GoogleGenAI | null = null;
  private session: Session | null = null;
  private isSetupComplete = false;
  private systemInstructions = '';
  private promptPreamble = '';
  private chatMessageHistory: IChatMessage[] = []; // To be managed by
  private dialogueUtterance: IDialogue[] | undefined;
  private lastInputTranscript = '';
  private lastOutputTranscript = '';
  private goAwayTimeLeft: string | undefined = ''; // New property to track GoAway time
  // THIS IS ONLY FOR TESTING/DEMO PURPOSES
  // Reconnect controls
  private userInitiatedClose = false; // when true, don't auto-reconnect
  // Demo/testing: force a disconnect to showcase reconnect behavior
  private demoDisconnectTimer: any = null;
  private recordingCycleCount = 0;
  // Control forced disconnects to eliminate automatic reconnect during normal use
  // Every some many minutes, we force a disconnect.
  private schedulingForcedDisconnect = false;
  private schedulingDisconnectMs = ONE_MINUTE;
  // Callbacks to communicate with LiveInterfaceService
  private _setupCompleteCallback: (() => void) | null = null;
  public onSessionResumptionUpdate: ((newHandle: string) => void) | null = null;
  public onInputTranscription: ((text: string) => void) | null = null;
  public onOutputTranscription: ((text: string) => void) | null = null;
  public onAudioData: ((audioBuffer: ArrayBuffer) => void) | null = null;
  public onTurnComplete: (() => void) | null = null;
  public oldOnError: ((message: string) => void) | null = null;
  public onClose: ((wasClean: boolean, code: number, reason: string) => void) | null = null;
  public onRestartRecording: (() => void) | null = null;
  public onCanCloseSession: (() => boolean) | null = null;
  public onPauseRecording: (() => void) | null = null;
  public onGetServiceMode: (() => string) | null = null;
  public onProgress: ((file: number, percent: number) => void) | null = null;
  public profile = defaultProfile;
  public pdfFiles: Array<File> = [];
  public isAutoReconnecting = false;
  private _resourceFileCollection: any[] = [];

  constructor() {}

  public setPdfFiles(files: Array<File>): void {
    this.pdfFiles = [...files];
  }

  public clearPdfFiles(): void {
    this.pdfFiles = [];
  }

  get resourceFileCollection(): any[] {
    return this._resourceFileCollection;
  }

  set resourceFileCollection(value: any[]) {
    this._resourceFileCollection = value;
  }

  public async initializeSession(
    profile: IProfile,
    options?: ILiveAssistantSessionOptions,
  ): Promise<void> {
    try {
      this.profile = profile;
      if (this.profile.clear_session_on_startup) {
        this.geminiSession = null;
      }
      this.systemInstructions = options?.systemInstructions?.trim() || 'Generic System Config';
      this.promptPreamble = options?.promptPreamble?.trim() || '';
      this.dialogueUtterance = this.parseDialogue(this.promptPreamble);
      await this.autostart();
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  }

  public async initialize(profile: IProfile, systemInstructions: string, promptPreamble: string) {
    try {
      this.profile = profile;
      if (this.profile.clear_session_on_startup) {
        this.geminiSession = null;
      }
      this.systemInstructions = systemInstructions;
      this.promptPreamble = promptPreamble;
      this.dialogueUtterance = this.parseDialogue(this.promptPreamble);
    } catch (error) {
      console.error('Error loading profile or instructions or PDF:', error);
      throw error;
    }
  }

  /**
   * Initializes the GeminiSessionService by loading profile-specific
   * system instructions and prompt preamble text files.
   * @param profile The selected profile containing instruction/prompt references.
   */

  public getDialogueUtterance(): IDialogue[] | undefined {
    return this.dialogueUtterance;
  }

  /**
   * Returns the parsed dialogue utterance sequence derived from the profile prompt.
   * @returns An array of IDialogue entries or undefined.
   */

  private parseDialogue(document: string): IDialogue[] | undefined {
    try {
      const json = JSON.parse(document);
      if (Array.isArray(json)) {
        return json as IDialogue[];
      }
    } catch {
      // Continue to parse as text if JSON parsing fails
    }

    const lines = document.split(/\r?\n/).filter((line) => line.trim() !== '');
    const parsedData: IDialogue[] = [];

    for (const line of lines) {
      const delayMatch = line.match(/Delay:\s*(\d+\.?\d*)/);
      const directionMatch = line.match(/(Input|Output):/);
      const utteranceMatch = line.match(/"([^"]*)"/);

      const delay = delayMatch ? parseFloat(delayMatch[1]) : 0;
      const direction = directionMatch ? directionMatch[1] : '';
      const utterance = utteranceMatch ? utteranceMatch[1] : '';

      if (direction && utterance) {
        parsedData.push({
          delay: delay,
          direction: direction.toLowerCase(),
          utterance: utterance,
        });
      }
    }
    return parsedData;
  }

  /**
   * Parses a dialogue section from the provided document text into IDialogue entries.
   * @param document The document text that may contain a Dialogue: ... Now, say section.
   * @returns Parsed dialogue entries or an empty array if none found.
   */

  public setLogOutput(logOutput: boolean) {
    this.logOutput = logOutput;
  }

  /**
   * Enable or disable verbose logging for Gemini session operations.
   * @param logOutput True to enable debug logging.
   */

  public setAllowRudeInteruption(allow: boolean) {
    this.allowRudeInteruption = allow;
  }

  /**
   * Configures whether the AI may interrupt playback with new audio (rude interruption).
   * @param allow True to allow interruptions.
   */

  public setChatMessageHistory(chatMessageHistory: IChatMessage[]) {
    this.chatMessageHistory = chatMessageHistory;
  }

  public resetRecordingCycleCount() {
    this.recordingCycleCount = 0;
  }

  /**
   * Clears the internal chat message history array.
   */
  public resetChatHistory() {
    this.chatMessageHistory.length = 0;
  }

  /**
   * initializing the Generative AI client and system settings.
   */
  async autostart() {
    const urlParams = new URLSearchParams(window.location.search);
    let apiKey = urlParams.get('apiKey');

    if (apiKey) {
      localStorage.setItem('apiKey', apiKey);
    } else {
      apiKey = localStorage.getItem('apiKey');
    }

    if (!apiKey) {
      // Using custom modal UI instead of alert()
      alert('API Key not found!');
      return;
    }
    this.genAI = new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
  }

  /**
   * Gets the stored Gemini session handle from local storage.
   * Use only is not expired
   */

  private get geminiSession(): string | null {
    const sessionHandle = localStorage.getItem(this.profile.profile_id + 'geminiSession');
    const lastSessionTime = this.sessionTimestamp;

    if (sessionHandle && lastSessionTime > 0) {
      const sessionAge = Date.now() - lastSessionTime;
      // Use the local expiration constant (now NINETY_MINUTES)
      if (sessionAge < SESSION_EXPIRATION) {
        return sessionHandle;
      } else {
        // If expired, clear the handle and return null
        this.geminiSession = null;
        return null;
      }
    }
    return null;
  }

  /**
   * Sets the Gemini session handle in local storage.
   * @param session The session handle to store.
   */
  private set geminiSession(session: string | null) {
    if (session) {
      localStorage.setItem(this.profile.profile_id + 'geminiSession', session);
      // Store the current time when setting a new, valid session handle
      this.sessionTimestamp = Date.now();
    } else {
      localStorage.removeItem(this.profile.profile_id + 'geminiSession');
      localStorage.removeItem(this.profile.profile_id + 'sessionLatestTicks'); // Also clear the timestamp
    }
  }

  /**
   * Gets the stored session creation timestamp from local storage.
   */
  private get sessionTimestamp(): number {
    const sessionLatestTicksString = localStorage.getItem(
      this.profile.profile_id + 'sessionLatestTicks',
    );
    if (sessionLatestTicksString) {
      return parseInt(sessionLatestTicksString, 10);
    }
    // Return 0 if not found, to indicate an invalid or missing timestamp
    return 0;
  }

  /**
   * Sets the Gemini session timestamp in local storage.
   * @param ticks The timestamp to store.
   */
  private set sessionTimestamp(ticks: number) {
    if (ticks) {
      localStorage.setItem(this.profile.profile_id + 'sessionLatestTicks', ticks.toString());
    } else {
      localStorage.removeItem(this.profile.profile_id + 'sessionLatestTicks');
    }
  }

  /**
   * Connects to the Gemini Live session if a session doesn't already exist or isn't fully set up.
   * It attempts to resume a previous session if a handle is available.
   * @returns A Promise that resolves to true if connection is successful or pending setup, false otherwise.
   */
  public async connect(): Promise<void> {
    await this.connectToGeminiIfNeeded();
  }

  public async disconnect(): Promise<void> {
    await this.closeSession(true);
  }

  async connectToGeminiIfNeeded(): Promise<boolean> {
    if (this.session && this.isSetupComplete) {
      return true;
    }

    if (this.session && !this.isSetupComplete) {
      return true; // Indicate connection process is "active" or "pending setup"
    }
    this.isSetupComplete = false;
    const previousSessionHandle = this.geminiSession || undefined;
    // if(previousSessionHandle)
    //   this.hasGeminiSession = true;
    return await this.connectToGemini(previousSessionHandle);
  }

  private async timeToPauseRecording() {
    this.isAutoReconnecting = true;
    console.log('[GeminiSessionService] Preparing for seamless auto-reconnect...');
    while (this.onCanCloseSession?.() === false) {
      await sleep(ONE_SECOND);
    }
    this.closeSession(false);
  }

  async pdfFileProcessing(
    pdfFileName: string,
    jpgFiles: any[],
    fileIndex: number,
    totalFiles: number,
  ) {
    let pageIndex = 0;
    for (const jpg of jpgFiles) {
      const percent = Math.round(((pageIndex + 1) / jpgFiles.length) * 100);
      this.onProgress?.(fileIndex + 1, percent);
      const jpgPageName = `${pdfFileName}-page-${jpg.pageNumber.toString().padStart(2, '0')}.jpg`;
      console.log(`Processing page: ${jpg.pageNumber.toString()}`);

      const documentUploadExpired = this.getDocumentUploadExpired(jpgPageName);
      if (documentUploadExpired || this.profile.pdf_flush) {
        const file = await this.createFileFromUrl(jpg.jpgDataUrl, jpgPageName, 'image/jpeg');
        const uploadResponse = await this.genAI?.files.upload({
          file: file,
          config: {
            mimeType: 'image/jpeg',
            displayName: jpgPageName,
          },
        });
        const documentUploadValue = {
          fileData: {
            fileUri: uploadResponse?.uri,
            mimeType: 'image/jpeg',
          },
        };
        this.setDocumentUploadValue(jpgPageName, documentUploadValue);
        this.setDocumentUploadExpired(jpgPageName);
      }
      const documentUploadValue = this.getDocumentUploadValue(jpgPageName);
      this.resourceFileCollection.push(documentUploadValue);
      pageIndex++;
    }
  }

  private onSessionOpen() {
    this.userInitiatedClose = false;
    if (this.schedulingForcedDisconnect) {
      // Set a timer to force a disconnect after 30 seconds to demonstrate reconnect logic
      this.demoDisconnectTimer = setTimeout(async () => {
        console.log('Forcing session disconnect now.');
        this.timeToPauseRecording();
      }, this.schedulingDisconnectMs);
    }
  }

  private async onSessionMessage(e: any) {
    if (e && e.sessionResumptionUpdate && e.sessionResumptionUpdate.newHandle) {
      this.geminiSession = e.sessionResumptionUpdate.newHandle;
      this.onSessionResumptionUpdate?.(e.sessionResumptionUpdate.newHandle);
    }

    if (e && e.goAway) {
      this.goAwayTimeLeft = e.goAway.timeLeft;
      // A GoAway message indicates the connection is about to close.
      // We should close the session now to force a clean reconnect with the existing handle.
      console.warn(
        `[GeminiSessionService] Connection closing in ${this.goAwayTimeLeft} seconds. Forcing session close to trigger reconnect.`,
      );
      this.timeToPauseRecording();
      return; // Stop processing for this message
    }

    if (e.serverContent) {
      if (e.serverContent.inputTranscription && e.serverContent.inputTranscription.text) {
        this.lastInputTranscript = this.mergeTranscript(
          this.lastInputTranscript,
          e.serverContent.inputTranscription.text,
        );
        console.log('[GeminiSessionService] Input Transcription:', e.serverContent.inputTranscription.text);
        this.onInputTranscription?.(e.serverContent.inputTranscription.text);
        if (this._messageCallback) {
          this._messageCallback(
            {
              sender: 'user',
              text: e.serverContent.inputTranscription.text,
              timestamp: Date.now(),
            },
            true,
          );
        }
      }

      if (e.serverContent.outputTranscription?.text) {
        this.lastOutputTranscript = this.mergeTranscript(
          this.lastOutputTranscript,
          e.serverContent.outputTranscription.text,
        );
        console.log('[GeminiSessionService] Output Transcription:', e.serverContent.outputTranscription.text);
        this.onOutputTranscription?.(e.serverContent.outputTranscription.text);
        if (this._messageCallback) {
          this._messageCallback(
            {
              sender: 'assistant',
              text: e.serverContent.outputTranscription.text,
              timestamp: Date.now(),
            },
            true,
          );
        }
      }
    }

    if (e?.setupComplete) {
      this.isAutoReconnecting = false;
      this.isSetupComplete = true;
      console.log('[GoogleLiveAssistantService] Received setupComplete event.');
      this._setupCompleteCallback?.();
    }
    if (e?.serverContent?.modelTurn?.parts) {
      e.serverContent.modelTurn.parts.forEach((part: any) => {
        if (part.inlineData?.data && typeof part.inlineData.data === 'string') {
          try {
            const audioArrayBuffer = base64ToArrayBuffer(part.inlineData.data);
            this.onAudioData?.(audioArrayBuffer);
          } catch (e) {
            console.error('[GeminiSessionService] Error decoding base64 audio from server:', e);
          }
        } else if (part.inlineData?.data) {
          console.warn(
            '[GeminiSessionService] Received inlineData.data that is not a string. Type:',
            typeof part.inlineData.data,
          );
        }
      });
    }

    // Handle turn completion
    if (e?.serverContent?.turnComplete) {
      if (this._messageCallback && this.lastOutputTranscript.trim().length > 0) {
        this._messageCallback(
          {
            sender: 'assistant',
            text: this.lastOutputTranscript,
            timestamp: Date.now(),
          },
          false,
        );
      }
      this.onTurnComplete?.();
      this.lastInputTranscript = '';
      this.lastOutputTranscript = '';
    }
  }

  private mergeTranscript(currentText: string, incomingText: string): string {
    if (incomingText.length === 0) {
      return currentText;
    }

    if (currentText.length === 0 || incomingText.startsWith(currentText)) {
      return incomingText;
    }

    if (currentText.startsWith(incomingText)) {
      return currentText;
    }

    return `${currentText}${incomingText}`;
  }

  private onSessionError(errorEvent: ErrorEvent) {
    const errorMessage =
      (errorEvent as any).message ||
      (errorEvent as any).error?.message ||
      'Unknown WebSocket error';
    console.error(
      '[GeminiSessionService] WebSocket onerror triggered:',
      errorEvent,
      'Message:',
      errorMessage,
    );
    this._errorCallback?.(`WebSocket Error: ${errorMessage}`);
  }

  private async onSessionClose(closeEvent: CloseEvent) {
    this.onClose?.(closeEvent.wasClean, closeEvent.code, closeEvent.reason);
    // Emit a status update with details so callers can observe why/when connection closed

    // If the close was initiated by application code, do not auto-reconnect
    if (this.userInitiatedClose) {
      // Reset the flag so subsequent closes may reconnect as normal
      this.userInitiatedClose = false;
      return;
    }

    // Only attempt reconnect when the close was not a graceful user-initiated shutdown
    // and we have a GenAI client available
    if (!this.genAI) {
      return;
    }

    // Start the reconnect flow
    console.log('[GeminiSessionService] Connection lost; scheduling automatic reconnect...');

    // Kick off reconnect attempts (will respect max attempts and backoff)
    setTimeout(() => {
      this.attemptReconnect();
    }, ONE_SECOND);
  }

  async connectToGemini(previousSessionHandle: string | undefined): Promise<boolean> {
    this.isSetupComplete = false;
    try {
      if (this.session) {
        console.warn(
          '[GeminiSessionService] Existing session found. Closing it before creating a new one.',
        );
        try {
          this.session.close();
        } catch (e) {
          console.warn('[GeminiSessionService] Error closing previous session:', e);
          // Using custom modal UI instead of alert()
        }
        this.session = null;
      }

      if (!this.genAI) {
        return false;
      }
      const voiceName = this.profile.voice_name;

      this.session = await this.genAI.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          sessionResumption: {
            handle: previousSessionHandle, // Pass the handle here to resume
          },
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: this.onSessionOpen.bind(this),
          onmessage: this.onSessionMessage.bind(this),
          onerror: this.onSessionError.bind(this),
          onclose: this.onSessionClose.bind(this),
        },
      });

      let historyTurns = this.chatMessageHistory
        .map((msg) => `${msg.sender}: ${msg.text}`)
        .join('\n');
      if (historyTurns.length === 0) {
        historyTurns = 'user: Hello!';
      }

      // load the dialogue file
      let dialogueFile = '';
      if (this.profile.dialogue_file) {
        const dialogueFileResponse = await fetch(`${PROFILES_URL}/${this.profile.dialogue_file}`);
        if (!dialogueFileResponse.ok) {
          throw new Error(
            `HTTP error! status: ${dialogueFileResponse.status} for ${this.profile.dialogue_file}`,
          );
        }
        dialogueFile = await dialogueFileResponse.text();
        if (this.profile.pre_recorded) {
          this.dialogueUtterance = this.parseDialogue(dialogueFile);
        }
      }

      let systemInstructions = this.systemInstructions;
      if (this.recordingCycleCount > 0) {
        systemInstructions += `\n\nThis is continuation of the session.`;
      }

      if (this.profile.pdf_file && previousSessionHandle === undefined) {
        // Single hardcoded PDF file specified in profile. Convert to JPG(s) and add to resource collection.
        const pdfFilePath = `${PROFILES_URL}/${this.profile.pdf_file}`;
        const pdfFileName = (this.profile.pdf_file.split('/').pop() || 'document.pdf').replace(
          '.pdf',
          '',
        );

        console.log(`Converting pdf file: ${pdfFileName} to JPG images...`);
        const jpgFiles = await convertPdfUrlToJpg(pdfFilePath);
        await this.pdfFileProcessing(pdfFileName, jpgFiles, 0, 1);
        console.log(`Completed! adding PDF pages as JPGs to resource file collection.`);
      }

      if (this.profile.pdf_upload && previousSessionHandle === undefined) {
        // Multiple PDF files uploaded by user. Convert to JPG(s) and add to resource collection.
        let fileIndex = 0;
        for (const file of this.pdfFiles) {
          const pdfFileName = (file.name.split('/').pop() || 'document.pdf').replace('.pdf', '');

          console.log(`Converting pdf file: ${pdfFileName} to JPG images...`);
          const jpgFiles = await convertPdfFileToJpg(file);
          await this.pdfFileProcessing(pdfFileName, jpgFiles, fileIndex, this.pdfFiles.length);
          fileIndex++;
        }
        console.log(`Completed! adding PDF pages as JPGs to resource file collection.`);
      }

      // resourceFiles is a collection of "text based" html/txt/md file names
      const resourceFiles = this.profile?.resource_files;
      // Map each file name to a fetch promise
      const fetchPromises = resourceFiles.map((file) =>
        fetch(`${PROFILES_URL}/${file}`).then((response) => response.text()),
      );
      // Wait for all fetch promises to resolve
      const textFileContents = await Promise.all(fetchPromises);
      // Create a collection of Content parts from the fetched textFile strings
      const textFileCollection = textFileContents.map((content) => ({ text: content }));
      // Add the textFileCollection to the resourceFileCollection array
      this.resourceFileCollection.push(...textFileCollection);

      let sessionContent: Content[] = [
        {
          role: 'user',
          parts: [...this.resourceFileCollection, { text: systemInstructions }],
        },
      ];

      let turnComplete = true; // default to true
      if (this.profile.turn_complete === false) {
        turnComplete = false;
      }
      if (this.recordingCycleCount > 0) {
        turnComplete = false;
      }

      // if(previousSessionHandle) {
      //   turnComplete = false;
      // }

      // Use the sendClientContent method to send the collection of Content objects.
      // A turnComplete value of true indicates to Gemini that it the AI will speak next and not wait for the user.
      this.session.sendClientContent({ turns: sessionContent, turnComplete });
      this.recordingCycleCount++;
      return true;
    } catch (error) {
      console.error('[GeminiSessionService] Error during ai.live.connect() call:', error);
      this._errorCallback?.(
        `Connection setup failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      return false;
    }
  }

  getDocumentUploadExpired(documentName: string): boolean {
    // upload document expires after 40 hours
    const expiryString = localStorage.getItem(`${documentName}-documentUploadExpired`);
    if (expiryString) {
      const expiryTime = parseInt(expiryString, 10);
      const currentTime = new Date().getTime();
      if (currentTime - expiryTime > 40 * ONE_HOUR) {
        // All files expire after 40 hours. They would have expired on the server after 48 hours anyway.
        return true;
      }
      return false;
    }
    return true;
  }

  setDocumentUploadExpired(documentName: string) {
    const todaysDate = new Date().getTime();
    localStorage.setItem(`${documentName}-documentUploadExpired`, todaysDate.toString());
  }

  getDocumentUploadValue(documentName: string): {} {
    // upload document expires after 40 hours
    const value = localStorage.getItem(`${documentName}-documentUploadValue`);
    if (value) {
      return JSON.parse(value);
    }
    return {};
  }

  setDocumentUploadValue(documentName: string, value: {}) {
    localStorage.setItem(`${documentName}-documentUploadValue`, JSON.stringify(value));
  }

  private async createFileFromUrl(url: string, fileName: string, mimeType?: string): Promise<File> {
    // 1. Fetch the data from the URL
    const response = await fetch(url);

    // 2. Convert the response into a Blob (Binary Large Object)
    const data = await response.blob();

    // 3. Create the File object
    // Syntax: new File([bits], name, { type })
    return new File([data], fileName, { type: mimeType || data.type });
  }

  // ILiveAssistantService mapped methods
  public async sendMessage(text: string): Promise<void> {
    if (this.session) {
      const turnContent: Content[] = [
        {
          role: 'user',
          parts: [{ text: text }],
        },
      ];
      this.session.sendClientContent({ turns: turnContent, turnComplete: true });
    }
  }

  public sendAudio(audio: ArrayBuffer): void {
    if (this.session) {
      this.sendRealtimeInput({
        mimeType: 'audio/pcm;rate=16000',
        data: this.arrayBufferToBase64(audio),
      });
    }
  }

  public sendImage(imageData: { base64: string; mimeType: string }): void {
    if (this.session) {
      this.sendRealtimeInput({
        mimeType: imageData.mimeType,
        data: imageData.base64,
      });
    }
  }

  public getInputAudioSampleRate(): number {
    return TARGET_SAMPLE_RATE;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  public onConnectionStatusChange(callback: (status: ConnectionState) => void): void {
    this._connectionCallback = callback;
  }

  public onAudioReceived(callback: (audio: ArrayBuffer) => void): void {
    this.onAudioData = callback;
  }

  public onSetupComplete(callback: () => void): void {
    this._setupCompleteCallback = callback;
  }

  public onAudioLevelChange(callback: (level: number) => void): void {
    // Audio worklet implementation mapping
  }

  public onMessageReceived(callback: (msg: IChatMessage, isStreaming?: boolean) => void): void {
    this._messageCallback = callback;
  }

  public onError(callback: (error: string) => void): void {
    this._errorCallback = callback;
  }

  public sendClientContent(turns: string) {
    if (this.session) {
      const turnContent: Content[] = [
        {
          role: 'user',
          parts: [{ text: turns }],
        },
      ];
      this.session.sendClientContent({ turns: turnContent, turnComplete: true });
    }
  }

  public sendRealtimeInput(media: GenAIBlobType) {
    if (this.session) {
      try {
        this.session.sendRealtimeInput({ media });
      } catch (err) {
        console.error('[GeminiSessionService] Error sending realtime input:', err);
      }
    } else {
      console.warn('[GeminiSessionService] sendRealtimeInput called but no active session.');
    }
  }

  public async closeSession(userInitiated: boolean = true) {
    while (this.onCanCloseSession?.() === false) {
      await sleep(ONE_SECOND);
    }
    await sleep(ONE_SECOND * 2); // Wait a bit to allow any in-progress operations to complete
    // Mark whether this close was triggered by user/app code so we don't auto-reconnect
    this.userInitiatedClose = userInitiated;
    if (this.session) {
      try {
        this.session.close();
      } catch (e) {
        console.warn('[GeminiSessionService] Error calling session.close():', e);
      }
      this.session = null;
    }

    // Always clear any demo disconnect timer when closing
    if (this.demoDisconnectTimer) {
      try {
        clearTimeout(this.demoDisconnectTimer);
      } catch (e) {
        /* ignore */
      }
      this.demoDisconnectTimer = null;
    }
  }

  private async attemptReconnect() {
    console.log('[GeminiSessionService] Attempting automatic reconnect...');
    await this.connectToGeminiIfNeeded();
  }

  public getSession(): Session | null {
    return this.session;
  }

  public getIsSetupComplete(): boolean {
    return this.isSetupComplete;
  }
}
