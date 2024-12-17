/*
https://docs.nestjs.com/providers#services
*/

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BrowserService } from "src/browser/browser/browser.service";
import { EventsGateway } from "src/events/events.gateway";
import { OpenAiService } from "src/llm/openai.service";
import { SessionsService } from "src/sessions/sessions/sessions.service";

import { SearchService } from "../search.service";
import { PlatformServiceInterface } from "./platform.interface";
import { HotelDetails, SearchProps, SearchResult } from "./types";
import { Page } from "playwright";

@Injectable()
export class BookingComService implements PlatformServiceInterface {
  constructor(
    private eventsGateway: EventsGateway,
    private configService: ConfigService,
    private sessionsService: SessionsService,
    private browserService: BrowserService,
    private readonly openaiService: OpenAiService,
    private readonly searchService: SearchService
  ) {}

  private readonly platform: string = "bookingcom";
  async search(sessionId: string, data: SearchProps): Promise<void> {
    const { adults, children, hotel, dateRanges } = data;
    const dateRange = dateRanges[0];
    // todo make use of multiple date ranges

    const context = this.browserService.getContext(sessionId);
    const page = await context.newPage();
    try {
      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "Preparing Booking.com search.",
        this.platform
      );
      await page.goto("https://www.booking.com/index.html", {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(2000);
      try {
        if (
          await page.waitForSelector(
            "button[aria-label='Dismiss sign-in info.']",
            { timeout: 5000 }
          )
        ) {
          await page
            .locator("button[aria-label='Dismiss sign-in info.']")
            .click();
        }
      } catch (e) {
        console.log(e);
        console.log("No sign in info found. continuing...");
      }
      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "Searching for hotel.",
        this.platform
      );

      await this.searchForHotel(page, hotel, sessionId);
      await page.waitForTimeout(1000);
      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "Submitting search without dates and occupancy.",
        this.platform
      );
      await page.pause();
      await Promise.all([
        page.getByRole("button", { name: "Search" }).click(),
        page.waitForEvent("domcontentloaded"),
      ]);
      await page.waitForTimeout(3000);
      const updatedUrl = this.updateBookingUrl(
        page.url(),
        dateRange.from,
        dateRange.to,
        adults,
        children
      );
      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "Updating search with dates and occupancy.",
        this.platform
      );

      await page.goto(updatedUrl, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);
      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "Results page loaded.",
        this.platform
      );

      const results: SearchResult[] = await page.$$eval(
        "div[data-testid='property-card'] a[data-testid='title-link']",
        (links) =>
          (links as HTMLAnchorElement[]).map((link) => ({
            link: link.href,
            name:
              (
                link.querySelector(
                  "div[data-testid='title']"
                ) as HTMLParagraphElement
              )?.innerText || "",
            price: "00.00",
            address:
              (
                link.querySelector(
                  "span[data-testid='address']"
                ) as HTMLParagraphElement
              )?.innerText || "",
          }))
      );

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
        await this.browserService.closePageInContext(sessionId, page);
        return;
      }

      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "Match found. Opening booking page.",
        this.platform
      );
      await Promise.all([page.waitForNavigation(), page.goto(match.link)]);
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
        this.platform
      );
      await this.browserService.closePageInContext(sessionId, page);
    }
    await this.browserService.closePageInContext(sessionId, page);
  }

  async searchForHotel(
    page: Page,
    hotel: HotelDetails,
    sessionId: string
  ): Promise<boolean> {
    let searchText = hotel.displayName;
    while (true) {
      const words = searchText.split(" ");
      if (words.length <= 1) {
        return false;
      }
      // Retry search with the reduced term
      await this.inputHotelNameInSearchField(page, searchText);
      const selectedHotel = await this.selectHotelFromList(page, hotel);
      if (selectedHotel) {
        return true;
      }
      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        `Trying search for '${searchText}'.`,
        this.platform
      );
      // Check if "no results" message is present
      /*const noResultsMessage = await this.checkForNoResultsMessage(page);

      if (!noResultsMessage) {
        return true;
      }*/

      // Remove the last word
      searchText = words.slice(0, -1).join(" ");
    }
  }

  async selectHotelFromList(page: Page, hotel: HotelDetails): Promise<boolean> {
    // Wait for the hotel list to be loaded
    await page.waitForSelector(`li[id^="autocomplete-result-0"]`);

    // Extract hotel choices from the updated structure
    const hotelChoices = await page.$$eval(
      `li[id^="autocomplete-result-"]`,
      (options) =>
        Array.from(options)
          .map((option) => ({
            name: option.textContent.trim(),
            id: option.getAttribute("id"),
            inner: option.innerHTML,
            all: option,
          }))
          .filter((choice) => choice.id !== null)
    );

    // Find the matching hotel name
    let selectedHotel: { name: string; id: string } | null = null;
    for (const choice of hotelChoices) {
      if (choice.name === hotel.displayName) {
        selectedHotel = choice;
        break;
      }
    }
    if (!selectedHotel) {
      // Use LLM or fallback logic to find the closest match
      const result = await this.useLLMToFindHotel(hotelChoices, hotel);
      if (!result) {
        return false;
      }
      selectedHotel = result;
    }
    await page.locator(`li[id="${selectedHotel.id}"]`).click();

    return true;
  }

  async useLLMToFindHotel(
    hotelChoices: { name: string; id: string }[],
    hotel: HotelDetails
  ): Promise<{ name: string; id: string } | null> {
    const systemPrompt = `I need you to search a list of hotels, and return the listed name that matches exactly or most closely to a hotel I am looking for [QUERY]. 
      [LIST]
      ${hotelChoices
        .map((choice) => `NAME: ${choice.name} (ID: ${choice.id})`)
        .join("\n")}
      [OUTPUT] return the best option or NULL if you dont believe the hotel is in the list, using JSON that matches the type { id: string | null, name: string | null} where null would be if no close match exists.`;
    const userPrompt = `[QUERY] name: ${hotel.displayName} location: ${hotel.formattedAddress}`;

    const llmResult = await this.openaiService.completion({
      systemPrompt,
      userPrompt,
      model: "gpt-4o-2024-08-06",
      json: true,
    });
    return JSON.parse(llmResult.content);
  }

  async inputHotelNameInSearchField(page: Page, text: string) {
    await page.locator(`input[data-destination='1']`).fill("");
    await page.locator(`input[data-destination='1']`).pressSequentially(text, {
      delay: 100,
    });
    await page.waitForTimeout(1000);
  }

  updateBookingUrl(
    baseUrl: string,
    checkInDate: string, // Format: yyyy-MM-dd
    checkOutDate: string, // Format: yyyy-MM-dd
    adults: number,
    children: number[] // Array of ages
  ): string {
    const urlObj = new URL(baseUrl);

    // Update dates
    urlObj.searchParams.set("checkin", checkInDate);
    urlObj.searchParams.set("checkout", checkOutDate);

    // Update occupancy
    urlObj.searchParams.set("group_adults", adults.toString());
    urlObj.searchParams.set("group_children", children.length.toString());

    // Add children ages dynamically
    // Clear existing 'age' params
    urlObj.searchParams.delete("age");
    children.forEach((age) => {
      urlObj.searchParams.append("age", age.toString());
    });

    return urlObj.toString();
  }
}
