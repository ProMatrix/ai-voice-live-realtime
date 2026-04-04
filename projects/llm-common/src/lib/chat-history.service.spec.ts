import { afterEach, describe, expect, it } from 'vitest';

import { ChatHistoryService } from './chat-history.service';
import { defaultProfile } from './interfaces';

describe('ChatHistoryService', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('clears persisted developer-researcher chat history when reset', () => {
    const profile = {
      ...defaultProfile,
      profile_title: 'AI Developer Researcher',
      profile_id: 'developer-researcher-session',
    };
    const historyKey = `${profile.profile_title} - chatMessages`;
    const chatHistoryMessagesDiv = document.createElement('div');

    localStorage.setItem(
      historyKey,
      JSON.stringify([
        {
          text: 'Previous saved researcher chat',
          sender: 'assistant',
          timestamp: Date.now(),
        },
      ]),
    );

    const service = new ChatHistoryService();
    service.initialize(profile, chatHistoryMessagesDiv);

    expect(chatHistoryMessagesDiv.children.length).toBe(1);
    expect(service.getChatHistory().length).toBe(1);

    service.resetChatHistory();

    expect(chatHistoryMessagesDiv.children.length).toBe(0);
    expect(service.getChatHistory().length).toBe(0);
    expect(localStorage.getItem(historyKey)).toBeNull();

    service.loadChatHistory();

    expect(service.getChatHistory()).toEqual([]);
  });
});