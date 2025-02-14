/*
https://docs.nestjs.com/modules
*/

import { forwardRef, Module } from "@nestjs/common";
import { BrowserModule } from "src/browser/browser.module";

import { EventsGateway } from "./events.gateway";

@Module({
  imports: [forwardRef(() => BrowserModule)],
  controllers: [],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}
