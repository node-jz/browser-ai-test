import { Body, Controller, Post } from "@nestjs/common";
import { DuffelService } from "src/search/platforms/duffel.service";
import { SessionsService } from "src/sessions/sessions/sessions.service";
import { SearchProps } from "./platforms/types";
import { PlatformServiceInterface } from "./platforms/platform.interface";
import { BedsOnlineService } from "./platforms/bedsonline.service";

@Controller("search")
export class SearchController {
  private readonly serviceMap: { [key: string]: PlatformServiceInterface };

  constructor(
    private readonly duffelService: DuffelService,
    private readonly bedsOnlineService: BedsOnlineService,
    private readonly sessionsService: SessionsService,
  ) {
    this.serviceMap = {
      duffel: this.duffelService,
      bedsonline: this.bedsOnlineService,
    };
  }

  @Post()
  async search(@Body() data: SearchProps) {
    try {
      const sessionId = await this.sessionsService.createSession();

      // Initialize an array to hold search results
      data.platforms.map((platform) => {
        const service = this.serviceMap[platform];
        return service.search(sessionId, data);
      });
      return { sessionId: sessionId };
    } catch (error) {
      console.error(error);
      return { error: "An error occurred during the search." };
    }
  }
}
