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
import { DateRange, HotelDetails, SearchProps } from "./types";

@Injectable()
export class ForaService implements PlatformServiceInterface {
  private readonly platform: string = "fora";

  constructor(
    private eventsGateway: EventsGateway,
    private configService: ConfigService,
    private sessionsService: SessionsService,
    private browserService: BrowserService,
    private readonly openaiService: OpenAiService,
    private readonly searchService: SearchService
  ) {}

  async search(sessionId: string, data: SearchProps): Promise<void> {
    const { adults, hotel, dateRanges } = data;
    const dateRange = dateRanges[0];

    const context = this.browserService.getContext(sessionId);
    const page = await context.newPage();

    try {
      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        `Navigating to ${this.platform}.`,
        this.platform
      );

      const searchUrl = this.buildSearchUrl(
        hotel.displayName,
        adults,
        dateRange
      );
      await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);

      if (page.url().includes("login")) {
        await this.handleLogin(page, sessionId);
        await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
      }

      const noResultsMessage = await this.checkForNoResultsMessage(page);
      if (noResultsMessage) {
        await this.searchService.triggerNoResultsNotification(
          page,
          sessionId,
          this.platform
        );
        await this.browserService.closePageInContext(sessionId, page);
        return;
      }

      await this.handleSearchResults(page, sessionId, hotel);
    } catch (e) {
      console.error(e);
      await this.searchService.triggerErrorNotification(
        page,
        sessionId,
        "Error during search.",
        this.platform
      );
    } finally {
      await this.browserService.closePageInContext(sessionId, page);
    }
  }

  private buildSearchUrl(
    hotelName: string,
    adults: number,
    dateRange: DateRange
  ): string {
    const baseURL = "https://advisor.fora.travel/partners/hotels";
    return `${baseURL}?view_mode=list&supplierType=hotels&currency=USD&q=${encodeURIComponent(
      hotelName
    )}&travelers=${adults}&dates=${dateRange.from}-${dateRange.to}&rooms=1`;
  }

  private async handleLogin(page: Page, sessionId: string): Promise<void> {
    await this.searchService.triggerProgressNotification(
      page,
      sessionId,
      "Login required.",
      this.platform
    );

    await page
      .getByRole("button", { name: "Sign in with your Fora email" })
      .click();

    const existingLogin = await this.handleExistingLogin(page, sessionId);
    if (!existingLogin) {
      await this.performNewLogin(page, sessionId);
    }
    await page.waitForSelector('button:has-text("Continue")');
    await page.getByRole("button", { name: "Continue" }).click();
    await this.sessionsService.saveCookies(this.platform, page.context());
  }

  private async handleExistingLogin(
    page: Page,
    sessionId: string
  ): Promise<boolean> {
    try {
      await page.waitForSelector(
        'h1#headingText:has-text("Choose an account")',
        { timeout: 5000 }
      );
      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "Existing login detected.",
        this.platform
      );
      await page.waitForTimeout(2000);
      await page
        .locator('div[data-identifier="ethan.bernstein@fora.travel"]')
        .click();
      await page.waitForTimeout(2000);
      return true;
    } catch {
      return false;
    }
  }

  private async performNewLogin(page: Page, sessionId: string): Promise<void> {
    await page
      .getByLabel("Enter your email")
      .fill(this.configService.get("FORA_USERNAME"));
    await page.getByRole("button", { name: "Next" }).click();
    await page
      .getByLabel("Enter your password")
      .fill(this.configService.get("FORA_PASSWORD"));
    await page.getByRole("button", { name: "Next" }).click();

    await this.handle2FA(page, sessionId);
  }

  private async handle2FA(page: Page, sessionId: string): Promise<void> {
    try {
      await page.waitForSelector(
        'h1#headingText:has-text("Verify it\'s you")',
        { timeout: 10000 }
      );
      await page.click(
        'div[role="link"][data-challengetype="9"][data-sendmethod="SMS"]'
      );

      await this.searchService.triggerNotification(
        page,
        sessionId,
        "requestMfaCode",
        {
          platform: this.platform,
          step: "MFA code required.",
          url: page.url(),
        }
      );

      const mfaCode = await this.eventsGateway.waitForMfaCode(sessionId);
      await page.locator("input[type='tel']").fill(mfaCode);
      await page.getByRole("button", { name: "Next" }).click();

      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "2FA code submitted.",
        this.platform
      );
    } catch {
      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "No 2FA required. Continuing.",
        this.platform
      );
    }
  }

  private async handleSearchResults(
    page: Page,
    sessionId: string,
    hotel: HotelDetails
  ): Promise<void> {
    await this.searchService.triggerProgressNotification(
      page,
      sessionId,
      "Search results loaded.",
      this.platform
    );

    await page.waitForTimeout(4000);
    const results = await this.extractSearchResults(page);

    const match = await this.searchService.findMatchWithLLM(
      results,
      hotel.displayName,
      hotel.formattedAddress
    );

    if (!match) {
      await this.searchService.triggerNoResultsNotification(
        page,
        sessionId,
        this.platform
      );
      return;
    }

    await this.searchService.triggerProgressNotification(
      page,
      sessionId,
      "Match found. Opening booking page.",
      this.platform
    );

    await page.goto(match.link, { waitUntil: "domcontentloaded" });
    await this.searchService.triggerNotification(page, sessionId, "results", {
      platform: this.platform,
      step: "Results found.",
      match: match,
      url: page.url(),
    });
  }

  private async extractSearchResults(page: Page) {
    return page.$$eval('ul a[href^="/partners/hotels/"]', (cards) =>
      (cards as HTMLAnchorElement[]).map((card) => {
        const container = card.querySelector(
          "div.flex.flex-col"
        ) as HTMLElement;
        if (!container) {
          return { link: card.href || "", name: "", price: "", address: "" };
        }
        return {
          link: card.href || "",
          name:
            container
              ?.querySelector(".text-main.text-2xl")
              ?.textContent?.trim() || "",
          price:
            container
              ?.querySelector(".text-mediumFS16.font-medium")
              ?.textContent?.trim() || "Unavailable",
          address:
            container
              ?.querySelector(".text-small.text-secondaryDark span")
              ?.textContent?.trim() || "",
        };
      })
    );
  }

  private async checkForNoResultsMessage(page: Page): Promise<boolean> {
    return page.locator("div[data-testid='banner-warningclear']").isVisible();
  }
}
