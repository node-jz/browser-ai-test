import { Controller, Get, Post, Param, Body } from "@nestjs/common";
import { PageService } from "./page.service";

@Controller("sessions/:sessionId/page")
export class PageController {
  constructor(private readonly pageService: PageService) {}

  @Get("forms")
  async getForms(@Param("sessionId") sessionId: string) {
    const forms = await this.pageService.getForms(sessionId);
    return { forms };
  }

  @Post("forms/fill")
  async fillForm(
    @Param("sessionId") sessionId: string,
    @Body("formSelector") formSelector: string,
    @Body("fields") fields: { [key: string]: string },
  ) {
    await this.pageService.fillFormFields(sessionId, formSelector, fields);
    return { status: "fieldsFilled" };
  }

  @Post("forms/submit")
  async submitForm(
    @Param("sessionId") sessionId: string,
    @Body("formSelector") formSelector: string,
  ) {
    await this.pageService.submitForm(sessionId, formSelector);
    return { status: "formSubmitted" };
  }

  @Post("element/click")
  async clickElement(
    @Param("sessionId") sessionId: string,
    @Body("selector") selector: string,
  ) {
    await this.pageService.clickElement(sessionId, selector);
    return { status: "elementClicked" };
  }

  @Post("element/select")
  async selectOption(
    @Param("sessionId") sessionId: string,
    @Body("selector") selector: string,
    @Body("value") value: string,
  ) {
    await this.pageService.selectOption(sessionId, selector, value);
    return { status: "optionSelected" };
  }

  @Post("execute")
  async executeScript(
    @Param("sessionId") sessionId: string,
    @Body("script") script: string,
  ) {
    const result = await this.pageService.executeScript(sessionId, script);
    return { result };
  }

  @Get("html")
  async getHtml(@Param("sessionId") sessionId: string) {
    const result = await this.pageService.getHtml(sessionId);
    return { html: result };
  }
}
