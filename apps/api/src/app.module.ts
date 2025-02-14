import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { BrowserModule } from "./browser/browser.module";
import { EventsModule } from "./events/events.module";
import { LlmModule } from "./llm/llm.module";
import { SearchModule } from "./search/search.module";

@Module({
  imports: [
    BrowserModule,
    EventsModule,
    LlmModule,
    SearchModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    EventEmitterModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService],
  exports: [],
})
export class AppModule {}
