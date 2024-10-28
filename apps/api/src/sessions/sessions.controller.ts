import { Controller, Post, Delete, Param } from "@nestjs/common";
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
}
