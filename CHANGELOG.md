# Changelog

All notable changes to ShortsMake will be documented in this file.

## [0.1.1.0] - 2026-03-23

### Fixed
- **ISSUE-001**: URL 유효성 검사 추가 — 잘못된 URL 입력 시 분석 시작 버튼 비활성화
- **ISSUE-002**: 모바일(375px) 환경에서 단계 탭 텍스트 잘림 수정 — `whiteSpace: nowrap` 및 말줄임표 적용
- **ISSUE-003**: 이전 작업 이어하기 시 자막 데이터 미복원 수정 — `transcribed`/`completed` 상태일 때 자막 병렬 로드
- **ISSUE-004**: 이전 작업 이어하기 시 선택 구간 미복원 수정 — `setSelectedSegments` 스토어 액션 추가 및 호출
- **ISSUE-005**: 렌더링 페이지에서 선택 구간 없을 때 렌더 버튼 비활성화

### Performance
- 자막 복원 시 순차 API 호출 → `Promise.all` 병렬 호출로 개선

## [0.1.0.0] - 2026-03-23

### Added
- 초기 ShortsMake 프로젝트 — 롱폼 영상을 AI 기반으로 숏폼 영상으로 변환
- YouTube/Vimeo 등 yt-dlp 지원 URL 다운로드
- 자동 구간 분석 및 선택
- 자막 편집 (Whisper 기반 자동 생성)
- 효과 설정 (줌, 패닝 등)
- TTS 음성 합성 (Azure Edge TTS)
- 최종 영상 렌더링 및 다운로드
