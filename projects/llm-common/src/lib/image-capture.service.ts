// image-capture.service.ts
import { Injectable } from '@angular/core';
import { dataURLtoFile, sleep } from './utils';
import { IMAGE_UPDATE_INTERVAL, FIFTEEN_HUNDRED_MS, IMAGE_SEND_INTERVAL_MS } from './constants';
import { IProfile, defaultProfile } from './interfaces';

@Injectable({ providedIn: 'root' })
export class ImageCaptureService {
  private videoElement: HTMLVideoElement | undefined;
  private canvasElement: HTMLCanvasElement | undefined;
  private imagePreviewDiv: HTMLDivElement | null = null;
  private imagePreview: HTMLImageElement | null = null;
  private screenWidth = 1000; // Default width, can be adjusted based on video element
  private imageDataUrl: string | null = null;
  private currentImageBase64: string | null = null;
  private currentImageMimeType: string | null = null;
  private imageSendIntervalId: number | null = null;
  private snapshotIntervalId: number | null = null;
  private logOutput = false;
  private stream: MediaStream | null = null;
  private session: any | null = null;
  private isRecording = false; // To be set by LiveInterfaceService
  private isSetupComplete = false; // To be set by LiveInterfaceService
  private profile = defaultProfile;
  // Callbacks to communicate with LiveInterfaceService
  public onImageReady: ((imageData: { base64: string; mimeType: string }) => void) | null = null;

  constructor() {}
  /**
   * Initialize the ImageCaptureService with DOM elements and profile.
   * @param videoElement The video element used as source for captures.
   * @param canvasElement The canvas element used for drawing frames.
   * @param imagePreviewDiv Container element for the preview image.
   * @param imagePreview Image element where the preview will be displayed.
   * @param profile Active profile settings.
   */
  public initialize(
    videoElement: HTMLVideoElement,
    canvasElement: HTMLCanvasElement,
    imagePreviewDiv: HTMLDivElement,
    imagePreview: HTMLImageElement,
    profile: IProfile,
  ) {
    this.videoElement = videoElement;
    this.canvasElement = canvasElement;
    this.imagePreviewDiv = imagePreviewDiv;
    this.imagePreview = imagePreview;
    this.profile = profile;
  }

  /**
   * Initializes the ImageCaptureService with DOM elements and profile.
   * @param videoElement The video element used as source for captures.
   * @param canvasElement The canvas element used for drawing frames.
   * @param imagePreviewDiv Container for the preview image.
   * @param imagePreview Image element where the preview will be displayed.
   * @param profile Active profile settings.
   */

  public setSession(session: any | null) {
    this.session = session;
  }

  /**
   * Assigns the GenAI session instance to the service.
   * @param session The GenAI Session or null to clear.
   */

  public setIsRecording(isRecording: boolean) {
    this.isRecording = isRecording;
  }

  /**
   * Sets whether the service should consider itself in recording mode.
   * @param isRecording True when recording is active.
   */

  public setIsSetupComplete(isSetupComplete: boolean) {
    this.isSetupComplete = isSetupComplete;
  }

  /**
   * Sets whether session setup is complete so images may be sent.
   * @param isSetupComplete True if setup is complete.
   */

  public setLogOutput(logOutput: boolean) {
    this.logOutput = logOutput;
  }

  /**
   * Enables or disables verbose logging for the image capture service.
   * @param logOutput True to enable debug logging.
   */

  /**
   * Initiates screen sharing and sets up periodic snapshots.
   */
  /**
   * Starts screen sharing by requesting a display media stream and attaches it to the
   * configured video element. Also starts a repeating snapshot process based on
   * IMAGE_UPDATE_INTERVAL.
   * @returns Promise that resolves when screen share has started or rejects on error.
   */
  async startScreenShare(): Promise<void> {
    if (this.imagePreview) {
      this.imagePreview.style.opacity = '1.0';
    }

    try {
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      if (this.videoElement) {
        this.videoElement.srcObject = this.stream;
        await this.waitForRenderableFrame(this.videoElement);
        await this.snapshot();
      }

      if (this.snapshotIntervalId) {
        clearInterval(this.snapshotIntervalId);
      }

      // Start taking snapshots at the defined interval.
      this.snapshotIntervalId = window.setInterval(
        this.onSnapshotInterval.bind(this),
        IMAGE_UPDATE_INTERVAL,
      );
    } catch (error) {
      throw error;
    }
  }

  private async onSnapshotInterval() {
    await this.snapshot();
  }

  /**
   * Starts a screen share stream using getDisplayMedia and begins snapshotting frames.
   * @returns A Promise that resolves when screen sharing has been started.
   */

  /**
   * Stops the active screen share stream and releases all media tracks.
   */
  async stopScreenShare() {
    try {
      if (this.snapshotIntervalId) {
        clearInterval(this.snapshotIntervalId);
        this.snapshotIntervalId = null;
      }

      this.stopPeriodicImageSending();

      if (this.stream) {
        this.stream.getTracks().forEach(this.stopTrack.bind(this));
        this.stream = null;
      }

      this.imageDataUrl = null;
      this.currentImageBase64 = null;
      this.currentImageMimeType = null;
    } catch (error) {
      throw error;
    }
  }

  private stopTrack(track: MediaStreamTrack) {
    track.stop();
  }

  /**
   * Stops the active screen share stream and releases tracks.
   */

  /**
   * Captures a frame from the video element, converts it to a data URL,
   * and prepares it for sending to the model.
   */
  /**
   * Captures a frame from the configured video element, converts it to a File/Data URL,
   * updates the preview DOM elements, and prepares base64 data for sending.
   * @returns Promise that resolves when snapshot processing completes.
   */
  async snapshot(): Promise<void> {
    if (!this.videoElement || !this.canvasElement) {
      return;
    }

    if (!this.hasRenderableFrame(this.videoElement)) {
      try {
        await this.waitForRenderableFrame(this.videoElement, FIFTEEN_HUNDRED_MS);
      } catch {
        return;
      }
    }

    this.imageDataUrl = this.captureFrame(this.videoElement, this.canvasElement);

    if (this.imageDataUrl) {
      const reader = new FileReader();
      reader.onload = this.onFileReaderLoad.bind(this);
      reader.onerror = this.onFileReaderError.bind(this);
      const f: File = await dataURLtoFile(this.imageDataUrl, 'newImageFile');
      reader.readAsDataURL(f);
    }
  }

  private onFileReaderLoad(e: ProgressEvent<FileReader>) {
    if (this.imagePreview && this.imagePreviewDiv) {
      const base64Full = e.target?.result as string;
      this.currentImageBase64 = base64Full.substring(base64Full.indexOf(',') + 1);
      this.currentImageMimeType = 'image/png'; // Ensure consistent MIME type

      if (this.imageDataUrl) {
        this.imagePreview.src = this.imageDataUrl;
      }

      this.imagePreviewDiv.style.display = 'block';
    }
  }

  private onFileReaderError() {
    console.log('Error reading image file.');
  }

  /**
   * Captures a frame from the configured video element, converts it to a data URL
   * and prepares the image data for sending to the GenAI session.
   * @returns A Promise that resolves when snapshot processing completes.
   */

  /**
   * Captures a single frame from a video element onto a canvas and returns its data URL.
   * @param videoElement The HTMLVideoElement to capture from.
   * @param canvasElement The HTMLCanvasElement to draw to.
   * @returns The data URL of the captured frame, or null if an error occurs.
   */
  /**
   * Captures a single frame from a video element onto a canvas and returns its data URL.
   * @param videoElement The HTMLVideoElement to capture from.
   * @param canvasElement The HTMLCanvasElement to draw to.
   * @returns The data URL of the captured frame, or null if an error occurs.
   */
  private captureFrame(
    videoElement: HTMLVideoElement,
    canvasElement: HTMLCanvasElement,
  ): string | null {
    const context = canvasElement.getContext('2d', {
      willReadFrequently: true,
    });
    if (!context) {
      console.error('Failed to get 2D context from canvas.');
      return null;
    }
    canvasElement.width = this.screenWidth;
    canvasElement.height =
      (videoElement.videoHeight / videoElement.videoWidth) * canvasElement.width;
    context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

    try {
      const dataUrl = canvasElement.toDataURL('image/png');
      return dataUrl;
    } catch (error) {
      console.error('Error converting canvas to data URL:', error);
      return null;
    }
  }

  private hasRenderableFrame(videoElement: HTMLVideoElement): boolean {
    return (
      videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      videoElement.videoWidth > 0 &&
      videoElement.videoHeight > 0
    );
  }

  private async waitForRenderableFrame(
    videoElement: HTMLVideoElement,
    timeoutMs = FIFTEEN_HUNDRED_MS,
  ): Promise<void> {
    if (this.hasRenderableFrame(videoElement)) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        videoElement.removeEventListener('loadedmetadata', onReady);
        videoElement.removeEventListener('canplay', onReady);
        videoElement.removeEventListener('playing', onReady);
      };

      const finishResolve = () => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve();
      };

      const finishReject = () => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        reject(new Error('Timed out waiting for a screen-share frame.'));
      };

      const onReady = () => {
        if (this.hasRenderableFrame(videoElement)) {
          finishResolve();
        }
      };

      videoElement.addEventListener('loadedmetadata', onReady);
      videoElement.addEventListener('canplay', onReady);
      videoElement.addEventListener('playing', onReady);

      const startedAt = Date.now();

      const poll = async () => {
        while (!settled) {
          if (this.hasRenderableFrame(videoElement)) {
            finishResolve();
            return;
          }

          if (Date.now() - startedAt >= timeoutMs) {
            finishReject();
            return;
          }

          await sleep(50);
        }
      };

      void poll();
    });
  }

  /**
   * Draws the current frame of a video element onto the canvas and returns a PNG data URL.
   * @param videoElement The video element to capture from.
   * @param canvasElement The canvas to draw to.
   * @returns A PNG data URL string or null if an error occurs.
   */

  /**
   * Starts periodically sending captured image data to the Gemini session.
   * Images are only sent if a session is active, setup is complete, and recording is active.
   */
  /**
   * Starts a periodic timer to send captured images to the configured GenAI session
   * provided that a session is active and sending is allowed.
   */
  startPeriodicImageSending() {
    if (this.imageSendIntervalId) {
      clearInterval(this.imageSendIntervalId);
      this.imageSendIntervalId = null;
    }

    if (!this.isSetupComplete) {
      console.warn('[ImageCaptureService] Skipping periodic image sending because setup is not complete.');
      return;
    }

    if (!this.hasImageSource()) {
      if (this.logOutput) {
        console.log('[ImageCaptureService] Not starting periodic image sending because no image source is available.');
      }
      return;
    }

    console.log('[ImageCaptureService] Starting periodic image sending interval.', {
      isRecording: this.isRecording,
      isSetupComplete: this.isSetupComplete,
      hasImage: !!this.currentImageBase64,
      mimeType: this.currentImageMimeType,
    });

    this.imageSendIntervalId = window.setInterval(
      this.sendPeriodicImageData.bind(this),
      IMAGE_SEND_INTERVAL_MS,
    );
  }

  private hasImageSource(): boolean {
    return !!this.stream || (!!this.currentImageBase64 && !!this.currentImageMimeType);
  }

  /**
   * Begins regularly sending captured image data to the GenAI session when conditions permit.
   */

  /**
   * Stops the periodic sending of image data.
   */
  /**
   * Stops the periodic image sending timer if one is active.
   */
  stopPeriodicImageSending() {
    if (this.imageSendIntervalId) {
      clearInterval(this.imageSendIntervalId);
      this.imageSendIntervalId = null;
    }
  }

  /**
   * Stops periodic image sending by clearing the interval timer.
   */

  /**
   * Sends the current captured image data to the Gemini session.
   */
  /**
   * Sends the currently captured image data as a GenAIBlob via the onImageReady callback
   * if recording, session and image data are available.
   */
  private sendPeriodicImageData() {
    if (
      this.isRecording &&
      this.isSetupComplete &&
      this.currentImageBase64 &&
      this.currentImageMimeType
    ) {
      console.log('[ImageCaptureService] Sending captured image to live interface.');
      this.onImageReady?.({
        base64: this.currentImageBase64,
        mimeType: this.currentImageMimeType,
      });
    } else {
      console.warn('[ImageCaptureService] Skipping image send because required state is missing.');
    }
  }

  public getCurrentImageDataUrl(): string | null {
    return this.imageDataUrl;
  }
}
