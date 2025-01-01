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
import { SearchProps } from "./types";

@Injectable()
export class PricelineService implements PlatformServiceInterface {
  constructor(
    private eventsGateway: EventsGateway,
    private configService: ConfigService,
    private sessionsService: SessionsService,
    private browserService: BrowserService,
    private readonly openaiService: OpenAiService,
    private readonly searchService: SearchService
  ) {}

  private readonly platform: string = "priceline";
  async search(sessionId: string, data: SearchProps): Promise<void> {
    const { adults, children, hotel, dateRanges } = data;
    const dateRange = dateRanges[0];
    // todo make use of multiple date ranges

    const url =
      "https://www.priceline.com/relax/in/3000008602/from/20250212/to/20250214/rooms/1/adults/3/children/3,2";
    const searchUrl = this.updateUrl(url, dateRange, {
      adults,
      children,
    });
    const context = this.browserService.getContext(sessionId);
    const page = await context.newPage();
    try {
      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "Preparing Priceline search.",
        this.platform
      );
      await this.searchService.triggerNotification(page, sessionId, "results", {
        platform: this.platform,
        step: "Link generated.",
        match: {
          link: searchUrl,
          name: "Search manually on Priceline (only date and occupancy set)",
          price: "Unavailable",
          address: hotel.formattedAddress,
        },
        url: searchUrl,
      });

      await this.browserService.closePageInContext(sessionId, page);
      return;
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

  updateUrl(
    url: string,
    newDates: { from: string; to: string }, // Dates in 'YYYY-MM-DD' format
    occupancy: { adults: number; children?: number[] } // Occupancy details
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
