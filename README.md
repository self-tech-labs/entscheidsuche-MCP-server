# Entscheidsuche MCP Server

An MCP server for accessing the entscheidsuche.ch Swiss legal decision search API.

## Overview

This server provides standardized access to Swiss court decisions through the Model Context Protocol (MCP). It allows LLMs like Claude to search, retrieve, and analyze legal documents from the entscheidsuche.ch database.

## Features

- **Resources**: Access Swiss court decisions as searchable resources
- **Tools**: Search court decisions, retrieve documents, list courts by canton
- **Prompts**: Templates for common legal research tasks

## Installation

```bash
# Clone the repository
git clone [repository-url]
cd entscheidsuche-mcp-server

# Install dependencies
npm install

# Build the server
npm run build
```

## Usage

### With Claude for Desktop

1. Open Claude for Desktop's settings
2. Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "entscheidsuche": {
      "command": "node",
      "args": ["/absolute/path/to/entscheidsuche-mcp-server/build/index.js"]
    }
  }
}
```

3. Restart Claude for Desktop
4. Start asking legal research questions!

### With MCP Inspector

```bash
npx @modelcontextprotocol/inspector node /path/to/entscheidsuche-mcp-server/build/index.js
```

## Available Capabilities

### Resources

- `entscheidsuche://scrapers` - Lists all available scrapers/collections
- `entscheidsuche://scraper/{scraperId}` - Gets details about a specific scraper
- `entscheidsuche://document/{documentId}` - Accesses metadata for a specific document

### Tools

- `search-decisions` - Search for court decisions using Elasticsearch query syntax
- `get-document-content` - Retrieve the content of a specific document
- `list-courts` - List available courts by canton
- `get-document-urls` - Get direct URLs for a document's PDF and HTML versions

### Prompts

- `search-legal-precedents` - Find relevant precedents on a specific legal topic
- `compare-jurisdictions` - Compare rulings on a specific legal issue across different cantons
- `court-decisions` - Retrieve recent decisions from a specific court

## Example Queries

### Search for copyright cases in Zurich

```
Can you find Swiss court decisions about copyright infringement in Zurich from the last 5 years?
```

### Compare cantonal approaches to a legal issue

```
How do different Swiss cantons approach the legal issue of tenant rights in rental disputes?
```

### Analyze a specific decision

```
Can you retrieve and analyze the decision with ID "ZH_VG-VB.2021.00042"?
```

## Technical Details

- Built with the MCP TypeScript SDK
- Respects rate limits to be "kind to the entscheidsuche.ch server"
- Handles proper authentication and error handling
- Formats search results with key metadata (court, date, case number)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.

## Acknowledgements

- [entscheidsuche.ch](https://entscheidsuche.ch) for providing the API
- The Model Context Protocol team for their excellent SDK


# Example MCP Queries for Entscheidsuche

This document provides examples of how to use the Entscheidsuche MCP server through Claude to research Swiss legal decisions.

## Basic Searches

### Finding cases on a specific topic

```
Find Swiss court decisions about intellectual property rights in the technology sector from the last 5 years.
```

### Searching by canton

```
What are some important court decisions from the canton of Zurich (ZH) related to landlord-tenant disputes?
```

### Searching by keyword and legal concept

```
Can you find Swiss Federal Supreme Court cases discussing the concept of "good faith" (Treu und Glauben) in contract law?
```

## Document Retrieval

### Retrieving a specific document by ID

```
Can you retrieve and analyze the Swiss court decision with ID "CH_BGer-4A_283_2021"?
```

### Getting document URLs

```
I'd like to access the original court decision for case number "ZH_OG-LB190025". Can you provide the PDF and HTML links?
```

## Comparative Analysis

### Comparing cantonal approaches

```
How do the cantons of Geneva (GE), Vaud (VD), and Zurich (ZH) differ in their approach to divorce settlements? Please search for relevant cases and compare.
```

### Analyzing legal trends

```
Has there been an evolution in how Swiss courts have interpreted data protection rights over the last decade? Search for relevant cases and analyze the trend.
```

## Specialized Legal Research

### Finding precedent for a specific situation

```
I'm researching a case where an employee was terminated while on medical leave. Can you find Swiss court decisions that established precedent for similar situations?
```

### Analyzing multiple related cases

```
Find the most significant Swiss court decisions related to pharmaceutical patent disputes and analyze how they've shaped the legal landscape in this area.
```

## Advanced Prompt Usage

### Using the compare-jurisdictions prompt

```
Using the compare-jurisdictions prompt, please analyze how different Swiss cantons approach the legal issue of "non-compete clauses" in employment contracts.
```

### Using the search-legal-precedents prompt

```
Using the search-legal-precedents prompt, find relevant Swiss legal precedents about "algorithmic decision making" and data protection, focusing on federal court decisions.
```

### Using the court-decisions prompt

```
Using the court-decisions prompt, retrieve recent decisions from the Swiss Federal Supreme Court (Bundesgericht) within the last 2 years related to cryptocurrency regulation.
```