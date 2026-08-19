import { chromium, type Browser, type Page } from "playwright";
import type { BrowserAction, BrowserResult } from "@maestro-oss/shared";

interface PortalSession {
  browser: Browser;
  page: Page;
}

/** One headless Chromium page per browser-portal canvas node, created lazily. */
export class BrowserPortalManager {
  private sessions = new Map<string, PortalSession>();

  private async getSession(nodeId: string): Promise<PortalSession> {
    const existing = this.sessions.get(nodeId);
    if (existing) return existing;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const session = { browser, page };
    this.sessions.set(nodeId, session);
    return session;
  }

  async handleAction(nodeId: string, action: BrowserAction): Promise<BrowserResult> {
    try {
      const { page } = await this.getSession(nodeId);

      switch (action.kind) {
        case "navigate": {
          await page.goto(action.url, { waitUntil: "domcontentloaded" });
          break;
        }
        case "click": {
          await page.click(action.selector, { timeout: 10_000 });
          break;
        }
        case "type": {
          await page.fill(action.selector, action.text, { timeout: 10_000 });
          break;
        }
        case "readText": {
          const text = action.selector
            ? await page.textContent(action.selector)
            : await page.textContent("body");
          return { nodeId, action, text: text ?? "", url: page.url() };
        }
        case "screenshot":
          break;
      }

      const screenshot = await page.screenshot({ type: "png" });
      return {
        nodeId,
        action,
        screenshot: `data:image/png;base64,${screenshot.toString("base64")}`,
        url: page.url(),
      };
    } catch (err) {
      return { nodeId, action, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async closeAll(): Promise<void> {
    await Promise.all(
      [...this.sessions.values()].map((s) => s.browser.close().catch(() => {})),
    );
    this.sessions.clear();
  }
}
