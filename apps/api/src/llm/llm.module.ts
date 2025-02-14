/*
https://docs.nestjs.com/modules
*/

import { Module } from "@nestjs/common";

import { OpenAiService } from "./openai.service";

@Module({
  imports: [],
  controllers: [],
  providers: [OpenAiService],
  exports: [OpenAiService],
})
export class LlmModule {}
