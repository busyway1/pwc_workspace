---
name: financial-audit
description: 감사 워크플로우 및 감사 절차 도메인 전문 지식
trigger: 감사, audit, 감사절차, audit procedure, 감사의견, audit opinion, 내부통제, internal control
---

# Financial Audit Skill (감사 워크플로우)

## When to Use

- 감사 절차 수행 지원 요청 시
- 감사조서 작성 보조 시
- 내부통제 평가 관련 질의 시

## Domain Knowledge

### 감사 절차 프레임워크 (ISA/KSA 기준)

1. **감사 계획 (Planning)**
   - 중요성 금액 결정 (Materiality)
   - 위험 평가 (Risk Assessment)
   - 감사 전략 수립

2. **위험 대응 (Risk Response)**
   - 통제 테스트 (Tests of Controls)
   - 실증 절차 (Substantive Procedures)
   - 분석적 절차 (Analytical Procedures)

3. **감사 완료 (Completion)**
   - 발견사항 요약
   - 경영진 확인서
   - 감사의견 형성

### 주요 감사 절차

- **확인서 (Confirmation)**: 외부 제3자 확인 (은행, 거래처)
- **재계산 (Recalculation)**: 수학적 정확성 검증
- **분석적 절차**: 추세 분석, 비율 분석, 합리성 테스트
- **표본추출 (Sampling)**: 통계적/비통계적 표본 설계

## Multi-Step Synthesis Workflow

여러 문서를 종합 분석하는 경우:

1. 각 문서를 개별 파싱 (parse_xlsx, parse_pdf, parse_docx)
2. 공통 키 기준으로 데이터 매핑 (계정코드, 일자 등)
3. 크로스 체크 수행 (장부 vs 증빙, TB vs 재무제표)
4. 불일치 항목 추출 및 원인 분석
5. 종합 감사 보고서 초안 생성

## Output Format

- **감사 체크리스트**: 절차별 수행 현황
- **발견사항 요약**: 유형별 분류 (중요, 비중요)
- **조정 분개**: 필요시 수정 분개 제안
- **보고서 초안**: 감사 결과 요약 문서
