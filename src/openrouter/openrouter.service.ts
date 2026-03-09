import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenRouter } from '@openrouter/sdk';

@Injectable()
export class OpenrouterService {
  private readonly openRouter: OpenRouter;
  private readonly defaultModel = 'stepfun/step-3.5-flash:free';
  private readonly defaultHeaders: Record<string, string>;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');

    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not set');
    }

    this.openRouter = new OpenRouter({
      apiKey,
    });

    this.defaultHeaders = {
      'HTTP-Referer': this.configService.get<string>(
        'APP_URL',
        'http://localhost:5000',
      ),
      'X-OpenRouter-Title': this.configService.get<string>(
        'APP_NAME',
        'FounderSignal',
      ),
    };
  }

  /**
   * Send a chat completion request to OpenRouter
   * @param messages - Array of chat messages
   * @param model - Optional model override (default: stepfun/step-3.5-flash:free)
   * @param stream - Whether to stream the response (default: false)
   */
  async sendChatCompletion(
    messages: Array<{ role: string; content: string }>,
    model?: string,
    stream = false,
  ) {
    const completion = await this.openRouter.chat.send(
      {
        messages,
        ...(model && { model: model }),
        ...(!model && { model: this.defaultModel }),
        ...(stream && { stream }),
      } as any,
      {
        fetchOptions: {
          headers: this.defaultHeaders,
        },
      },
    );

    return completion;
  }

  /**
   * Send a simple text prompt to the AI
   * @param prompt - The text prompt
   * @param model - Optional model override
   */
  async sendPrompt(prompt: string, model?: string) {
    const completion = await this.sendChatCompletion(
      [
        {
          role: 'user',
          content: prompt,
        },
      ],
      model,
    );

    return completion.choices[0]?.message?.content || '';
  }

  /**
   * Get the OpenRouter client instance for advanced usage
   */
  getClient(): OpenRouter {
    return this.openRouter;
  }
}
