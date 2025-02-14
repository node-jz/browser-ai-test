/*
https://docs.nestjs.com/modules
*/

import { forwardRef, Module } from "@nestjs/common";
import { EventsModule } from "src/events/events.module";

import { BrowserService } from "./browser.service";
import { NavigationController } from "./navigation/navigation.controller";
import { NavigationService } from "./navigation/navigation.service";
import { PageController } from "./page/page/page.controller";
import { PageService } from "./page/page/page.service";
import { ScrapeService } from "./page/page/scrape.service";
import { SessionsController } from "./sessions/sessions.controller";
import { SessionsService } from "./sessions/sessions.service";

@Module({
  imports: [forwardRef(() => EventsModule)],
  controllers: [SessionsController, PageController, NavigationController],
  providers: [
    ScrapeService,
    BrowserService,
    PageService,
    NavigationService,
    SessionsService,
  ],
  exports: [
    ScrapeService,
    BrowserService,
    PageService,
    NavigationService,
    SessionsService,
  ],
})
export class BrowserModule {}
