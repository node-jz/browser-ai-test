import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Browser, BrowserContext, chromium } from "playwright";

@Injectable()
export class BrowserService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BrowserService.name);

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
    this.logger.log(`New Context Created - ${sessionId}`);
    this.logger.debug(this.contexts.keys.length + " Contexts Open");
    return context;
  }

  getContext(sessionId: string): BrowserContext {
    return this.contexts.get(sessionId);
  }

  getAllContexts() {
    return this.contexts;
  }

  async closeContext(sessionId: string): Promise<void> {
    const context = this.contexts.get(sessionId);
    if (context) {
      await context.close();
      this.contexts.delete(sessionId);

      this.logger.log(`Context Deleted - ${sessionId}`);
      this.logger.debug(this.contexts.keys.length + " Contexts Open");
    }
  }
}
