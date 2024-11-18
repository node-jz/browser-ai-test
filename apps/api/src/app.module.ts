import { SearchService } from "./search/search.service";
import { Module } from "@nestjs/common";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { BrowserService } from "./browser/browser/browser.service";
import { EventsGateway } from "./events/events.gateway";
import { NavigationController } from "./navigation/navigation.controller";
import { NavigationService } from "./navigation/navigation.service";
import { PageController } from "./page/page/page.controller";
import { PageService } from "./page/page/page.service";
import { ScrapeService } from "./page/page/scrape.service";
import { DuffelService } from "./search/platforms/duffel.service";
import { SearchController } from "./search/search.controller";
import { SessionsController } from "./sessions/sessions.controller";
import { SessionsService } from "./sessions/sessions/sessions.service";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ConfigModule } from "@nestjs/config";
import { OpenAiService } from "./llm/openai.service";
import { BedsOnlineService } from "./search/platforms/bedsonline.service";

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
  ],
})
export class AppModule {}
