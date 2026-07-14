// apply-manual-patches.mjs
// One-off patch pass: fixes a small, known set of extraction gaps in
// data/almanac.mock.json that extract-almanac-data.mjs cannot resolve on
// its own — name-matching collisions where two countries' text blocks
// landed in the same source region (Korea, Panama/Guatemala, St Kitts/
// Dominica, St Vincent/Dominican Republic), a diplomatic-relations phrasing
// case detectRelations() can't parse (St Lucia's "外長...簽署建交公報"
// names officials by title rather than a generic self-reference keyword),
// a false-positive detectRelations() match unfixable by further heuristics
// (Vanuatu's brief, quickly-reversed 2004 establishment), and two
// structural non-bugs (Hong Kong/Macau genuinely have no sovereign capital
// concept).
//
// Must be re-run after every extract-almanac-data.mjs run, since that
// script overwrites data/almanac.mock.json wholesale.
//
// Run manually: node scripts/apply-manual-patches.mjs
// Not wired into any build step — this repo has no bundler/build (see AGENTS.md).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ALMANAC_PATH = path.join(ROOT, 'data', 'almanac.mock.json');

function fb(cap, lang, pop, area, loc, relations) {
  const items = [
    { label: '首都', value: cap },
    { label: '語言', value: lang },
    { label: '人口', value: pop },
    { label: '面積', value: area },
    { label: '地理位置', value: loc },
  ];
  if (relations) items.push({ label: '邦交', value: relations });
  return items;
}

function main() {
  const almanac = JSON.parse(fs.readFileSync(ALMANAC_PATH, 'utf-8'));

  // Korea collision: both blocks resolved to the same key, so KR was lost
  // entirely and KP held Seoul's data. The 與我關係 text found under this
  // block is specifically about South Korea (民國81年斷交後...) — North
  // Korea has no bilateral-relations narrative in this yearbook at all, so
  // KP is left with an empty timeline rather than fabricating content.
  almanac.KP = {
    iso: 'KP', name_zh: '北韓', name_en: 'North Korea', flag: '🇰🇵',
    factbox: fb('平壤（Pyongyang）', '韓語', '2,630萬人（2024）', '120,538 平方公里', '東北亞，朝鮮半島'),
    sections: [],
  };
  almanac.KR = {
    iso: 'KR', name_zh: '南韓', name_en: 'South Korea', flag: '🇰🇷',
    factbox: fb('首爾（Seoul）', '韓語', '5,209萬人（2024）', '99,720 平方公里', '東北亞，朝鮮半島'),
    sections: [{
      type: 'timeline', title: '近年大事記',
      events: [
        { date: '2023-04-19', title: '南韓總統尹錫悅稱台海問題為全球性議題', desc: '南韓總統尹錫悅接受外媒訪問時指出，台海問題為全球性議題，反對武力改變現狀。' },
      ],
    }],
  };

  // Panama/Guatemala collision: same pattern, GT was lost and PA held
  // Guatemala City's data. Panama severed relations in 2017 — its
  // relations text has no ★ bullet in the 5-year window (or even the
  // relaxed unwindowed tier, since the 2017 severance date is embedded
  // inside the text's opening summary sentence rather than its own ★
  // bullet, which the parser's one-date-per-bullet assumption misses) —
  // the severance date is still the single most relevant fact about
  // Panama's current status, so it's included directly.
  almanac.PA = {
    iso: 'PA', name_zh: '巴拿馬', name_en: 'Panama', flag: '🇵🇦',
    factbox: fb('巴拿馬市（Panama City）', '西班牙語', '447萬人（2024.7）', '75,420平方公里', '中美洲'),
    sections: [{
      type: 'timeline', title: '近年大事記',
      events: [
        { date: '2017-06-13', title: '巴拿馬與中國建交，同日我與巴國斷交', desc: '2017年6月13日巴拿馬與中國建交，同日我與巴國斷交。' },
      ],
    }],
  };
  almanac.GT = {
    iso: 'GT', name_zh: '瓜地馬拉', name_en: 'Guatemala', flag: '🇬🇹',
    factbox: fb(
      '瓜地馬拉市（Guatemala City）', '西班牙語', '1,826萬人（2024.7）', '108,889平方公里', '中美洲北部，鄰墨西哥',
      '1935年中華民國在瓜地馬拉設立總領事館，1960年升格為大使館'
    ),
    sections: [{
      type: 'timeline', title: '近年大事記',
      events: [
        { date: '2024-05-21', title: '賴清德總統與瓜國總統視訊談話', desc: '總統賴清德與瓜地馬拉總統阿雷巴洛視訊談話，感謝阿雷巴洛總統堅定支持台灣。' },
        { date: '2023-04-25', title: '賈麥岱總統訪台並赴立法院演說', desc: '瓜地馬拉總統賈麥岱訪台，並赴立法院發表演說。' },
        { date: '2023-03-03', title: '蔡英文總統訪問瓜地馬拉', desc: '總統蔡英文訪問瓜地馬拉，瓜國總統賈麥岱贈勳蔡總統。' },
        { date: '2022-01', title: '瓜國駐台商務參事處揭牌', desc: '瓜地馬拉駐台商務參事處揭牌。' },
      ],
    }],
  };

  // St Kitts/Dominica collision: KN was lost entirely.
  almanac.KN = {
    iso: 'KN', name_zh: '聖克里斯多福及尼維斯', name_en: 'Saint Kitts and Nevis', flag: '🇰🇳',
    factbox: fb(
      '巴士地（Basseterre）', '英語', '5萬5,133人（2024.8）', '261平方公里',
      '東加勒比海小安地列斯群島中，背風群島的北部', '1983年10月9日與中華民國建交'
    ),
    sections: [{
      type: 'timeline', title: '近年大事記',
      events: [
        { date: '2024-05-18', title: '副總理率團參加總統就職', desc: '聖克里斯多福及尼維斯副總理韓利率團訪台，參加總統賴清德就職典禮。' },
        { date: '2023-10-09', title: '總督來台參加國慶', desc: '聖克里斯多福及尼維斯總督萊柏來台參加中華民國國慶活動。' },
        { date: '2023-09-16', title: '慶祝建國40週年', desc: '外交部長吳釗燮率團參加聖克里斯多福及尼維斯建國40週年慶。' },
        { date: '2022-11-08', title: '新任總理德魯訪台', desc: '聖克里斯多福及尼維斯新任總理德魯訪台，總統蔡英文以軍禮歡迎。' },
        { date: '2022', title: '友邦於WHA提案邀台灣列席', desc: '聖克里斯多福及尼維斯等13友邦於世界衛生大會提出「邀請台灣以觀察員身分出席WHA」案。' },
      ],
    }],
  };

  // St Vincent/Dominican Republic collision: VC was lost entirely.
  almanac.VC = {
    iso: 'VC', name_zh: '聖文森及格瑞那丁', name_en: 'Saint Vincent and the Grenadines', flag: '🇻🇨',
    factbox: fb(
      '京斯鎮（Kingstown）', '英語', '10萬647人（2024.8）', '389平方公里',
      '東加勒比海小安地列斯群島中，向風群島之中部', '1981年8月15日聖文森總理卡拓在臺北簽署建交公報'
    ),
    sections: [{
      type: 'timeline', title: '近年大事記',
      events: [
        { date: '2024-05-18', title: '總理率團參加總統就職', desc: '聖文森總理龔薩福來台參加總統賴清德就職典禮。' },
        { date: '2023-10-07', title: '總督來台參加國慶', desc: '聖文森總督朵根來台參加中華民國國慶活動。' },
        { date: '2023-09', title: '總理聯大總辯論挺台', desc: '聖文森總理龔薩福於聯合國大會總辯論為台灣國際參與發聲。' },
        { date: '2022-08', title: '總理龔薩福於中共軍演期間訪台', desc: '中共對台軍演期間，聖文森總理龔薩福第12次訪台。' },
        { date: '2022-07-27', title: '總理龔薩福感謝台灣港口發展貸款', desc: '聖文森總理龔薩福在推特感謝台灣提供6,000萬美元貸款支持聖國港口發展。' },
      ],
    }],
  };

  // Hong Kong/Macau: special administrative regions, no sovereign capital.
  if (almanac.HK) almanac.HK.factbox[0].value = '香港（特別行政區無另設首都，全境由香港政府直轄）';
  if (almanac.MO) almanac.MO.factbox[0].value = '澳門（特別行政區無另設首都，全境由澳門政府直轄）';

  // St Lucia: correctly extracted 5-field data, but detectRelations() misses
  // its establishment sentence ("外長黃志芳與露國外長布斯吉...簽署建交公報")
  // because it names officials by title, not a generic self-reference keyword.
  if (almanac.LC && almanac.LC.factbox.length === 5) {
    almanac.LC.factbox.push({
      label: '邦交',
      value: '2007年4月30日外長黃志芳與露國外長布斯吉簽署建交公報，恢復邦交',
    });
  }

  // Vanuatu: false positive. The text opens with "與我無邦交"; the brief
  // 2004 establishment was reversed within weeks (a no-confidence vote
  // toppled the PM who signed it, and the new PM restored relations with
  // China) — a known unfixable-by-heuristic case, same category as the
  // Korea-War narrative issue documented in extract-almanac-data.mjs.
  if (almanac.VU) {
    almanac.VU.factbox = almanac.VU.factbox.filter((f) => f.label !== '邦交');
  }

  fs.writeFileSync(ALMANAC_PATH, `${JSON.stringify(almanac, null, 2)}\n`, 'utf-8');
  console.log('Manual patches applied: KP, KR, PA, GT, KN, VC, HK, MO, LC, VU');
}

main();
