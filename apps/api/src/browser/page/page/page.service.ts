import { Injectable, NotFoundException } from "@nestjs/common";
import { Page } from "playwright";
import { BrowserService } from "src/browser/browser.service";

import { ScrapeService } from "./scrape.service";
import { EventsGateway } from "src/events/events.gateway";

type FormField = {
  name: string;
  type: string;
  label: string | null;
  placeholder: string | undefined;
};

type Form = {
  formId: string | null;
  action: string;
  method: string;
  fields: FormField[];
};

@Injectable()
export class PageService {
  constructor(
    private readonly browserService: BrowserService,
    private readonly scrapeService: ScrapeService,
    private readonly eventsGateway: EventsGateway
  ) {}

  private async getPage(sessionId: string): Promise<Page> {
    const context = this.browserService.getContext(sessionId);
    if (!context) {
      throw new NotFoundException("Session not found");
    }
    const pages = context.pages();
    if (pages.length === 0) {
      throw new NotFoundException("No pages open in this session");
    }
    this.eventsGateway.notifyEvent("progress", sessionId, {
      website: pages[0].url.toString(),
      step: "Page Loaded",
    });
    this.eventsGateway.notifyEvent("pageLoaded", sessionId, {
      url: pages[0].url(),
    });
    return pages[0];
  }

  async getHtml(sessionId: string): Promise<string> {
    const page = await this.getPage(sessionId);
    return await page.innerHTML("body");
  }

  async pageToMarkdown(
    sessionId: string
  ): Promise<{ text: string; links: { url: string; text: string }[] }> {
    const page = await this.getPage(sessionId);
    return this.scrapeService.scrapePage(page);
  }

  async getForms(sessionId: string): Promise<Form[]> {
    const page = await this.getPage(sessionId);
    const forms = await page.$$eval("form", (forms) =>
      forms.map((form) => {
        return {
          formId: form.id || null,
          action: form.action,
          method: form.method,
          fields: Array.from(form.elements).map(
            (element: HTMLInputElement) => ({
              name: element.name,
              type: element.type,
              label: element.labels ? element.labels[0]?.innerText : null,
              placeholder: element.placeholder,
            })
          ),
        };
      })
    );
    return forms;
  }

  async fillFormFields(
    sessionId: string,
    formSelector: string,
    fields: { [key: string]: string }
  ): Promise<void> {
    const page = await this.getPage(sessionId);
    for (const [name, value] of Object.entries(fields)) {
      await page.fill(`${formSelector} [name="${name}"]`, value);
    }
  }

  async submitForm(sessionId: string, formSelector: string): Promise<void> {
    const page = await this.getPage(sessionId);
    await Promise.all([
      page.waitForNavigation(),
      page.click(`${formSelector} [type="submit"]`),
    ]);
  }

  async clickElement(sessionId: string, selector: string): Promise<void> {
    const page = await this.getPage(sessionId);
    await page.click(selector);
  }

  async selectOption(
    sessionId: string,
    selector: string,
    value: string
  ): Promise<void> {
    const page = await this.getPage(sessionId);
    await page.selectOption(selector, value);
  }

  async executeScript<T>(sessionId: string, script: string): Promise<T> {
    const page = await this.getPage(sessionId);
    return await page.evaluate(script);
  }
}
