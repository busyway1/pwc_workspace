---
name: excel-analysis
description: 재무제표 및 감사조서 엑셀 파일 분석을 위한 도메인 전문 지식
trigger: 엑셀 분석, Excel 분석, 재무제표, 감사조서, financial statement, audit workpaper, spreadsheet analysis
---

# Excel Analysis Skill (재무제표/감사조서 분석)

## When to Use

- 사용자가 엑셀 파일(.xlsx)을 업로드하고 분석을 요청할 때
- 재무제표, 감사조서, 재무모델 관련 질문이 있을 때
- 숫자 데이터의 정합성 검증이 필요할 때

## Domain Knowledge

### 재무제표 구조 (K-IFRS 기준)

1. **재무상태표** (Statement of Financial Position)
   - 자산 = 부채 + 자본 (항상 검증)
   - 유동/비유동 분류 확인
   - 주요 계정: 현금및현금성자산, 매출채권, 재고자산, 유형자산, 무형자산

2. **포괄손익계산서** (Statement of Comprehensive Income)
   - 매출액 → 매출원가 → 매출총이익 → 영업이익 → 당기순이익 흐름
   - 영업이익률, 순이익률 자동 계산

3. **현금흐름표** (Statement of Cash Flows)
   - 영업/투자/재무활동 구분
   - 간접법 조정항목 확인

### 감사조서 분석 패턴

- **Trial Balance (시산표)**: 차변합계 = 대변합계 검증
- **Aging Schedule (연령분석)**: 매출채권/매입채무 연령 분류
- **Roll-forward**: 기초잔액 + 증가 - 감소 = 기말잔액 검증
- **Lead Schedule**: 계정별 상세 내역 매핑

## Analysis Workflow

1. `doc-processor` MCP의 `parse_xlsx` 도구로 파일 파싱
2. 시트 구조 파악 (시트명, 행/열 수, 병합셀 여부)
3. 헤더 행 식별 및 데이터 영역 확정
4. 도메인 규칙에 따른 검증 수행
5. 이상치 또는 불일치 항목 리포트

## Output Format

분석 결과는 다음 구조로 제공:

- **요약**: 핵심 수치와 주요 발견사항
- **상세 분석**: 계정별 / 시트별 분석
- **검증 결과**: 정합성 체크 결과 (PASS/FAIL)
- **주의 사항**: 이상치, 누락, 불일치 항목
