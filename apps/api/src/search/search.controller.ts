import { Body, Controller, Post } from "@nestjs/common";
import { SessionsService } from "src/browser/sessions/sessions.service";
import { EventsGateway } from "src/events/events.gateway";
import { DuffelService } from "src/search/platforms/duffel.service";

import { BedsOnlineService } from "./platforms/bedsonline.service";
import { BookingComService } from "./platforms/bookingcom.service";
import { ExpediaService } from "./platforms/expedia.service";
import { ForaService } from "./platforms/fora.service";
import { GoogleHotelsService } from "./platforms/googleHotels.service";
import { PlatformServiceInterface } from "./platforms/platform.interface";
import { PricelineService } from "./platforms/priceline.service";
import { TpiService } from "./platforms/tpi.service";
import { TravelEdgeService } from "./platforms/traveledge.service";
import { SearchProps } from "./platforms/types";
import { WebBedsService } from "./platforms/webbeds.service";

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
    private readonly bookingcomService: BookingComService,
    private readonly tpiService: TpiService,
    private readonly travelEdgeService: TravelEdgeService,
    private readonly pricelineService: PricelineService,
    private readonly googleHotelsService: GoogleHotelsService,
    private readonly eventsGateway: EventsGateway
  ) {
    this.serviceMap = {
      duffel: this.duffelService,
      bedsonline: this.bedsOnlineService,
      webbeds: this.webBedsService,
      fora: this.foraService,
      expedia: this.expediaService,
      bookingcom: this.bookingcomService,
      tpi: this.tpiService,
      traveledge: this.travelEdgeService,
      priceline: this.pricelineService,
      googleHotels: this.googleHotelsService,
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
