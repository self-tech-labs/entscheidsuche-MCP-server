import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";
import { setTimeout } from "timers/promises";

// Constants
const API_BASE_URL = "https://entscheidsuche.ch";
const SEARCH_ENDPOINT = "/_search.php";
const ELASTIC_ENDPOINT = "https://entscheidsuche.pansoft.de:9200/entscheidsuche-*/_search";
const DOCS_BASE_URL = `${API_BASE_URL}/docs`;
const STATUS_URL = `${API_BASE_URL}/status`;

// Rate limiting constants
const REQUEST_DELAY_MS = 500; // Be kind to their server with a 500ms delay between requests

// Create the MCP server
const server = new McpServer({
  name: "entscheidsuche-swiss-legal-server",
  version: "1.0.0",
});

// Utility function to handle rate limiting
async function rateLimitedFetch(url: string, options: any = {}) {
  try {
    await setTimeout(REQUEST_DELAY_MS); // Add delay to be kind to their server
    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status} for URL: ${url}`);
    }
    
    return response;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    throw error;
  }
}

// Utility function to parse JSON safely
async function safeJsonParse(response: Response) {
  try {
    return await response.json();
  } catch (error) {
    console.error("Error parsing JSON:", error);
    return null;
  }
}

// Format document metadata for display
function formatDocumentMetadata(doc: any) {
  try {
    const metadata = {
      signature: doc.Signatur || "Unknown",
      caseNumber: doc.Num || "Unknown",
      date: doc.Datum || "Unknown",
      court: doc.Meta?.DE || doc.Kopfzeile?.DE || "Unknown",
      language: doc.Sprache || "Unknown",
      abstract: doc.Abstract?.DE || doc.Abstract?.FR || doc.Abstract?.IT || "",
      pdfUrl: doc.PDFFile ? `${DOCS_BASE_URL}/${doc.PDFFile}` : null,
      htmlUrl: doc.HTMLFile ? `${DOCS_BASE_URL}/${doc.HTMLFile}` : null,
      originalUrl: doc.OriginalURL || null,
    };
    
    return metadata;
  } catch (error) {
    console.error("Error formatting document metadata:", error);
    return { error: "Could not parse document metadata" };
  }
}

// Helper to format Elasticsearch results
function formatSearchResults(results: any) {
  if (!results || !results.hits || !results.hits.hits) {
    return "No results found.";
  }
  
  const totalHits = results.hits.total?.value || 0;
  const formattedResults = results.hits.hits.map((hit: any) => {
    const source = hit._source;
    return formatDocumentMetadata(source);
  });
  
  return {
    totalResults: totalHits,
    results: formattedResults,
  };
}

// ===== RESOURCES =====

// Resource for listing all available scrapers/collections
server.resource(
  "scrapers-list",
  "entscheidsuche://scrapers",
  async (uri) => {
    const response = await rateLimitedFetch(`${API_BASE_URL}/status`);
    const html = await response.text();
    
    // Extract scraper information from HTML (simplified - in production use a proper HTML parser)
    const scraperMatches = html.match(/\/docs\/Index\/([A-Z0-9_]+)\/last/g) || [];
    const scrapers = scraperMatches.map(match => match.split('/')[3]);
    
    return {
      contents: [{
        uri: uri.href,
        text: JSON.stringify({
          scrapers,
          note: "For details about each scraper, query the scraper-details resource.",
          statusPageUrl: STATUS_URL
        }, null, 2)
      }]
    };
  }
);

// Resource for getting details about a specific scraper
server.resource(
  "scraper-details",
  new ResourceTemplate("entscheidsuche://scraper/{scraperId}", { list: undefined }),
  async (uri, { scraperId }) => {
    // Fetch the last index file
    const indexUrl = `${DOCS_BASE_URL}/Index/${scraperId}/last`;
    const response = await rateLimitedFetch(indexUrl);
    const indexData = await safeJsonParse(response);
    
    return {
      contents: [{
        uri: uri.href,
        text: JSON.stringify({
          scraperId,
          lastRunDate: indexData?.Zeit || "Unknown",
          documentCount: indexData?.Dokumente?.length || 0,
          jobType: indexData?.Jobtyp || "Unknown",
          details: indexData || "No data available",
          indexUrl,
          documentsUrl: `${DOCS_BASE_URL}/${scraperId}/`
        }, null, 2)
      }]
    };
  }
);

// Resource for accessing a specific document by signature
server.resource(
  "document-metadata",
  new ResourceTemplate("entscheidsuche://document/{documentId}", { list: undefined }),
  async (uri, { documentId }) => {
    try {
      // Fetch document metadata JSON
      const documentUrl = `${DOCS_BASE_URL}/${documentId}.json`;
      const response = await rateLimitedFetch(documentUrl);
      const documentData = await safeJsonParse(response);
      
      if (!documentData) {
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({ error: `Document ${documentId} not found.` }, null, 2)
          }]
        };
      }
      
      const metadata = formatDocumentMetadata(documentData);
      
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(metadata, null, 2)
        }]
      };
    } catch (error) {
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({ error: `Error fetching document ${documentId}: ${error}` }, null, 2)
        }]
      };
    }
  }
);

// ===== TOOLS =====

// Tool for searching court decisions
server.tool(
  "search-decisions",
  "Search for court decisions using Elasticsearch query syntax",
  {
    query: z.string().describe("Elasticsearch query string (e.g., 'copyright AND music')"),
    size: z.number().min(1).max(100).default(10).describe("Number of results to return (1-100)"),
    from: z.number().min(0).default(0).describe("Starting index for pagination"),
    sort: z.string().optional().describe("Optional sort field and direction (e.g., 'Datum:desc')"),
  },
  async ({ query, size, from, sort }) => {
    try {
      // Construct Elasticsearch query
      const esQuery = {
        query: {
          query_string: {
            query: query
          }
        },
        size,
        from,
      };
      
      if (sort) {
        const [field, direction] = sort.split(':');
        esQuery["sort"] = [{ [field]: { order: direction || 'desc' } }];
      }
      
      // Make the search request
      const response = await rateLimitedFetch(ELASTIC_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(esQuery)
      });
      
      const searchResults = await safeJsonParse(response);
      const formattedResults = formatSearchResults(searchResults);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(formattedResults, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error performing search: ${error}`
        }],
        isError: true
      };
    }
  }
);

// Tool for getting document content (text/html/pdf)
server.tool(
  "get-document-content",
  "Retrieve the content of a specific document",
  {
    documentId: z.string().describe("Document ID/signature"),
    format: z.enum(["text", "html"]).default("text").describe("Content format to retrieve (text or html)")
  },
  async ({ documentId, format }) => {
    try {
      // First get the document metadata to know what files are available
      const metadataUrl = `${DOCS_BASE_URL}/${documentId}.json`;
      const metadataResponse = await rateLimitedFetch(metadataUrl);
      const metadata = await safeJsonParse(metadataResponse);
      
      if (!metadata) {
        return {
          content: [{
            type: "text",
            text: `Document ${documentId} not found.`
          }],
          isError: true
        };
      }
      
      let contentUrl;
      let contentType;
      
      if (format === "html" && metadata.HTMLFile) {
        contentUrl = `${DOCS_BASE_URL}/${metadata.HTMLFile}`;
        contentType = "HTML";
      } else {
        // If HTML is not available or text format is requested, use the JSON metadata
        // This simulates text extraction from the document
        contentUrl = metadataUrl;
        contentType = "Metadata";
      }
      
      const contentResponse = await rateLimitedFetch(contentUrl);
      let content;
      
      if (contentType === "HTML") {
        content = await contentResponse.text();
        // Here you could add additional processing to clean up the HTML if needed
      } else {
        // For text format, just return formatted metadata
        content = JSON.stringify(formatDocumentMetadata(metadata), null, 2);
      }
      
      return {
        content: [{
          type: "text",
          text: content
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error retrieving document content: ${error}`
        }],
        isError: true
      };
    }
  }
);

// Tool for listing courts by canton
server.tool(
  "list-courts",
  "List available courts by canton",
  {
    canton: z.string().optional().describe("Optional two-letter canton code (e.g., 'ZH' for Zürich, 'BE' for Bern)")
  },
  async ({ canton }) => {
    try {
      // Fetch status page which contains information about courts
      const response = await rateLimitedFetch(STATUS_URL);
      const html = await response.text();
      
      // In a real implementation, properly parse the HTML to extract court information
      // This is a simplified version
      const cantonPattern = canton ? 
        new RegExp(`${canton}[^<]*?</a>.*?<ul>(.*?)</ul>`, 's') :
        /<h3>.*?<a[^>]*>(.*?)<\/a>.*?<ul>(.*?)<\/ul>/g;
      
      let courts = {};
      
      if (canton) {
        const match = html.match(cantonPattern);
        if (match) {
          const courtMatches = match[1].match(/<li>(.*?)<\/li>/g) || [];
          courts[canton] = courtMatches.map(m => m.replace(/<[^>]*>/g, '').trim());
        }
      } else {
        let match;
        const fullPattern = /<h3>.*?<a[^>]*>(.*?)<\/a>.*?<ul>(.*?)<\/ul>/gs;
        while ((match = fullPattern.exec(html)) !== null) {
          const cantonName = match[1].trim();
          const courtMatches = match[2].match(/<li>(.*?)<\/li>/g) || [];
          courts[cantonName] = courtMatches.map(m => m.replace(/<[^>]*>/g, '').trim());
        }
      }
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(courts, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error listing courts: ${error}`
        }],
        isError: true
      };
    }
  }
);

// Tool for getting document URLs
server.tool(
  "get-document-urls",
  "Get direct URLs for a document's PDF and HTML versions",
  {
    documentId: z.string().describe("Document ID/signature")
  },
  async ({ documentId }) => {
    try {
      const metadataUrl = `${DOCS_BASE_URL}/${documentId}.json`;
      const response = await rateLimitedFetch(metadataUrl);
      const metadata = await safeJsonParse(response);
      
      if (!metadata) {
        return {
          content: [{
            type: "text",
            text: `Document ${documentId} not found.`
          }],
          isError: true
        };
      }
      
      const urls = {
        documentId,
        pdfUrl: metadata.PDFFile ? `${DOCS_BASE_URL}/${metadata.PDFFile}` : null,
        htmlUrl: metadata.HTMLFile ? `${DOCS_BASE_URL}/${metadata.HTMLFile}` : null,
        originalUrl: metadata.OriginalURL || null,
        jsonUrl: metadataUrl
      };
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(urls, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error getting document URLs: ${error}`
        }],
        isError: true
      };
    }
  }
);

// ===== PROMPTS =====

// Prompt for searching precedents on a legal topic
server.prompt(
  "search-legal-precedents",
  "Find relevant precedents on a specific legal topic",
  {
    topic: z.string().describe("Legal topic or keywords to search for"),
    jurisdiction: z.string().optional().describe("Optional: Canton code or court to restrict search")
  },
  ({ topic, jurisdiction }) => {
    let queryString = topic;
    
    if (jurisdiction) {
      queryString = `(${topic}) AND (${jurisdiction})`;
    }
    
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please search for relevant Swiss legal precedents about "${topic}"${jurisdiction ? ` in jurisdiction ${jurisdiction}` : ""} and analyze the most significant findings. For each relevant case, provide a summary of the facts, the legal reasoning, and the outcome.`
          }
        }
      ]
    };
  }
);

// Prompt for comparing legal rulings across jurisdictions
server.prompt(
  "compare-jurisdictions",
  "Compare rulings on a specific legal issue across different cantons",
  {
    legalIssue: z.string().describe("Legal issue to compare"),
    cantons: z.string().describe("Comma-separated list of canton codes to compare (e.g., 'ZH,BE,GE')")
  },
  ({ legalIssue, cantons }) => {
    const cantonList = cantons.split(',').map(c => c.trim()).join('", "');
    
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `I'd like to understand how different Swiss cantons have ruled on the issue of "${legalIssue}". Please search for relevant court decisions in these cantons: "${cantonList}". Then compare and contrast the approaches, highlighting any significant differences in legal interpretation or application.`
          }
        }
      ]
    };
  }
);

// Prompt for retrieving decisions from a specific court
server.prompt(
  "court-decisions",
  "Retrieve recent decisions from a specific court",
  {
    court: z.string().describe("Court name or identifier"),
    timeframe: z.string().default("1 year").describe("Timeframe to search within (e.g., '6 months', '2 years')")
  },
  ({ court, timeframe }) => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please find and list the most important decisions from ${court} within the last ${timeframe}. For each decision, provide the case number, date, a brief summary of the legal issue, and outcome.`
          }
        }
      ]
    };
  }
);

// Start the server with a stdio transport
const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  console.error("Entscheidsuche MCP server started");
}).catch(error => {
  console.error("Error starting server:", error);
});