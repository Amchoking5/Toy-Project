# Toy-Project

직접 기획하고 만든 개인 프로젝트 모음입니다. 각 프로젝트는 [포트폴리오 홈페이지](https://amchoking5.github.io/projects.html?group=toy)의 **토이 프로젝트** 탭에 자동으로 올라갑니다.

| 프로젝트 | 설명 |
|---|---|
| [SRT 자동예약](SRT%20자동예약) | 취소표 자동 조회·예약 및 메일 알림 |
| [자주 등장하는 영단어찾기](자주%20등장하는%20영단어찾기) | 지문 기반 빈출 영단어 단어장 |
| [스도쿠 자동풀기](스도쿠%20자동풀기) | 백트래킹 스도쿠 풀이 GUI |
| [스도쿠 웹](스도쿠%20웹) | 브라우저에서 바로 쓰는 스도쿠 자동 풀이 ([데모](https://amchoking5.github.io/toy/sudoku-web/demo/)) |

## 홈페이지 연동

`main`에 push하면 `.github/workflows/notify-blog.yml`이 홈페이지 저장소의 배포를 실행합니다.
홈페이지는 **최상위 폴더 중 `README.md` 맨 앞에 frontmatter가 있는 폴더**만 프로젝트로 읽습니다.

새 프로젝트를 추가할 때는 폴더를 만들고 `README.md`를 아래 형식으로 작성하면 됩니다.

```markdown
---
id: my-project            # 주소에 쓰이는 영문 id (project.html?id=my-project)
title: 프로젝트 이름
subtitle: 한 줄 설명
emoji: 🛠️
period: "2026.01 – 2026.02" # 비워 두면 폴더의 첫/마지막 커밋 날짜로 표시
team: 개인 프로젝트
order: 1                  # 작을수록 앞에 표시 (없으면 맨 뒤)
roles: [역할 1, 역할 2]
stack:
  Back-end: [Python, FastAPI]
  Front-end: [JavaScript]
gallery:                  # 첫 번째 이미지가 카드 썸네일이 됩니다
  - [메인 화면, images/main.png]      # 폴더 기준 상대 경로 또는 URL
  - [데모 영상, images/demo.mp4, video]
demo: web                 # (선택) 정적 웹 페이지 폴더. index.html이 있으면 홈페이지에 올리고 '데모 바로가기' 버튼 추가 ('.'은 이 폴더)
structure:                # 구조도 (넓게 표시)
  - [아키텍처, images/arch.png]
links:                    # GitHub 폴더 링크는 자동으로 추가됩니다
  - [서비스 바로가기, https://example.com]
---
# 프로젝트 이름

첫 번째 `##` 제목 전까지의 문단이 홈페이지 "개요"가 됩니다.

## 핵심 기능

### 기능 이름
- `### 제목` 아래 목록이 기능 카드 하나가 됩니다.

## 그 밖의 제목

`## 핵심 기능` 외의 섹션은 홈페이지 상세 페이지에 그대로 표시됩니다.
```

이미지는 프로젝트 폴더 안(예: `images/`)에 두거나, GitHub 이슈/README에 끌어다 놓아서 얻은 `https://github.com/user-attachments/assets/...` 주소를 그대로 써도 됩니다.
