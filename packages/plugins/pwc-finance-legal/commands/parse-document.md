---
name: parse-document
description: 문서를 파싱하여 구조화된 데이터로 변환합니다 (XLSX, PDF, DOCX 지원)
---

주어진 문서 파일을 파싱합니다.

1. 파일 경로를 확인합니다.
2. 파일 확장자에 따라 적절한 파서를 선택합니다:
   - `.xlsx` → `parse_xlsx` 도구 사용
   - `.pdf` → `parse_pdf` 도구 사용
   - `.docx` → `parse_docx` 도구 사용
3. `doc-processor` MCP 서버의 해당 도구를 호출합니다.
4. 파싱 결과를 사용자에게 요약하여 제공합니다:
   - 파일 메타데이터 (형식, 페이지/시트 수)
   - 주요 구조 (헤더, 섹션, 테이블)
   - 데이터 미리보기 (처음 10행 또는 첫 섹션)

사용자가 추가 분석을 원하면 `analyze-excel`, `review-tax-case`, 또는 `synthesize` 커맨드를 안내합니다.
