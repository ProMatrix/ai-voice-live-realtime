import { Component, ElementRef, OnInit, ViewChild, Inject } from '@angular/core';
import { LIVE_ASSISTANT_SERVICE_TOKEN, ILiveAssistantService, IChatMessage } from 'llm-common';

@Component({
  selector: 'lib-chat-window',
  templateUrl: './chat-window.component.html',
  styleUrls: ['./chat-window.component.scss'],
  standalone: true
})
export class ChatWindowComponent implements OnInit {
  @ViewChild('chatHistoryContainer', { static: true }) chatHistoryContainer!: ElementRef<HTMLDivElement>;

  constructor(
    @Inject(LIVE_ASSISTANT_SERVICE_TOKEN) private liveAssistant: ILiveAssistantService
  ) {}

  ngOnInit() {
    this.liveAssistant.onMessageReceived((msg: IChatMessage, isStreaming?: boolean) => {
      this.renderMessage(msg, isStreaming);
    });
  }

  onSendMessage(eventOrText: any) {
    let text = typeof eventOrText === 'string' ? eventOrText : eventOrText.target.value;
    if (!text || text.trim() === '') return;
    
    this.liveAssistant.sendMessage(text);
    if (typeof eventOrText !== 'string') {
      eventOrText.target.value = '';
    }
  }

  private renderMessage(msg: IChatMessage, isStreaming?: boolean) {
    // Basic rendering logic (will be expanded to match the robust logic in ChatHistoryService)
    const div = document.createElement('div');
    div.className = `message-bubble ${msg.sender === 'user' ? 'message-user' : 'message-ai'}`;
    div.innerHTML = msg.text.replace(/\n/g, '<br>');
    this.chatHistoryContainer.nativeElement.appendChild(div);
    this.chatHistoryContainer.nativeElement.scrollTop = this.chatHistoryContainer.nativeElement.scrollHeight;
  }
}
