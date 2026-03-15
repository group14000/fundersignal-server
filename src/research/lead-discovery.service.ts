import { Injectable, Logger } from '@nestjs/common';
import { OpenrouterService } from '../openrouter/openrouter.service';
import { PrismaService } from '../prisma/prisma.service';
import { MarketSignalService, MarketSignal } from './market-signal.service';
import { SearchOrchestratorService } from './search-orchestrator.service';
import { ScraperService } from './scraper.service';

export interface DiscoveredLead {
  company: string;
  industry?: string;
  role?: string;
  website?: string;
}

export interface LeadDiscoveryResult {
  ideaId: string;
  leads: DiscoveredLead[];
  storedCount: number;
  usedQueries: string[];
  fallbackUsed: boolean;
}

interface ParsedLeadResponse {
  leads: DiscoveredLead[];
}

@Injectable()
export class LeadDiscoveryService {
  private readonly logger = new Logger(LeadDiscoveryService.name);

  private readonly PRIMARY_MODEL = 'z-ai/glm-4.5-air:free';
  private readonly FALLBACK_MODEL = 'stepfun/step-3.5-flash:free';
  private readonly MAX_SIGNAL_QUERIES = 8;
  private readonly MAX_SCRAPED_ENTRIES = 10;
  private readonly MAX_CONTENT_CHARS = 1500;

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketSignalService: MarketSignalService,
    private readonly searchOrchestrator: SearchOrchestratorService,
    private readonly scraperService: ScraperService,
    private readonly openrouter: OpenrouterService,
  ) {}

  /**
   * Discovers potential leads from market signals and stores them.
   * Any failure is contained and returns an empty result so pipeline execution continues.
   */
  async discoverLeads(ideaId: string): Promise<LeadDiscoveryResult> {
    this.logger.log(`Starting lead discovery for idea ${ideaId}`);

    try {
      const signals = await this.getOrCreateSignals(ideaId);
      const usedQueries = this.buildQueriesFromSignals(signals);

      if (usedQueries.length === 0) {
        this.logger.warn(
          `No market signal queries available for idea ${ideaId}`,
        );
        return {
          ideaId,
          leads: [],
          storedCount: 0,
          usedQueries: [],
          fallbackUsed: true,
        };
      }

      const searchResults =
        await this.searchOrchestrator.orchestrateSearch(usedQueries);

      const scraped = await this.scraperService.scrapeMultiple(
        searchResults.slice(0, this.MAX_SCRAPED_ENTRIES),
      );

      const dataset = scraped.map((item) => {
        const title = item.title?.trim() || 'Untitled';
        const content = item.content.slice(0, this.MAX_CONTENT_CHARS);
        return `TITLE: ${title}\nSOURCE: ${item.source}\nURL: ${item.url}\nCONTENT: ${content}`;
      });

      const leads = await this.extractLeadsWithFallback(dataset, usedQueries);
      const deduped = this.dedupeLeads(leads);
      const storedCount = await this.storeLeads(ideaId, deduped);

      this.logger.log(
        `Lead discovery complete for ${ideaId}: ${storedCount} leads stored`,
      );

      return {
        ideaId,
        leads: deduped,
        storedCount,
        usedQueries,
        fallbackUsed: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Lead discovery failed for idea ${ideaId} (${message}); continuing with empty lead set`,
      );

      return {
        ideaId,
        leads: [],
        storedCount: 0,
        usedQueries: [],
        fallbackUsed: true,
      };
    }
  }

  private async getOrCreateSignals(ideaId: string): Promise<MarketSignal[]> {
    const existing = await this.prisma.marketSignals.findUnique({
      where: { idea_id: ideaId },
      select: { signals: true },
    });

    if (existing?.signals) {
      try {
        const parsed = JSON.parse(existing.signals) as MarketSignal[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {
        this.logger.warn(
          `Invalid stored market signals JSON for idea ${ideaId}; regenerating`,
        );
      }
    }

    const detected = await this.marketSignalService.detectSignals(ideaId);
    return detected.signals;
  }

  private buildQueriesFromSignals(signals: MarketSignal[]): string[] {
    const queries = signals
      .map((signal) => signal.description?.trim())
      .filter((text): text is string => Boolean(text))
      .slice(0, this.MAX_SIGNAL_QUERIES)
      .flatMap((description) => [
        `${description} company`,
        `${description} startup`,
        `${description} clinic owner`,
      ]);

    return Array.from(new Set(queries)).slice(0, this.MAX_SIGNAL_QUERIES);
  }

  private async extractLeadsWithFallback(
    dataset: string[],
    usedQueries: string[],
  ): Promise<DiscoveredLead[]> {
    const prompt = this.buildLeadExtractionPrompt(dataset, usedQueries);

    try {
      const response = await this.openrouter.sendPrompt(
        prompt,
        this.PRIMARY_MODEL,
      );
      return this.parseLeadResponse(response).leads;
    } catch (primaryError) {
      const primaryMessage =
        primaryError instanceof Error
          ? primaryError.message
          : String(primaryError);
      this.logger.warn(
        `Primary lead extraction model failed (${primaryMessage}), retrying fallback model`,
      );

      const fallbackResponse = await this.openrouter.sendPrompt(
        prompt,
        this.FALLBACK_MODEL,
      );
      return this.parseLeadResponse(fallbackResponse).leads;
    }
  }

  private buildLeadExtractionPrompt(
    dataset: string[],
    queries: string[],
  ): string {
    const queryBlock = queries.length ? queries.join(', ') : '(none)';
    const dataBlock = dataset.length
      ? dataset.map((entry, idx) => `[${idx + 1}] ${entry}`).join('\n\n')
      : '(No scraped company text available)';

    return `You are a startup lead discovery analyst.

You are given research text collected from web sources using these market-signal queries:
${queryBlock}

Your task:
- Identify potential leads (companies, organizations, or professionals) relevant to these signals.
- Extract company name, industry, role/title, and website when present.
- Only include realistic and text-supported leads.

RESEARCH TEXT:
${dataBlock}

Return ONLY valid JSON in this exact format:
{
  "leads": [
    {
      "company": "string",
      "industry": "string",
      "role": "string",
      "website": "https://example.com"
    }
  ]
}

Rules:
- Return at most 15 leads.
- Do not invent websites.
- If a field is unavailable, use an empty string.`;
  }

  private parseLeadResponse(rawResponse: string): ParsedLeadResponse {
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in lead extraction response');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error('Malformed JSON in lead extraction response');
    }

    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj.leads)) {
      throw new Error('Lead response missing leads[] array');
    }

    const leads = (obj.leads as unknown[])
      .map((item) => item as Record<string, unknown>)
      .filter((item) => typeof item?.company === 'string')
      .map((item) => ({
        company: String(item.company || '').trim(),
        industry: String(item.industry || '').trim() || undefined,
        role: String(item.role || '').trim() || undefined,
        website: this.normalizeWebsite(String(item.website || '').trim()),
      }))
      .filter((lead) => lead.company.length > 0)
      .slice(0, 15);

    return { leads };
  }

  private normalizeWebsite(raw: string): string | undefined {
    if (!raw) return undefined;
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    if (raw.includes('.')) return `https://${raw}`;
    return undefined;
  }

  private dedupeLeads(leads: DiscoveredLead[]): DiscoveredLead[] {
    const seen = new Set<string>();
    const output: DiscoveredLead[] = [];

    for (const lead of leads) {
      const key = `${lead.company.toLowerCase()}|${(lead.website || '').toLowerCase()}|${(lead.role || '').toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(lead);
    }

    return output;
  }

  private async storeLeads(
    ideaId: string,
    leads: DiscoveredLead[],
  ): Promise<number> {
    if (leads.length === 0) {
      await this.prisma.lead.deleteMany({ where: { idea_id: ideaId } });
      return 0;
    }

    await this.prisma.$transaction([
      this.prisma.lead.deleteMany({ where: { idea_id: ideaId } }),
      this.prisma.lead.createMany({
        data: leads.map((lead) => ({
          idea_id: ideaId,
          company: lead.company,
          industry: lead.industry,
          role: lead.role,
          website: lead.website,
        })),
      }),
    ]);

    return leads.length;
  }
}
