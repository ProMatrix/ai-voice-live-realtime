import { Injectable } from '@angular/core';
import { defaultProfile, IProfile, IVisionAssistantConfig } from './interfaces';
import OpenAI from 'openai';

@Injectable({ providedIn: 'root' })
export class VisionApiService {
  private profile = defaultProfile;
  private config: IVisionAssistantConfig | null = null;

  // Keep the OpenAI client and the last response id so follow-up
  // questions can refer to the same image without resending it.
  private openai: OpenAI | null = null;
  private previousResponseId: string | null = null;
  private lastImageDataUrl: string | null = null;
  private currentImageDataUrl: string | null = null;

  constructor() {}

  public initialize(profile: IProfile, config: IVisionAssistantConfig): void {
    this.profile = profile;
    this.config = config;
    this.startup();
  }

  private startup(): void {
    if (!this.config) {
      console.error('Vision API configuration is missing.');
      return;
    }
    try {
      this.openai = new OpenAI({
        baseURL: this.config.visionApiEndpoint,
        apiKey: this.config.visionApiKey,
        // Fine for local experiments, but do not expose API keys in production.
        dangerouslyAllowBrowser: true,
      });
    } catch (error) {
      alert('Failed to initialize Vision API client. Please check the console for details.');
      console.error('Error initializing Vision API client:', error);
    }

    // Uncomment to run the demo on service initialization. Make sure to provide a valid API key and endpoint in the config.
    // this.runDemo().catch((error) => {
    //   console.error('Error during Vision API demo run:', error);
    // });
  }

  /**
   * Starts a new image conversation.
   * Send the image once, ask the first question, and store the response id.
   */
  public async askFirstQuestionAboutImage(
    imageUrl: string,
    question: string,
    instructions = 'Answer in plain English.',
  ): Promise<string> {
    const client = this.getClient();
    const modelImageUrl = await this.toModelImageUrl(imageUrl);

    const response = await client.responses.create({
      model: this.config!.visionApiDeployment,
      instructions,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: question,
            },
            {
              type: 'input_image',
              image_url: modelImageUrl,
              detail: 'auto',
            },
          ],
        },
      ],
    });

    this.lastImageDataUrl = modelImageUrl;
    this.previousResponseId = response.id;
    return response.output_text;
  }

  public setCurrentImageDataUrl(imageUrl: string | null): void {
    this.currentImageDataUrl = imageUrl;
  }

  public hasCurrentImage(): boolean {
    return Boolean(this.currentImageDataUrl);
  }

  public async askQuestionAboutCurrentImage(
    question: string,
    imageUrl: string | null = this.currentImageDataUrl,
    instructions = 'Answer in plain English.',
  ): Promise<string> {
    if (!imageUrl) {
      throw new Error('No image is available yet. Share a screen or capture an image first.');
    }

    const modelImageUrl = await this.toModelImageUrl(imageUrl);

    if (!this.previousResponseId || this.lastImageDataUrl !== modelImageUrl) {
      return this.askFirstQuestionAboutImage(modelImageUrl, question, instructions);
    }

    return this.askFollowUpQuestion(question, instructions);
  }

  /**
   * Ask a follow-up question about the same image without resending it.
   */
  public async askFollowUpQuestion(
    question: string,
    instructions = 'Answer in plain English.',
  ): Promise<string> {
    const client = this.getClient();

    if (!this.previousResponseId) {
      throw new Error(
        'No previous image conversation exists. Call askFirstQuestionAboutImage() first.',
      );
    }

    const response = await client.responses.create({
      model: this.config!.visionApiDeployment,
      instructions,
      previous_response_id: this.previousResponseId,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: question,
            },
          ],
        },
      ],
    });

    this.previousResponseId = response.id;
    return response.output_text;
  }

  /**
   * Optional helper if you want to force a brand-new image conversation.
   */
  public resetConversation(): void {
    this.previousResponseId = null;
    this.lastImageDataUrl = null;
    this.currentImageDataUrl = null;
  }

  private getClient(): OpenAI {
    if (!this.config) {
      throw new Error('Vision API configuration is missing.');
    }

    if (!this.openai) {
      this.startup();
    }

    if (!this.openai) {
      throw new Error('OpenAI client could not be created.');
    }

    return this.openai;
  }

  private async toModelImageUrl(imageUrl: string): Promise<string> {
    if (imageUrl.startsWith('data:')) {
      return imageUrl;
    }

    try {
      const response = await fetch(imageUrl);

      if (!response.ok) {
        throw new Error(`Image download failed with status ${response.status}.`);
      }

      const blob = await response.blob();
      return await this.blobToDataUrl(blob);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error.';
      throw new Error(
        `The model endpoint could not access the remote image URL, and the browser fallback download also failed. ${message}`,
      );
    }
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onloadend = () => {
        const result = reader.result;

        if (typeof result === 'string') {
          resolve(result);
          return;
        }

        reject(new Error('Failed to convert image blob to a data URL.'));
      };

      reader.onerror = () => {
        reject(new Error('Failed to read image blob.'));
      };

      reader.readAsDataURL(blob);
    });
  }
}
