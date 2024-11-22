/*
https://docs.nestjs.com/providers#services
*/

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DateTime } from "luxon";
import { chromium, Page } from "playwright";
import { BrowserService } from "src/browser/browser/browser.service";
import { EventsGateway } from "src/events/events.gateway";
import { OpenAiService } from "src/llm/openai.service";
import { SessionsService } from "src/sessions/sessions/sessions.service";

import { SearchService } from "../search.service";
import { PlatformServiceInterface } from "./platform.interface";
import { DateRange, HotelDetails, SearchProps, SearchResult } from "./types";

@Injectable()
export class BedsOnlineService implements PlatformServiceInterface {
  constructor(
    private eventsGateway: EventsGateway,
    private configService: ConfigService,
    private sessionsService: SessionsService,
    private browserService: BrowserService,
    private readonly openaiService: OpenAiService,
    private readonly searchService: SearchService,
  ) {}

  private readonly platform: string = "bedsonline";
  async search(sessionId: string, data: SearchProps): Promise<void> {
    try {
      const { adults, children, hotel, dateRanges } = data;
      const dateRange = dateRanges[0];
      // todo make use of multiple date ranges

      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        extraHTTPHeaders: {
          "Accept-Language": "en-US", // Adding the required Accept-Language header
        },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      });
      const page = await context.newPage();
      await page.goto("https://app.bedsonline.com/auth/login");

      await page.waitForTimeout(2000);
      let buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
      await this.eventsGateway.notifyEvent("progress", sessionId, {
        platform: this.platform,
        step: "login page loaded.",
        image: buffer,
        url: page.url(),
      });
      await page.getByRole("link", { name: "Allow all" }).click();

      await page.waitForTimeout(2000);
      // Fill the Username field
      await page
        .locator('[data-qa="username"]')
        .pressSequentially(
          this.configService.get<string>("BEDSONLINE_USERNAME"),
          { delay: 100 },
        );

      await page.waitForTimeout(2000);
      // Fill the Password field
      await page
        .locator('[data-qa="password"]')
        .pressSequentially(
          this.configService.get<string>("BEDSONLINE_PASSWORD"),
          { delay: 100 },
        );

      await page.waitForTimeout(2000);
      buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
      await this.eventsGateway.notifyEvent("progress", sessionId, {
        platform: this.platform,
        step: "login form filled out.",
        image: buffer,
        url: page.url(),
      });

      await Promise.all([page.click('[data-qa="login-button"]')]);

      await page.waitForTimeout(2000);
      buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
      await this.eventsGateway.notifyEvent("progress", sessionId, {
        platform: this.platform,
        step: "Search form loaded.",
        image: buffer,
        url: page.url(),
      });

      await page.locator("#HOTEL_selector").click();
      const resultsFound = await this.searchForHotel(page, hotel, sessionId);
      await page.waitForTimeout(2000);
      if (!resultsFound) {
        buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
        await this.eventsGateway.notifyEvent("no-results", sessionId, {
          platform: this.platform,
          url: page.url(),
        });
      }

      buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
      await this.eventsGateway.notifyEvent("progress", sessionId, {
        platform: this.platform,
        step: "hotel name entered.",
        image: buffer,
        url: page.url(),
      });

      const hotelFoundAndSelected = await this.selectHotelFromList(page, hotel);
      if (!hotelFoundAndSelected) {
        buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
        await this.eventsGateway.notifyEvent("no-results", sessionId, {
          platform: this.platform,
          url: page.url(),
        });
      }

      buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
      await this.eventsGateway.notifyEvent("progress", sessionId, {
        platform: this.platform,
        step: "Selected hotel from list.",
        image: buffer,
        url: page.url(),
      });

      await Promise.all([
        page.waitForNavigation(),
        page.getByRole("button", { name: " Search" }).click(),
      ]);

      buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
      await this.eventsGateway.notifyEvent("progress", sessionId, {
        platform: this.platform,
        step: "Results loaded.",
        image: buffer,
        url: page.url(),
      });

      await this.handleResultsPage(
        page,
        hotel,
        { adults: adults, children: children },
        dateRange,
        sessionId,
      );
    } catch (e) {
      console.error(e);
      this.sessionsService.deleteSession(sessionId);
    }
    this.sessionsService.deleteSession(sessionId);
  }

  async searchForHotel(
    page: Page,
    hotel: HotelDetails,
    sessionId: string,
  ): Promise<boolean> {
    let searchText = hotel.displayName;
    while (true) {
      const words = searchText.split(" ");
      if (words.length <= 1) {
        return false;
      }

      // Remove the last word
      searchText = words.slice(0, -1).join(" ");

      // Retry search with the reduced term
      await this.performHotelNameSearch(page, searchText);
      const buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
      await this.eventsGateway.notifyEvent("progress", sessionId, {
        platform: this.platform,
        step: "Trying Search.",
        image: buffer,
        url: page.url(),
      });
      // Check if "no results" message is present
      const noResultsMessage = await this.checkForNoResultsMessage(page);

      if (!noResultsMessage) {
        return true;
      }
    }
  }

  async selectHotelFromList(page: Page, hotel: HotelDetails): Promise<boolean> {
    await page.waitForSelector(".fts-dropdown__fts__description__title");
    const hotelChoices = await page.$$eval(
      ".fts-dropdown__fts__description__title",
      (links) =>
        Array.from(links).map((element) =>
          element.textContent.trim().slice(0, -1),
        ),
    );
    let selectedHotelName = null;
    for (const choice of hotelChoices) {
      if (choice == hotel.displayName) {
        selectedHotelName = choice;
      }
    }
    if (!selectedHotelName) {
      // LLM choice
      const result = await this.useLLMToFindHotel(hotelChoices, hotel);
      if (!result) {
        return false;
      }
      selectedHotelName = result;
    }

    await page.getByText(selectedHotelName).first().click();
    return true;
  }

  async useLLMToFindHotel(
    hotelChoices: string[],
    hotel: HotelDetails,
  ): Promise<string | null> {
    const systemPrompt = `I need you to search a list of hotels, and return the listed name that matches exactly or most closely to a hotel I am looking for [QUERY]. 
      [LIST]
      ${hotelChoices.join("\n")}
      [OUTPUT] return the best option or NULL if you dont believe the hotel is in the list, using JSON that matches the type {name: string | null} where null would be if no close match exists.`;
    const userPrompt = `[QUERY] name: ${hotel.displayName} location: ${hotel.formattedAddress}`;

    const llmResult = await this.openaiService.completion({
      systemPrompt,
      userPrompt,
      model: "gpt-4o-2024-08-06",
      json: true,
    });
    return JSON.parse(llmResult.content).name;
  }

  async performHotelNameSearch(page: Page, text: string) {
    await page.locator("[data-qa=destinationsControl]").fill("");
    await page
      .locator("[data-qa=destinationsControl]")
      .pressSequentially(text, { delay: 100 });
    await page.waitForTimeout(1000);
  }

  async checkForNoResultsMessage(page: Page) {
    const noResultsMessage = await page
      .locator("text=Your search did not return any results")
      .isVisible();
    return noResultsMessage;
  }

  /** RESULTS PAGE  */
  async handleResultsPage(
    page: Page,
    hotel: HotelDetails,
    occupancy: { adults: number; children: number[] },
    dateRange: DateRange,
    sessionId: string,
  ) {
    let buffer: Buffer;
    buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
    await this.eventsGateway.notifyEvent("progress", sessionId, {
      platform: this.platform,
      step: "Results loaded.",
      image: buffer,
      url: page.url(),
    });
    await page.goto(this.updateUrl(page.url(), dateRange, occupancy));
    buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
    await this.eventsGateway.notifyEvent("progress", sessionId, {
      platform: this.platform,
      step: "Changing URL.",
      image: buffer,
      url: page.url(),
    });
    await page.waitForTimeout(10000);
    await page.waitForSelector("clientb2b-front-feature-results-list");
    buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
    await this.eventsGateway.notifyEvent("progress", sessionId, {
      platform: this.platform,
      step: "New results loaded.",
      image: buffer,
      url: page.url(),
    });
    const results: SearchResult[] = await page.$$eval(
      ".feature-card-layout__card__body", // Select the main container for each hotel card
      (cards) =>
        (cards as HTMLElement[]).map((card) => ({
          link:
            (
              card.querySelector(
                "a.card-content-header__name__link",
              ) as HTMLAnchorElement
            )?.href || "",
          name:
            (
              card.querySelector(
                ".card-content-header__name__title",
              ) as HTMLSpanElement
            )?.innerText.trim() || "",
          price:
            (
              card.querySelector(
                ".tooltip-markup-commission__price__container__integer",
              ) as HTMLElement
            )?.innerText || "00.00",
          address:
            (
              card.querySelector(
                ".card-content-header__location__address__title",
              ) as HTMLElement
            )?.innerText.trim() || "",
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
        url: page.url(),
      });
      await this.browserService.closeContext(sessionId);
      return;
    }

    buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
    await this.eventsGateway.notifyEvent("results", sessionId, {
      platform: this.platform,
      match: match,
      image: buffer,
      url: page.url(),
    });
  }

  updateUrl(
    url: string,
    { from, to }: DateRange,
    { adults, children }: { adults: number; children: number[] },
  ): string {
    const newCheckIn = DateTime.fromFormat(from, "yyyy-MM-dd").toFormat(
      "dd-MM-yyyy",
    );
    const newCheckOut = DateTime.fromFormat(to, "yyyy-MM-dd").toFormat(
      "dd-MM-yyyy",
    );
    const newOccupancy = [adults, children.length, ...children].join("~");

    const urlObj = new URL(url);
    urlObj.searchParams.set("check_in", newCheckIn);
    urlObj.searchParams.set("check_out", newCheckOut);
    urlObj.searchParams.set("occupancy", newOccupancy);

    return urlObj.toString();
  }

  async getHotelResults() {}
}
