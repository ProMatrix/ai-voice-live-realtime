import { Injectable } from '@angular/core';
import { defaultProfile, IChatMessage, IProfile } from './interfaces';

@Injectable({ providedIn: 'root' })
export class ChatHistoryService {
  private chatHistoryMessagesDiv: HTMLDivElement | null | undefined;
  private chatMessageHistory: IChatMessage[] = [];
  private profile: IProfile = defaultProfile;
  constructor() {}

  public initialize(profile: IProfile, chatHistoryMessagesDiv: HTMLDivElement) {
    this.profile = profile;
    this.chatHistoryMessagesDiv = chatHistoryMessagesDiv;
    this.loadChatHistory();
    this.chatMessageHistory.forEach((message) => {
      this.addToChatHistoryDiv(message.text, message.sender);
    });
  }

  public getChatHistoryCount() {
    return this.savedMessages.length;
  }

  private get savedMessages(): Array<IChatMessage> {
    const messageHistoryString = localStorage.getItem(
      `${this.profile.profile_title} - chatMessages`,
    );
    if (messageHistoryString) {
      return JSON.parse(messageHistoryString);
    } else {
      return new Array<IChatMessage>();
    }
  }

  private set savedMessages(chatMessageHistory: Array<IChatMessage> | null) {
    if (chatMessageHistory) {
      const messages = JSON.stringify(chatMessageHistory);
      localStorage.setItem(`${this.profile.profile_title} - chatMessages`, messages);
    } else {
      localStorage.removeItem(`${this.profile.profile_title} - chatMessages`);
    }
  }

  public loadChatHistory() {
    this.chatMessageHistory = this.savedMessages;
  }

  public saveChatHistory() {
    this.savedMessages = this.chatMessageHistory;
  }

  public resetChatHistory() {
    this.chatMessageHistory.length = 0;
    this.emptyChatHistoryDiv();
  }

  public emptyChatHistoryDiv() {
    if (this.chatHistoryMessagesDiv) {
      this.chatHistoryMessagesDiv.innerHTML = '';
    }
  }

  public addToChatHistoryDiv(text: string, sender: string) {
    if (text.trim().length < 2) {
      return;
    }
    const messageBubble = document.createElement('div');
    messageBubble.classList.add('message-bubble');
    if (sender === 'user') {
      messageBubble.classList.add('message-user');
    } else if (sender === 'assistant' || sender === 'AI') {
      messageBubble.classList.add('message-ai');
    }
    messageBubble.innerHTML = text.replace(/\n/g, '<br>');
    if (this.chatHistoryMessagesDiv) {
      this.chatHistoryMessagesDiv.appendChild(messageBubble);
      this.chatHistoryMessagesDiv.scrollTop = this.chatHistoryMessagesDiv.scrollHeight;
    }
  }

  public getChatHistory(): IChatMessage[] {
    return this.chatMessageHistory;
  }

  public createRealtimeMessage(sender: 'user' | 'assistant' | 'AI'): HTMLDivElement | null {
    if (!this.chatHistoryMessagesDiv) {
      return null;
    }
    const messageBubble = document.createElement('div');
    messageBubble.classList.add('message-bubble');
    if (sender === 'user') {
      messageBubble.classList.add('message-user');
    } else if (sender === 'assistant' || sender === 'AI') {
      messageBubble.classList.add('message-ai');
    }
    messageBubble.textContent = '...';
    this.chatHistoryMessagesDiv.appendChild(messageBubble);
    this.chatHistoryMessagesDiv.scrollTop = this.chatHistoryMessagesDiv.scrollHeight;
    return messageBubble;
  }

  public updateChatHistoryDiv(messageDiv: HTMLDivElement | null, text: string) {
    if (messageDiv) {
      messageDiv.textContent = text;
      if (this.chatHistoryMessagesDiv) {
        this.chatHistoryMessagesDiv.scrollTop = this.chatHistoryMessagesDiv.scrollHeight;
      }
    }
  }

  public finalizeMessage(messageDiv: HTMLDivElement | null, text: string, sender: string) {
    if (messageDiv) {
      messageDiv.innerHTML = text.replace(/\n/g, '<br>');
    }
    if (text.trim().length > 0) {
      const newMessage: IChatMessage = {
        text,
        sender,
        timestamp: Date.now(),
      };
      this.chatMessageHistory.push(newMessage);
      this.saveChatHistory();
    }
    messageDiv = null;
  }
}
