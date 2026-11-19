// node_modules의 렌더링 라이브러리를 src/vendor로 복사한다 (런타임에 네트워크를 쓰지 않음).
import { cpSync, mkdirSync, rmSync } from "node:fs";

const out = "src/vendor";
rmSync(out, { recursive: true, force: true });

const copies = [
  ["node_modules/katex/dist/katex.min.js", `${out}/katex/katex.min.js`],
  ["node_modules/katex/dist/katex.min.css", `${out}/katex/katex.min.css`],
  ["node_modules/katex/dist/fonts", `${out}/katex/fonts`],
  ["node_modules/mermaid/dist/mermaid.min.js", `${out}/mermaid/mermaid.min.js`],
  ["node_modules/@highlightjs/cdn-assets/highlight.min.js", `${out}/hljs/highlight.min.js`],
  // Pretendard: 쓰는 글자 묶음만 내려받는 dynamic subset (CSP상 CDN을 쓸 수 없어 앱에 포함)
  ["node_modules/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css", `${out}/pretendard/pretendard.css`],
  ["node_modules/pretendard/dist/web/variable/woff2-dynamic-subset", `${out}/pretendard/woff2-dynamic-subset`],
];

for (const [from, to] of copies) {
  mkdirSync(to.substring(0, to.lastIndexOf("/")), { recursive: true });
  cpSync(from, to, { recursive: true });
}
console.log("vendor 복사 완료 →", out);
