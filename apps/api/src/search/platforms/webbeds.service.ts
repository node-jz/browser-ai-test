/*
https://docs.nestjs.com/providers#services
*/

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DateTime } from "luxon";
import { Page } from "playwright";
import { BrowserService } from "src/browser/browser/browser.service";
import { EventsGateway } from "src/events/events.gateway";
import { OpenAiService } from "src/llm/openai.service";
import { SessionsService } from "src/sessions/sessions/sessions.service";

import { SearchService } from "../search.service";
import { PlatformServiceInterface } from "./platform.interface";
import { DateRange, HotelDetails, SearchProps, SearchResult } from "./types";

@Injectable()
export class WebBedsService implements PlatformServiceInterface {
  constructor(
    private readonly eventsGateway: EventsGateway,
    private readonly configService: ConfigService,
    private readonly sessionsService: SessionsService,
    private readonly browserService: BrowserService,
    private readonly openaiService: OpenAiService,
    private readonly searchService: SearchService
  ) {}

  private readonly platform: string = "webbeds";
  async search(sessionId: string, data: SearchProps): Promise<void> {
    const { adults, children, hotel, dateRanges } = data;
    const dateRange = dateRanges[0];

    const context = this.browserService.getContext(sessionId);
    const page = await context.newPage();
    await this.searchService.triggerProgressNotification(
      page,
      sessionId,
      `Navigating to ${this.platform}.`,
      this.platform
    );

    try {
      await Promise.all([
        page.waitForNavigation(),
        page.goto("https://book.webbeds.com/accommodations", {
          waitUntil: "domcontentloaded",
        }),
      ]);
      await page.waitForTimeout(4000);
      if (await page.getByLabel("Login ID").isVisible()) {
        await this.searchService.triggerProgressNotification(
          page,
          sessionId,
          "Login required.",
          this.platform
        );
        await page.getByLabel("Login ID").click();
        await page.getByLabel("Login ID").fill(process.env.WEBBEDS_USERNAME);
        await page.getByLabel("Password").click();
        await page.getByLabel("Password").fill(process.env.WEBBEDS_PASSWORD);
        await page.getByLabel("Company Code").click();
        await page
          .getByLabel("Company Code")
          .fill(process.env.WEBBEDS_COMPANY_CODE);
        await page.getByRole("checkbox", { name: "remember" }).check();
        await Promise.all([
          page.waitForNavigation(),
          page.getByRole("button", { name: "Login" }).click(),
        ]);

        await this.handleMfa(page, sessionId);
        await this.searchService.triggerProgressNotification(
          page,
          sessionId,
          "Saving cookies to skip login next time.",
          this.platform
        );
        await page.waitForTimeout(2000);
        await this.sessionsService.saveCookies(this.platform, context);
      }
      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        `Beginning search for ${hotel.displayName}.`,
        this.platform
      );
      await page.waitForTimeout(2000);
      const resultsFound = await this.searchForHotel(page, hotel, sessionId);
      await page.waitForTimeout(2000);
      if (!resultsFound) {
        await this.searchService.triggerNoResultsNotification(
          page,
          sessionId,
          this.platform
        );
      }

      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "hotel name entered.",
        this.platform
      );

      const hotelFoundAndSelected = await this.selectHotelFromList(page, hotel);
      if (!hotelFoundAndSelected) {
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
        "Selected hotel from list.",
        this.platform
      );

      await Promise.all([
        page.waitForLoadState("networkidle"),
        page.locator('button[type="submit"]').click(),
      ]);

      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "Initial page loaded without date and occupancy set.",
        this.platform
      );

      await this.handleResultsPage(
        page,
        hotel,
        { adults: adults, children: children },
        dateRange,
        sessionId
      );
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

  async handleMfa(page: Page, sessionId: string) {
    try {
      const mfaFormField = await page.locator("#mfacode");
      if ((await mfaFormField.isVisible()) === false) {
        return;
      }

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
      console.log(mfaCode);
      await page.locator("#mfacode").fill(mfaCode);
      await page.getByRole("button", { name: "Verify code" }).click();
      await page.waitForTimeout(2000);
    } catch (e) {
      console.error(e);
    }
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

      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        `Trying search for '${searchText}'.`,
        this.platform
      );
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
    // Wait for the hotel list to be loaded
    await page.waitForSelector(`ul#\\:r0\\:-listbox`);

    // Extract hotel choices from the updated structure
    const hotelChoices = await page.$$eval(
      `ul#\\:r0\\:-listbox li`,
      (options) =>
        Array.from(options)
          .map((option) => ({
            name: option.querySelector("p")?.textContent.trim(),
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

    // Click on the matching hotel name
    await page
      .locator(`ul#\\:r0\\:-listbox li[id="${selectedHotel.id}"]`)
      .click();

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
    await page.locator(`#\\:r0\\:`).fill("");
    await page.locator(`#\\:r0\\:`).pressSequentially(text, {
      delay: 100,
    });
    await page.waitForTimeout(1000);
  }

  async checkForNoResultsMessage(page: Page) {
    const noResultsMessage = await page
      .locator("text=No matches found. Please refine your search.")
      .isVisible();
    return noResultsMessage;
  }

  /** RESULTS PAGE  */
  async handleResultsPage(
    page: Page,
    hotel: HotelDetails,
    occupancy: { adults: number; children: number[] },
    dateRange: DateRange,
    sessionId: string
  ) {
    await page.waitForTimeout(4000);
    await Promise.all([
      page.waitForNavigation(),
      page.goto(this.updateUrl(page.url(), dateRange, occupancy)),
    ]);

    await this.searchService.triggerProgressNotification(
      page,
      sessionId,
      "Changed URL to match occupancy and date.",
      this.platform
    );

    await page.waitForSelector("div[data-testid='search-results-section']");
    await page.waitForSelector("span[role='progressbar']");
    await page.getByRole("progressbar").waitFor({ state: "detached" });
    await this.searchService.triggerProgressNotification(
      page,
      sessionId,
      "New results loaded.",
      this.platform
    );
    await page.waitForTimeout(3000);
    const results: SearchResult[] = await page.$$eval(
      "div[data-testid='search-results-section'] li", // Select the main container for each hotel card
      (cards) =>
        (cards as HTMLElement[]).map((card) => {
          const spans = card.querySelectorAll("span");
          const price =
            spans.length >= 2 && spans[0].textContent.trim() === "From"
              ? spans[1].textContent.trim()
              : "00.00";
          return {
            link: (card.querySelector("a") as HTMLAnchorElement)?.href || "",
            name:
              (card.querySelector("h6") as HTMLSpanElement)?.innerText.trim() ||
              "",
            price: price,
            address: "(address not listed)",
          };
        })
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

    await this.searchService.triggerNotification(page, sessionId, "results", {
      platform: this.platform,
      step: "Results found.",
      match: match,
      url: page.url(),
    });
  }

  updateUrl(
    url: string,
    { from, to }: DateRange,
    { adults, children }: { adults: number; children: number[] }
  ): string {
    // Convert string dates to ISO format (yyyy-MM-dd)
    const formattedStartDate = DateTime.fromISO(from).toFormat("yyyy-MM-dd");
    const formattedEndDate = DateTime.fromISO(to).toFormat("yyyy-MM-dd");

    // Create the updated occupancy parameter as a JSON string
    const guestParam = JSON.stringify([
      {
        adults: adults,
        children: children.length,
        ages: children.map((age) => ({ age })),
      },
    ]);

    // Parse the URL and update query parameters
    const urlObj = new URL(url);

    // Update query parameters for check-in, check-out, and occupancy
    urlObj.searchParams.set("in", formattedStartDate);
    urlObj.searchParams.set("out", formattedEndDate);
    urlObj.searchParams.set("r", guestParam);
    urlObj.searchParams.set("SORT_BY", "distance@asc");

    return urlObj.toString();
  }

  async getHotelResults() {}
}
