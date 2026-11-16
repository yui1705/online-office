# 온라인 교무실 운영 및 인수인계

최종 확인일: 2026-10-06 (Asia/Seoul). 이 문서는 로컬 코드와 설정을 근거로 작성했다. 실제 GitHub Actions 실행 결과, Firebase 콘솔의 배포 이력·권한·데이터, 운영 사이트의 현재 응답은 이번 작업에서 확인하지 않았다.

## 저장소와 배포 구조

- 작업 폴더: `D:\00 바이브코딩\온라인 교무실`
- GitHub 원격 `origin`: https://github.com/yui1705/online-office.git
- GitLab 원격 `gitlab`: https://gitlab.aigov.go.kr/yui1705/online-office.git
- 자동 배포 대상 브랜치: `master`
- Firebase 기본 프로젝트: `online-office-4fe31` (`.firebaserc`)

작업 브랜치에서 수정·검증 → GitHub에 변경 반영 → `master`에 푸시 → GitHub Actions → Firebase Hosting 라이브 배포.

`.github/workflows/deploy-firebase.yml`은 `master` 푸시와 수동 실행(`workflow_dispatch`)을 받는다. 저장소를 체크아웃한 뒤 `FirebaseExtended/action-hosting-deploy@v0`로 프로젝트 `online-office-4fe31`의 `live` 채널에 배포한다. GitHub Secrets의 `FIREBASE_SERVICE_ACCOUNT_ONLINE_OFFICE_4FE31`을 사용한다. 비밀 값은 문서에 복사하지 말고 GitHub 저장소 설정에서 관리한다. 현재 별도 빌드 단계는 없다.

`.github/workflows/deploy-pages.yml`도 같은 조건으로 GitHub Pages 배포를 실행한다. 따라서 `master` 푸시는 두 배포 작업을 실행할 수 있다. GitLab으로만 푸시하거나 작업 브랜치에만 푸시하면 이 GitHub 자동 배포 조건을 충족하지 않는다.

`firebase.json`의 Hosting 공개 디렉터리는 `.`이며, SPA 경로를 `/index.html`로 연결한다. `.git`, 숨김 경로, `.firebase`, 로그, `tools`, `node_modules` 등은 제외한다. GitHub Pages는 `_site`에 파일을 복사하면서 `.git`, `.github`, `.firebase`, `_site`, `*.log`를 제외한다. **두 배포의 제외 규칙은 서로 다르다.** 공개하면 안 되는 파일을 추가할 때 두 설정을 함께 확인한다.

이 운영 문서와 작업 로그는 `.github/maintenance/`에 있으므로 현재 두 호스팅 설정에서 배포 대상이 제외된다. Git 저장소에 커밋하면 저장소 접근 권한을 가진 사람은 읽을 수 있다. GitHub 저장소의 공개 여부는 이번 작업에서 확인하지 않았다.

## 주요 파일과 데이터 위치

| 위치 | 관리 대상 |
| --- | --- |
| `index.html` | 화면 골격, 외부 스크립트, Firebase 웹 설정, CSS/JS 캐시 버전 |
| `css/style.css` | 화면 스타일과 반응형 레이아웃 |
| `js/main.js` | 메뉴, 화면 렌더링, 외부 데이터 조회, Firestore 연동 |
| `js/monthly-schedules.js` | 공유 월중행사계획표 데이터 해석 |
| `data.json` | 기본 공지·링크·서식·업무 도구와 일정·시간표 데이터 소스 설정 |
| `assets/` | QR 등 정적 자산 |
| `util/` | 교사용 업무 도구 정적 웹앱 (`01 학생부 개인정보 삭제 도구` 등) |
| `mini_game/` | 미니게임 목록과 개별 게임 |
| `firestore.rules` | Firestore 접근 규칙 소스 |
| `.firebaserc`, `firebase.json` | Firebase 프로젝트와 배포 대상 설정 |
| `.github/workflows/` | GitHub Actions 배포 설정 |

홈페이지는 정적 HTML/CSS/JavaScript로 구성되어 있으며, 현재 루트에 `package.json`은 없다. `data.json` 기본 데이터와 Firestore 저장 데이터를 함께 사용한다.

Firestore 컬렉션은 `shared-links`(공유 링크), `department-notices`(공지), `work-documents`(서식), `deleted-item-ids`(기본 항목의 삭제 기록), `site-settings`(방문자 수·특별실 이름/예약·일정 등)이다. 일부 데이터는 브라우저 `localStorage`에도 저장된다. **코드 커밋이나 Hosting 재배포가 Firestore 데이터 백업을 대신하지 않는다.** 로컬에서 화면을 실행해도 `index.html`의 Firebase 설정은 운영 프로젝트를 가리키므로 저장·삭제 기능을 시험할 때 실제 데이터에 반영될 수 있다.

현재 `firestore.rules`는 위 다섯 컬렉션의 읽기·쓰기를 `if true`로 허용하며 그 밖의 경로는 거부한다. 이는 로컬 규칙 파일의 상태이며, 운영에 적용된 규칙은 별도로 확인해야 한다. Hosting 자동 배포 워크플로에는 Firestore 규칙 배포 단계가 명시되어 있지 않다.

학사일정은 현재 공유 Google Sheets 월중행사계획표를 기준으로 읽는다. 원본 주소와 월별 탭 이름은 `data.json`의 `monthlyPlanSource`에서 관리한다. 2026-10-06 기준 매핑은 2026년 3~10월이며, 새 달·새 학년도에는 원본 시트와 매핑을 확인한다. 주간 시간표 소스는 `timetableSource`, 수업 변경 소스는 `classChangeSource`를 확인한다. 외부 시트 내용 변경은 Git 변경으로 남지 않는다.

## 실제 관리 작업 순서

1. 이 문서와 `WORK_LOG.md`의 최신 기록을 읽고, `git status --short`, `git branch --show-current`, `git log -5 --oneline`, `git remote -v`로 시작 상태를 확인한다. 기존 변경과 이번 작업을 구분하여 로그에 기록한다.
2. 요청·대상 파일·현재 증상을 로그에 남긴 후 수정한다. 구조나 데이터 소스를 변경했다면 이 문서도 갱신한다.
3. 작업에 맞게 검증한다. JSON 변경은 구문을 확인하고, 화면 변경은 로컬 HTTP 서버에서 데스크톱·모바일 화면과 관련 메뉴를 확인한다. 일정·시간표 변경은 대상 월·학기와 원본 데이터를 비교한다. CSS/JS 캐시 버전을 사용하는 경우 `index.html`의 해당 `?v=` 값도 검토한다.
4. `git diff --check`와 관련 파일의 diff를 확인한다. 검증한 결과와 검증하지 못한 범위를 로그에 명시한다.
5. 커밋할 때 필요한 파일과 작업 로그를 경로별로 선별한다. `git add .`로 다른 작업자의 변경이나 임시 파일을 함께 올리지 않는다. 푸시·병합·배포 여부는 실제 수행 결과에 맞춰 기록한다.
6. 배포 작업을 수행했다면 GitHub Actions에서 두 워크플로의 결과를 확인한다. Firebase 배포 완료 후 실제 주소에서 변경 화면·콘솔 오류·데이터 로딩을 확인한다. 커밋·푸시 성공과 사이트 배포 성공은 각각 기록한다.
7. 종료 전에 완료 사항, 실패·미검증 사항, 남은 작업과 재현 방법을 로그에 추가한다. 현재 브랜치와 남은 미커밋 변경도 다음 작업자가 알 수 있게 남긴다.

로컬 확인은 Python이 설치된 환경에서 프로젝트 루트에 다음 명령을 실행하고 `http://127.0.0.1:8092/`를 연다. 서버 종료는 실행 터미널에서 `Ctrl+C`를 누른다. 이 명령은 사용 예시이며 이번 문서화 작업에서 실행하지 않았다.

```powershell
python -m http.server 8092 --bind 127.0.0.1
```

현재 `tools/start-local-server.ps1`도 있지만 Git에서 추적되지 않는 폴더에 있고 특정 PC의 Python 경로에 의존한다. 다음 작업자가 이 도구를 사용할 수 있다고 가정하지 않는다.

## 배포 문제를 확인할 때

- 자동 배포가 시작되지 않으면 푸시한 원격과 브랜치가 `origin`·`master`인지 확인한다.
- Firebase 배포 실패는 Actions 로그, 프로젝트 ID, 서비스 계정 Secret과 권한을 확인한다. 비밀 값은 로그에 남기지 않는다.
- 배포 후 화면이 이전 상태라면 실행한 워크플로의 커밋, 브라우저 캐시, `index.html`의 자산 버전을 확인한다.
- 화면은 열리지만 데이터가 없으면 `data.json`, Google Sheets 소스·탭 이름·접근 권한, Firestore 연결·규칙, 브라우저 콘솔을 확인한다.
- 문제가 있는 코드 배포를 되돌려야 하면 해당 변경을 되돌리는 커밋 또는 Firebase 배포 이력의 복원 기능을 검토한다. Hosting 복원으로 Firestore·외부 시트 데이터까지 복원되지는 않는다.
