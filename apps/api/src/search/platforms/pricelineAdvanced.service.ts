/*
THIS IS NOT BEING USED CURRENTLY.  WHILE IT WAS DESIGNED TO AUTOMATE PRICELINE, THERE ARE BOT DETECTIONS THAT ARE TOO STRONG.
THE PRICELINE SERVICE WILL BE USED INSTEAD AND JUST RETURNS A SEARCH URL WITH DATE AND OCCUPANCY.
*/

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Page } from "playwright";
import { BrowserService } from "src/browser/browser.service";
import { SessionsService } from "src/browser/sessions/sessions.service";
import { EventsGateway } from "src/events/events.gateway";
import { OpenAiService } from "src/llm/openai.service";

import { SearchService } from "../search.service";
import { PlatformServiceInterface } from "./platform.interface";
import { HotelDetails, SearchProps, SearchResult } from "./types";

@Injectable()
export class PricelineAdvancedService implements PlatformServiceInterface {
  constructor(
    private eventsGateway: EventsGateway,
    private configService: ConfigService,
    private sessionsService: SessionsService,
    private browserService: BrowserService,
    private readonly openaiService: OpenAiService,
    private readonly searchService: SearchService,
  ) {}

  private readonly platform: string = "priceline";
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
        "Preparing Priceline search.",
        this.platform,
      );
      await page.goto("https://www.priceline.com/?tab=hotels", {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(2000);

      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "Searching for hotel.",
        this.platform,
      );

      const button = await page.locator("div", {
        hasText: "Press & Hold",
      });

      // Press and hold interaction
      await button.hover(); // Ensure the button is hovered over
      await page.mouse.down(); // Simulate pressing the mouse down
      await page.waitForTimeout(5000); // Wait for 3 seconds (adjust as needed for the task)
      await page.mouse.up(); // Simulate releasing the mouse

      await this.searchForHotel(page, hotel, sessionId);
      await page.waitForTimeout(1000);
      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "Submitting search without dates and occupancy.",
        this.platform,
      );
      await page.waitForTimeout(3000);
      const form = page.locator(`div#panel-hotels form:first-of-type`);
      await form.locator(`button[type="submit"]`).click();
      await page.waitForEvent("domcontentloaded");
      await page.waitForTimeout(3000);
      await page.waitForTimeout(3000);
      const updatedUrl = this.updateUrl(page.url(), dateRange, {
        adults,
        children,
      });
      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "Updating search with dates and occupancy.",
        this.platform,
      );

      await page.goto(updatedUrl, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);
      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "Results page loaded.",
        this.platform,
      );

      const results: SearchResult[] = await page.$$eval(
        "div[data-testid='HTL_NEW_LISTING_CARD_RESP']",
        (links) =>
          (links as HTMLAnchorElement[]).map((link) => ({
            link: (link.querySelector("a:first-of-type") as HTMLAnchorElement)
              ?.href,
            name:
              (link.querySelector("h3") as HTMLParagraphElement)?.innerText ||
              "",
            price: "00.00",
            address:
              (
                link.querySelector(
                  "span[data-testid='address']",
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
      await page.waitForTimeout(3000);
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
        this.platform,
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
    await page.waitForSelector(
      `div[id^="endLocation-typeahead-downshift-container-item-0"]`,
    );

    // Extract hotel choices from the updated structure
    const hotelChoices = await page.$$eval(
      `li[id^="endLocation-typeahead-downshift-container-item-"]`,
      (options) =>
        Array.from(options)
          .map((option) => ({
            name: option.textContent.trim(),
            id: option.getAttribute("id"),
            inner: option.innerHTML,
            all: option,
          }))
          .filter((choice) => choice.id !== null),
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
    await page.locator(`div[id="${selectedHotel.id}"]`).click();
    await page.waitForTimeout(1000);
    await page.locator(`div#panel-hotels`).click();
    return true;
  }

  async useLLMToFindHotel(
    hotelChoices: { name: string; id: string }[],
    hotel: HotelDetails,
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
    await page
      .locator(`input#endLocation-typeahead-downshift-container-input`)
      .fill("");
    await page
      .locator(`input#endLocation-typeahead-downshift-container-input`)
      .pressSequentially(text, {
        delay: 100,
      });
    await page.waitForTimeout(1000);
  }

  updateUrl(
    url: string,
    newDates: { from: string; to: string }, // Dates in 'YYYY-MM-DD' format
    occupancy: { adults: number; children?: number[] }, // Occupancy details
  ): string {
    const urlObj = new URL(url);

    // Update the check-in and check-out dates
    const newFrom = newDates.from.replace(/-/g, ""); // Convert to 'YYYYMMDD'
    const newTo = newDates.to.replace(/-/g, ""); // Convert to 'YYYYMMDD'

    // Update path segments for dates
    const pathSegments = urlObj.pathname.split("/");
    const fromIndex = pathSegments.indexOf("from");
    const toIndex = pathSegments.indexOf("to");

    if (fromIndex !== -1 && toIndex !== -1) {
      pathSegments[fromIndex + 1] = newFrom; // Update check-in date
      pathSegments[toIndex + 1] = newTo; // Update check-out date
    }

    // Update adults in the path
    const adultsIndex = pathSegments.indexOf("adults");
    if (adultsIndex !== -1) {
      pathSegments[adultsIndex + 1] = occupancy.adults.toString();
    }

    // Add children to the path if provided
    const childrenAges =
      occupancy.children && occupancy.children.length > 0
        ? occupancy.children.join(",")
        : null;

    const childrenIndex = pathSegments.indexOf("children");
    if (childrenAges) {
      if (childrenIndex !== -1) {
        pathSegments[childrenIndex + 1] = childrenAges;
      } else {
        // Append 'children/{ages}' to the path
        pathSegments.push("children", childrenAges);
      }
    } else if (childrenIndex !== -1) {
      // Remove the 'children' segment if no children are specified
      pathSegments.splice(childrenIndex, 2);
    }

    // Update the pathname with modified segments
    urlObj.pathname = pathSegments.join("/");

    return urlObj.toString();
  }
}
