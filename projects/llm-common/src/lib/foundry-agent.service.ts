import { Injectable } from '@angular/core';
import { defaultProfile, IFoundryAgentConfig, IProfile } from './interfaces';

@Injectable({ providedIn: 'root' })
export class FoundryAgentService {
  private profile = defaultProfile;
  private config: IFoundryAgentConfig | null = null;
  private conversationId: string | null = null;
  private currentAgentKey = '';

  public initialize(profile: IProfile, config: IFoundryAgentConfig): void {
    const nextAgentKey = this.getAgentKey(profile);

    if (this.currentAgentKey !== nextAgentKey) {
      this.resetConversation();
      this.currentAgentKey = nextAgentKey;
    }

    this.profile = profile;
    this.config = config;
  }

  public resetConversation(): void {
    this.conversationId = null;
  }

  public async askQuestion(question: string): Promise<string> {
    const trimmedQuestion = question.trim();

    if (!trimmedQuestion) {
      throw new Error('A non-empty Foundry agent question is required.');
    }

    this.ensureConfiguration();
    this.conversationId = null;

    try {
      const httpResponse = await fetch(this.config!.proxyEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: trimmedQuestion,
          conversationId: this.conversationId,
          projectEndpoint: (this.profile as any)?.project_endpoint.trim(),
          agentName: (this.profile as any)?.agent_name.trim(),
          agentVersion: (this.profile as any)?.agent_version.trim(),
        }),
      });

      const responseBody = (await httpResponse.json().catch(() => ({}))) as {
        answer?: string;
        conversationId?: string;
        error?: string;
      };

      if (!httpResponse.ok) {
        throw new Error(responseBody.error || 'The Azure AI Foundry proxy request failed.');
      }

      this.conversationId = responseBody.conversationId?.trim() || this.conversationId;
      return (
        responseBody.answer?.trim() || 'I could not get an answer from the Azure AI Foundry agent.'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes('401') || message.includes('403') || message.includes('denied')) {
        throw new Error(
          'Azure AI Foundry access was denied by the backend proxy. Verify the backend Azure credential configuration.',
        );
      }

      if (message.includes('404')) {
        throw new Error(
          'The configured Azure AI Foundry project endpoint, proxy endpoint, or agent reference could not be found.',
        );
      }

      if (message.includes('429') || message.includes('Too Many Requests')) {
        throw new Error(
          'Azure AI Foundry is rate limiting this conversation right now. Wait a moment and try again.',
        );
      }

      throw error;
    }
  }

  private ensureConfiguration(): void {
    if (!this.config?.proxyEndpoint?.trim()) {
      throw new Error(
        'A Foundry proxy endpoint is required for backend-based Azure AI Foundry profiles.',
      );
    }

    if (!(this.profile as any)?.project_endpoint?.trim()) {
      throw new Error('The current profile is missing project_endpoint.');
    }

    if (!(this.profile as any)?.agent_name?.trim()) {
      throw new Error('The current profile is missing agent_name.');
    }

    if (!(this.profile as any)?.agent_version?.trim()) {
      throw new Error('The current profile is missing agent_version.');
    }
  }

  private getAgentKey(profile: IProfile): string {
    return [
      profile.project_endpoint?.trim(),
      profile.agent_name?.trim(),
      profile.agent_version?.trim(),
    ].join('|');
  }
}
