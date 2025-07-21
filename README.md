# Entscheidsuche MCP Server

A Model Context Protocol (MCP) server for searching and accessing Swiss legal case law through the Entscheidsuche API. This server enables legal professionals to efficiently research court decisions from Swiss federal and cantonal courts.

## Features

### Tools
- **Search Case Law** (`search_case_law`): Search through Swiss court decisions using natural language queries
- **Get Document** (`get_document`): Retrieve full document content in JSON, HTML, or PDF format
- **List Courts** (`list_courts`): Get information about available courts and their document counts

### Resources
- **Court Status** (`entscheidsuche://courts/status`): Real-time information about court document collections

### Prompts
- **Legal Research** (`legal_research`): Template for conducting comprehensive legal research
- **Case Analysis** (`case_analysis`): Template for analyzing specific legal cases

## Installation

1. Clone or download this project
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```

## Usage

### With Claude Desktop

Add the following to your Claude Desktop configuration file:

**macOS/Linux**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "entscheidsuche": {
      "command": "node",
      "args": ["/absolute/path/to/entscheidsuche-mcp/build/index.js"]
    }
  }
}
```

### With MCP Inspector

Test the server using the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node build/index.js
```

## Example Searches

### Basic Legal Research
Use the search tool to find cases on specific topics:
- "Datenschutz DSGVO" (Data protection)
- "Arbeitsrecht Kündigung" (Employment law termination)
- "Mietrecht Mietzinserhöhung" (Rental law rent increases)

### Advanced Queries
The search supports Elasticsearch query syntax:
- `"exact phrase"` for exact matches
- `field:value` for field-specific searches
- `term1 AND term2` for boolean operations

### Document Retrieval
Once you find a relevant case, use the signature and spider name to retrieve the full document:
- Signature: e.g., "CH_BGer_2023_1C_123_2023"
- Spider: e.g., "CH_BGer" (Swiss Federal Court)

## API Endpoints Used

This server interfaces with:
- `https://entscheidsuche.ch/_search.php` - Elasticsearch search endpoint
- `https://entscheidsuche.ch/docs/` - Document repository
- `https://entscheidsuche.ch/status` - Court status information

## Legal Information

This tool provides access to publicly available Swiss court decisions through the Entscheidsuche service. Please note:

- Always verify legal information through official sources
- This tool is for research purposes only
- Consult qualified legal professionals for legal advice
- Respect the terms of service of entscheidsuche.ch

## Development

### Scripts
- `npm run build` - Build the TypeScript project
- `npm run dev` - Build and run the server
- `npm run watch` - Watch for changes and rebuild

### Project Structure
```
src/
  index.ts          # Main server implementation
build/              # Compiled JavaScript output
package.json        # Project dependencies and scripts
tsconfig.json       # TypeScript configuration
```

## Contributing

Feel free to submit issues and enhancement requests. When contributing:

1. Follow the existing code style
2. Add appropriate error handling
3. Update documentation as needed
4. Test your changes with the MCP Inspector

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- [Entscheidsuche.ch](https://entscheidsuche.ch) for providing the open API
- [Model Context Protocol](https://modelcontextprotocol.io) for the MCP framework
- Swiss courts for making decisions publicly available