import { Controller, Post, Delete, Param, Get } from "@nestjs/common";
import { SessionsService } from "./sessions/sessions.service";

@Controller("sessions")
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  async createSession() {
    const sessionId = await this.sessionsService.createSession();
    return { sessionId };
  }

  @Delete(":sessionId")
  async deleteSession(@Param("sessionId") sessionId: string) {
    await this.sessionsService.deleteSession(sessionId);
    return { status: "sessionDeleted" };
  }

  @Get("clear-all")
  async clearAllSessions() {
    const sessions = await this.sessionsService.getAllSessions();
    await this.sessionsService.deleteAllSessions();
    return {
      closed: sessions,
    };
  }

  @Get("list-all")
  async getAllSessions() {
    const sessions = await this.sessionsService.getAllSessions();
    return { sessions: sessions };
  }
}
