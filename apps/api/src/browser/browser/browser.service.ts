import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Browser, BrowserContext, Page, chromium } from "playwright";
import { SessionsService } from "src/sessions/sessions/sessions.service";
@Injectable()
export class BrowserService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(forwardRef(() => SessionsService))
    private readonly sessionsService: SessionsService
  ) {}

  private readonly logger = new Logger(BrowserService.name);

  private browser: Browser;
  private contexts: Map<string, BrowserContext> = new Map();

  async onModuleInit() {
    this.browser = await chromium.launch({ headless: false, timeout: 10000 });
  }

  async onModuleDestroy() {
    await this.browser.close();
  }

  async createContext(sessionId: string): Promise<BrowserContext> {
    if (!this.browser.isConnected()) {
      await this.onModuleInit();
    }
    let context: BrowserContext;
    try {
      context = await this.browser.newContext({
        extraHTTPHeaders: {
          "Accept-Language": "en-US", // Adding the required Accept-Language header
        },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      });
    } catch (e) {
      await this.onModuleInit();
      context = await this.browser.newContext({
        extraHTTPHeaders: {
          "Accept-Language": "en-US", // Adding the required Accept-Language header
        },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      });
      console.error(e);
    }
    context = await this.sessionsService.loadCookies(context);
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

  async closePageInContext(sessionId: string, page: Page) {
    const context = this.contexts.get(sessionId);
    if (context) {
      await page.close();
      const pages = context.pages();
      if (pages.length === 0) {
        await context.close();
        this.contexts.delete(sessionId);
      }
    }
  }
}
