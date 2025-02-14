/*
https://docs.nestjs.com/providers#services
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
import { SearchProps, SearchResult } from "./types";

@Injectable()
export class GoogleHotelsService implements PlatformServiceInterface {
  constructor(
    private eventsGateway: EventsGateway,
    private configService: ConfigService,
    private sessionsService: SessionsService,
    private browserService: BrowserService,
    private readonly openaiService: OpenAiService,
    private readonly searchService: SearchService,
  ) {}

  private readonly platform: string = "googleHotels";
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
        "Preparing Google Hotels search.",
        this.platform,
      );
      const hotelURL = new URLSearchParams({
        q: hotel.displayName + ", " + hotel.formattedAddress,
      });
      await page.goto(
        `https://www.google.com/travel/search?${hotelURL.toString()}`,
        {
          waitUntil: "domcontentloaded",
        },
      );
      await page.waitForTimeout(2000);

      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "Setting Occupancy.",
        this.platform,
      );
      await this.setOccupancy(page, { adults, children });

      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "Setting Dates.",
        this.platform,
      );

      await page.waitForTimeout(3000);
      // set dates and occupancy first
      await this.setDates(page, dateRange);

      await page.waitForTimeout(3000);

      const match: SearchResult = {
        link: page.url(),
        name: data.hotel.displayName,
        price: "0",
        address: data.hotel.formattedAddress,
      };
      if (!match) {
        await this.searchService.triggerNoResultsNotification(
          page,
          sessionId,
          this.platform,
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

  async setDates(page: Page, dateRange: { from: string; to: string }) {
    const initialDateWrapper = page.locator("div[data-default-days]").first();
    let fromField = initialDateWrapper.locator(`input`).first();
    await fromField.click();
    await page.waitForTimeout(1000);

    const dateWrapper = page.locator("div[data-default-days]").nth(1);
    fromField = dateWrapper.locator(`input`).first();

    await fromField.dblclick();
    await fromField.clear();
    const fromDate = new Date(dateRange.from);
    const fromDateFormatted = fromDate.toISOString().split("T")[0];
    await fromField.pressSequentially(fromDateFormatted, {
      delay: 100,
    });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1000);
    const toField = dateWrapper.locator(`input`).last();
    await toField.click();
    await page.waitForTimeout(1000);
    await toField.dblclick();
    await toField.clear();
    const toDate = new Date(dateRange.to);
    const toDateFormatted = toDate.toISOString().split("T")[0];
    await toField.pressSequentially(toDateFormatted, {
      delay: 100,
    });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1000);
    await page.keyboard.press("Escape");
  }

  async setOccupancy(
    page: Page,
    occupancy: { adults: number; children?: number[] },
  ) {
    const initialOccupancyField = page.locator(`div[data-adults]`).first();
    await initialOccupancyField.click();
    // Set adults count
    const occupancyField = page.locator(`div[data-adults]`).nth(1);
    const currentAdults: number = parseInt(
      await occupancyField.getAttribute("data-adults"),
    );
    const targetAdults = occupancy.adults;
    const adultsToAdd = targetAdults - currentAdults;

    if (adultsToAdd > 0) {
      // Click + button for adults
      for (let i = 0; i < adultsToAdd; i++) {
        await page.locator('button[aria-label="Add adult"]').first().click();
        await page.waitForTimeout(200);
      }
    } else if (adultsToAdd < 0) {
      // Click - button for adults
      for (let i = 0; i < Math.abs(adultsToAdd); i++) {
        await page.locator('button[aria-label="Remove adult"]').first().click();
        await page.waitForTimeout(200);
      }
    }

    // Set children count and ages if provided
    if (occupancy.children && occupancy.children.length > 0) {
      const childrenAttribute =
        await occupancyField.getAttribute("data-children");
      const currentChildren: number =
        childrenAttribute && childrenAttribute !== ""
          ? childrenAttribute.split(",").length
          : 0;
      const targetChildren = occupancy.children.length;
      const childrenToAdd = targetChildren - currentChildren;

      if (childrenToAdd > 0) {
        const addChildButton = occupancyField
          .locator('button[aria-label="Add child"]')
          .first();
        await addChildButton.click({
          force: true,
          delay: 200,
          clickCount: childrenToAdd,
        });

        // Set age for each child
        for (let i = 0; i < occupancy.children.length; i++) {
          const ageSelector = occupancyField
            .locator("label")
            .nth(i)
            .locator('div[role="listbox"]');
          await ageSelector.click();
          await page.waitForTimeout(2000);

          // Find and click the option with matching age
          const ageOption = ageSelector
            .locator(
              `div[role="option"][data-value="${occupancy.children[i]}"]`,
            )
            .first();
          await ageOption.click();
          await page.waitForTimeout(2000);
        }
      }
    }

    await page.keyboard.press("Escape");
    await page.waitForTimeout(2000);
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
