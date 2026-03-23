import json
import httpx
from config import OPENAI_API_KEY

REWRITE_STYLES = {
    "funny": {
        "label": "재밌고 유쾌하게",
        "prompt": "자막을 재밌고 유쾌한 톤으로 다시 써줘. 적절한 유머, 과장, 감탄사를 넣어서 시청자가 웃으면서 볼 수 있게. 인터넷 밈이나 유행어도 자연스럽게 활용해.",
    },
    "dramatic": {
        "label": "드라마틱하게",
        "prompt": "자막을 극적이고 웅장한 톤으로 다시 써줘. 영화 예고편처럼 긴장감 있고 임팩트 있게. 짧고 강렬한 문장.",
    },
    "cute": {
        "label": "귀엽고 발랄하게",
        "prompt": "자막을 귀엽고 발랄한 톤으로 다시 써줘. 이모티콘 느낌의 표현, 짧은 감탄사, 친근한 반말체로.",
    },
    "professional": {
        "label": "전문적이고 깔끔하게",
        "prompt": "자막을 전문적이고 깔끔한 존댓말로 다듬어줘. 불필요한 감탄사나 말더듬을 제거하고 정보 전달에 집중.",
    },
    "meme": {
        "label": "밈/짤 스타일",
        "prompt": "자막을 인터넷 밈, 짤방 스타일로 바꿔줘. 과장된 리액션, 인터넷 유행어, '레전드' '미쳤다' 'ㅋㅋㅋ' 같은 표현 적극 활용. 숏폼 댓글 느낌으로.",
    },
    "custom": {
        "label": "사용자 지정",
        "prompt": "",  # 사용자가 직접 입력
    },
}


async def rewrite_subtitles(
    subtitles: list[dict],
    style: str = "funny",
    custom_prompt: str = "",
    context: str = "",
) -> list[dict]:
    """GPT로 자막 리라이팅"""
    if not OPENAI_API_KEY or OPENAI_API_KEY.startswith("sk-여기"):
        raise ValueError("OpenAI API 키가 설정되지 않았어요. server/.env 파일에 OPENAI_API_KEY를 입력해주세요.")

    style_info = REWRITE_STYLES.get(style, REWRITE_STYLES["funny"])
    style_prompt = custom_prompt if style == "custom" and custom_prompt else style_info["prompt"]

    # 원본 자막 텍스트 + 타이밍 정보
    original_lines = []
    for s in subtitles:
        original_lines.append(f"[{s['start']:.1f}~{s['end']:.1f}] {s['text']}")
    original_text = "\n".join(original_lines)

    system_msg = f"""너는 숏폼 영상 자막 전문 리라이터야.

규칙:
1. 원본 자막의 타이밍(시작~끝 시간)은 그대로 유지해
2. 자막 개수도 동일하게 유지해 (합치거나 나누지 마)
3. 각 자막의 길이는 원본과 비슷하게 (TTS 타이밍에 맞아야 하니까)
4. 의미는 보존하되 표현만 바꿔
5. 반드시 JSON 배열로만 응답해: [{{"start": 0.0, "end": 2.5, "text": "리라이팅된 텍스트"}}]

스타일 지시: {style_prompt}"""

    user_msg = f"다음 자막을 리라이팅해줘:\n\n{original_text}"
    if context:
        user_msg += f"\n\n영상 컨텍스트: {context}"

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_msg},
                ],
                "temperature": 0.8,
                "max_tokens": 2000,
            },
        )

    if resp.status_code != 200:
        err = resp.json()
        raise RuntimeError(err.get("error", {}).get("message", f"OpenAI API 오류 ({resp.status_code})"))

    data = resp.json()
    raw = data["choices"][0]["message"]["content"].strip()

    # JSON 파싱
    try:
        match = None
        if raw.startswith("["):
            match = raw
        else:
            import re
            m = re.search(r'\[[\s\S]*\]', raw)
            if m:
                match = m.group()
        rewritten = json.loads(match) if match else []
    except (json.JSONDecodeError, TypeError):
        raise RuntimeError("GPT 응답을 파싱할 수 없어요. 다시 시도해주세요.")

    # 원본 타이밍 보존 + ID 재부여
    result = []
    for i, orig in enumerate(subtitles):
        if i < len(rewritten):
            result.append({
                "id": orig["id"],
                "start": orig["start"],
                "end": orig["end"],
                "text": rewritten[i].get("text", orig["text"]),
            })
        else:
            result.append(orig)

    return result
