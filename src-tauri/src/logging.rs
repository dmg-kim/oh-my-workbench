// 로깅 초기화 (로컬 파일, rotating)
// 상세 설계: docs/ARCHITECTURE.md §6.7, PRD D-7
// tracing + tracing-appender 기반 구현은 M2 초기 스프린트에서 추가.

pub fn init() {
    // TODO(M2): tracing_subscriber + tracing_appender::rolling 로 logs/app.log 구성
    //           URL query string / 프로세스 인자 redact 유틸 포함.
}
