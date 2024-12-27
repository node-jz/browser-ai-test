/*
https://docs.nestjs.com/providers#services
*/

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BrowserService } from "src/browser/browser/browser.service";
import { SessionsService } from "src/sessions/sessions/sessions.service";

import { SearchService } from "../search.service";
import { PlatformServiceInterface } from "./platform.interface";
import { DateRange, HotelDetails, SearchProps, SearchResult } from "./types";
import { DateTime } from "luxon";
import { BrowserContext, Page } from "playwright";
import { OpenAiService } from "src/llm/openai.service";

@Injectable()
export class TpiService implements PlatformServiceInterface {
  constructor(
    private configService: ConfigService,
    private readonly searchService: SearchService,
    private readonly sessionsService: SessionsService,
    private readonly browserService: BrowserService,
    private readonly openaiService: OpenAiService,
  ) {}

  private readonly platform: string = "tpi";

  async handleLogin(page: Page, sessionId: string, context: BrowserContext) {
    await page.waitForTimeout(2000);
    await page.locator("input#user").click();
    await page
      .locator("input#user")
      .fill(this.configService.get<string>("TPI_USERNAME"));
    await page.locator("input#pass").click();
    await page
      .locator("input#pass")
      .fill(this.configService.get<string>("TPI_PASSWORD"));
    await page.locator("input#submit").click();
    await this.sessionsService.saveCookies(this.platform, context);
    await this.searchService.triggerProgressNotification(
      page,
      sessionId,
      "Login successful.",
      this.platform,
    );
  }

  async search(sessionId: string, data: SearchProps): Promise<void> {
    const { adults, children, hotel, dateRanges } = data;

    const dateRange = dateRanges[0];
    const searchUrl = `https://www.tpicentral.com/air_car_hotel/booking_engine`;

    const context = this.browserService.getContext(sessionId);
    const page = await context.newPage();
    await this.searchService.triggerProgressNotification(
      page,
      sessionId,
      "Navigating to Tpi.",
      this.platform,
    );

    try {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(4000);

      if (page.url().includes("login")) {
        await this.handleLogin(page, sessionId, context);
        await page.waitForTimeout(4000);
        await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
      }

      // reveal search
      await page
        .getByRole("button", { name: "I Understand and Agree" })
        .click();
      await page.waitForTimeout(2000);
      const hotelButton = await page.locator("a#ui-id-2");
      await hotelButton.scrollIntoViewIfNeeded();
      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "Scrolling to hotels tab.",
        this.platform,
      );
      await hotelButton.click();

      const resultsFound = await this.searchForHotel(page, hotel, sessionId);

      await page.waitForTimeout(2000);
      if (!resultsFound) {
        await this.searchService.triggerNoResultsNotification(
          page,
          sessionId,
          this.platform,
        );
      }

      const hotelFoundAndSelected = await this.selectHotelFromList(page, hotel);
      if (!hotelFoundAndSelected) {
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
        "Selected best match from list. Searching for availability.",
        this.platform,
      );

      await Promise.all([
        page.waitForNavigation(),
        page.locator('button[data-qa="btn_search_stay_themepark"]').click(),
      ]);

      await this.handleResultsPage(
        page,
        hotel,
        { adults: adults, children: children },
        dateRange,
        sessionId,
      );
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
      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        `Trying search for '${searchText}'.`,
        this.platform,
      );
      // Retry search with the reduced term
      await this.performHotelNameSearch(page, searchText);
      const selectedHotel = await this.selectHotelFromList(page, hotel);
      if (selectedHotel) {
        return true;
      }

      // Check if "no results" message is present
      const noResultsMessage = await this.checkForNoResultsMessage(page);

      if (!noResultsMessage) {
        return true;
      }

      // Remove the last word
      searchText = words.slice(0, -1).join(" ");
    }
  }

  async selectHotelFromList(page: Page, hotel: HotelDetails): Promise<boolean> {
    await page.waitForSelector("ul.ui-autocomplete li");
    const hotelChoices = await page.$$eval("ul.ui-autocomplete li", (links) =>
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
    await page.locator("input#hotel-city").fill("");
    await page
      .locator("input#hotel-city")
      .pressSequentially(text, { delay: 100 });
    await page.waitForTimeout(1000);
  }

  async checkForNoResultsMessage(page: Page) {
    const noResultsMessage = await page
      .locator("ul.ui-autocomplete")
      .isHidden();
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
    await this.searchService.triggerProgressNotification(
      page,
      sessionId,
      "Initial results loaded without date and occupancy. Changing URL.",
      this.platform,
    );
    await page.goto(this.updateUrl(page.url(), dateRange, occupancy), {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(3000);

    await page.waitForSelector("clientb2b-front-feature-results-list");

    await this.searchService.triggerProgressNotification(
      page,
      sessionId,
      "New results loaded with date and occupancy.",
      this.platform,
    );

    (
      await page.waitForSelector(".feature-card-layout__card__body")
    ).isVisible();

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
      await this.searchService.triggerNoResultsNotification(
        page,
        sessionId,
        this.platform,
      );
      await this.browserService.closePageInContext(sessionId, page);
      return;
    }

    // Ethan wants to save the url of the search page not the URL of the fact sheet page
    await this.searchService.triggerNotification(page, sessionId, "results", {
      step: "Results found.",
      match: { ...match, link: page.url() },
      url: page.url(),
      platform: this.platform,
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
