import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { BrowserService } from "./browser/browser/browser.service";
import { NavigationController } from "./navigation/navigation.controller";
import { NavigationService } from "./navigation/navigation.service";
import { PageService } from "./page/page/page.service";
import { PageController } from "./page/page/page.controller";
import { EventsGateway } from "./events/events.gateway";
import { SessionsController } from "./sessions/sessions.controller";
import { SessionsService } from "./sessions/sessions/sessions.service";

@Module({
  imports: [],
  controllers: [
    AppController,
    NavigationController,
    PageController,
    SessionsController,
  ],
  providers: [
    AppService,
    BrowserService,
    NavigationService,
    PageService,
    SessionsService,
    EventsGateway,
  ],
})
export class AppModule {}
