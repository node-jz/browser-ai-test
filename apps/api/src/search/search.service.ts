/*
https://docs.nestjs.com/providers#services
*/

import { Injectable } from "@nestjs/common";
import { Page } from "playwright";
import { EventsGateway } from "src/events/events.gateway";
import { OpenAiService } from "src/llm/openai.service";

import { SearchResult } from "./platforms/types";

export class BrowserError extends Error {
  constructor(
    public message: string,
    public page: Page,
  ) {
    super(message);
    this.name = "BrowserError";
  }
}
export type UpdateNotificationData = {
  image?: Buffer;
  url?: string;
  step: string;
  platform: string;
  match?: SearchResult;
};
@Injectable()
export class SearchService {
  constructor(
    private readonly openaiService: OpenAiService,
    private readonly eventsGateway: EventsGateway,
  ) {}
  async findMatchWithLLM(
    results: SearchResult[],
    name: string,
    address: string,
  ): Promise<SearchResult | null> {
    let match = results.find((result) => result.name === name);
    if (!match) {
      const systemPrompt = `I need you to search a list of hotels and their ID number, and tell which ID number matches exactly or most closely to a hotel I am looking for [QUERY]. 
            [LIST]
            ${results.map((result, i) => `id: ${i}  name:${result.name}   address:${result.address}`).join("\n")}
            [OUTPUT] return the best option or NULL if you dont believe the hotel is in the list, using JSON that matches the type {id: int | null, name: string | null} where null would be if no close match exists.`;
      const userPrompt = `[QUERY] name: ${name}  address: ${address}`;

      const llmResult = await this.openaiService.completion({
        systemPrompt,
        userPrompt,
        model: "gpt-4o-2024-08-06",
        json: true,
        temperature: 0.3,
      });
      const choice = JSON.parse(llmResult.content) as {
        id: number | null;
        name: string | null;
      };
      match = choice.id !== null ? results[choice.id] : null;
    }
    return match;
  }

  async safeNavigation(
    page: Page,
    navigateCallback: () => Promise<void>,
    timeout: number = 30000,
  ): Promise<boolean> {
    try {
      await Promise.all([
        page.waitForNavigation({ timeout }),
        navigateCallback(),
      ]);
      return true;
    } catch (e) {
      throw new BrowserError(`Navigation failed: ${e.message}`, page);
    }
  }

  async triggerProgressNotification(
    page: Page,
    sessionId: string,
    step: string,
    platform: string,
  ) {
    await this.triggerNotification(page, sessionId, "progress", {
      step,
      platform,
      url: page.url(),
    });
  }

  async triggerErrorNotification(
    page: Page,
    sessionId: string,
    step: string,
    platform: string,
  ) {
    await this.triggerNotification(
      page,
      sessionId,
      "error",
      {
        step,
        platform,
      },
      true,
    );
  }

  async triggerNoResultsNotification(
    page: Page,
    sessionId: string,
    platform: string,
  ) {
    await this.triggerNotification(page, sessionId, "no-results", {
      step: "No results found.",
      platform,
    });
  }
  async triggerNotification(
    page: Page,
    sessionId: string,
    event: "progress" | "error" | "requestMfaCode" | "results" | "no-results",
    data: UpdateNotificationData,
    takeScreenshot: boolean = true,
  ) {
    let buffer: Buffer | null = null;
    if (takeScreenshot) {
      buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
    }
    await this.eventsGateway.notifyEvent(event, sessionId, {
      ...data,
      image: buffer,
      url: page.url(),
    });
  }
}
