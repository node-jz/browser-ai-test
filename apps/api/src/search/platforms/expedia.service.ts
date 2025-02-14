/*
https://docs.nestjs.com/providers#services
*/

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BrowserService } from "src/browser/browser.service";
import { SessionsService } from "src/browser/sessions/sessions.service";
import { EventsGateway } from "src/events/events.gateway";
import { OpenAiService } from "src/llm/openai.service";

import { SearchService } from "../search.service";
import { PlatformServiceInterface } from "./platform.interface";
import { SearchProps } from "./types";

@Injectable()
export class ExpediaService implements PlatformServiceInterface {
  constructor(
    private eventsGateway: EventsGateway,
    private configService: ConfigService,
    private sessionsService: SessionsService,
    private browserService: BrowserService,
    private readonly openaiService: OpenAiService,
    private readonly searchService: SearchService,
  ) {}

  private readonly platform: string = "expedia";
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
        "Preparing URL for Expedia.",
        this.platform,
      );
      const formattedChildren = children.map((age) => `1_${age}`).join("%2C");
      const searchUrl = `https://www.expedia.com/Hotel-Search?destination=${encodeURIComponent(`${hotel.displayName},${hotel.city},${hotel.state}`)}&latLong=${hotel.location.latitude},${hotel.location.longitude}&startDate=${dateRange.from}&endDate=${dateRange.to}&d1=${dateRange.from}&d2=${dateRange.to}&adults=${adults}&flexibility=0_DAY&rooms=1&children=${formattedChildren}&sort=RECOMMENDED`;
      await page.waitForTimeout(2000);
      await this.searchService.triggerNotification(page, sessionId, "results", {
        platform: this.platform,
        step: "Link generated.",
        match: {
          link: searchUrl,
          name: "Browse results manually on Expedia",
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
        this.platform,
      );
      await this.browserService.closePageInContext(sessionId, page);
    }
    await this.browserService.closePageInContext(sessionId, page);
  }
}
