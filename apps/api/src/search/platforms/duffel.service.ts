/*
https://docs.nestjs.com/providers#services
*/

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SessionsService } from "src/sessions/sessions/sessions.service";

import { SearchService } from "../search.service";
import { PlatformServiceInterface } from "./platform.interface";
import { SearchProps, SearchResult } from "./types";
import { BrowserService } from "src/browser/browser/browser.service";

@Injectable()
export class DuffelService implements PlatformServiceInterface {
  constructor(
    private configService: ConfigService,
    private readonly searchService: SearchService,
    private readonly sessionsService: SessionsService,
    private readonly browserService: BrowserService
  ) {}

  private readonly platform: string = "duffel";
  async search(sessionId: string, data: SearchProps): Promise<void> {
    const { adults, children, hotel, dateRanges } = data;

    const dateRange = dateRanges[0];
    const searchUrl = `https://app.duffel.com/997a4f4c1d8725505ef8bf3/test/stays/results?checkInDate=${dateRange.from}&checkOutDate=${dateRange.to}&rooms=1&lat=${hotel.location.latitude}&long=${hotel.location.longitude}&loc=${encodeURIComponent(hotel.displayName)}&adults=${adults}&children=${children.length}&timestamp=${Date.now()}`;

    const context = this.browserService.getContext(sessionId);
    const page = await context.newPage();
    await this.searchService.triggerProgressNotification(
      page,
      sessionId,
      "Navigating to duffel.",
      this.platform
    );

    try {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(4000);

      if (await page.locator("input#password").isVisible()) {
        if (await page.waitForSelector('form[method="post"]')) {
          await this.searchService.triggerProgressNotification(
            page,
            sessionId,
            "Login required.",
            this.platform
          );

          await page.locator("input#email").click();
          await page
            .locator("input#email")
            .fill(this.configService.get<string>("DUFFEL_USERNAME"));
          await page.locator("input#password").click();
          await page
            .locator("input#password")
            .fill(this.configService.get<string>("DUFFEL_PASSWORD"));
          await page.waitForTimeout(1000);
          await Promise.all([
            page.waitForNavigation(),
            page.getByTestId("submit").click(),
          ]);

          await this.searchService.safeNavigation(page, async () => {
            await page.goto(searchUrl);
            return;
          });
        }
        await this.sessionsService.saveCookies(this.platform, context);
      }

      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "Waiting for search results to load.",
        this.platform
      );

      try {
        await page.waitForSelector("#results");
      } catch (e) {
        console.log("No results.", e.message ?? "");
        await this.searchService.triggerNoResultsNotification(
          page,
          sessionId,
          this.platform
        );
        await this.browserService.closePageInContext(sessionId, page);
        return;
      }

      await page
        .locator(".LoadingBar_bar__XtMeA")
        .waitFor({ state: "detached" });

      await this.searchService.triggerProgressNotification(
        page,
        sessionId,
        "Search results, selecting best match.",
        this.platform
      );
      const results: SearchResult[] = await page.$$eval(
        "#results a.StaysResultCard_container__QEx7E",
        (links) =>
          (links as HTMLAnchorElement[]).map((link) => ({
            link: link.href,
            name:
              (link.querySelector("p.Text_text__vsLHb") as HTMLParagraphElement)
                ?.innerText || "",
            price: "00.00",
            address:
              (
                link.querySelector(
                  "p.Text_text--grey-600__0O8J3"
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
    } catch (error) {
      await this.searchService.triggerErrorNotification(
        page,
        sessionId,
        this.platform,
        error.message ?? "Error while searching"
      );
      console.error("Error during browser operation:", error.message);
      this.browserService.closePageInContext(sessionId, page);
      console.error(error);
    }
  }
}
