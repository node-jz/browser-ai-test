/*
https://docs.nestjs.com/providers#services
*/

import { Injectable } from "@nestjs/common";

@Injectable()
export class ScrapeService {
  async scrapePage(
    page,
  ): Promise<{ text: string; links: { url: string; text: string }[] }> {
    const structuredText = await page.evaluate(() => {
      let markdown = "";

      // Define the patterns for ids and classes to ignore
      const ignoreTags = [
        "nav",
        "menu",
        "footer",
        "iframe",
        "script",
        "style",
        "noscript",
      ];
      const ignoreIdSubstrings = [
        "nav",
        "footer",
        "menu",
        "header",
        "cookies",
        "onetrust-consent-sdk",
      ];
      const ignoreClassSubstrings = [
        "nav",
        "footer",
        "menu",
        "header",
        "cookies",
      ];

      function shouldIgnoreElement(element: Element): boolean {
        const tagName = element.tagName.toLowerCase();

        if (ignoreTags.includes(tagName)) {
          return true;
        }

        const id = element.id?.toLowerCase();
        if (id) {
          for (const substring of ignoreIdSubstrings) {
            if (id.includes(substring)) {
              return true;
            }
          }
        }

        const className =
          typeof element.className === "string"
            ? element.className.toLowerCase()
            : null;
        if (className) {
          const regex = new RegExp(
            `\\b(${ignoreClassSubstrings.join("|")})\\b`,
            "i",
          );
          return regex.test(className);
        }

        return false;
      }

      function traverse(node: Node, inGroup = false): string {
        let content = "";
        if (
          node.nodeType !== Node.TEXT_NODE &&
          node.nodeType !== Node.ELEMENT_NODE
        ) {
          return content;
        }

        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent?.trim();
          if (text) {
            content += `${text} `;
          }
          return content.trim();
        }

        const element = node as HTMLElement;

        if (shouldIgnoreElement(element)) {
          return "";
        }

        const tagName = element.tagName.toLowerCase();

        if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tagName)) {
          const level = parseInt(tagName[1]);
          const prefix = "#".repeat(level);
          const textContent = getTextContent(element).trim();
          if (textContent) {
            content += `\n\n${prefix} ${textContent}\n`;
          }
        } else if (["b", "strong"].includes(tagName)) {
          const textContent = getTextContent(element).trim();
          if (textContent) {
            content += `**${textContent}** `;
          }
        } else if (tagName === "p") {
          const paragraphContent = getTextContent(element).trim();
          if (paragraphContent) {
            content += `${paragraphContent}\n`;
          }
        } else if (["div", "section"].includes(tagName)) {
          const groupContent = traverseGroup(element);
          if (groupContent.length > 1) {
            content += groupContent + "\n\n";
          }
        } else {
          element.childNodes.forEach((child) => {
            content += traverse(child, inGroup);
          });
        }
        return content;
      }

      function traverseGroup(groupElement: HTMLElement): string {
        let content = "";
        groupElement.childNodes.forEach((child) => {
          content += traverse(child, true); // Process children in group mode
        });
        return content;
      }

      function getTextContent(element: HTMLElement): string {
        const texts: string[] = [];
        element.childNodes.forEach((child) => {
          if (child.nodeType === Node.TEXT_NODE) {
            const text = child.textContent?.trim();
            if (text) {
              texts.push(text);
            }
          } else if (child.nodeType === Node.ELEMENT_NODE) {
            const childElement = child as HTMLElement;
            if (shouldIgnoreElement(childElement)) {
              return;
            }
            const childText = getTextContent(childElement);
            if (childText) {
              texts.push(childText);
            }
          }
        });
        return texts.join(" ").trim();
      }

      markdown = traverse(document.body).trim();
      markdown = markdown.replace(/\n{3,}/g, "\n\n");

      return markdown;
    });

    // Get all of the available links on the page
    const links = await page.$$eval("a", (anchors) => {
      const uniqueLinks = new Set<string>();

      return anchors
        .filter((a) => {
          const href = a.href;
          if (href.startsWith("http") && !uniqueLinks.has(href)) {
            uniqueLinks.add(href);
            return true;
          }
          return false;
        })
        .map((a) => ({
          url: a.href,
          text: a.textContent?.trim() || "",
        }));
    });
    return { text: structuredText.trim(), links };
  }
}
