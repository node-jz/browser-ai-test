import { Injectable } from "@nestjs/common";
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
}
