# 소개 데모 (docs/images/demo.gif)

README 맨 위의 GIF는 실제 앱을 녹화한 것이 아니라, 앱 화면을 단순화해 다시 그린 소개용 애니메이션이다. stageshow 스킬의 React 키트로 만들었다.

- `GraphiteDemo.tsx`, `graphite.css`: 장면. 문서를 읽다가 "편집"을 눌러 오른쪽에 원문 편집기를 열고, `- [x] LVS 통과`를 입력하면 왼쪽 체크리스트에 항목이 생기고, `⌘S`로 저장한 뒤 "보기"로 돌아간다.
- `record.mjs`: 키트의 가상 시계를 한 프레임씩 진행하며 찍는 녹화 스크립트. 프레임이 빠지거나 겹치지 않는다.

## 다시 만들기

stageshow 폴더에서:

```bash
cp -R <Graphite>/docs/demo examples/graphite        # 장면을 예제로 등록 (index.tsx는 아래 한 줄)
echo "export { GraphiteDemo as default } from './GraphiteDemo'" > examples/graphite/index.tsx
npm run dev                                          # http://127.0.0.1:4091
node scripts/film.mjs "http://127.0.0.1:4091/?capture=graphite" --select '#example' --gate   # 검사
node examples/graphite/record.mjs "http://127.0.0.1:4091/?embed=graphite" frames 30 16.6     # 프레임 녹화
```

한 루프는 348프레임(30fps, 11.6초)이다. GIF 변환:

```bash
ffmpeg -framerate 30 -i frames/f%04d.png -vf "trim=end_frame=348,setpts=PTS-STARTPTS,fps=25,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle" -loop 0 demo.gif
```

## 검사 기록

`film.mjs --gate`는 `rehearsal passed`로 끝났다. 남은 알림과 판단:

- 편집기가 닫힐 때 원문 줄이 잘려 보임: 편집기는 폭이 줄며 내용을 가리는 방식이라 의도한 것이다.
- 화면이 잠깐 비는 구간(약 0.2초): 처음 장면으로 돌아가는 컷이다.
- 저장 알림이 자리표시 줄 위에 겹침: 떠 있는 알림이고 아래는 글자가 아닌 자리표시 줄이다.
- 확인하지 않은 것: 좁은 화면용(`compact`) 배치. GIF는 고정 크기 이미지라 만들지 않았다.
