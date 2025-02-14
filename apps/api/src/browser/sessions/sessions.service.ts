import { forwardRef, Inject, Injectable } from "@nestjs/common";
import * as fs from "fs";
import { BrowserContext } from "playwright";
import { BrowserService } from "src/browser/browser.service";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class SessionsService {
  constructor(
    @Inject(forwardRef(() => BrowserService))
    private readonly browserService: BrowserService,
  ) {}

  async createSession(): Promise<string> {
    const sessionId = uuidv4();
    await this.browserService.createContext(sessionId);
    return sessionId;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.browserService.closeContext(sessionId);
  }

  async getAllSessions(): Promise<{ id: string; pages: string[] }[]> {
    const contexts = this.browserService.getAllContexts();
    const mapped = [];
    contexts.forEach((context: BrowserContext, key) => {
      mapped.push({
        id: key,
        pages: context
          .pages()
          .map((page) => page.url())
          .join("\n"),
      });
    });
    return mapped;
  }

  async deleteAllSessions() {
    const contexts = this.browserService.getAllContexts();
    contexts.forEach((context, key) => {
      this.deleteSession(key);
    });
  }

  async saveCookies(platform: string, context: BrowserContext) {
    const cookies = await context.cookies();
    fs.writeFileSync(`./cookies/${platform}.json`, JSON.stringify(cookies));
    return cookies;
  }

  async loadCookies(context: BrowserContext) {
    if (!fs.existsSync("./cookies")) {
      fs.mkdirSync("./cookies");
    }
    try {
      const cookieFiles = fs
        .readdirSync("./cookies")
        .filter((file) => file.endsWith(".json"));
      const allCookies = [];

      for (const file of cookieFiles) {
        const cookies = JSON.parse(
          fs.readFileSync(`./cookies/${file}`, "utf8"),
        );
        allCookies.push(...cookies);
      }
      if (allCookies.length > 0) {
        await context.addCookies(allCookies);
      }
    } catch (e) {
      console.error(e);
    }
    return context;
  }
}
