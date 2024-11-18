import { Injectable } from "@nestjs/common";
import { BrowserContext } from "playwright";
import { BrowserService } from "src/browser/browser/browser.service";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class SessionsService {
  constructor(private readonly browserService: BrowserService) {}

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
}
