<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="Graphite 로고">
</p>

<h1 align="center">Graphite</h1>

로컬 마크다운 파일을 바로 열어 읽는 데스크톱 뷰어입니다.

AI가 정리해 준 보고서나 문서를 `.md`로 열어 볼 일이 잦은데, 파일 하나 읽자고 무거운 에디터를 켜는 게 번거로워 만들었습니다. Tauri로 만들어 가볍고, 표·수식(KaTeX)·Mermaid 다이어그램·로컬 이미지를 오프라인에서 그대로 보여 줍니다. 고칠 부분이 보이면 `⌘E`로 옆에 원문을 열어 바로 수정하고 `⌘S`로 저장합니다.

![Graphite에서 문서를 읽다가 원문 편집기를 열어 할 일을 추가하는 데모](docs/images/demo.gif)

## 설치

[GitHub Releases](https://github.com/aghoc/graphite/releases/latest)에서 OS에 맞는 설치 파일을 받습니다.

| 운영체제 | 다운로드 | 설치 방법 |
| --- | --- | --- |
| macOS (Apple Silicon) | [.dmg](https://github.com/aghoc/graphite/releases/download/v0.1.0/Graphite_0.1.0_aarch64.dmg) | 디스크 이미지를 열고 Graphite를 응용 프로그램 폴더로 옮깁니다. |
| Windows (x64) | [.exe](https://github.com/aghoc/graphite/releases/download/v0.1.0/Graphite_0.1.0_x64-setup.exe) | 설치 프로그램을 실행합니다. |
| Linux (x64) | [.AppImage](https://github.com/aghoc/graphite/releases/download/v0.1.0/Graphite_0.1.0_amd64.AppImage) | 실행 권한을 준 뒤 실행합니다. |

공증·서명 관련 첫 실행 안내는 [릴리스 페이지](https://github.com/aghoc/graphite/releases/latest)에 정리해 두었습니다.

macOS에서 기본 앱으로 지정하려면 Finder에서 `.md` 파일의 **정보 가져오기 → 다음으로 열기**에서 Graphite를 고르고 **모두 변경**을 누릅니다.

### 소스에서 빌드 (macOS)

Node.js, Rust, Xcode Command Line Tools가 필요합니다.

```bash
git clone https://github.com/aghoc/graphite.git
cd graphite
npm install
npm run build
cp -R src-tauri/target/release/bundle/macos/Graphite.app /Applications/
```

아래 스크립트로 `.md`, `.markdown`, `.mdown`, `.mkd`, `.mkdn` 기본 앱을 한 번에 Graphite로 바꿀 수 있습니다(macOS 12 이상). 다른 앱으로 되돌릴 때는 뒤에 앱 경로를 붙입니다.

```bash
swift scripts/set-default-viewer.swift
```

코드를 수정한 뒤에는 `npm run update`로 설치된 앱을 덮어씌웁니다. 실행 중이라면 종료 후 다시 열면 반영됩니다.

## 사용법

단축키는 macOS 기준이며, Windows·Linux에서는 `⌘` 대신 `Ctrl`을 씁니다.

- **파일·폴더 열기**: `⌘O`로 파일을 열거나 창에 끌어다 놓습니다. 폴더째 보려면 `⇧⌘O`로 열어 왼쪽 **파일** 탭에서 고릅니다. 새 문서는 `⌘N`입니다.
- **읽기**: 왼쪽 목차에서 제목을 눌러 이동하고, `⌘F`로 본문을 검색합니다. 글자 크기는 `⌘+`, `⌘-`로 조절하고 `⌘0`으로 초기화합니다.
- **원문 편집**: `⌘E`를 누르면 오른쪽에 편집기가 열리고 입력 내용이 바로 반영됩니다. 양쪽 스크롤이 같이 움직이며, 가운데 경계선을 끌어 너비를 조절할 수 있습니다.
- **외부 변경 감지**: 다른 앱에서 같은 파일을 수정해 저장하면 자동으로 다시 읽습니다. 편집기가 열려 있을 때는 새로 불러올지 먼저 묻습니다.

표, 체크리스트, 각주, 알림 블록, 코드 하이라이팅, KaTeX 수식, Mermaid 다이어그램, 상대 경로 이미지를 오프라인에서 렌더링합니다. 지원 문법은 [docs/sample.md](docs/sample.md)에서 확인할 수 있습니다.

| 읽기 화면 | 원문 편집 |
| --- | --- |
| ![왼쪽에 목차가 있고 오른쪽에 마크다운 문서가 열린 화면](docs/images/viewer-light.png) | ![왼쪽에 렌더링한 문서, 오른쪽에 마크다운 원문이 열린 화면](docs/images/split-edit.png) |

시스템 설정에 따라 라이트·다크 모드가 자동으로 바뀝니다. [다크 모드 화면](docs/images/viewer-dark.png) · [데모 소스](docs/demo)

## 개발

Tauri v2 웹뷰 위에 HTML, CSS, JavaScript로 UI를 구성하고, Rust 백엔드에서 파일 입출력과 마크다운 렌더링(comrak)을 처리합니다. 수식·다이어그램 렌더러와 글꼴은 앱 안에 번들링되어 있습니다.

```bash
npm run dev
npm run dev:sample
npm run dev -- -- -- "경로/문서.md"
```

렌더링과 파일 탐색기 테스트는 `src-tauri`에서 돌립니다.

```bash
cd src-tauri
cargo test
```

화면 코드는 [src/](src), 파일 처리와 렌더링은 [src-tauri/src/lib.rs](src-tauri/src/lib.rs)에 있습니다.

## 라이선스

Graphite 소스 코드는 [MIT 라이선스](LICENSE)를 따릅니다.

| 라이브러리·글꼴 | 용도 | 라이선스 |
| --- | --- | --- |
| [Tauri](https://tauri.app) | 데스크톱 앱 프레임워크 | MIT / Apache-2.0 |
| [comrak](https://github.com/kivikakk/comrak) | 마크다운 렌더링 | BSD-2-Clause |
| [notify](https://github.com/notify-rs/notify) | 파일 변경 감지 | CC0-1.0 |
| [KaTeX](https://katex.org) | 수식 렌더링 | MIT |
| [Mermaid](https://mermaid.js.org) | 다이어그램 렌더링 | MIT |
| [highlight.js](https://highlightjs.org) | 코드 강조 | BSD-3-Clause |
| [Pretendard](https://github.com/orioncactus/pretendard) | 본문 글꼴 | SIL OFL 1.1 |
| [토스페이스](https://github.com/toss/tossface) v1.6.1 | 이모지 글꼴 | [토스페이스 라이선스](licenses/tossface/LICENSE) |

본문과 목차 이모지에는 토스팀에서 제공한 토스페이스(v1.6.1 원본 WOFF2)가 적용되어 있습니다. 재배포 시 저작권 안내와 라이선스 전문을 함께 포함해야 하며, 글꼴 자체를 판매하거나 허락 없이 수정본을 만들 수 없습니다. 빌드 시 두 문서가 앱에 함께 들어갑니다. [저작권 안내](licenses/tossface/NOTICE.md) · [라이선스 전문](licenses/tossface/LICENSE)
