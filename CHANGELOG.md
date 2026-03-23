# Changelog

All notable changes to ShortsMake will be documented in this file.

## [0.1.11.0] - 2026-03-23

### Added
- **Job 관리 대시보드**: 헤더 "📂 이전 작업" 버튼 → 슬라이드인 패널
  - 이전 작업 목록 (최신순 정렬), 상태 배지 색상 구분
  - ZIP 다운로드 버튼 (출력 파일 있는 경우), 작업 삭제 버튼
- **자막 스타일 고급화**: Bold/Italic 토글, 그림자 깊이(0-4), 자간(0-10) 슬라이더
  - ASS 자막 포맷에 Bold(-1/0), Italic(1/0), Shadow, Spacing 필드 적용
- **폰트 업로드**: EffectsStep에서 TTF/OTF 업로드 → 폰트 목록 셀렉터
- **썸네일 자동 생성**: 구간 중간 프레임 FFmpeg 추출, 다운로드 지원
- **배치 렌더링 구간별 진행률**: WS `detail.seg_id/seg_progress` → per-segment 프로그레스바
- **WebSocket 자동 재연결**: 지수 백오프(최대 30초, 최대 10회), 폴링 방식 완전 제거

## [0.1.10.0] - 2026-03-23

### Added
- **제품 쇼츠 모드 (P8)**: InputStep에 "🛍️ 제품 쇼츠 모드" 토글 섹션
  - OpenAI API 키 입력 (비밀번호 타입)
  - 제품 힌트 텍스트 입력 (예: "삼성 갤럭시 S25")
  - 번인 자막 제거 체크박스
- **GPT-4o 비전 분석**: `POST /api/jobs/{id}/analyze_visual` — 오디오 없는 영상도 분석
  - 5초 간격 프레임 추출 → GPT-4o vision으로 하이라이트 구간 선정
  - 각 구간별 자막 스크립트 자동 생성 (15자 이내)
  - `detail: low` 모드로 비용 절감 (약 1,500 프레임/1시간 영상 기준 $0.10~0.15)
- **번인 자막 제거**: `POST /api/jobs/{id}/remove_subtitles` — 두 가지 모드
  - `fast`: FFmpeg delogo 필터 (실시간, 흐릿할 수 있음)
  - `quality`: OpenCV TELEA 인페인팅 (CPU 기준 5분 영상 약 10~20분, 고품질)
  - EasyOCR로 자막 영역 자동 감지 후 고정 마스크 적용
- **SegmentsStep 제품 모드 UI**: 제품 모드 활성화 시
  - 번인 자막 제거 패널 (모드 선택 + 제거 시작 버튼)
  - 오디오 분석 버튼 대신 "👁 비전 AI 분석" 버튼으로 전환
  - 구간 이유 레이블에 `product_highlight` 추가

## [0.1.9.0] - 2026-03-23

### Added
- **SRT 자막 가져오기/내보내기**: SubtitleStep 툴바에 "⬇ SRT 내보내기" + "⬆ SRT 가져오기" 버튼
  - 내보내기: 현재 자막을 `{segId}_subtitle.srt` 파일로 다운로드
  - 가져오기: SRT 파일 선택 후 현재 구간 자막 전체 교체 (타임스탬프 파싱)
- **커스텀 효과 프리셋**: EffectsStep에 "💾 나만의 프리셋" 섹션 — 현재 설정을 이름 붙여 저장 (localStorage)
  - 저장된 프리셋 목록에서 적용/삭제 가능
  - trim_start/trim_end는 프리셋에 포함되지 않음 (구간별 유지)
- **렌더링 로그 뷰**: RenderStep 최종 렌더링 버튼 아래에 실시간 로그 패널
  - 타임스탬프 + 진행 메시지 표시, 자동 스크롤
  - 접기/펼치기 토글, 오류는 빨간색/완료는 초록색 강조

## [0.1.8.0] - 2026-03-23

### Added
- **빠른 미리보기**: EffectsStep에 "▶ 미리보기 생성" 버튼 — 저해상도(480p)/최대 10초 클립을 자막·TTS·BGM 없이 즉시 생성
  - `POST /api/jobs/{id}/segments/{seg_id}/preview` + `GET /api/jobs/{id}/preview/{filename}`
  - 결과는 EffectsStep 내 인라인 `<video>` 플레이어로 즉시 재생
- **자막 전체 타이밍 오프셋**: SubtitleStep 툴바에 빠른 버튼 6종 (-1s/-0.5s/-0.2s/+0.2s/+0.5s/+1s) + 직접 입력 필드
  - 전체 자막을 N초 앞/뒤로 일괄 이동, start/end 최솟값 0 보장

## [0.1.7.0] - 2026-03-23

### Added
- **구간 트리밍 UI**: EffectsStep에 시작/끝 시간 입력 필드 (분:초 형식, blur 시 적용)
  - AI 분석값 대신 원하는 구간으로 미세 조정 가능
  - "AI 분석값으로 초기화" 버튼, 실시간 길이 표시
  - 백엔드: `trim_start` / `trim_end` Optional 필드로 렌더 시 구간 오버라이드
- **크롭 위치 조절**: 클로즈업/분할 효과 선택 시 크롭 중심 설정 UI 자동 표시
  - 3×3 방향 그리드 피커 (↖/⬆/↗/◀/⊙/▶/↙/⬇/↘)
  - 가로/세로 슬라이더 (0~100% 연속 조정)
- **설정 전체 복사**: "📋 모든 구간에 복사" 버튼 — 현재 구간의 효과/자막/색상/속도 등을 나머지 구간에 일괄 적용 (trim은 구간별 유지)

### Changed
- `EffectsConfig` 스키마에 `trim_start: Optional[float]`, `trim_end: Optional[float]` 추가
- 렌더 파이프라인 step 1: `trim_start`/`trim_end` 우선 적용, 유효성 검증 (최소 0.5초)

## [0.1.6.0] - 2026-03-23

### Added
- **워터마크 삽입**: EffectsStep에 워터마크 텍스트 입력 + 4방향 위치 선택 UI (좌상/우상/좌하/우하)
  - FFmpeg `drawtext` 필터 — 흰 글자 + 반투명 그림자, 영상 너비 기준 자동 폰트 크기
  - `EffectsConfig`에 `watermark`, `watermark_position` 필드 추가
- **자막 자동 줄바꿈**: SubtitleStep에 "↩ 자동 줄바꿈" 버튼 — 18자 초과 자막을 어절 단위로 분리
  - 줄 수에 비례하여 타임스탬프를 자동 분배
- **에러 UI 개선**: 단계별 맥락 힌트 + 재시도/처음으로 버튼
  - App.tsx 헤더 sticky 고정 + "↩ 처음으로" 리셋 버튼 (confirm 다이얼로그)
  - 에러 배너 리디자인: 에러 메시지 + 단계별 힌트 텍스트 + 액션 버튼 2종

### Changed
- `EffectsConfig` 스키마에 `watermark: str = ""`, `watermark_position: str = "bottom_right"` 필드 추가
- 렌더 파이프라인 4.5단계 추가 — watermark ≠ "" 시 `_apply_watermark()` 적용 (자막 번인 후)

## [0.1.5.0] - 2026-03-23

### Added
- **로컬 파일 업로드**: InputStep에 탭 UI — URL 입력과 파일 업로드 전환 가능 (드래그&드롭 지원)
  - `POST /api/jobs/{id}/upload` — 청크 저장 + FFprobe 메타데이터 자동 추출
  - MP4, MOV, AVI, MKV, WEBM, M4V 지원
- **영상 속도 조절**: EffectsStep 오디오 섹션에 속도 슬라이더 추가 (0.5x~2.0x, 0.1x 단위)
  - 빠른 설정 버튼 6종 (0.5x / 0.75x / 1.0x / 1.25x / 1.5x / 2.0x)
  - FFmpeg `setpts` + `atempo` 필터 기반 구현
- **모바일 반응형 UI**: media query + 터치 최소 영역 보장 (min-height: 40px)

### Changed
- `EffectsConfig` 스키마에 `speed: float = 1.0` 필드 추가
- 렌더 파이프라인 1.5단계 추가 — speed ≠ 1.0 시 `_apply_speed()` 적용
- InputStep 제목 "롱폼 영상 URL 입력" → "영상 불러오기", 설명 업데이트

## [0.1.4.0] - 2026-03-23

### Added
- **자막 스타일 프리셋**: 기본/TikTok 노란/시네마/Bold/미니멀/배경박스 6가지 빠른 프리셋 버튼 (EffectsStep)
- **ZIP 일괄 다운로드**: 렌더링 완료 후 모든 영상을 ZIP으로 한 번에 다운로드 (`GET /api/jobs/{id}/outputs/zip`)
- **BGM 업로드 + 믹싱**: MP3/AAC/WAV 파일을 업로드하면 최종 렌더링 시 낮은 볼륨(8%)으로 자동 믹싱 (루프 반복)

### Changed
- 렌더링 파이프라인: TTS 믹싱 → BGM 믹싱 → 최종 파일 순서로 재구성 (6단계)
- `StreamingResponse` + `zipfile` 기반 ZIP 생성 (메모리 내)
- BGM 파일은 `{job_dir}/bgm.*` 경로에 저장, 렌더링 시 자동 감지

## [0.1.3.0] - 2026-03-23

### Added
- **색상 필터**: 원본/비비드/시네마틱/따뜻한/쿨톤/흑백/빈티지 7가지 프리셋 — FFmpeg `eq`·`colorbalance`·`hue` 필터 기반
- **배경 노이즈 감소**: EffectsStep 토글 — `afftdn` 필터로 잡음 제거 (원본 오디오 및 TTS 믹스 시 모두 적용)
- **필러워드 제거**: SubtitleStep "🧹 필러 제거" 버튼 — 음/어/그/저 등 단독 필러 자막 자동 삭제

### Changed
- `EffectsConfig` 스키마에 `color_preset: str` + `denoise_audio: bool` 필드 추가
- `_mix_audio()` 함수에 `denoise` 파라미터 추가
- 렌더링 진행률 구간 재조정 (45%→색상 필터→55%→자막→70%→TTS→90%)

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
