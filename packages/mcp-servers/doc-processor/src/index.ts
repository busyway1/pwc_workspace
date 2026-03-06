import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { parseXlsx } from "./tools/parse-xlsx.js";
import { parsePdf } from "./tools/parse-pdf.js";
import { parseDocx } from "./tools/parse-docx.js";

const server = new Server(
  { name: "doc-processor", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "parse_xlsx",
      description:
        "Excel(.xlsx) 파일을 파싱하여 구조화된 JSON으로 반환합니다. 병합셀, 숨긴 행/열, 멀티시트를 지원합니다.",
      inputSchema: {
        type: "object" as const,
        properties: {
          filePath: {
            type: "string",
            description: "엑셀 파일의 절대 경로",
          },
          sheetName: {
            type: "string",
            description: "파싱할 시트 이름 (미지정 시 전체 시트)",
          },
          sheetIndex: {
            type: "number",
            description: "파싱할 시트 인덱스 (0부터 시작)",
          },
          maxRows: {
            type: "number",
            description: "시트당 최대 행 수 (기본값: 5000)",
            default: 5000,
          },
          includeHidden: {
            type: "boolean",
            description: "숨긴 행/열 포함 여부 (기본값: false)",
            default: false,
          },
        },
        required: ["filePath"],
      },
    },
    {
      name: "parse_pdf",
      description:
        "PDF 파일에서 텍스트를 추출하고 섹션/테이블 구조로 변환합니다.",
      inputSchema: {
        type: "object" as const,
        properties: {
          filePath: {
            type: "string",
            description: "PDF 파일의 절대 경로",
          },
        },
        required: ["filePath"],
      },
    },
    {
      name: "parse_docx",
      description:
        "Word(.docx) 문서를 HTML로 변환 후 섹션/테이블 구조로 파싱합니다.",
      inputSchema: {
        type: "object" as const,
        properties: {
          filePath: {
            type: "string",
            description: "DOCX 파일의 절대 경로",
          },
        },
        required: ["filePath"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "parse_xlsx": {
        const result = await parseXlsx({
          filePath: args?.filePath as string,
          sheetName: args?.sheetName as string | undefined,
          sheetIndex: args?.sheetIndex as number | undefined,
          maxRows: (args?.maxRows as number | undefined) ?? 5000,
          includeHidden: (args?.includeHidden as boolean | undefined) ?? false,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "parse_pdf": {
        const result = await parsePdf({
          filePath: args?.filePath as string,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "parse_docx": {
        const result = await parseDocx({
          filePath: args?.filePath as string,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
