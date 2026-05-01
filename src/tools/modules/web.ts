import { chromium } from "playwright";
import TurndownService from "turndown";
import type { Tool } from "../registry.js";

export const webTools: Tool[] = [
  {
    name: "browser_search",
    category: "web",
    description: "Search the web for information using a search engine.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "The search query" } },
      required: ["query"]
    },
    execute: async (input) => {
      const { query } = input;
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      try {
        await page.goto(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
        const results = await page.$$eval('.result', (elements) => {
          return elements.slice(0, 5).map(el => {
            const title = el.querySelector('.result__a')?.textContent || "";
            const link = el.querySelector('.result__a')?.getAttribute('href') || "";
            const snippet = el.querySelector('.result__snippet')?.textContent || "";
            return `Title: ${title}\nURL: ${link}\nSnippet: ${snippet}\n`;
          });
        });
        return results.length > 0 ? results.join("\n---\n") : "No search results found.";
      } finally {
        await browser.close();
      }
    }
  },
  {
    name: "browser_read",
    category: "web",
    description: "Read the content of a specific web page. Returns markdown.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: { url: { type: "string", description: "The URL of the page" } },
      required: ["url"]
    },
    execute: async (input) => {
      const { url } = input;
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      const turndown = new TurndownService();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const html = await page.content();
        return turndown.turndown(html).slice(0, 20000);
      } finally {
        await browser.close();
      }
    }
  }
];
