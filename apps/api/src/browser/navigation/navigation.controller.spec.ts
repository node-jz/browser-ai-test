import { Controller, Post, Get, Param, Body } from "@nestjs/common";
import { NavigationService } from "./navigation.service";

@Controller("sessions/:sessionId")
export class NavigationController {
  constructor(private readonly navigationService: NavigationService) {}

  @Post("navigate")
  async navigate(
    @Param("sessionId") sessionId: string,
    @Body("url") url: string,
  ) {
    await this.navigationService.navigateTo(sessionId, url);
    return { status: "navigated", currentUrl: url };
  }

  @Get("url")
  async getCurrentUrl(@Param("sessionId") sessionId: string) {
    const url = await this.navigationService.getCurrentUrl(sessionId);
    return { currentUrl: url };
  }
}
