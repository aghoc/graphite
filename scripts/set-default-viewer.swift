// Graphite를 마크다운 문서(.md 등)의 기본 앱으로 지정한다 (macOS 12 이상).
//
//   swift scripts/set-default-viewer.swift                 # /Applications/Graphite.app으로 지정
//   swift scripts/set-default-viewer.swift /경로/다른.app   # 다른 앱으로 되돌릴 때 (예: VS Code)
//
// 시스템 설정을 바꾸지 않고, 사용자 계정의 "이 형식은 이 앱으로 열기" 선택만 바꾼다.
// Finder의 정보 가져오기 → 다음으로 열기 → 모두 변경과 같은 동작이다.
import AppKit
import UniformTypeIdentifiers

let appPath = CommandLine.arguments.dropFirst().first ?? "/Applications/Graphite.app"
let appURL = URL(fileURLWithPath: appPath)
guard let bundle = Bundle(url: appURL), let appId = bundle.bundleIdentifier else {
    print("앱을 찾지 못했어요: \(appPath)")
    exit(1)
}

// 앱을 LaunchServices에 다시 등록해 문서 형식 선언을 최신으로 반영한다
let lsregister = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
let reg = Process()
reg.executableURL = URL(fileURLWithPath: lsregister)
reg.arguments = ["-f", appURL.path]
try? reg.run()
reg.waitUntilExit()

// 확장자마다 시스템이 쓰는 형식(UTI)을 모은다. .md는 net.daringfireball.markdown,
// 시스템이 모르는 확장자는 동적 형식(dyn.*)이 되므로 각각 지정한다.
let exts = ["md", "markdown", "mdown", "mkd", "mkdn"]
var types: [UTType] = []
for ext in exts {
    if let t = UTType(filenameExtension: ext), !types.contains(t) { types.append(t) }
}
if let md = UTType("net.daringfireball.markdown"), !types.contains(md) { types.insert(md, at: 0) }

var failed = 0
let group = DispatchGroup()
for t in types {
    group.enter()
    NSWorkspace.shared.setDefaultApplication(at: appURL, toOpen: t) { error in
        if let error {
            failed += 1
            print("✗ \(t.identifier): \(error.localizedDescription)")
        } else {
            print("✓ \(t.identifier)")
        }
        group.leave()
    }
}
// 완료 콜백은 메인 런루프에서 오므로 런루프를 돌리며 기다린다
while group.wait(timeout: .now()) == .timedOut {
    RunLoop.main.run(until: Date().addingTimeInterval(0.05))
}

// 결과 확인: 실제로 지정된 앱
if let md = UTType("net.daringfireball.markdown"),
   let current = NSWorkspace.shared.urlForApplication(toOpen: md) {
    print("지금 .md 기본 앱: \(current.path)")
}
print(failed == 0 ? "\(bundle.infoDictionary?["CFBundleName"] ?? appId)을(를) 기본 앱으로 지정했어요." : "\(failed)개 형식은 지정하지 못했어요.")
exit(failed == 0 ? 0 : 1)
