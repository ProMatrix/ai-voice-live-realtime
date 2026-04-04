import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LiveInterfaceService } from '../../../llm-common/src/lib/live-interface.service';

import { App } from './app';

class LiveInterfaceServiceMock {
  appraisalCount = 0;
  isSharing = false;
  isRecording = false;
  isMuted = false;
  isInitialized = false;
  serviceMode = 'stopRecording';
  aiVolume = 0;
  simVolume = 0;
  audioLevel = 0;
  outputAudioLevel = 0;
  getChatHistoryCount = 0;
  private profile: { profile_title: string; profile_id: string } | null = null;
  private chatHistoryMessagesDiv: HTMLDivElement | null = null;

  private renderSavedMessages = () => {
    if (!this.chatHistoryMessagesDiv || !this.profile) {
      return;
    }

    this.chatHistoryMessagesDiv.innerHTML = '';
    const savedMessagesJson = localStorage.getItem(
      `${this.profile.profile_title} - chatMessages`,
    );
    const savedMessages = savedMessagesJson ? JSON.parse(savedMessagesJson) : [];

    for (const message of savedMessages) {
      const messageBubble = document.createElement('div');
      messageBubble.classList.add('message-bubble');
      messageBubble.textContent = message.text;
      this.chatHistoryMessagesDiv.appendChild(messageBubble);
    }

    this.getChatHistoryCount = savedMessages.length;
  };

  setProfile = vi.fn((profile: { profile_title: string; profile_id: string }) => {
    this.profile = profile;
  });
  initializeHistory = vi.fn((chatHistoryMessagesDiv: HTMLDivElement) => {
    this.chatHistoryMessagesDiv = chatHistoryMessagesDiv;
    this.renderSavedMessages();
  });
  restartSession = vi.fn((resetSession?: boolean) => {
    if (resetSession && this.profile) {
      localStorage.removeItem(`${this.profile.profile_title} - chatMessages`);
      localStorage.removeItem(this.profile.profile_id + 'geminiSession');
      localStorage.removeItem(this.profile.profile_id + 'sessionLatestTicks');
      if (this.chatHistoryMessagesDiv) {
        this.chatHistoryMessagesDiv.innerHTML = '';
      }
      this.getChatHistoryCount = 0;
      return;
    }

    this.renderSavedMessages();
  });
  removeHtmlLinks = vi.fn();
  resetRecordingCycleCount = vi.fn();
  updateSpeakerState = vi.fn();
  setAiVolume = vi.fn();
  setSimVolume = vi.fn();
  setPdfFiles = vi.fn();
  handleTextFromUser = vi.fn();
  startScreenShare = vi.fn(async () => undefined);
  stopScreenShare = vi.fn(async () => undefined);
  startupPreRecorded = vi.fn(async () => undefined);
  initialize = vi.fn(async () => {
    this.isInitialized = true;
    this.restartSession(false);
  });
  startRecording = vi.fn(async () => {
    this.isRecording = true;
  });
  stopRecording = vi.fn(async () => {
    this.isRecording = false;
    this.isMuted = false;
  });
  muteMicrophone = vi.fn(async () => {
    this.isMuted = true;
  });
  unmuteMicrophone = vi.fn(() => {
    this.isMuted = false;
  });
  continuePlayback = vi.fn();
  continueRecording = vi.fn();
  getPendingPausedUserText = vi.fn(() => '');
  showHostActive = vi.fn(() => false);
  showGuestActive = vi.fn(() => false);
}

const developerAssistantProfile = {
  profile_title: 'AI Developer Assistant',
  profile_id: 'developer-assistant-session',
  model_instructions: 'developer-assistant/instructions.md',
  dialogue_file: '',
  voice_name: 'Zephyr',
  isSpeakerOn: true,
  aiVolume: 0.3,
  aiFullVolume: 1.0,
  simVolume: 0.3,
  simFullVolume: 1.0,
  resource_files: [],
  pre_recorded: false,
  go_bridge: '',
  clear_session_on_startup: false,
  show_side_panel: true,
  show_chatbots: true,
};

const developerResearcherProfile = {
  profile_title: 'AI Developer Researcher',
  profile_id: 'developer-researcher-session',
  model_instructions: 'developer-researcher/instructions.md',
  dialogue_file: '',
  voice_name: 'Zephyr',
  isSpeakerOn: true,
  aiVolume: 0.3,
  aiFullVolume: 1.0,
  simVolume: 0.3,
  simFullVolume: 1.0,
  resource_files: [],
  pre_recorded: false,
  go_bridge: '',
  clear_session_on_startup: false,
  show_side_panel: true,
  show_chatbots: true,
};

function createFetchResponse(body: string, ok = true) {
  return {
    ok,
    async json() {
      return JSON.parse(body);
    },
    async text() {
      return body;
    },
  };
}

describe('App smoke interactions', () => {
  let fixture: ComponentFixture<App>;
  let app: App;
  let liveInterface: LiveInterfaceServiceMock;
  let alertSpy: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  async function mountApp(profileName: 'developer-assistant' | 'developer-researcher') {
    window.history.replaceState({}, '', `/?profile=${profileName}`);

    const nextFixture = TestBed.createComponent(App);
    const nextApp = nextFixture.componentInstance;
    nextFixture.detectChanges();
    await vi.advanceTimersByTimeAsync(1000);
    await nextFixture.whenStable();
    nextFixture.detectChanges();

    fixture = nextFixture;
    app = nextApp;
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    liveInterface = new LiveInterfaceServiceMock();
    localStorage.clear();

    if (!Object.getOwnPropertyDescriptor(SVGElement.prototype, 'r')) {
      Object.defineProperty(SVGElement.prototype, 'r', {
        configurable: true,
        get() {
          return { baseVal: { value: 16 } };
        },
      });
    }

    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/assets/profiles/developer-assistant.json')) {
        return createFetchResponse(JSON.stringify(developerAssistantProfile));
      }

      if (url.endsWith('/assets/profiles/developer-researcher.json')) {
        return createFetchResponse(JSON.stringify(developerResearcherProfile));
      }

      if (url.endsWith('/assets/profiles/developer-assistant/instructions.md')) {
        return createFetchResponse('You are a helpful developer assistant.');
      }

      if (url.endsWith('/assets/profiles/developer-researcher/instructions.md')) {
        return createFetchResponse('You are a helpful developer researcher.');
      }

      throw new Error(`Unexpected fetch request in smoke test: ${url}`);
    });

    vi.stubGlobal('fetch', fetchSpy);

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: LiveInterfaceService, useValue: liveInterface }],
    }).compileComponents();

    await mountApp('developer-assistant');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    alertSpy.mockRestore();
    vi.useRealTimers();
  });

  it('loads the profile without showing an alert', () => {
    expect(app.profile.profile_id).toBe('developer-assistant-session');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith('/assets/profiles/developer-assistant.json');
  });

  it('clicking start recording initializes and starts the live interface', async () => {
    const startRecordButton = fixture.nativeElement.querySelector(
      '#startRecordButton',
    ) as HTMLButtonElement;
    const screenShareButton = fixture.nativeElement.querySelector(
      '#screenShareButton',
    ) as HTMLButtonElement;

    startRecordButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(liveInterface.initialize).toHaveBeenCalledTimes(1);
    expect(liveInterface.startRecording).toHaveBeenCalledTimes(1);
    expect(liveInterface.isRecording).toBe(true);
    expect(screenShareButton.style.visibility).toBe('visible');
  });

  it('clicking share screen toggles sharing on and off', async () => {
    const startRecordButton = fixture.nativeElement.querySelector(
      '#startRecordButton',
    ) as HTMLButtonElement;
    const screenShareButton = fixture.nativeElement.querySelector(
      '#screenShareButton',
    ) as HTMLButtonElement;
    const showVideoButton = fixture.nativeElement.querySelector(
      '#showVideoButton',
    ) as HTMLButtonElement;

    (app as any).startSessionTimer = vi.fn();

    startRecordButton.click();
    await fixture.whenStable();

    screenShareButton.click();
    await vi.advanceTimersByTimeAsync(1100);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(liveInterface.startScreenShare).toHaveBeenCalledTimes(1);
    expect(screenShareButton.classList.contains('active')).toBe(true);
    expect(screenShareButton.title).toBe('Screen Sharing: On');
    expect(showVideoButton.style.visibility).toBe('visible');
    expect(showVideoButton.disabled).toBe(false);

    screenShareButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(liveInterface.stopScreenShare).toHaveBeenCalledTimes(1);
    expect(screenShareButton.classList.contains('active')).toBe(false);
    expect(screenShareButton.title).toBe('Screen Sharing: Off');
  });

  it('developer-researcher trash clears persisted history and start does not reload it', async () => {
    localStorage.setItem(
      'AI Developer Researcher - chatMessages',
      JSON.stringify([
        {
          text: 'Existing saved developer-researcher message',
          sender: 'assistant',
          timestamp: Date.now(),
        },
      ]),
    );

    fixture.destroy();
    await mountApp('developer-researcher');

    const trashButton = fixture.nativeElement.querySelector('#trashButton') as HTMLButtonElement;
    const startRecordButton = fixture.nativeElement.querySelector(
      '#startRecordButton',
    ) as HTMLButtonElement;
    const chatHistoryMessagesDiv = fixture.nativeElement.querySelector(
      '#chat-history-messages',
    ) as HTMLDivElement;

    expect(chatHistoryMessagesDiv.textContent).toContain('Existing saved developer-researcher message');

    trashButton.click();
    await vi.advanceTimersByTimeAsync(1000);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(liveInterface.restartSession).toHaveBeenCalledWith(true);
    expect(localStorage.getItem('AI Developer Researcher - chatMessages')).toBeNull();
    expect(chatHistoryMessagesDiv.textContent?.trim()).toBe('');

    startRecordButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(liveInterface.initialize).toHaveBeenCalled();
    expect(chatHistoryMessagesDiv.textContent?.trim()).toBe('');
  });

  it('developer-researcher reuses undeleted session history on reload and start', async () => {
    localStorage.setItem(
      'AI Developer Researcher - chatMessages',
      JSON.stringify([
        {
          text: 'Saved developer-researcher history',
          sender: 'assistant',
          timestamp: Date.now(),
        },
      ]),
    );
    localStorage.setItem('developer-researcher-sessiongeminiSession', 'existing-session-handle');
    localStorage.setItem('developer-researcher-sessionsessionLatestTicks', Date.now().toString());

    fixture.destroy();
    await mountApp('developer-researcher');

    const startRecordButton = fixture.nativeElement.querySelector(
      '#startRecordButton',
    ) as HTMLButtonElement;
    const chatHistoryMessagesDiv = fixture.nativeElement.querySelector(
      '#chat-history-messages',
    ) as HTMLDivElement;

    expect(chatHistoryMessagesDiv.textContent).toContain('Saved developer-researcher history');
    expect(localStorage.getItem('AI Developer Researcher - chatMessages')).not.toBeNull();
    expect(localStorage.getItem('developer-researcher-sessiongeminiSession')).toBe(
      'existing-session-handle',
    );

    startRecordButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(liveInterface.initialize).toHaveBeenCalled();
  expect(liveInterface.restartSession).toHaveBeenCalledWith(false);
    expect(liveInterface.startRecording).toHaveBeenCalled();
    expect(chatHistoryMessagesDiv.textContent).toContain('Saved developer-researcher history');
    expect(localStorage.getItem('AI Developer Researcher - chatMessages')).not.toBeNull();
    expect(localStorage.getItem('developer-researcher-sessiongeminiSession')).toBe(
      'existing-session-handle',
    );
  });
});