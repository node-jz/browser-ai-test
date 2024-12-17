/*
https://docs.nestjs.com/providers#services
*/

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Page } from "playwright";
import { BrowserService } from "src/browser/browser/browser.service";
import { EventsGateway } from "src/events/events.gateway";
import { OpenAiService } from "src/llm/openai.service";
import { SessionsService } from "src/sessions/sessions/sessions.service";

import { SearchService } from "../search.service";
import { PlatformServiceInterface } from "./platform.interface";
import { SearchProps } from "./types";

@Injectable()
export class ForaService implements PlatformServiceInterface {
  constructor(
    private eventsGateway: EventsGateway,
    private configService: ConfigService,
    private sessionsService: SessionsService,
    private browserService: BrowserService,
    private readonly openaiService: OpenAiService,
    private readonly searchService: SearchService,
  ) {}

  private readonly platform: string = "fora";
  async search(sessionId: string, data: SearchProps): Promise<void> {
    const { adults, hotel, dateRanges } = data;
    const dateRange = dateRanges[0];
    // todo make use of multiple date ranges

    const context = this.browserService.getContext(sessionId);
    const page = await context.newPage();
    try {
      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        `Navigating to ${this.platform}.`,
        this.platform,
      );

      const baseURL = "https://advisor.fora.travel/partners/hotels";
      const searchUrl = `${baseURL}?view_mode=list&supplierType=hotels&currency=USD&q=${encodeURIComponent(
        hotel.displayName,
      )}&travelers=${adults}&dates=${dateRange.from}-${dateRange.to}&rooms=1`;

      console.log(searchUrl);

      await page.goto(searchUrl, {
        waitUntil: "domcontentloaded",
      });

      await page.waitForTimeout(3000);

      if (page.url().includes("login")) {
        await this.searchService.triggerProgressNotification(
          page,
          sessionId,
          "Login required.",
          this.platform,
        );
        await page.waitForTimeout(2000);

        await page
          .getByRole("button", { name: "Sign in with your Fora email" })
          .click();
        await page.getByLabel("Enter your email").click();
        await page
          .getByLabel("Enter your email")
          .fill(this.configService.get("FORA_USERNAME"));
        await page.getByRole("button", { name: "Next" }).click();
        await page.getByLabel("Enter your password").click();
        await page
          .getByLabel("Enter your password")
          .fill(this.configService.get("FORA_PASSWORD"));
        await page.getByRole("button", { name: "Next" }).click();
        await page.getByRole("button", { name: "Continue" }).click();

        await this.sessionsService.saveCookies(this.platform, context);
      }

      await page.waitForTimeout(2000);
      await page.goto(searchUrl, {
        waitUntil: "domcontentloaded",
      });

      const noResultsMessage = await this.checkForNoResultsMessage(page);

      if (noResultsMessage) {
        await this.searchService.triggerNoResultsNotification(
          page,
          sessionId,
          this.platform,
        );
        await this.browserService.closePageInContext(sessionId, page);
        return;
      }

      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "Search results loaded.",
        this.platform,
      );

      await page.waitForTimeout(4000);
      const results = await page.$$eval(
        'ul a[href^="/partners/hotels/"]',
        (cards) =>
          (cards as HTMLAnchorElement[]).map((card) => {
            const container = card.querySelector(
              "div.flex.flex-col",
            ) as HTMLElement;
            if (!container) {
              return {
                link: card.href || "",
                name: "",
                price: "",
                address: "",
              };
            }
            return {
              link: card.href || "",
              name:
                (
                  container?.querySelector(".text-main.text-2xl") as HTMLElement
                )?.innerText.trim() || "",
              price:
                (
                  container?.querySelector(
                    ".text-mediumFS16.font-medium",
                  ) as HTMLElement
                )?.innerText.trim() || "Unavailable",
              address:
                (
                  container?.querySelector(
                    ".text-small.text-secondaryDark span",
                  ) as HTMLElement
                )?.innerText.trim() || "",
            };
          }),
      );

      await page.waitForTimeout(2000);

      const match = await this.searchService.findMatchWithLLM(
        results,
        hotel.displayName,
        hotel.formattedAddress,
      );
      if (!match) {
        await this.searchService.triggerNoResultsNotification(
          page,
          sessionId,
          this.platform,
        );
        await this.browserService.closePageInContext(sessionId, page);
        return;
      }

      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "Match found. Opening booking page.",
        this.platform,
      );
      await page.goto(match.link, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      await this.searchService.triggerNotification(page, sessionId, "results", {
        platform: this.platform,
        step: "Results found.",
        match: match,
        url: page.url(),
      });

      await this.browserService.closePageInContext(sessionId, page);
    } catch (e) {
      console.error(e);
      await this.searchService.triggerErrorNotification(
        page,
        sessionId,
        "Error during search.",
        this.platform,
      );
      await this.browserService.closePageInContext(sessionId, page);
    }
    await this.browserService.closePageInContext(sessionId, page);
  }

  async checkForNoResultsMessage(page: Page) {
    const noResultsMessage = await page
      .locator("div[data-testid='banner-warningclear']")
      .isVisible();
    return noResultsMessage;
  }
}
