/*
https://docs.nestjs.com/providers#services
*/

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DateTime } from "luxon";
import { BrowserContext, Page } from "playwright";
import { BrowserService } from "src/browser/browser.service";
import { SessionsService } from "src/browser/sessions/sessions.service";
import { OpenAiService } from "src/llm/openai.service";

import { SearchService } from "../search.service";
import { PlatformServiceInterface } from "./platform.interface";
import { DateRange, HotelDetails, SearchProps, SearchResult } from "./types";

@Injectable()
export class TravelEdgeService implements PlatformServiceInterface {
  constructor(
    private configService: ConfigService,
    private readonly searchService: SearchService,
    private readonly sessionsService: SessionsService,
    private readonly browserService: BrowserService,
    private readonly openaiService: OpenAiService,
  ) {}

  private readonly platform: string = "traveledge";

  async handleLogin(page: Page, sessionId: string, context: BrowserContext) {
    await page.waitForTimeout(2000);
    await page.locator("input[type='email']").click();
    await page
      .locator("input[type='email']")
      .fill(this.configService.get<string>("TRAVEL_EDGE_USERNAME"));
    await page.locator("input[type='password']").click();
    await page
      .locator("input[type='password']")
      .fill(this.configService.get<string>("TRAVEL_EDGE_PASSWORD"));
    await page.locator("button[type='submit']").click();

    await page.waitForTimeout(3000);
    await this.sessionsService.saveCookies(this.platform, context);
    await this.searchService.triggerProgressNotification(
      page,
      sessionId,
      "Login successful.",
      this.platform,
    );
  }

  /**
   * ENTRY POINT
   * Search for a hotel on the TravelEdge platform.
   * @param sessionId - The ID of the session.
   * @param data - The search data.
   */
  async search(sessionId: string, data: SearchProps): Promise<void> {
    const { adults, children, hotel, dateRanges } = data;

    const dateRange = dateRanges[0];
    const searchUrl = `https://adxtravel.com`;

    const context = this.browserService.getContext(sessionId);
    const page = await context.newPage();
    await this.searchService.triggerProgressNotification(
      page,
      sessionId,
      "Navigating to Travel Edge.",
      this.platform,
    );

    try {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(4000);

      if (page.url().includes("login")) {
        await this.handleLogin(page, sessionId, context);
      }

      if (await page.getByRole("button", { name: "Got it" }).isVisible()) {
        await page.getByRole("button", { name: "Got it" }).click();
      }
      await page.waitForTimeout(1000);
      await page.getByRole("button", { name: "Hotel" }).first().click();
      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "Clicking the hotel tab.",
        this.platform,
      );

      const resultsFound = await this.searchForHotel(page, hotel, sessionId);
      console.log("resultsFound", resultsFound);
      /** Date and occupancy */
      const formattedCheckInDate = DateTime.fromFormat(
        dateRange.from,
        "yyyy-MM-dd",
      ).toFormat("MM/dd/yyyy");
      const formattedCheckOutDate = DateTime.fromFormat(
        dateRange.to,
        "yyyy-MM-dd",
      ).toFormat("MM/dd/yyyy");
      const checkInDateInput = page
        .locator(`input[placeholder="mm/dd/yyyy"]`)
        .first();
      const checkOutDateInput = page
        .locator(`input[placeholder="mm/dd/yyyy"]`)
        .last();
      await checkInDateInput.fill(formattedCheckInDate);
      await page.waitForTimeout(1000);
      await checkOutDateInput.fill(formattedCheckOutDate);
      await page.waitForTimeout(2000);
      await page
        .locator("adx-hotel-rooms-selector > div > div")
        .first()
        .click();
      await page.waitForSelector("div.room-body", { state: "visible" });

      await page
        .locator("div.room-body > div > div:first-child select")
        .first()
        .selectOption(adults.toString());
      await page.waitForTimeout(2000);
      await page
        .locator("div.room-body > div > div:nth-child(2) select")
        .first()
        .selectOption(children.length.toString());

      await page.waitForTimeout(2000);
      // Wait for the "Child Ages" section to appear
      await page.waitForSelector("div.room-body > div > div:nth-child(3)", {
        state: "visible",
      });
      const childAgeSection = page.locator(
        "div.room-body > div > div:nth-child(3)",
      );

      await page.waitForTimeout(2000);
      // Locate all the dropdowns for child ages
      const childAgeSelectors = childAgeSection.locator("select");

      // Check if the number of dropdowns matches the array length
      const dropdownCount = await childAgeSelectors.count();
      if (dropdownCount !== children.length) {
        console.error(
          `Expected ${children.length} dropdowns, but found ${dropdownCount}`,
        );
        await this.browserService.closePageInContext(sessionId, page);
        return;
      }

      // Fill each dropdown with the corresponding age
      for (let i = 0; i < children.length; i++) {
        await childAgeSelectors.nth(i).selectOption(`${children[i]}`); // Convert age to string for matching the value
      }

      await page.waitForTimeout(2000);

      await page.getByRole("button", { name: " Search " }).first().click();

      await page.waitForTimeout(2000);
      if (!resultsFound) {
        await this.searchService.triggerNoResultsNotification(
          page,
          sessionId,
          this.platform,
        );
      }

      await this.handleResultsPage(page, hotel, sessionId);
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
    await page.waitForSelector("div.pac-container", { state: "visible" });

    const hotelChoices = await page.$$eval(".pac-item", (links) =>
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
    await page.waitForTimeout(2000);
    await page.locator("adx-location-autocomplete input").first().fill("");
    await page
      .locator("adx-location-autocomplete input")
      .first()
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
  async handleResultsPage(page: Page, hotel: HotelDetails, sessionId: string) {
    await this.searchService.triggerProgressNotification(
      page,
      sessionId,
      "Results loaded.",
      this.platform,
    );
    await page.waitForTimeout(3000);
    await page.waitForSelector("div.hotel-list-item", {
      state: "visible",
    });
    const results: SearchResult[] = await page.$$eval(
      ".hotel-list-item", // Select the main container for each hotel card
      (cards) =>
        (cards as HTMLElement[]).map((card) => ({
          link: `div[data-property-id="${card.firstElementChild?.getAttribute("data-property-id")}"] button.select-hotel`,
          name:
            (
              card.querySelector(".property-name-col") as HTMLSpanElement
            )?.innerText.trim() || "",
          price:
            (card.querySelector(".price-col") as HTMLElement)?.innerText ||
            "00.00",
          address: "",
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
