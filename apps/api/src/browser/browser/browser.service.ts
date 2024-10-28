import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { chromium, Browser, BrowserContext } from "playwright";

@Injectable()
export class BrowserService implements OnModuleInit, OnModuleDestroy {
  private browser: Browser;
  private contexts: Map<string, BrowserContext> = new Map();

  async onModuleInit() {
    this.browser = await chromium.launch({ headless: true });
  }

  async onModuleDestroy() {
    await this.browser.close();
  }

  async createContext(sessionId: string): Promise<BrowserContext> {
    const context = await this.browser.newContext();
    this.contexts.set(sessionId, context);
    return context;
  }

  async getContext(sessionId: string): Promise<BrowserContext> {
    return this.contexts.get(sessionId);
  }

  async closeContext(sessionId: string): Promise<void> {
    const context = this.contexts.get(sessionId);
    if (context) {
      await context.close();
      this.contexts.delete(sessionId);
    }
  }
}
