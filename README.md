<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="Graphite 로고">
</p>

<h1 align="center">Graphite</h1>

AI가 만든 보고서나 정리본을 `.md` 파일로 받는 일이 많아졌습니다. 원문을 열면 표는 `|`와 `-`가 섞인 텍스트로, 수식은 LaTeX 코드로 보여 읽기 어렵습니다. 써 본 Electron 기반 편집기는 파일 하나 읽기엔 무거웠습니다.

Graphite는 macOS 내장 웹뷰를 쓰는 마크다운 뷰어입니다. 기본 앱으로 지정해 두면 Finder에서 파일을 더블클릭해 표와 수식, 이미지까지 바로 볼 수 있습니다. 고칠 내용이 있으면 `⌘E`로 문서 옆에 원문을 열고 `⌘S`로 같은 파일에 저장합니다.

![Graphite에서 문서를 읽다가 원문 편집기를 열어 할 일을 추가하는 데모](docs/images/demo.gif)

## 설치

[GitHub Releases에서 최신 버전을 다운로드합니다.](https://github.com/aghoc/graphite/releases/latest)

| 운영체제 | 받는 파일 | 설치 방법 |
| --- | --- | --- |
| macOS (Apple Silicon) | [.dmg 다운로드](https://github.com/aghoc/graphite/releases/download/v0.1.0/Graphite_0.1.0_aarch64.dmg) | 디스크 이미지를 열고 Graphite를 응용 프로그램 폴더로 옮깁니다. |
| Windows (x64) | [.exe 다운로드](https://github.com/aghoc/graphite/releases/download/v0.1.0/Graphite_0.1.0_x64-setup.exe) | 설치 프로그램을 실행합니다. |
| Linux (x64) | [.AppImage 다운로드](https://github.com/aghoc/graphite/releases/download/v0.1.0/Graphite_0.1.0_amd64.AppImage) | 파일에 실행 권한을 준 뒤 실행합니다. |

첫 실행과 관련된 안내는 릴리스 페이지에서 확인할 수 있습니다.

macOS에서 Graphite를 기본 앱으로 지정하려면 Finder에서 `.md` 파일의 **정보 가져오기**를 엽니다. **다음으로 열기**에서 Graphite를 선택하고 **모두 변경**을 누릅니다.

### 소스에서 빌드

macOS에서 소스를 내려받아 빌드합니다. Node.js, Rust, Xcode Command Line Tools가 필요합니다.

```bash
git clone https://github.com/aghoc/graphite.git
cd graphite
npm install
npm run build
cp -R src-tauri/target/release/bundle/macos/Graphite.app /Applications/
```

Finder에서 마크다운 파일을 더블클릭할 때 Graphite가 열리도록 하려면 아래 명령을 실행하세요. macOS 12 이상에서 `.md`, `.markdown`, `.mdown`, `.mkd`, `.mkdn`의 기본 앱을 바꿉니다. 다른 앱으로 되돌릴 때는 명령 뒤에 해당 앱의 경로를 붙이면 됩니다.

```bash
swift scripts/set-default-viewer.swift
```

코드를 업데이트한 뒤에는 `npm run update`로 설치한 앱을 교체할 수 있습니다. Graphite가 켜져 있다면 종료한 뒤 다시 열면 됩니다.

## 사용법

- **파일 열기** — `⌘O`를 누르거나 파일을 창에 끌어다 놓습니다. 폴더째 보려면 `⇧⌘O`로 열고 왼쪽 **파일** 탭에서 문서를 고릅니다. `⌘N`으로 새 마크다운 파일을 만들 수 있습니다.
- **문서 읽기** — 왼쪽 목차에서 제목을 고르면 해당 위치로 이동합니다. `⌘F`로 본문을 찾고, `⌘+`와 `⌘-`로 글자 크기를 바꿀 수 있습니다. `⌘0`을 누르면 기본 크기로 돌아갑니다.
- **원문 고치기** — `⌘E`로 편집기를 열면 입력한 내용이 왼쪽 화면에 바로 반영됩니다. 두 화면이 함께 스크롤되고, 가운데 경계선을 끌어 너비를 조절할 수 있습니다.
- **다른 앱에서 수정한 파일 다시 보기** — 같은 파일을 다른 앱에서 저장하면 Graphite가 다시 읽습니다. 편집기를 열어 둔 상태라면 새로 불러올지 먼저 묻습니다.

표, 체크리스트, 각주, 알림 블록, 코드 강조, KaTeX 수식과 Mermaid 다이어그램을 표시합니다. 이미지의 상대 경로는 마크다운 파일 위치를 기준으로 읽습니다. 로컬 파일을 열고 렌더링하는 데 인터넷 연결은 필요 없습니다. 예제는 [docs/sample.md](docs/sample.md)에서 볼 수 있습니다.

| 읽기 화면 | 원문 편집을 열었을 때 |
| --- | --- |
| ![왼쪽에 목차가 있고 오른쪽에 마크다운 문서가 열린 화면](docs/images/viewer-light.png) | ![왼쪽에 렌더링한 문서, 오른쪽에 마크다운 원문이 열린 화면](docs/images/split-edit.png) |

시스템이 다크 모드면 앱도 어두운 색으로 표시됩니다. 위 GIF는 사용 흐름을 보여 주기 위해 재현한 데모입니다. [다크 모드 화면](docs/images/viewer-dark.png) · [데모 소스](docs/demo)

## 개발

Tauri v2의 웹뷰에 HTML, CSS, JavaScript로 화면을 그립니다. Rust 쪽에서 파일을 열고 저장하며, comrak으로 마크다운을 렌더링합니다. 수식, 다이어그램 렌더러와 글꼴은 앱에 포함됩니다.

```bash
npm run dev
npm run dev:sample
npm run dev -- -- -- "경로/문서.md"
```

렌더링과 파일 탐색기 테스트는 `src-tauri`에서 실행합니다.

```bash
cd src-tauri
cargo test
```

화면 코드는 [src/](src), 파일 처리와 마크다운 렌더링은 [src-tauri/src/lib.rs](src-tauri/src/lib.rs)에 있습니다.

## 라이선스

Graphite 코드는 [MIT 라이선스](LICENSE)를 따릅니다.

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

본문과 목차에는 토스팀에서 제공한 토스페이스를 사용합니다. Graphite는 공식 v1.6.1의 WOFF2 파일을 그대로 넣습니다. 토스페이스를 재배포할 때는 저작권 안내와 라이선스 전문을 함께 넣어야 하며, 글꼴 자체를 판매하거나 허락 없이 수정본을 만들 수 없습니다. Graphite는 빌드할 때 두 문서를 앱에 포함합니다. [저작권 안내](licenses/tossface/NOTICE.md) · [라이선스 전문](licenses/tossface/LICENSE)
