import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";
import { Page } from "playwright";
import { BrowserService } from "src/browser/browser/browser.service";

@Injectable()
export class NavigationService {
  constructor(private readonly browserService: BrowserService) {}

  private async getPage(sessionId: string): Promise<Page> {
    const context = await this.browserService.getContext(sessionId);
    if (!context) {
      throw new NotFoundException("Session not found");
    }
    const pages = context.pages();
    if (pages.length === 0) {
      return await context.newPage();
    }
    return pages[0];
  }

  async navigateTo(sessionId: string, url: string): Promise<void> {
    const page = await this.getPage(sessionId);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "load" }),
      page.goto(url),
    ]);
    await page.waitForTimeout(5000);
    const buffer = await page.screenshot({ fullPage: true, type: "jpeg" });
    writeFileSync(randomUUID() + ".jpg", buffer);
  }

  async getCurrentUrl(sessionId: string): Promise<string> {
    const page = await this.getPage(sessionId);
    return page.url();
  }
}
