# Changelog

All notable changes to ShortsMake will be documented in this file.

## [0.1.2.0] - 2026-03-23

### Added
- **구간 미리보기 플레이어**: 구간 선택 화면에서 ▶ 버튼으로 해당 구간을 즉시 미리보기 (HTML Media Fragment 활용)
- **단어별 카라오케 자막**: Whisper 단어 타임스탬프를 ASS `\k` 태그로 변환 — 단어 단위 하이라이트 렌더링
- **자막 타임라인 시각화**: 자막 편집 화면 상단에 구간별 타임라인 바 표시, 클릭 시 해당 자막으로 스크롤
- **소스 영상 스트리밍 API**: `GET /api/jobs/{job_id}/source` 엔드포인트 추가

### Changed
- **병렬 렌더링**: 구간 렌더링을 `asyncio.gather()`로 변경 — 다수 구간 동시 처리로 최대 5x 속도 향상
- **schemas.py**: `SubtitleEntry`에 `words: list[WordEntry]` 필드 추가 (카라오케용)

### Fixed
- **yt-dlp 타임아웃**: 메타 조회 60초, 다운로드 10분 타임아웃 추가 — 무한 대기 방지

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
