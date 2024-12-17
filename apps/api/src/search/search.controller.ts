import { Body, Controller, Post } from "@nestjs/common";
import { EventsGateway } from "src/events/events.gateway";
import { DuffelService } from "src/search/platforms/duffel.service";
import { SessionsService } from "src/sessions/sessions/sessions.service";

import { BedsOnlineService } from "./platforms/bedsonline.service";
import { ForaService } from "./platforms/fora.service";
import { PlatformServiceInterface } from "./platforms/platform.interface";
import { SearchProps } from "./platforms/types";
import { WebBedsService } from "./platforms/webbeds.service";
import { ExpediaService } from "./platforms/expedia.service";

@Controller("search")
export class SearchController {
  private readonly serviceMap: { [key: string]: PlatformServiceInterface };

  constructor(
    private readonly duffelService: DuffelService,
    private readonly bedsOnlineService: BedsOnlineService,
    private readonly sessionsService: SessionsService,
    private readonly webBedsService: WebBedsService,
    private readonly foraService: ForaService,
    private readonly expediaService: ExpediaService,
    private readonly eventsGateway: EventsGateway,
  ) {
    this.serviceMap = {
      duffel: this.duffelService,
      bedsonline: this.bedsOnlineService,
      webbeds: this.webBedsService,
      fora: this.foraService,
      expedia: this.expediaService,
    };
  }

  @Post()
  async search(@Body() data: SearchProps) {
    const sessionId = await this.sessionsService.createSession();

    for (const platform of data.platforms) {
      const service = this.serviceMap[platform];
      service.search(sessionId, data);
    }
    return { sessionId: sessionId };
  }
}
