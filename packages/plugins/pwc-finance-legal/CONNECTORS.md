# PwC Finance & Legal Plugin - Connectors

## MCP Server: doc-processor

이 플러그인은 `doc-processor` MCP 서버를 통해 문서 파싱 기능을 사용합니다.

### Available Tools

| Tool         | Description                                | Input                                                                 |
| ------------ | ------------------------------------------ | --------------------------------------------------------------------- |
| `parse_xlsx` | Excel 파일 파싱 (병합셀, 숨긴행, 멀티시트) | `filePath`, `sheetName?`, `sheetIndex?`, `maxRows?`, `includeHidden?` |
| `parse_pdf`  | PDF 파일 텍스트 추출 및 구조화             | `filePath`                                                            |
| `parse_docx` | Word 문서 HTML 변환 및 구조화              | `filePath`                                                            |

### Output Format

모든 도구는 `ParsedDocument` 형식의 JSON을 반환합니다:

- `metadata`: 파일명, 형식, 페이지/시트 수, 파싱 시각
- `content`: 형식에 따른 구조화된 콘텐츠 (SpreadsheetContent 또는 TextContent)

### Connection

MCP 서버는 stdio transport로 연결됩니다.
설정은 `opencode.jsonc`의 `mcp.doc-processor` 항목에서 관리됩니다.
