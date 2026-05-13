구성하신 프로젝트 요구사항을 바탕으로, Oracle Cloud(OCI) 인프라와 24GB RAM의 이점을 극대화할 수 있도록 아키텍처 및 요구사항 명세서를 정리해 드립니다.
🚀 Stock & Social Sentiment Daily Report Project
1. 개요
• 목적: 소셜(Reddit, Twitter) 및 뉴스 데이터를 수집/분석하여 사용자 맞춤형 토픽에 대한 AI 분석 리포트 제공.
• 핵심 가치: 넉넉한 RAM을 활용한 고성능 로컬 LLM(Gemma 2 27B 등) 기반의 깊이 있는 사고력 중심 분석.
2. 인프라 및 기술 스택
• Cloud: Oracle Cloud Infrastructure (OCI) - Ampere A1 (4 vCPU, 24GB RAM)
• Database: Oracle Database 23ai Free (Relational + AI Vector Search)
• CI/CD: GitHub Actions (Self-hosted Runner 권장 - ARM 빌드 속도 향상)
• Migration: Flyway (Schema 버전 관리)
• Runtime: Node.js (package.json 기반 모노레포 또는 컴포넌트 관리)
• LLM 엔진: Ollama (로컬 구동)
3. 컴포넌트별 세부 요구사항
📦 컴포넌트 1: Multi-Source Crawler
• 대상: Reddit (PRAW), Twitter/X (API 또는 Scraper), 주식 뉴스 (yfinance/RSS).
• 기능: • 각 소스별 독립적 크롤링 엔진 구축. • 수집된 텍스트의 데이터 클리닝 및 Oracle 23ai 저장. • 뉴스/포스트 본문을 벡터화하여 VECTOR 타입 컬럼에 저장 (임베딩).
🖥️ 컴포넌트 2: Topic Manager (Web App)
• 기능: • 관심 토픽 관리: 사용자가 분석받고 싶은 키워드/문장 등록 (예: "이란 전쟁 현황", "국제유가"). • 알림 설정: 리포트를 수신할 이메일 주소 및 발송 시간 설정. • 대시보드: 수집된 데이터의 실시간 현황 및 과거 리포트 조회.
• 기술: Next.js 또는 단순 React + Express.
🤖 컴포넌트 3: Daily Analysis Job (LLM)
• 기능: • RAG 기반 분석: 사용자가 설정한 '토픽'과 관련된 최신 뉴스/소셜 데이터를 Oracle Vector Search로 검색. • Deep Reasoning: 로컬 LLM(Gemma 2 27B 등)을 활용하여 단순 요약을 넘어선 시장 영향력 분석 및 인사이트 도출. • 리포트 생성: Markdown 또는 HTML 형식의 데일리 리포트 작성. • 메일 발송: 설정된 시간에 이메일 전송.
• 실행: 매일 새벽 자동 스케줄링 (Cron).
🧹 컴포넌트 4: Data Archivist (Maintenance)
• 기능: • Compact Storage: 생성일 기준 30일이 지난 원본 데이터(Long text) 삭제. • 요약본 보관: 삭제 전 LLM을 통해 1~2문장으로 핵심 요약 및 메타데이터(티커, 감성 지수 등)만 남겨서 아카이빙. • 효율화: DB 용량 확보 및 장기적 추세 분석을 위한 경량 데이터 유지.
4. 데이터베이스 스키마 설계 (Flyway 관리 대상)
• TOPICS: 사용자 정의 관심 주제 및 설정 정보.
• RAW_DATA: 크롤링된 원본 텍스트, 소스 정보, 생성일, Vector Embedding.
• DAILY_REPORTS: 생성된 리포트 아카이브.
• ARCHIVED_SUMMARY: 한 달 지난 데이터의 요약본.
5. 단계별 실행 계획
1. Phase 1: OCI에 Oracle 23ai 설치 및 Flyway로 기본 스키마 구축.
2. Phase 2: Reddit/뉴스 크롤러 우선 구현 및 DB 저장 확인.
3. Phase 3: Ollama 설치 및 Gemma 2 27B 모델 테스트 (추론 속도 확인).
4. Phase 4: 토픽 매니저 웹앱 연동 및 데일리 잡 자동화.
💡 추가 제언
• Vector DB 시너지: 컴포넌트 3에서 분석할 때, 컴포넌트 4에서 압축(Compact)하기 전의 고밀도 벡터 데이터를 활용하면 훨씬 정확한 분석이 가능합니다.
• GitHub Actions: A1 인스턴스 사양이 좋으므로, 별도의 빌드 서버를 쓰기보다 A1에 Self-hosted Runner를 띄워 빌드와 배포를 내부에서 처리하는 것이 속도 면에서 유리합니다.
이대로 정리해서 프로젝트 시작해 볼까요? 우선 순위가 가장 높은 컴포넌트는 무엇인가요?

