/*
https://docs.nestjs.com/modules
*/

import { Module } from "@nestjs/common";
import { BrowserModule } from "src/browser/browser.module";
import { EventsModule } from "src/events/events.module";
import { LlmModule } from "src/llm/llm.module";

import { BedsOnlineService } from "./platforms/bedsonline.service";
import { BookingComService } from "./platforms/bookingcom.service";
import { DuffelService } from "./platforms/duffel.service";
import { ExpediaService } from "./platforms/expedia.service";
import { ForaService } from "./platforms/fora.service";
import { GoogleHotelsService } from "./platforms/googleHotels.service";
import { PricelineService } from "./platforms/priceline.service";
import { TpiService } from "./platforms/tpi.service";
import { TravelEdgeService } from "./platforms/traveledge.service";
import { WebBedsService } from "./platforms/webbeds.service";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";

@Module({
  imports: [LlmModule, EventsModule, BrowserModule],
  controllers: [SearchController],
  providers: [
    SearchService,
    DuffelService,
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
  exports: [
    SearchService,
    DuffelService,
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
export class SearchModule {}
