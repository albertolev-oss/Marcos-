import { chromium, type BrowserContext, type Page } from 'playwright';
import { DomainPolicy, assertSafeType, type DomElement } from '../../security/src/index.js';

export class ClinicalBrowser {
  context?: BrowserContext; page?: Page;
  constructor(private profile: string, private policy: DomainPolicy) {}
  async start() { this.context = await chromium.launchPersistentContext(this.profile, { headless: false, viewport: null }); this.page = this.context.pages()[0] ?? await this.context.newPage(); }
  async navigate(url: string) { this.policy.assertAllowed(url); await this.needPage().goto(url, {waitUntil:'domcontentloaded'}); }
  async safeDom(): Promise<DomElement[]> {
    return this.needPage().locator('input,button,a,select,textarea,table,[role]').evaluateAll(nodes => nodes.slice(0,200).map((n:any) => ({tag:n.tagName.toLowerCase(),role:n.getAttribute('role')||undefined,type:n.getAttribute('type')||undefined,name:(n.getAttribute('aria-label')||n.getAttribute('name')||'').slice(0,100),text:(n.innerText||'').replace(/\s+/g,' ').slice(0,160)})));
  }
  async type(selector: string, value: string) { const el = this.needPage().locator(selector).first(); assertSafeType({tag:await el.evaluate((n:any)=>n.tagName),type:await el.getAttribute('type')??undefined,name:await el.getAttribute('name')??undefined}); await el.fill(value); }
  async close() { await this.context?.close(); }
  private needPage() { if (!this.page) throw new Error('BROWSER_NOT_STARTED'); return this.page; }
}
