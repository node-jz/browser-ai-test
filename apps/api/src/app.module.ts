import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { BrowserService } from "./browser/browser/browser.service";
import { EventsGateway } from "./events/events.gateway";
import { OpenAiService } from "./llm/openai.service";
import { NavigationController } from "./navigation/navigation.controller";
import { NavigationService } from "./navigation/navigation.service";
import { PageController } from "./page/page/page.controller";
import { PageService } from "./page/page/page.service";
import { ScrapeService } from "./page/page/scrape.service";
import { BedsOnlineService } from "./search/platforms/bedsonline.service";
import { BookingComService } from "./search/platforms/bookingcom.service";
import { DuffelService } from "./search/platforms/duffel.service";
import { ExpediaService } from "./search/platforms/expedia.service";
import { ForaService } from "./search/platforms/fora.service";
import { PricelineService } from "./search/platforms/priceline.service";
import { TpiService } from "./search/platforms/tpi.service";
import { TravelEdgeService } from "./search/platforms/traveledge.service";
import { WebBedsService } from "./search/platforms/webbeds.service";
import { SearchController } from "./search/search.controller";
import { SearchService } from "./search/search.service";
import { SessionsController } from "./sessions/sessions.controller";
import { SessionsService } from "./sessions/sessions/sessions.service";
import { GoogleHotelsService } from "./search/platforms/googleHotels.service";
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    EventEmitterModule.forRoot(),
  ],
  controllers: [
    SearchController,
    AppController,
    NavigationController,
    PageController,
    SessionsController,
  ],
  providers: [
    SearchService,
    DuffelService,
    ScrapeService,
    AppService,
    BrowserService,
    NavigationService,
    PageService,
    SessionsService,
    EventsGateway,
    OpenAiService,
    BedsOnlineService,
    WebBedsService,
    ForaService,
    ExpediaService,
    BookingComService,
    TravelEdgeService,
    TpiService,
    PricelineService,
    GoogleHotelsService,
  ],
})
export class AppModule {}
