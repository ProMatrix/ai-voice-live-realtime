import { formatElapsedTime } from './time-format.utils';

export class SessionTimer {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private elapsedSeconds = 0;

  constructor(private readonly onTick: (formattedTime: string, totalSeconds: number) => void) {}

  start() {
    this.pause();
    this.intervalId = setInterval(() => {
      this.elapsedSeconds++;
      this.onTick(formatElapsedTime(this.elapsedSeconds), this.elapsedSeconds);
    }, 1000);
  }

  pause() {
    if (!this.intervalId) {
      return;
    }

    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  reset() {
    this.elapsedSeconds = 0;
    this.onTick(formatElapsedTime(this.elapsedSeconds), this.elapsedSeconds);
  }

  resetAndStart() {
    this.reset();
    this.start();
  }

  dispose() {
    this.pause();
  }
}
