# 온라인 교무실 작업 로그

한국 시간(Asia/Seoul) 기준으로 작업별 기록을 아래에 추가한다. 실제 수행한 과정과 확인한 결과만 기록한다. 기존 기록은 보존하고, 후속 확인이나 정정은 추가 기록으로 남긴다.

## 새 작업 기록 양식

```markdown
## YYYY-MM-DD — 작업 제목

- 작업자:
- 상태: 진행 중 / 완료 / 일부 완료 / 보류
- 요청과 목적:
- 시작 상태: 브랜치, 기준 커밋, 기존 미커밋 변경
- 실제 작업 과정: 확인 내용, 변경 내용, 결정 이유, 발생 문제와 처리
- 변경 파일 또는 외부 데이터 위치:
- 검증: 실행한 확인과 결과, 실행하지 못한 확인
- 결과:
- 커밋 / 푸시 / 배포: 각각 수행 여부, 커밋 ID·실행 링크 등 확인 근거
- 남은 작업 / 다음 작업자 인수인계:
```

## 2026-10-06 — 운영 구조와 Markdown 문서 존재 여부 확인

- 작업자: Codex
- 상태: 완료
- 요청과 목적: GitHub에 코드를 올리고 Firebase Hosting으로 운영하는 구조가 Markdown 파일에 저장되어 있는지 확인.
- 시작 상태: 브랜치 `update/second-semester-timetable`, HEAD `8d9a202` (`Use shared monthly plan as sole calendar source`). 기존 변경: `mini_game/index.html` 수정, `.tmp-remote-compare/`, `mini_game/roadfighter/`, `tools/` 미추적.
- 실제 작업 과정: 프로젝트의 Markdown 파일을 검색하고 숨김 경로를 포함한 파일 검사와 HEAD의 추적 파일 목록으로 교차 확인했다. Git 원격, Firebase 설정, 두 배포 워크플로를 읽었다.
- 변경 파일: 없음. 읽기 전용 점검.
- 검증 및 결과: 작업 폴더(`.git` 내부 제외)와 HEAD에서 `.md` 파일이 없음을 확인했다. GitHub `master` 푸시 시 Firebase Hosting 라이브 배포와 GitHub Pages 배포를 실행하는 워크플로가 존재했다. Firebase 프로젝트는 `online-office-4fe31`이었다.
- 커밋 / 푸시 / 배포: 수행하지 않음. GitHub Actions와 Firebase 콘솔의 실제 실행 이력은 확인하지 않음.
- 인수인계: 배포 설정은 존재하지만 운영 절차와 작업 이력을 설명하는 문서가 필요함.

## 2026-10-06 — 운영 인수인계 문서와 지속 작업 로그 도입

- 작업자: Codex
- 상태: 완료
- 요청과 목적: 다른 작업자가 홈페이지 관리를 이어갈 수 있도록 실제 작업 과정과 결과를 Markdown 로그로 남기기.
- 시작 상태: 브랜치 `update/second-semester-timetable`, HEAD `8d9a202`. 앞선 점검과 동일한 기존 미커밋·미추적 변경이 있었음.
- 실제 작업 과정:
  1. 적용 가능한 상위·프로젝트 `AGENTS.md`를 확인했으며 해당 위치에 기존 파일이 없었다.
  2. 배포 워크플로, Firebase 설정, 파일 구조, 화면 초기화 코드, Firestore 컬렉션·규칙, 월중행사계획표 설정과 로컬 서버 도구를 읽었다.
  3. 운영 구조·데이터 위치·수정부터 배포 확인까지의 절차를 `OPERATIONS.md`로 작성했다. 로컬 미리보기도 운영 Firestore 설정을 사용한다는 점과 Hosting 배포/데이터 변경의 차이를 기록했다.
  4. 두 호스팅 설정에서 `.github`가 제외되는 것을 확인하고 운영 문서와 로그를 `.github/maintenance/`에 저장했다.
  5. 루트 `AGENTS.md`에 작업 시작 시 문서 확인, 진행 과정과 종료 결과 기록, 구조 변경 시 운영 문서 갱신 지침을 작성했다. 새 작업 로그 양식과 이번 두 작업의 실제 결과를 남겼다.
- 변경 파일: `AGENTS.md`, `.github/maintenance/OPERATIONS.md`, `.github/maintenance/WORK_LOG.md` (신규).
- 검증: 문서 내용을 로컬 설정·코드와 대조하고 `git diff --check` 및 신규 문서 파일의 공백 오류 검사를 수행하여 통과했다. 문서 경로와 작업 로그 참조 파일의 존재를 확인했다. 문서 작업이므로 화면 테스트·서버 실행은 수행하지 않았다.
- 결과: 다음 작업자가 운영 구조와 최신 상태를 읽고 같은 양식으로 관리 이력을 이어 쓸 수 있다. 자동 실행 로그 수집 기능은 추가하지 않았으며, 각 작업자가 실제 수행 내용을 문서에 기록하는 방식이다.
- 커밋 / 푸시 / 배포: 수행하지 않음. 신규 문서는 로컬 미추적 상태이며 GitHub 공유를 위해서는 추후 커밋·푸시가 필요함.
- 남은 작업 / 다음 작업자 인수인계: 기존 `mini_game/index.html` 수정과 `.tmp-remote-compare/`, `mini_game/roadfighter/`, `tools/`는 그대로 존재한다. 해당 변경의 완료·검증·배포 여부는 이번 작업에서 확인하지 않았으므로 필요 시 별도 확인하고 로그에 추가한다. 운영 배포 성공 여부도 실제 Actions·운영 사이트에서 별도로 확인한다.

## 2026-11-17 — 왼쪽 사이드바에 교사용 '업무 도구' 메뉴 추가

- 작업자: Antigravity
- 상태: 완료
- 요청과 목적: 왼쪽 사이드바의 '특별실 예약 현황' 바로 아래에 교사용 업무 도구를 만들어 배포할 '업무 도구' 메뉴를 추가.
- 시작 상태: 브랜치 `update/second-semester-timetable`, HEAD `8d9a202` (`Use shared monthly plan as sole calendar source`). 기존 미커밋 변경: `mini_game/index.html` 수정, `.github/maintenance/`, `.tmp-remote-compare/`, `AGENTS.md`, `mini_game/roadfighter/`, `tools/` 미추적.
- 실제 작업 과정:
  1. `index.html`의 `.sidebar-nav` 목록에서 `data-section="special-room-reservations"` 바로 아래에 `data-section="work-tools"`(`업무 도구`, 아이콘 `wrench`) 항목을 추가하고, `css/style.css`와 `js/main.js`의 캐시 버전 쿼리를 `?v=20261117-work-tools-01`로 갱신했다.
  2. `data.json`에 향후 교사용 업무 도구 목록을 등록·배포할 수 있도록 `"workTools": []` 배열을 추가했다.
  3. `js/main.js`에 `getWorkTools()` 헬퍼와 `renderSection`의 `'work-tools'` 분기, `renderWorkTools()` 화면 렌더링 함수를 추가했다. 등록된 도구가 있을 때는 카드 그리드(`.work-tools-grid`)와 열기/다운로드 버튼을 표시하고, 등록 전에는 배포 공간 안내 카드(`.work-tools-empty-card`)를 표시하며, 상단 검색창(`matchesSearch`)과 연동되도록 구성했다.
  4. `css/style.css`에 `.work-tools-empty-card` 및 `.work-tools-empty-icon` 스타일을 추가하고, `.github/maintenance/OPERATIONS.md`의 `data.json` 관리 대상 설명에 업무 도구를 반영했다.
- 변경 파일 또는 외부 데이터 위치: `index.html`, `js/main.js`, `css/style.css`, `data.json`, `.github/maintenance/OPERATIONS.md`, `.github/maintenance/WORK_LOG.md` (Firestore 및 외부 시트 변경 없음).
- 검증: `node --check js/main.js`로 JS 구문 검사 통과, `node`로 `data.json` JSON 파싱 검사 통과, `git diff --check`로 공백/충돌 마커 이상 없음 확인. 로컬 브라우저 렌더링 및 모바일 실기기 화면은 이번 작업에서 직접 실행하지 않음.
- 결과: 왼쪽 사이드바 '특별실 예약 현황' 바로 아래에 '업무 도구' 메뉴가 추가되었으며, 클릭 시 교사용 업무 도구 배포 섹션이 표시된다.
- 커밋 / 푸시 / 배포: 사용자 요청에 커밋·푸시·배포가 포함되지 않아 수행하지 않음 (로컬 파일 수정 상태).
- 남은 작업 / 다음 작업자 인수인계: 추후 배포할 교사용 업무 도구가 준비되면 `data.json`의 `workTools` 배열에 항목(`name`, `description`, `category`, `version`, `icon`, `url`, `download` 등)을 추가하거나 `renderWorkTools()`를 확장하여 배포할 수 있다. 기존 미커밋 변경(`mini_game/index.html` 등)은 그대로 보존되어 있다.

## 2026-11-17 — '업무 도구' 메뉴에 '학생부 개인정보 자동 삭제 도구' 연결

- 작업자: Antigravity
- 상태: 완료
- 요청과 목적: `util/01 학생부 개인정보 삭제 도구` 폴더에 추가된 교사용 도구를 확인하고 '업무 도구' 메뉴에서 사용할 수 있도록 연결.
- 시작 상태: 브랜치 `update/second-semester-timetable`, HEAD `8d9a202`. 앞선 '업무 도구' 메뉴 추가 변경 및 `util/01 학생부 개인정보 삭제 도구/` 폴더(`index.html`, `lib/jszip.min.js`, `lib/pako.min.js`, `lib/pdf.min.js`, `lib/pdf.worker.min.js`)가 작업 폴더에 존재.
- 실제 작업 과정:
  1. `util/01 학생부 개인정보 삭제 도구/index.html`과 `lib/` 하위 라이브러리 파일 구성을 확인했다(100% 브라우저 로컬 처리 방식의 학교생활기록부II 개인정보 자동 삭제 도구).
  2. `firebase.json`과 `.github/workflows/deploy-pages.yml`의 제외 목록을 점검하여 `util/` 경로가 배포 대상에서 제외되지 않음을 확인하고, SPA 리라이트에 걸리지 않도록 정확한 파일 경로(`util/01 학생부 개인정보 삭제 도구/index.html`)로 연결했다.
  3. `data.json`의 `workTools` 배열에 '학생부 개인정보 자동 삭제 도구' 항목을 등록하고, `js/main.js`에서 공백·한글 경로가 안전하게 열리도록 `encodeURI()` 처리를 추가했다.
  4. `.github/maintenance/OPERATIONS.md`의 주요 파일 표에 `util/` 폴더 설명을 추가했다.
- 변경 파일 또는 외부 데이터 위치: `data.json`, `js/main.js`, `.github/maintenance/OPERATIONS.md`, `.github/maintenance/WORK_LOG.md` (사용자 추가 폴더: `util/01 학생부 개인정보 삭제 도구/`).
- 검증: `node`로 `data.json` JSON 파싱 및 `workTools[0].url` 경로 파일 존재 여부 확인, `node --check js/main.js` 구문 검사 통과, `git diff --check` 통과. 배포 후 운영 주소(`https://online-office-4fe31.web.app/index.html`, `https://online-office-4fe31.web.app/data.json`, `https://online-office-4fe31.web.app/util/01%20%ED%95%99%EC%83%9D%EB%B6%80%20%EA%B0%9C%EC%9D%B8%EC%A0%95%EB%B3%B4%20%EC%82%AD%EC%A0%9C%20%EB%8F%84%EA%B5%AC/index.html`) 응답에 '업무 도구' 메뉴와 '학생부 개인정보 자동 삭제 도구'가 정상 반영된 것을 확인.
- 결과: '업무 도구' 메뉴에 '학생부 개인정보 자동 삭제 도구' 카드가 표시되며 '도구 열기' 클릭 시 새 탭에서 도구가 실행된다.
- 커밋 / 푸시 / 배포:
  - 커밋 및 푸시 완료: 커밋 `6458ea4` (`Add work tools menu and student record privacy redactor tool`)를 `origin`의 `update/second-semester-timetable` 및 `master` 브랜치에 푸시.
  - GitHub Actions 확인: `Deploy to GitHub Pages` 성공(https://github.com/yui1705/online-office/actions/runs/43983117359), `Deploy to Firebase Hosting`은 기존 커밋들과 동일하게 Actions 단계에서 즉시 실패(https://github.com/yui1705/online-office/actions/runs/43983117394).
  - Firebase Hosting 라이브 배포 완료: 기존 미커밋 변경(`mini_game/index.html`, `mini_game/roadfighter/`)을 `git stash`로 임시 분리한 뒤 `firebase deploy --only hosting --project online-office-4fe31`을 실행해 라이브 사이트(`https://online-office-4fe31.web.app`)에 배포 완료하고 미커밋 변경을 원복(`git stash pop`).
- 남은 작업 / 다음 작업자 인수인계: 현재 브랜치는 `update/second-semester-timetable`이며 기존 미커밋 변경(`mini_game/index.html` 수정, `.tmp-remote-compare/`, `mini_game/roadfighter/`, `tools/` 미추적)은 그대로 보존되어 있다. GitHub Actions를 통한 Firebase 자동 배포를 사용하려면 GitHub 저장소 Secrets의 `FIREBASE_SERVICE_ACCOUNT_ONLINE_OFFICE_4FE31` 설정을 점검해야 한다.

## 2026-11-25 — 학생부 개인정보 자동 삭제 도구 AI(GPT) 업로드용 PDF 기본 저장 적용

- 작업자: Antigravity
- 상태: 완료
- 요청과 목적: 학생부 PDF에서 개인정보 삭제 후 GPT 등에 업로드했을 때 한글 추출이 깨지거나(원본 Type 3 벡터 PDF), 이미지만 저장했을 때 GPT의 기본 텍스트 추출기가 본문을 읽지 못하는 문제를 해결하기 위해, 별도 옵션 없이 기본적으로 **한글 유니코드 검색 가능 텍스트 레이어(Searchable Unicode Text Layer)가 내장된 AI 업로드용 PDF**로 저장되도록 변경.
- 시작 상태: 브랜치 `update/second-semester-timetable`, HEAD `155be11`. 기존 미커밋 변경(`mini_game/index.html`, `.tmp-remote-compare/`, `mini_game/roadfighter/`, `tools/`) 존재.
- 실제 작업 과정:
  1. 원인 재확인: 나이스 학생부 PDF는 Type 3 커스텀 글리프 폰트(`/CharProcs`)만 있고 `/ToUnicode`가 없어 텍스트 레이어 추출 시 기호로 깨지며, 반대로 텍스트 레이어 없이 이미지만 담긴 PDF로 저장하면 ChatGPT의 기본 PDF 파서(`pypdf`/`pdfminer`)가 OCR을 자동 수행하지 않아 본문을 추출하지 못하는 현상을 확인했다.
  2. `util/01 학생부 개인정보 삭제 도구/lib/tesseract.min.js`를 추가하고, `util/01 학생부 개인정보 삭제 도구/index.html`에 Type 3 글리프 해시(`codeToHash`) 중복 제거 기반의 고속 OCR 디코더(`decodeGlyphHashesWithOCR`)를 구현했다. 문서 내 고유 글리프 해시를 커버하는 최소 텍스트 블록만 표 테두리 없이 흰 배경 시트로 합성·인식한 뒤 3단계 합의·앵커 DP 정렬 알고리즘으로 모든 페이지의 한글 텍스트를 복원한다(삭제된 개인정보 블록은 원천 제외).
  3. PDF 저장(`buildSearchableAiPDF`) 시 각 페이지의 고해상도 이미지 레이어(`/Im0 Do`)와 함께 `/Type0` `/Identity-H` 폰트(`/F1`) + `/ToUnicode` CMap 기반의 투명 유니코드 한글 텍스트 레이어(`3 Tr`)를 내장하도록 구현했다.
- 변경 파일 또는 외부 데이터 위치: `util/01 학생부 개인정보 삭제 도구/index.html`, `util/01 학생부 개인정보 삭제 도구/lib/tesseract.min.js` (신규), `.github/maintenance/WORK_LOG.md`.
- 검증: 내장 스크립트 JS 구문 검사, `pdf.js`(`getTextContent()`)를 통한 `/Type0` + `/Identity-H` + `/ToUnicode` 투명 한글 텍스트 레이어 추출 검증, `git diff --check` 통과.
- 결과: '현재 PDF 저장' 및 '전체 일괄 저장 (ZIP)' 시 기본적으로 고해상도 페이지 이미지와 한글 유니코드 텍스트 레이어가 함께 포함된 Searchable PDF가 생성되어, ChatGPT 등에 업로드 시 별도 OCR 지시 없이도 한글 본문이 즉시 추출된다.
- 커밋 / 푸시 / 배포: 로컬 반영 완료 (사용자 요청 시 커밋·푸시·Firebase 배포 가능).
- 남은 작업 / 다음 작업자 인수인계: 운영 사이트(`https://online-office-4fe31.web.app`)에도 반영하려면 커밋·푸시 및 `firebase deploy --only hosting`을 수행한다.

## 이전 커밋 참고

다음은 로컬 Git 이력의 제목만 옮긴 참고 자료다. 상세 작업 과정·검증·배포 여부는 확인하지 않았으며 실제 작업 로그로 간주하지 않는다.

| 커밋 날짜 | 커밋 | 제목 |
| --- | --- | --- |
| 2026-10-02 | `8d9a202` | Use shared monthly plan as sole calendar source |
| 2026-09-08 | `c779cb8` | Add NEIS monthly schedule import |
| 2026-08-20 | `9caf851` | Refresh timetable asset cache |
| 2026-08-20 | `99e9354` | Use second-semester weekly timetable |
| 2026-07-02 | `07eb085` | Add Google Analytics tag |
