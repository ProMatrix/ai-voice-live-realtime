import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IMAGE_SEND_INTERVAL_MS } from './constants';
import { ImageCaptureService } from './image-capture.service';
import { LiveInterfaceService } from './live-interface.service';

describe('image sharing regression guardrails', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits periodic image data when sharing state is ready', async () => {
    const service = new ImageCaptureService();
    const onImageReady = vi.fn();

    service.onImageReady = onImageReady;
    service.setIsSetupComplete(true);
    service.setIsRecording(true);
    (service as any).currentImageBase64 = 'encoded-image';
    (service as any).currentImageMimeType = 'image/png';

    service.startPeriodicImageSending();
    await vi.advanceTimersByTimeAsync(IMAGE_SEND_INTERVAL_MS);

    expect(onImageReady).toHaveBeenCalledTimes(1);
    expect(onImageReady).toHaveBeenCalledWith({
      base64: 'encoded-image',
      mimeType: 'image/png',
    });

    service.stopPeriodicImageSending();
  });

  it('does not emit periodic image data before setup completes', async () => {
    const service = new ImageCaptureService();
    const onImageReady = vi.fn();

    service.onImageReady = onImageReady;
    service.setIsSetupComplete(false);
    service.setIsRecording(true);
    (service as any).currentImageBase64 = 'encoded-image';
    (service as any).currentImageMimeType = 'image/png';

    service.startPeriodicImageSending();
    await vi.advanceTimersByTimeAsync(IMAGE_SEND_INTERVAL_MS);

    expect(onImageReady).not.toHaveBeenCalled();
  });

  it('starts periodic image sending when setup completes and a shared image is already present', async () => {
    const conversationAudioService = {
      setIsSetupComplete: vi.fn(),
      initializeAudioSystem: vi.fn(async () => true),
      startMicrophone: vi.fn(async () => undefined),
      playAudio: vi.fn(),
      isUserSpeaking: false,
    } as any;

    const preRecordedAudioService = {
      isPlayingPreRecorded: false,
    } as any;

    const imageCaptureService = {
      setIsSetupComplete: vi.fn(),
      setIsRecording: vi.fn(),
      startPeriodicImageSending: vi.fn(),
      onImageReady: null,
    } as any;

    const liveAssistantService = {
      onMessageReceived: vi.fn(),
      onAudioReceived: vi.fn(),
      onSetupComplete: vi.fn(),
      sendAudio: vi.fn(),
      sendImage: vi.fn(),
    } as any;

    const chatHistoryService = {
      getChatHistory: vi.fn(() => []),
      saveChatHistory: vi.fn(),
      createRealtimeMessage: vi.fn(() => document.createElement('div')),
      finalizeMessage: vi.fn(),
    } as any;

    const service = new LiveInterfaceService(
      conversationAudioService,
      preRecordedAudioService,
      imageCaptureService,
      liveAssistantService,
      chatHistoryService,
      { triggerSnapshotCue: vi.fn() } as any,
      {} as any,
      { resetConversation: vi.fn() } as any,
      { resetConversation: vi.fn() } as any,
    );

    (service as any).imagePreview = { src: 'data:image/png;base64,encoded-image' };

    await (service as any).onSetupComplete();

    expect(conversationAudioService.setIsSetupComplete).toHaveBeenCalledWith(true);
    expect(imageCaptureService.setIsSetupComplete).toHaveBeenCalledWith(true);
    expect(imageCaptureService.startPeriodicImageSending).toHaveBeenCalledTimes(1);
  });

  it('starts periodic image sending when screen share begins after setup is already complete', async () => {
    const conversationAudioService = {
      setIsSetupComplete: vi.fn(),
      initializeAudioSystem: vi.fn(async () => true),
      startMicrophone: vi.fn(async () => undefined),
      playAudio: vi.fn(),
      isUserSpeaking: false,
    } as any;

    const preRecordedAudioService = {
      isPlayingPreRecorded: false,
    } as any;

    const imageCaptureService = {
      setIsSetupComplete: vi.fn(),
      setIsRecording: vi.fn(),
      startScreenShare: vi.fn(async () => undefined),
      startPeriodicImageSending: vi.fn(),
      onImageReady: null,
    } as any;

    const liveAssistantService = {
      onMessageReceived: vi.fn(),
      onAudioReceived: vi.fn(),
      onSetupComplete: vi.fn(),
      sendAudio: vi.fn(),
      sendImage: vi.fn(),
    } as any;

    const visionApiService = {
      resetConversation: vi.fn(),
    } as any;

    const service = new LiveInterfaceService(
      conversationAudioService,
      preRecordedAudioService,
      imageCaptureService,
      liveAssistantService,
      {
        getChatHistory: vi.fn(() => []),
        saveChatHistory: vi.fn(),
        createRealtimeMessage: vi.fn(() => document.createElement('div')),
        finalizeMessage: vi.fn(),
      } as any,
      { triggerSnapshotCue: vi.fn() } as any,
      {} as any,
      visionApiService,
      { resetConversation: vi.fn() } as any,
    );

    (service as any).isRecording = true;
    imageCaptureService.startPeriodicImageSending.mockClear();

    await (service as any).onSetupComplete();
    imageCaptureService.startPeriodicImageSending.mockClear();

    await service.startScreenShare();

    expect(imageCaptureService.startScreenShare).toHaveBeenCalledTimes(1);
    expect(imageCaptureService.startPeriodicImageSending).toHaveBeenCalledTimes(1);
    expect(visionApiService.resetConversation).toHaveBeenCalledTimes(1);
  });
});