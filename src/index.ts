#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Types for Entscheidsuche API responses
interface SearchResult {
  hits: {
    total: { value: number };
    hits: Array<{
      _index: string;
      _id: string;
      _score: number | null;
      _source: {
        date: string;
        hierarchy: string[];
        abstract: {
          de: string;
          fr: string;
          it: string;
        };
        source: string;
        title: {
          de: string;
          fr: string;
          it: string;
        };
        reference: string[];
        attachment: {
          content_type: string;
          language: string;
          content_url: string;
          source: string;
          content: string;
          content_length: number;
        };
        meta: {
          de: string;
          fr: string;
          it: string;
        };
        scrapedate: string;
        canton: string;
        id: string;
      };
    }>;
  };
}

interface CourtStatus {
  name: string;
  total_documents: number;
  new_documents: number;
  last_run: string;
  status: string;
}

class EntscheidungsucheClient {
  private readonly baseUrl = "https://entscheidsuche.ch";
  private readonly searchEndpoint = "https://entscheidsuche.ch/_search.php";

  // Extract spider from signature (e.g., "CH_BGer_005_5F-23-2025_2025-07-01" -> "CH_BGer")
  extractSpiderFromSignature(signature: string): string {
    const parts = signature.split('_');
    if (parts.length >= 2) {
      return `${parts[0]}_${parts[1]}`;
    }
    return signature; // fallback
  }

  async searchCases(query: string, size: number = 10, from: number = 0): Promise<SearchResult> {
    const searchBody = {
      query: {
        simple_query_string: {
          query: query,
          default_operator: "and"
        }
      },
      size,
      from,
      sort: [{ date: { order: "desc" } }]
    };

    const response = await fetch(this.searchEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(searchBody)
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async getDocument(path: string): Promise<string> {
    const url = `${this.baseUrl}/docs/${path}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Document not found: ${response.status} ${response.statusText}`);
    }

    return await response.text();
  }

  async getDocumentFromUrl(url: string): Promise<string> {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Document not found: ${response.status} ${response.statusText}`);
    }

    return await response.text();
  }

  async findDocumentBySignature(signature: string): Promise<{content_url: string, spider: string} | null> {
    // Search for the document by its signature to get the correct URL
    const searchBody = {
      query: {
        term: {
          "_id": signature
        }
      },
      size: 1
    };

    const response = await fetch(this.searchEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(searchBody)
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();
    if (result.hits.hits.length === 0) {
      return null;
    }

    const hit = result.hits.hits[0];
    const source = hit._source;
    
    return {
      content_url: source.attachment.content_url,
      spider: source.hierarchy[1] || source.canton
    };
  }

  async getDocumentJson(signature: string, spider: string, contentUrl?: string): Promise<any> {
    // Try to get JSON metadata from the content URL directory structure
    let url: string;
    
    if (contentUrl) {
      // Extract the directory from the content URL and construct JSON path
      const urlParts = contentUrl.split('/');
      const directoryIndex = urlParts.indexOf('docs');
      if (directoryIndex !== -1 && directoryIndex + 1 < urlParts.length) {
        const directory = urlParts[directoryIndex + 1];
        url = `${this.baseUrl}/docs/${directory}/${signature}.json`;
      } else {
        url = `${this.baseUrl}/docs/${spider}/${signature}.json`;
      }
    } else {
      url = `${this.baseUrl}/docs/${spider}/${signature}.json`;
    }
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Document metadata not found: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async getCourtStatus(): Promise<CourtStatus[]> {
    // This would need to be implemented by scraping the status page
    // For now, return a mock response
    return [
      {
        name: "Bundesgericht",
        total_documents: 15000,
        new_documents: 45,
        last_run: "2024-01-15",
        status: "Komplett gelesen"
      }
    ];
  }
}

// Create the MCP server
const server = new McpServer({
  name: "entscheidsuche-server",
  version: "1.0.0"
});

const client = new EntscheidungsucheClient();

// Tool: Search case law
server.registerTool(
  "search_case_law",
  {
    title: "Search Swiss Case Law",
    description: "Search for Swiss court decisions using Entscheidsuche database",
    inputSchema: {
      query: z.string().describe("Search query for legal cases"),
      size: z.number().optional().default(10).describe("Number of results to return (max 50)"),
      from: z.number().optional().default(0).describe("Starting position for pagination")
    }
  },
  async ({ query, size = 10, from = 0 }) => {
    try {
      // Limit size to prevent abuse
      const limitedSize = Math.min(size, 50);
      
      const results = await client.searchCases(query, limitedSize, from);
      
      const formattedResults = results.hits.hits.map(hit => {
        const source = hit._source;
        return {
          signature: hit._id,
          court: source.hierarchy[1] || source.canton,
          language: source.attachment.language,
          date: source.date,
          case_number: source.reference[0] || '',
          title_de: source.title.de,
          title_fr: source.title.fr,
          title_it: source.title.it,
          abstract_de: source.abstract?.de || '',
          abstract_fr: source.abstract?.fr || '',
          abstract_it: source.abstract?.it || '',
          has_html: !!source.attachment.content_url,
          has_pdf: false, // PDF availability not indicated in new structure
          document_url: source.attachment.content_url,
          scrapedate: source.scrapedate
        };
      });

      const summary = `Found ${results.hits.total.value} total cases matching "${query}". Showing ${formattedResults.length} results starting from position ${from}.`;
      
      return {
        content: [
          {
            type: "text",
            text: `${summary}\n\n${JSON.stringify(formattedResults, null, 2)}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching case law: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: Get document content
server.registerTool(
  "get_document",
  {
    title: "Get Legal Document Content",
    description: "Retrieve the full content of a specific legal document",
    inputSchema: {
      signature: z.string().describe("Document signature (e.g., CH_BGer_005_5F-23-2025_2025-07-01)"),
      spider: z.string().optional().describe("Court/spider name (e.g., CH_BGer). If not provided, will be extracted from signature"),
      format: z.enum(["json", "html", "pdf"]).optional().default("json").describe("Document format to retrieve")
    }
  },
  async ({ signature, spider, format = "json" }) => {
    try {
      // First try to find the document via search to get the correct URL
      const docInfo = await client.findDocumentBySignature(signature);
      
      if (format === "json") {
        // For JSON format, use the spider from search results or fallback to provided/extracted spider
        const actualSpider = docInfo?.spider || spider || client.extractSpiderFromSignature(signature);
        const doc = await client.getDocumentJson(signature, actualSpider, docInfo?.content_url);
        return {
          content: [
            {
              type: "text",
              text: `Document metadata for ${signature}:\n\n${JSON.stringify(doc, null, 2)}`
            }
          ]
        };
      } else {
        // For HTML/PDF, prefer the exact URL from search results
        if (docInfo && format === "html") {
          const content = await client.getDocumentFromUrl(docInfo.content_url);
          return {
            content: [
              {
                type: "text",
                text: `Document content (${format}):\n\n${content.substring(0, 5000)}${content.length > 5000 ? '\n\n... (truncated)' : ''}`
              }
            ]
          };
        } else {
          // Fallback to constructed path
          const actualSpider = docInfo?.spider || spider || client.extractSpiderFromSignature(signature);
          const path = `${actualSpider}/${signature}.${format}`;
          const content = await client.getDocument(path);
          return {
            content: [
              {
                type: "text",
                text: `Document content (${format}):\n\n${content.substring(0, 5000)}${content.length > 5000 ? '\n\n... (truncated)' : ''}`
              }
            ]
          };
        }
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving document: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: List courts and scrapers
server.registerTool(
  "list_courts",
  {
    title: "List Available Courts",
    description: "Get information about available courts and their document counts",
    inputSchema: {}
  },
  async () => {
    try {
      const courts = await client.getCourtStatus();
      return {
        content: [
          {
            type: "text",
            text: `Available Courts:\n\n${JSON.stringify(courts, null, 2)}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving court information: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Resource: Court status
server.registerResource(
  "court-status",
  "entscheidsuche://courts/status",
  {
    title: "Court Status Information",
    description: "Current status of all courts and scrapers",
    mimeType: "application/json"
  },
  async (uri) => {
    try {
      const courts = await client.getCourtStatus();
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(courts, null, 2),
          mimeType: "application/json"
        }]
      };
    } catch (error) {
      return {
        contents: [{
          uri: uri.href,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          mimeType: "text/plain"
        }]
      };
    }
  }
);

// Prompt: Legal research template
server.registerPrompt(
  "legal_research",
  {
    title: "Legal Research Assistant",
    description: "Template for conducting legal research with case law search",
    argsSchema: {
      topic: z.string().describe("Legal topic or question to research"),
      jurisdiction: z.string().optional().describe("Specific jurisdiction or court"),
      keywords: z.string().optional().describe("Additional keywords for search")
    }
  },
  ({ topic, jurisdiction, keywords }) => {
    const searchQuery = [topic, jurisdiction, keywords].filter(Boolean).join(" ");
    
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please help me research the following legal topic: "${topic}"

${jurisdiction ? `Focus on jurisdiction: ${jurisdiction}` : ''}
${keywords ? `Additional keywords: ${keywords}` : ''}

Please search for relevant case law and provide an analysis of the key legal principles, precedents, and trends. Structure your response to include:

1. Overview of the legal issue
2. Key cases and their holdings
3. Analysis of trends or developments
4. Practical implications

Use the search_case_law tool to find relevant cases with this query: "${searchQuery}"`
          }
        }
      ]
    };
  }
);

// Prompt: Case analysis template
server.registerPrompt(
  "case_analysis",
  {
    title: "Case Law Analysis",
    description: "Template for analyzing specific legal cases",
    argsSchema: {
      signature: z.string().describe("Case signature to analyze (e.g., CH_BGer_005_5F-23-2025_2025-07-01)"),
      spider: z.string().optional().describe("Court/spider name (e.g., CH_BGer). If not provided, will be extracted from signature"),
      focus: z.string().optional().describe("Specific aspect to focus on")
    }
  },
  ({ signature, spider, focus }) => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please analyze the legal case with signature "${signature}"${spider ? ` from ${spider}` : ''}.

${focus ? `Please focus particularly on: ${focus}` : ''}

Use the get_document tool to retrieve the case details and provide a comprehensive analysis including:

1. Case summary and key facts
2. Legal issues presented
3. Court's reasoning and holding
4. Significance and implications
5. Related precedents or legal principles

Please start by retrieving the case metadata and content.`
          }
        }
      ]
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Entscheidsuche MCP server running on stdio");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
  });
}