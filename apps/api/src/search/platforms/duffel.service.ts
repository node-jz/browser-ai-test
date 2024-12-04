/*
https://docs.nestjs.com/providers#services
*/

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { chromium } from "playwright";
import { EventsGateway } from "src/events/events.gateway";
import { OpenAiService } from "src/llm/openai.service";
import { SessionsService } from "src/sessions/sessions/sessions.service";

import { SearchService } from "../search.service";
import { PlatformServiceInterface } from "./platform.interface";
import { SearchProps, SearchResult } from "./types";

@Injectable()
export class DuffelService implements PlatformServiceInterface {
  constructor(
    private eventsGateway: EventsGateway,
    private configService: ConfigService,
    private readonly openaiService: OpenAiService,
    private readonly searchService: SearchService,
    private readonly sessionsService: SessionsService,
  ) {}

  private readonly platform: string = "duffel";
  async search(sessionId: string, data: SearchProps): Promise<void> {
    const { adults, children, hotel, dateRanges } = data;

    const dateRange = dateRanges[0];
    // todo make use of multiple date ranges

    const searchUrl = `https://app.duffel.com/997a4f4c1d8725505ef8bf3/test/stays/results?checkInDate=${dateRange.from}&checkOutDate=${dateRange.to}&rooms=1&lat=${hotel.location.latitude}&long=${hotel.location.longitude}&loc=${encodeURIComponent(hotel.displayName)}&adults=${adults}&children=${children.length}&timestamp=${Date.now()}`;

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(searchUrl);
      let buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
      await this.eventsGateway.notifyEvent("progress", sessionId, {
        platform: this.platform,
        step: "Initial page loaded.",
        image: buffer,
        url: page.url(),
      });

      await page.waitForTimeout(4000);

      buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
      await this.eventsGateway.notifyEvent("progress", sessionId, {
        platform: this.platform,
        step: "page loaded.",
        image: buffer,
        url: page.url(),
      });
      if (await page.waitForSelector('form[method="post"]')) {
        buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
        await this.eventsGateway.notifyEvent("progress", sessionId, {
          platform: this.platform,
          image: buffer,
          step: "Filling out login form.",
          url: page.url(),
        });

        await page.getByPlaceholder("Enter your email address…").click();
        await page
          .getByPlaceholder("Enter your email address…")
          .fill(this.configService.get<string>("DUFFEL_USERNAME"));
        await page.getByPlaceholder("Enter your password…").click();
        await page
          .getByPlaceholder("Enter your password…")
          .fill(this.configService.get<string>("DUFFEL_PASSWORD"));
        await page.getByTestId("submit").click();

        buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
        await this.eventsGateway.notifyEvent("progress", sessionId, {
          platform: this.platform,
          step: "Login form submitted.",
          image: buffer,
          url: page.url(),
        });

        await Promise.all([
          page.waitForNavigation(),
          page.click('button[type="submit"]'),
        ]);

        await this.searchService.safeNavigation(page, async () => {
          await page.goto(searchUrl);
          return;
        });
      }

      buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
      await this.eventsGateway.notifyEvent("progress", sessionId, {
        platform: this.platform,
        step: "Waiting for search results to load.",
        image: buffer,
        url: page.url(),
      });

      try {
        await page.waitForSelector("#results", {
          timeout: 5000,
        });
      } catch (e) {
        console.log("No results.", e.message ?? "");
        buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
        await this.eventsGateway.notifyEvent("no-results", sessionId, {
          platform: this.platform,
          image: buffer,
          url: page.url(),
        });
        await this.sessionsService.deleteSession(sessionId);
        return;
      }

      buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
      await this.eventsGateway.notifyEvent("progress", sessionId, {
        platform: this.platform,
        step: "search results loaded.",
        image: buffer,
        url: page.url(),
      });
      // Extract results
      const results: SearchResult[] = await page.$$eval(
        "#results a.StaysResultCard_container__QEx7E",
        (links) =>
          (links as HTMLAnchorElement[]).map((link) => ({
            link: link.href,
            name:
              (link.querySelector("p.Text_text__vsLHb") as HTMLParagraphElement)
                ?.innerText || "",
            price: "00.00",
            address:
              (
                link.querySelector(
                  "p.Text_text--grey-600__0O8J3",
                ) as HTMLParagraphElement
              )?.innerText || "",
          })),
      );

      const match = await this.searchService.findMatchWithLLM(
        results,
        hotel.displayName,
        hotel.formattedAddress,
      );
      if (!match) {
        buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
        await this.eventsGateway.notifyEvent("no-results", sessionId, {
          platform: this.platform,
          image: buffer,
          url: page.url(),
        });
        await this.sessionsService.deleteSession(sessionId);
        return;
      }

      await Promise.all([page.waitForNavigation(), page.goto(match.link)]);
      buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
      await this.eventsGateway.notifyEvent("results", sessionId, {
        platform: this.platform,
        match: match,
        image: buffer,
        url: page.url(),
      });

      await this.sessionsService.deleteSession(sessionId);
    } catch (error) {
      const buffer = await page.screenshot({
        fullPage: true,
        type: "jpeg",
      });
      this.eventsGateway.notifyEvent("error", sessionId, {
        platform: this.platform,
        image: buffer,
        url: page.url(),
        message: error.message ?? "Error while searching",
      });
      console.error("Error during browser operation:", error.message);
      this.sessionsService.deleteSession(sessionId);
      console.error(error);
    }
  }
}
