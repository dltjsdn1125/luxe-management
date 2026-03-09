# 통합문서1-structure.json

**통합 문서1.xlsx**의 실제 셀·병합 구조를 그대로 가져와 일일정산 페이지에 반영하기 위한 JSON입니다.

## 사용법

1. `통합 문서1.xlsx`를 `장부form/` 폴더에 넣어둡니다.
2. 프로젝트 루트에서 아래를 실행합니다.

```bash
npm install
npm run excel-to-json
```

3. 생성된 `장부form/통합문서1-structure.json`을 웹에서 불러와 일일정산 페이지가 엑셀과 같은 레이아웃으로 표시됩니다.

## 출력 구조

| 필드 | 설명 |
|------|------|
| `sheets[]` | 시트별 전체 행·열·병합(merges)·셀값(rows) |
| `branchDailySettlement` | 지점별 일일정산 테이블(헤더 병합 포함) |
| `settlementInputForm` | 정산 입력 폼용 룸 블록 레이아웃(엑셀에서 추출) |
