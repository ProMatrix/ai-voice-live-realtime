import { Injectable, computed, signal } from '@angular/core';

type SnapshotIndicatorPhase = 'hidden' | 'off' | 'flash' | 'cooldown' | 'fading';

const CAMERA_PREVIEW_BEAT_MS = 1000;
const CAMERA_FLASH_BEAT_MS = 300;
const CAMERA_COOLDOWN_BEAT_MS = 1500;
const CAMERA_FADE_OUT_MS = 0;

@Injectable({ providedIn: 'root' })
export class SnapshotIndicatorService {
  private timeoutIds: number[] = [];
  private readonly isEnabled = signal(false);
  private readonly phase = signal<SnapshotIndicatorPhase>('hidden');

  readonly isCameraIndicatorVisible = computed(() => this.phase() !== 'hidden');
  readonly isCameraOff = computed(() => {
    const currentPhase = this.phase();
    return currentPhase === 'off' || currentPhase === 'cooldown' || currentPhase === 'fading';
  });
  readonly isCameraFlashOn = computed(() => this.phase() === 'flash');
  readonly isCameraFading = computed(() => this.phase() === 'fading');

  enable() {
    this.isEnabled.set(true);
  }

  disable() {
    this.isEnabled.set(false);

    this.clearSequence();
    this.phase.set('hidden');
  }

  triggerSnapshotCue() {
    if (!this.isEnabled() || this.phase() !== 'hidden') {
      return;
    }

    this.clearSequence();
    this.phase.set('off');

    this.timeoutIds.push(
      window.setTimeout(() => {
        this.phase.set('flash');
      }, CAMERA_PREVIEW_BEAT_MS),
    );

    this.timeoutIds.push(
      window.setTimeout(() => {
        this.phase.set('cooldown');
      }, CAMERA_PREVIEW_BEAT_MS + CAMERA_FLASH_BEAT_MS),
    );

    this.timeoutIds.push(
      window.setTimeout(() => {
        this.phase.set('fading');
      }, CAMERA_PREVIEW_BEAT_MS + CAMERA_FLASH_BEAT_MS + CAMERA_COOLDOWN_BEAT_MS),
    );

    this.timeoutIds.push(
      window.setTimeout(() => {
        this.phase.set('hidden');
      }, CAMERA_PREVIEW_BEAT_MS + CAMERA_FLASH_BEAT_MS + CAMERA_COOLDOWN_BEAT_MS + CAMERA_FADE_OUT_MS),
    );
  }

  private clearSequence() {
    this.timeoutIds.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    this.timeoutIds = [];
  }
}
