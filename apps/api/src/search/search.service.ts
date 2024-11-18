/*
https://docs.nestjs.com/providers#services
*/

import { Injectable } from "@nestjs/common";
import { OpenAiService } from "src/llm/openai.service";
import { SearchResult } from "./platforms/types";

@Injectable()
export class SearchService {
  constructor(private readonly openaiService: OpenAiService) {}
  async findMatchWithLLM(
    results: SearchResult[],
    name: string,
    address: string,
  ): Promise<SearchResult | null> {
    let match = results.find((result) => result.name === name);
    if (!match) {
      const systemPrompt = `I need you to search a list of hotels and their ID number, and tell which ID number matches exactly or most closely to a hotel I am looking for [QUERY]. 
            [LIST]
            ${results.map((result, i) => `id: ${i}  name:${result.name}   address:${result.address}`).join("\n")}
            [OUTPUT] return the best option or NULL if you dont believe the hotel is in the list, using JSON that matches the type {id: int | null, name: string | null} where null would be if no close match exists.`;
      const userPrompt = `[QUERY] name: ${name}  address: ${address}`;

      const llmResult = await this.openaiService.completion({
        systemPrompt,
        userPrompt,
        model: "gpt-4o-2024-08-06",
        json: true,
      });
      const choice = JSON.parse(llmResult.content) as {
        id: number | null;
        name: string | null;
      };
      match = choice.id !== null ? results[choice.id] : null;
    }
    return match;
  }
}
