import { Component, ElementRef, OnInit, ViewChild, Inject, OnDestroy } from '@angular/core';
import { LIVE_ASSISTANT_SERVICE_TOKEN, ILiveAssistantService } from 'llm-common';

@Component({
  selector: 'lib-audio-meter',
  templateUrl: './audio-meter.component.html',
  styleUrls: ['./audio-meter.component.scss'],
  standalone: true,
})
export class AudioMeterComponent implements OnInit, OnDestroy {
  @ViewChild('meterCanvas', { static: true }) meterCanvas!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D | null;
  private currentLevel: number = 0;
  private animationFrameId?: number;

  constructor(@Inject(LIVE_ASSISTANT_SERVICE_TOKEN) private liveAssistant: ILiveAssistantService) {}

  ngOnInit() {
    this.ctx = this.meterCanvas.nativeElement.getContext('2d');

    // Subscribe to the unified audio level event from the Common Contract
    this.liveAssistant.onAudioLevelChange((level: number) => {
      // Smooth out the level changes
      this.currentLevel = level;
    });

    this.drawLoop();
  }

  private drawLoop() {
    if (!this.ctx) return;
    const canvas = this.meterCanvas.nativeElement;
    const width = canvas.width;
    const height = canvas.height;

    // Clear previous frame
    this.ctx.clearRect(0, 0, width, height);

    // Baseline size (idle)
    const baseRadius = width * 0.3;
    // Volume dictates how much it expands beyond the baseline
    const targetRadius = baseRadius + this.currentLevel * width * 0.2;

    // Draw the pulsating circle to mimic azure-voice-live
    this.ctx.beginPath();
    this.ctx.arc(width / 2, height / 2, targetRadius, 0, 2 * Math.PI);
    this.ctx.fillStyle = 'rgba(0, 120, 212, 0.6)'; // Matches the Microsoft Blue default
    this.ctx.fill();

    this.animationFrameId = requestAnimationFrame(() => this.drawLoop());
  }

  ngOnDestroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }
}
