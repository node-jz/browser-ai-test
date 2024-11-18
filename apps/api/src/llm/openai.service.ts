import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";

export type OpenAiCompletionConfig = {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  json?: boolean;
  temperature?: number;
};
export type OpenAiStreamCompletionConfig = Omit<
  OpenAiCompletionConfig,
  "json"
> & { streamConfig: { channel: string; event: string } };

@Injectable()
export class OpenAiService {
  openai = new OpenAI();
  private readonly logger = new Logger(OpenAiService.name);

  constructor() {}

  async completion({
    systemPrompt,
    userPrompt,
    model = null,
    json = false,
    temperature = Number(process.env.LLM_DEFAULT_TEMPERATURE ?? 0.3).valueOf(),
  }: OpenAiCompletionConfig): Promise<OpenAI.Chat.Completions.ChatCompletionMessage> {
    model = model ?? process.env.DEFAULT_GPT_MODEL;

    const response = await this.openai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: json ? "json_object" : "text" },
      temperature,
      model,
    });

    return response.choices[0].message;
  }
}
