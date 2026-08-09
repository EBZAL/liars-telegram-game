# Liar's Deck — مشخصات Canonical قوانین و منطق بازی

**نسخه سند:** v3 — Audited / Project Rules / Implementation-Ready  
**تاریخ ممیزی:** 2026-08-09  
**هدف:** مرجع قطعی Game Rules برای Project Architect و Executor هنگام ساخت نسخه‌ی 2 تا 4 نفره در Telegram Mini App.  
**دامنه:** فقط **PC Liar's Deck Basic / Classic** با درنظرگرفتن اینکه آپدیت رسمی **Liar's Deck Remastered (2 Jul 2026)** اعلام کرده تجربه‌ی اصلی Gameplay حفظ شده است. Devil، Chaos، Liar's Deck 2، Dice، Poker و Slots خارج از Scope هستند.

---

## 0. نتیجه‌ی ممیزی

این سند پس از ممیزی دوباره‌ی منابع رسمی و منابع تفصیلی مبتنی بر Tutorial بازی، برای **Core Gameplay** کامل شده است.

در نسخه‌ی قبلی چند نکته برای پیاده‌سازی صریح نبود که اکنون اضافه شده‌اند:

1. رفتار کارت‌های **undealt** در بازی 2 و 3 نفره و پس از Eliminationها.
2. اینکه Claim توسط بازیکن آزادانه ساخته نمی‌شود: **Rank همیشه Table Rank و Count همیشه تعداد کارت‌های واقعاً بازی‌شده است**.
3. نبودن Action به نام Pass و محدودیت دقیق Actionهای Turn.
4. پنجره‌ی Challenge و اینکه فقط **آخرین Play واقعی و حل‌نشده** قابل Challenge است، حتی اگر Seatهای خالی/بدون کارت Skip شوند.
5. اینکه Table Rank می‌تواند در Roundهای متوالی تکرار شود.
6. تفکیک دقیق وضعیت‌های `ALIVE_WITH_CARDS`، `ALIVE_EMPTY_SAFE` و `ELIMINATED`.
7. قانون اطلاعات مخفی برای Spectator حذف‌شده؛ Patch رسمی بازی صراحتاً دیدن کارت‌های دیگران توسط Dead Player را باگ دانسته و حذف کرده است.
8. Timeout: وجود Timer 30 ثانیه‌ای و Auto-Selection مستند است، اما **الگوریتم دقیق انتخاب خودکار کارت‌ها** در منابع عمومی معتبر مشخص نشده؛ این یک Source Gap واقعی است و نباید با حدس پر شود.
9. تعارض نسخه‌ی موبایل با PC درباره‌ی Empty Hand مشخص و از Ruleset این پروژه جدا شده است.

**نتیجه:** برای تمام State Transitionهای اصلی بازی سند Deterministic است. Source Gap مربوط به الگوریتم Timeout نسخه اصلی با یک **Project Override صریح** برای این پروژه بسته شده است؛ این Override نباید به‌عنوان قانون Canonical خود Liar's Bar معرفی شود.

---

# Project Override ثبت‌شده در این نسخه

این نسخه علاوه بر Rules ممیزی‌شده، یک تصمیم صریح پروژه را ثبت می‌کند:

> اگر Turn Timer تمام شود و بازیکن هیچ کارتی انتخاب نکرده باشد، بازی دقیقاً یک کارت را به‌صورت تصادفی از Hand فعلی او انتخاب و Auto-Play می‌کند.

این تصمیم برای پیاده‌سازی پروژه **الزام‌آور** است، اما ادعا نمی‌شود که الگوریتم دقیق نسخه اصلی Liar's Bar بوده است.

---

# 1. سیاست منابع و نسخه‌ی هدف

برای جلوگیری از مخلوط‌شدن Rulesetها، ترتیب اعتماد این سند چنین است:

1. Steam Store رسمی Curve Animation.
2. Steam News / Patch Notes رسمی Curve Animation.
3. Patch Notes رسمی بازنشرشده در SteamDB فقط وقتی متنِ همان Announcement رسمی را منتقل می‌کنند.
4. Rule reconstruction تفصیلی Guillaume Fortin-Debigaré که صراحتاً بر in-game tutorial، مشاهده‌ی gameplay و comments توسعه‌دهندگان بنا شده است.
5. Steam Community Rule Guides برای corroboration و جزئیات UI/Timeout.
6. منابع غیررسمی دیگر فقط برای corroboration، نه برای ساخت Rule جدید.

### نکته‌ی مهم درباره Mobile

نسخه‌ی رسمی Android در Google Play در توضیحات فعلی خود می‌گوید خالی‌شدن Hand بازیکن را وارد «sudden-death Russian roulette» می‌کند. این با رفتار Basic PC که توسط Tutorial-derived rules و رفتار عملی PC مستند شده تعارض دارد. بنابراین:

> **این پروژه از PC Liar's Deck Basic/Remastered پیروی می‌کند، نه Mobile-specific Empty-Hand rule.**

از منبع Mobile فقط برای تأیید رسمی 2–4 player و کلیات Liar's Deck استفاده می‌شود، نه برای Edge Caseهای PC.

---

# 2. واژگان و Stateهای Canonical

## 2.1 Match

از شروع بازی با 2 تا 4 بازیکن تا زمانی که فقط یک بازیکن زنده باقی بماند.

## 2.2 Round

از Deal کارت‌ها و انتخاب Table Rank تا یک `LIAR` Resolution و Russian Roulette مربوط به آن.

## 2.3 Turn

فرصت Action یک بازیکن واجد شرایط در Round.

## 2.4 Player States

برای جلوگیری از باگ، حداقل این سه وضعیت باید از هم جدا باشند:

### `ALIVE_WITH_CARDS`

- بازیکن از Match حذف نشده.
- حداقل یک کارت در Hand دارد.
- در Turn cycle همان Round شرکت می‌کند.

### `ALIVE_EMPTY_SAFE`

- بازیکن از Match حذف نشده.
- Hand او در همین Round خالی شده.
- Play آخر او یا Challenge نشده و فرصت Challenge آن گذشته، یا اکنون دیگر Turn ندارد.
- تا پایان همان Round Skip می‌شود.
- در Round بعد دوباره مانند هر بازیکن زنده 5 کارت دریافت می‌کند.

### `ELIMINATED`

- Lethal را در Russian Roulette گرفته است.
- دیگر در هیچ Turn یا Deal بعدی Match شرکت نمی‌کند.
- Match فقط زمانی پایان می‌یابد که تمام بازیکنان به‌جز یک نفر `ELIMINATED` شده باشند.

---

# 3. تعداد بازیکن و شرط برد

- حداقل: **2 بازیکن**.
- حداکثر: **4 بازیکن**.
- هدف Match: **Last Player Standing**.
- خالی‌شدن Hand به‌تنهایی برد Match نیست.
- خالی‌شدن Hand به‌تنهایی Elimination هم نیست.
- تنها Lethal در Russian Roulette بازیکن را از Match حذف می‌کند.
- وقتی فقط یک بازیکن زنده بماند، Match فوراً پایان می‌یابد و همان Player Winner است.

---

# 4. اجزای بازی

## 4.1 Liar Deck — 20 Cards

- 6 × King
- 6 × Queen
- 6 × Ace
- 2 × Joker

جمع: **20 کارت**.

## 4.2 Table Deck

برای مدل دقیق قواعد:

- 1 × King
- 1 × Queen
- 1 × Ace

در آغاز هر Round این Table Deck Shuffle و یک کارت Reveal می‌شود. همان Rank، Table Rank آن Round است.

## 4.3 Revolver State — برای هر Player مستقل

برای هر بازیکن:

- 1 × Lethal
- 5 × Blank

این شش نتیجه در ابتدای Match Shuffle می‌شوند و ترتیب آن‌ها در طول Match برای همان بازیکن پایدار می‌ماند.

---

# 5. Match Initialization

در شروع Match:

1. بین 2 تا 4 Player وارد بازی می‌شوند.
2. یک Turn/Seat order چرخه‌ای تعیین می‌شود.
3. منابع Tutorial-derived ترتیب نشستن را Random توصیف می‌کنند.
4. First Player اولین Round به‌صورت Random انتخاب می‌شود.
5. برای هر Player یک Revolver sequence مستقل شامل `1 Lethal + 5 Blank` Shuffle می‌شود.
6. هیچ Player در ابتدا Eliminated نیست.

### Turn order

منابع تفصیلی، جهت بازی را **counter-clockwise** توصیف می‌کنند. در کد، مهم‌تر از جهت بصری این invariant است:

> Match یک **cyclic seat order ثابت** دارد و `nextEligiblePlayer()` همیشه در همان جهت ثابت حرکت می‌کند.

---

# 6. Round Initialization

اگر Match هنوز Winner ندارد، هر Round به این ترتیب شروع می‌شود:

1. Table Deck شامل K/Q/A Shuffle می‌شود.
2. Top Table Card Reveal می‌شود.
3. `tableRank ∈ {KING, QUEEN, ACE}` تعیین می‌شود.
4. تمام 20 کارت Liar Deck دوباره جمع و Shuffle می‌شوند.
5. هر Player زنده دقیقاً **5 کارت** دریافت می‌کند.
6. Playerهای Eliminated هیچ کارتی دریافت نمی‌کنند.
7. کارت‌های Dealنشده وارد Hand هیچ‌کس نمی‌شوند و تا پایان Round خارج از بازی می‌مانند.
8. Central played pile خالی می‌شود.
9. `previousPlay = null` می‌شود.
10. First Player همان Round Turn اول را آغاز می‌کند.

## 6.1 تعداد کارت‌های Undealt

این نتیجه مستقیماً از `20-card deck` و `5 cards per living player` به‌دست می‌آید:

| Living Players | Dealt | Undealt / Hidden |
|---:|---:|---:|
| 4 | 20 | 0 |
| 3 | 15 | 5 |
| 2 | 10 | 10 |

پس از Elimination نیز همین قاعده اعمال می‌شود؛ Deck کوچک نمی‌شود و Composition تغییر نمی‌کند.

### اثر منطقی مهم

وجود کارت Undealt یعنی در بازی 2 یا 3 نفره بازیکنان نمی‌توانند صرفاً با دیدن کارت‌های Hand/Played نتیجه بگیرند تمام King/Queen/Ace/Jokerهای باقی‌مانده الزاماً دست حریف هستند.

---

# 7. Table Rank

در هر Round فقط یک Rank معتبر اصلی وجود دارد:

- King's Table
- Queen's Table
- Ace's Table

کارت معتبر (`Innocent`) برای همان Round:

```text
card.rank == tableRank
OR
card.rank == JOKER
```

همه‌ی King/Queen/Aceهای دیگر `Liar card` هستند.

### تکرار Rank بین Roundها

چون Table Deck در **هر Round دوباره Shuffle** می‌شود، Table Rank حافظه‌ی Round قبلی را ندارد و **ممکن است همان Rank در دو یا چند Round متوالی دوباره انتخاب شود**.

---

# 8. Claim دقیقاً چیست؟

در Basic Liar's Deck، Player یک Rank دلخواه برای Claim انتخاب نمی‌کند.

اگر Table = Queen و Player دو کارت بازی کند، Claim او دقیقاً:

```text
2 Queens
```

است؛ مستقل از مقدار واقعی آن دو کارت.

بنابراین:

```text
claim.rank  = tableRank
claim.count = numberOfCardsPlayed
```

Player نمی‌تواند:

- یک کارت بازی کند و ادعا کند دو کارت بوده؛
- دو کارت بازی کند و ادعا کند سه کارت بوده؛
- در Queen's Table ادعا کند King بازی کرده؛
- Count یا Rank جداگانه Bid کند.

Bluff فقط در **هویت واقعی کارت‌های face-down** است.

---

# 9. Turn — Actionهای مجاز

## 9.1 First Turn یک Round

چون `previousPlay == null` است:

- `CALL_LIAR` مجاز نیست.
- Player باید بین 1 تا 3 کارت بازی کند.
- Pass وجود ندارد.

## 9.2 Turnهای بعدی

Player دارای کارت دقیقاً یکی از این دو Action را دارد:

### Action A — `PLAY_CARDS`

- حداقل 1 کارت.
- حداکثر 3 کارت.
- اگر Hand کمتر از 3 کارت دارد، حداکثر برابر اندازه‌ی Hand است.
- کارت‌ها face-down بازی می‌شوند.

پس:

```text
1 <= playedCount <= min(3, handCount)
```

### Action B — `CALL_LIAR`

- فقط روی `previousPlay` مجاز است.
- با Call کردن، Player دیگر در همان Turn کارت بازی نمی‌کند.
- Round وارد Reveal/Resolution می‌شود.

## 9.3 Action ممنوع

Basic Rules هیچ Action مستقلی به نام `PASS` ندارد.

اگر Player نخواهد `LIAR` بگوید، باید یک Play قانونی 1–3 کارتی انجام دهد.

---

# 10. ثبت Play و Central Pile

وقتی Player کارت بازی می‌کند:

1. کارت‌های انتخاب‌شده از Hand او حذف می‌شوند.
2. همان کارت‌ها face-down وارد Central Pile می‌شوند.
3. Count کارت‌ها عمومی است.
4. Value واقعی کارت‌ها مخفی می‌ماند.
5. `previousPlay` به همین Play جدید اشاره می‌کند.
6. Playهای قدیمی‌تر دیگر Challenge target نیستند.

برای پیاده‌سازی بدون ambiguity، یک Play منطقی حداقل شامل این داده‌هاست:

```text
playId
playerId
cardIds[]
count
claimedRank = tableRank
resolved = false
```

`cardIds[]` فقط برای Game Engine معتبر است و تا Challenge نباید برای سایر Playerها Reveal شود.

---

# 11. Challenge Window — فقط آخرین Play

`LIAR` فقط می‌تواند آخرین Play واقعی را Challenge کند.

یعنی:

```text
challengeTarget = previousPlay
```

نه:

- هر Play دلخواه در pile؛
- Play دو Turn قبل؛
- کارت‌های جمعی pile؛
- Hand بازیکن.

### وقتی Seatهای بین دو Player Skip شده‌اند

اگر Player وسط Turn order قبلاً Hand خود را خالی کرده یا Eliminated است، Skip می‌شود. این Skip باعث ازبین‌رفتن `previousPlay` نمی‌شود.

بنابراین **next eligible player** حق دارد آخرین Play واقعی را Challenge کند، حتی اگر از نظر Seat فیزیکی بلافاصله کنار Accused نباشد.

### بسته‌شدن Challenge Window

اگر next eligible player به‌جای `CALL_LIAR` کارت‌های خودش را Play کند:

- Play قدیمی دیگر Challengeپذیر نیست.
- `previousPlay` با Play جدید جایگزین می‌شود.

---

# 12. Truth / Lie Resolution

وقتی `LIAR` اعلام می‌شود، فقط کارت‌های `previousPlay` Reveal می‌شوند.

## Truthful Play

اگر **همه** کارت‌های Revealشده یکی از موارد زیر باشند:

- Table Rank؛ یا
- Joker؛

Play Truthful است.

## Lie

اگر **حداقل یک کارت**:

- Table Rank نباشد؛ و
- Joker هم نباشد؛

کل Play = Lie.

### Mixed Play

مثلاً Queen's Table:

```text
Queen + Joker + King
```

Lie است، چون King نامعتبر است.

وجود کارت‌های صحیح در کنار یک کارت غلط، Play را نجات نمی‌دهد.

---

# 13. نتیجه‌ی CALL LIAR

## Accused دروغ گفته

```text
challengerWasCorrect = true
roundLoser = accusedPlayer
```

Accused باید Russian Roulette انجام دهد.

## Accused راست گفته

```text
challengerWasCorrect = false
roundLoser = caller
```

Caller باید Russian Roulette انجام دهد.

پس از Resolve، دیگر Play جدیدی در همان Round انجام نمی‌شود.

---

# 14. Empty Hand — منطق کامل

این بخش یکی از مهم‌ترین Edge Caseهای بازی است.

## 14.1 بازی آخرین کارت‌ها

Player مجاز است 1 تا 3 کارت باقی‌مانده‌ی خود را یکجا بازی کند.

بعد از آن:

```text
handCount = 0
```

اما Play آخر او هنوز **فوراً safe نیست**؛ next eligible player باید ابتدا تصمیم Challenge را داشته باشد، مگر اینکه Mandatory Auto-Call فعال شود.

## 14.2 اگر Play آخر Challenge شود

- اگر Lie باشد → Player خالی‌شده Round را می‌بازد و Roulette می‌کند.
- اگر Truthful باشد → Caller Round را می‌بازد و Roulette می‌کند.

## 14.3 اگر Play آخر Challenge نشود

اگر next eligible player به‌جای Challenge خودش کارت Play کند:

- Challenge Window آن Play بسته می‌شود.
- Player خالی‌شده برای باقی Round safe است.
- Turnهای او تا پایان Round Skip می‌شوند.
- او هنوز در Match زنده است.

## 14.4 بازگشت در Round بعد

`ALIVE_EMPTY_SAFE` فقط State همان Round است.

در Round بعد:

- Player دوباره 5 کارت می‌گیرد.
- دوباره Turn eligible می‌شود.

## 14.5 فقط یک Player دارای کارت باقی مانده

اگر یک Play باعث شود فقط یک Player در کل Round هنوز کارت داشته باشد، آن Player **مجبور است** آخرین Play را `LIAR` اعلام کند.

این Action اختیاری نیست.

مفهومی:

```text
if count(players where alive && handCount > 0) == 1:
    forcedCaller = theOnlyPlayerWithCards
    resolveLiar(forcedCaller, previousPlay.player)
```

این همان مکانیکی است که در Heads-Up باعث Auto-Call روی Final Play می‌شود.

---

# 15. رفتار دقیق 1v1 داخل Match

وقتی فقط دو Player زنده‌اند:

1. هر دو در شروع Round پنج کارت می‌گیرند.
2. ده کارت دیگر از Deck، undealt و مخفی می‌مانند.
3. Turnها بین دو Player زنده در همان cyclic order جابه‌جا می‌شوند.
4. اگر Player A آخرین کارت‌هایش را بازی کند، تنها Player دارای کارت = B.
5. B باید `LIAR` را روی همان Play A Call کند.
6. اگر Play A Truthful باشد → B Round loser است.
7. اگر Play A Lie باشد → A Round loser است.
8. Match فقط با Lethal یکی از دو Player پایان می‌یابد، نه صرفاً با Empty Hand.

---

# 16. Russian Roulette — State دقیق Match

هر Player Revolver State مستقل خود را دارد.

در ابتدای Match:

```text
revolver = shuffle([LETHAL, BLANK, BLANK, BLANK, BLANK, BLANK])
nextShotIndex = 0
```

هر بار Player Round loser شود:

```text
result = revolver[nextShotIndex]
nextShotIndex += 1
```

## اگر Blank

- Player زنده می‌ماند.
- Blank مصرف‌شده برنمی‌گردد.
- Revolver reset یا reshuffle نمی‌شود.
- اگر Match تمام نشده، Round جدید آغاز می‌شود.

## اگر Lethal

- Player فوراً `ELIMINATED` می‌شود.
- دیگر Turn نمی‌گیرد.
- دیگر کارت دریافت نمی‌کند.

## نتیجه‌ی قطعی پس از Blankهای متوالی

چون Revolver فقط یک Lethal دارد و Blankهای Resolveشده مصرف می‌شوند، Player که 5 Blank خود را قبلاً مصرف کرده باشد در Shot بعدی قطعاً به Lethal می‌رسد.

---

# 17. Elimination و Spectator Information

پس از Elimination:

- Player در Turn order Skip می‌شود.
- در Dealهای Roundهای بعدی حضور ندارد.
- زنده‌شدن مجدد در همان Match وجود ندارد.
- Revolver یا Hand جدید برای او ساخته نمی‌شود.

Patch رسمی 4 Oct 2024، دیدن کارت‌های سایر Playerها توسط Dead Player در Spectator Mode را باگ دانسته و Fix کرده است.

بنابراین اگر نسخه‌ی Telegram ما Spectator داشته باشد:

> Eliminated Player فقط **Public State** را می‌بیند و نباید Hidden Hand/Card Values بازیکنان زنده را دریافت کند.

این فقط Anti-Cheat recommendation نیست؛ با رفتار رسمی اصلاح‌شده‌ی بازی هم‌راستا است.

---

# 18. پایان Round و First Player Round بعد

بعد از `LIAR` Resolution:

1. `roundLoser` مشخص می‌شود.
2. roundLoser یک Shot از Revolver خودش Resolve می‌کند.
3. اگر Lethal باشد، Eliminated می‌شود.
4. اگر فقط یک Player زنده ماند → Match End.
5. در غیر این صورت Round جدید آغاز می‌شود.

### First Player Round بعد

قاعده:

```text
nextRoundFirstPlayer = roundLoser
```

اگر roundLoser همان Shot حذف شده باشد:

```text
nextRoundFirstPlayer = next non-eliminated player in fixed turn order
```

این `roundLoser` می‌تواند یکی از دو نفر باشد:

- Accused که واقعاً Lie کرده؛ یا
- Caller که اشتباه Call کرده.

---

# 19. Round Reset

در Classic/Basic، پس از Challenge + Roulette:

- همه‌ی Handهای Round قبلی پایان می‌یابند.
- همه‌ی Central Pile cards جمع می‌شوند.
- تمام 20 کارت Liar Deck دوباره برای Round جدید در دسترس‌اند.
- Deck Shuffle می‌شود.
- Table Deck دوباره Shuffle و Rank جدید Reveal می‌شود.
- همه‌ی Playerهای زنده دوباره دقیقاً 5 کارت می‌گیرند.
- Playerهای `ALIVE_EMPTY_SAFE` قبلی کاملاً وارد Round جدید می‌شوند.
- Eliminated Playerها همچنان خارج می‌مانند.
- `previousPlay = null`.

**توجه:** نگه‌داشتن Hand بین Roundها یا عدم Redistribution مربوط به Variantهاست، نه Basic.

---

# 20. Turn Advancement Algorithm

برای جلوگیری از Turn-order bug، منطق باید بر اساس eligibility باشد، نه صرفاً Seat+1.

مفهومی:

```text
function nextEligiblePlayer(fromPlayer):
    p = nextSeatCounterClockwise(fromPlayer)

    while true:
        if p.isAlive and p.handCount > 0:
            return p
        p = nextSeatCounterClockwise(p)
```

اما قبل از Advance معمولی باید Mandatory Auto-Call بررسی شود:

```text
if playersWithCards == 1:
    force that player to CALL_LIAR(previousPlay)
else:
    currentPlayer = nextEligiblePlayer(lastPlayer)
```

Patch رسمی 3 Jul 2026 صراحتاً یک bug در **incorrect turn order after a player ran out of cards** را Fix کرده است، پس این Edge Case باید Test اجباری داشته باشد.

---

# 21. Timer

Rule reconstruction مبتنی بر Tutorial و چند Guide مستقل مقدار Turn Timer را:

**30 seconds**

ذکر می‌کنند.

در طول این زمان Player باید:

- Play 1–3 cards؛ یا
- اگر مجاز است CALL_LIAR کند.

Steam Community Rules Summary همچنین می‌گوید اگر Player تا پایان زمان کارت انتخاب/Action نکند، **cards will be selected for you**.

## Source Gap نسخه اصلی

منابع عمومی معتبر بررسی‌شده الگوریتم دقیق Auto-Selection نسخه اصلی را مشخص نمی‌کنند؛ بنابراین این رفتار نباید به‌عنوان Canonical Rule از روی حدس بازسازی شود.

## Project Rule — Timeout Fallback

برای این پروژه، کاربر صریحاً رفتار زیر را تعیین کرده است:

```text
IF turn_timer_expires
AND selected_cards_count == 0
THEN choose exactly 1 random card from the player's current hand
AND play that card automatically
```

قواعد اجرایی:

- فقط وقتی **هیچ کارتی انتخاب نشده باشد** این Random Fallback فعال می‌شود.
- Engine دقیقاً **1 کارت** انتخاب می‌کند، نه 2 یا 3 کارت.
- انتخاب باید از میان کارت‌هایی باشد که در همان لحظه واقعاً در Hand بازیکن هستند.
- کارت انتخاب‌شده بلافاصله مثل یک Play عادی ثبت می‌شود.
- Claim Count برای این Auto-Play برابر `1` است.
- Claim Rank همچنان برابر `tableRank` است.
- کارت ممکن است Truthful، Joker یا Lie باشد؛ Engine نباید برای «بهتر بازی کردن» کارت خاصی را ترجیح دهد.
- Random selection باید بدون دخالت UI انجام شود.
- این قانون **Project Override** است و نباید به‌عنوان رفتار مستند نسخه اصلی Liar's Bar معرفی شود.

### وضعیت پروژه

```text
TURN_TIMER_SECONDS = 30
TIMEOUT_CAUSES_AUTOMATIC_CARD_PLAY = documented
ORIGINAL_TIMEOUT_SELECTION_ALGORITHM = SOURCE_GAP / NOT VERIFIED

PROJECT_TIMEOUT_FALLBACK:
  trigger = timer expired AND selected_cards_count == 0
  auto_play_count = 1
  selection = uniform/random from current hand
  claim_count = 1
  claim_rank = tableRank
```

### حالت انتخاب‌شده ولی Confirm نشده

این تصمیم فعلی فقط حالت `selected_cards_count == 0` را تعریف می‌کند. اگر UI اجازه دهد بازیکن کارت‌هایی را Select کند ولی قبل از Confirm زمان تمام شود، رفتار آن باید جداگانه در UX/Interaction Spec تعریف شود و نباید از این Rule استنتاج شود.

---

# 22. Public vs Hidden Information

## Hidden

- Hand card values هر Player فقط برای خودش.
- کارت‌های face-down هر Play تا زمان Challenge.
- کارت‌های Undealt.
- ترتیب دقیق Lethal/Blankهای آینده‌ی هر Revolver.

## Public

- Table Rank فعلی.
- Current Player.
- Living / Eliminated state.
- Hand card **count** بازیکنان.
- تعداد کارت‌های آخرین Play.
- Playerی که آخرین Play را انجام داده.
- نتیجه‌ی Reveal در Challenge.
- Shot outcome بعد از Roulette.
- Progress/used-shot count Revolver مطابق UI بازی.

### Spectator

Eliminated spectator به Hidden cards بازیکنان زنده دسترسی ندارد.

---

# 23. قواعد دقیق برای 2 / 3 / 4 نفر

## 2 Players

- 10 cards dealt, 10 undealt.
- Turn cycle بین دو Player است.
- Empty Hand یکی، به Mandatory Call توسط دیگری منجر می‌شود.
- اولین Lethal یکی از دو نفر = Match winner برای دیگری.

## 3 Players

- 15 cards dealt, 5 undealt.
- Player empty-safe از Turn cycle همان Round حذف می‌شود ولی Alive است.
- اگر یک Player Eliminated شود، Match با دو Player ادامه دارد.
- Round بعد با 2 Player: 10 کارت Deal و 10 کارت Undealt.

## 4 Players

- 20 cards dealt, 0 undealt.
- با اولین Elimination، Roundهای بعد 3-player rules را دارند.
- سپس 4 → 3 → 2 → 1 living players.
- Core Rules عوض نمی‌شوند؛ فقط eligibility و تعداد undealt تغییر می‌کند.

---

# 24. Invariants اجباری برای Game Engine

Project Architect نباید این Invariantها را تغییر دهد مگر با تصمیم صریح کاربر:

1. PlayerCount فقط 2–4.
2. Deck همیشه 20 = 6K + 6Q + 6A + 2J.
3. Living Player ابتدای هر Round دقیقاً 5 کارت می‌گیرد.
4. Eliminated Player کارت نمی‌گیرد.
5. Table Rank فقط K/Q/A است.
6. Joker همیشه برای Table Rank معتبر است.
7. Claim Rank همیشه = Table Rank.
8. Claim Count همیشه = played card count.
9. Play قانونی = 1 تا `min(3, handCount)` کارت.
10. Pass وجود ندارد.
11. CALL_LIAR روی First Turn Round ممنوع است.
12. فقط آخرین Play حل‌نشده Challenge می‌شود.
13. Reveal فقط کارت‌های همان Previous Play است.
14. یک کارت Invalid کافی است تا کل Play Lie شود.
15. Correct Caller → Accused shoots.
16. Wrong Caller → Caller shoots.
17. Revolver sequence هر Player در طول Match persist می‌کند.
18. Blank مصرف می‌شود و Revolver reshuffle نمی‌شود.
19. Lethal تنها مسیر Elimination در Basic است.
20. Empty Hand = Elimination نیست.
21. Empty Hand Play تا تصمیم next eligible player هنوز Challengeable است.
22. اگر next eligible player Play کند، Challenge Window قبلی بسته می‌شود.
23. Empty-safe Player تا پایان همان Round Skip می‌شود.
24. اگر فقط یک Player کارت دارد، Mandatory CALL_LIAR رخ می‌دهد.
25. Round بعد همه‌ی Living Players دوباره Hand جدید می‌گیرند.
26. Round loser شروع‌کننده‌ی Round بعد است.
27. اگر Round loser Eliminated شد، next living player در همان cycle شروع می‌کند.
28. Table Rank می‌تواند پشت‌سرهم تکرار شود.
29. Dead spectator نباید Hidden handهای Living Players را ببیند.
30. Match با یک Living Player فوراً تمام می‌شود.
31. Variant mechanics وارد Basic نمی‌شوند.
32. اگر Turn Timer تمام شود و Player هیچ کارتی انتخاب نکرده باشد، Engine دقیقاً 1 کارت تصادفی از Hand فعلی او Auto-Play می‌کند.
33. Timeout Random Fallback نباید بر اساس Rank، Truthfulness یا Joker بودن کارت Bias داشته باشد.

---

# 25. Edge Cases که باید صریحاً Test شوند

این Testها Rule جدید نیستند؛ از قواعد بالا مشتق شده‌اند و برای جلوگیری از پیاده‌سازی پر باگ لازم‌اند.

## Card validity

### T01 — Pure Truth

Queen's Table:

```text
[Q, Q]
```

Expected: Truthful.

### T02 — Joker Truth

Queen's Table:

```text
[JOKER]
```

Expected: Truthful.

### T03 — Mixed Truth

Queen's Table:

```text
[Q, JOKER, Q]
```

Expected: Truthful.

### T04 — Mixed Lie

Queen's Table:

```text
[Q, JOKER, K]
```

Expected: Lie.

## Action legality

### T05 — First Turn cannot challenge

`previousPlay = null`

Expected: CALL_LIAR rejected.

### T06 — Zero-card Play rejected

Expected: rejected.

### T07 — Four-card Play rejected

Expected: rejected.

### T08 — No Pass

Expected: only PLAY_CARDS or legal CALL_LIAR accepted.

## Challenge target

### T09 — Only previous play

A plays → B plays → C challenges.

Expected: C challenges B, never A.

### T10 — skipped empty seat does not erase target

A plays → B is already empty-safe and skipped → C's turn.

Expected: C may challenge A's latest Play.

## Empty hand

### T11 — Last cards still challengeable

A plays final cards → B calls LIAR.

Expected: A's Play resolves normally.

### T12 — Empty player becomes safe only after no challenge

A plays final cards → B chooses PLAY_CARDS.

Expected: A becomes safe for remainder of Round; A's old Play no longer challengeable.

### T13 — 1v1 forced call

A plays final card, B still has cards.

Expected: B automatically CALL_LIAR on A.

### T14 — 3-player forced call after two empty

A empty-safe, B plays final cards, C is only Player still holding cards.

Expected: C forced to CALL_LIAR on B.

## Round result

### T15 — Correct challenge

Previous Play contains invalid card.

Expected: Accused = roundLoser/shooter.

### T16 — Incorrect challenge

Previous Play all Table/Joker.

Expected: Caller = roundLoser/shooter.

## Roulette

### T17 — Blank persists progress

Player's next Revolver result = Blank.

Expected: Alive; shot index increments; no reshuffle.

### T18 — Lethal eliminates

Expected: Player ELIMINATED; no future deal/turn.

### T19 — five blanks guarantee sixth lethal

After 5 Blank results, Expected next unresolved position = Lethal.

## New round

### T20 — surviving loser starts

Round loser gets Blank.

Expected: same Player starts next Round.

### T21 — eliminated loser fallback

Round loser gets Lethal.

Expected: next living Player in fixed cycle starts next Round.

### T22 — safe-empty player returns next round

Expected: receives 5 new cards.

## Player counts

### T23 — 4 players

Expected: 20 dealt / 0 undealt.

### T24 — 3 players

Expected: 15 dealt / 5 undealt.

### T25 — 2 players

Expected: 10 dealt / 10 undealt.

## Winner

### T26 — last player standing

A eliminated leaving exactly one Living Player B.

Expected: Match ends immediately; B wins; no new Round.

## Information security consistent with official gameplay

### T27 — dead spectator hidden cards

Expected: Eliminated Player cannot read living Players' hidden card values.

## Table rank

### T28 — repeated table type legal

Round N = King; next independent Table shuffle again yields King.

Expected: accepted; no anti-repeat rule.

## Timeout

### T29 — no selection at timeout

Player has 5 cards, selects none, and the 30s timer expires.

Expected:
- exactly 1 card is chosen randomly from the current Hand;
- exactly that 1 card is Auto-Played;
- Hand size decreases by 1;
- `claimCount = 1`;
- `claimRank = tableRank`;
- normal challenge rules apply to this Auto-Play.

### T30 — timeout fallback never auto-plays multiple cards

Player has at least 3 cards, selects none, and the timer expires.

Expected: Auto-Play count is always exactly 1.

### T31 — timeout random choice is not truth-biased

Hand contains a mix of matching cards, non-matching cards, and/or Joker.

Expected: selection mechanism does not intentionally prefer a truthful card, a lie, or a Joker; it selects from the current Hand according to the project's random-selection implementation.

---

# 26. چیزهایی که عمداً خارج از Basic Core هستند

بدون Scope Change وارد Game Engine نشوند:

- Devil Mode / Devil Card / Devil's Deal
- Chaos Mode / Chaos Card / Master Card
- Liar's Deck 2
- 7-card hands
- retained hands across rounds
- targeted shooting
- Table Joker from Deck 2
- Liar's Dice
- Liar's Poker
- Liar's Slots
- Ranking
- Store / Economy
- Cosmetics
- Character abilities
- Matchmaking public
- AI opponents

---

# 27. Product/Network Decisions که Rule بازی نیستند

Architect باید این‌ها را جدا از Canonical Game Rules مدیریت کند:

- Telegram room creation / join flow
- Invite links
- Reconnect
- Disconnect timeout
- Host migration
- Firebase / Cloudflare / other backend choice
- database persistence
- optimistic UI
- animation timing
- sound design
- avatar art
- bot commands
- anti-cheat implementation
- game restart / play again UX

این تصمیم‌ها نباید به‌عنوان «قانون Liar's Bar» ثبت شوند.

---

# 28. Source Gap نسخه اصلی و Project Override

برای fidelity تاریخی به نسخه اصلی PC هنوز یک Source Gap وجود دارد:

```text
When 30s turn timer expires,
exactly WHICH card(s) does the original PC game auto-select and play?
```

وجود Auto-Selection مستند است، ولی Selection Algorithm اصلی مستند نیست.

برای **این پروژه** این Gap با تصمیم صریح کاربر بسته شده است:

```text
NO CARD SELECTED AT TIMEOUT
→ choose exactly 1 random card from current hand
→ auto-play it
```

Architect باید تفاوت این دو را حفظ کند:

- `Canonical / externally verified`: Timer و وجود Auto-Selection.
- `Unknown in original`: الگوریتم دقیق انتخاب نسخه PC.
- `Project Rule`: در نبود Selection، دقیقاً یک کارت Random Auto-Play شود.

اگر بعداً منبع معتبر رفتار دقیق نسخه اصلی را مشخص کرد، آن اطلاعات فقط بخش Historical/Canonical را به‌روزرسانی می‌کند و **Project Rule فعلی را بدون تصمیم جدید کاربر تغییر نمی‌دهد**.

---

# 29. Canonical State Flow

```text
MATCH_START
  ↓
2..4 players
fixed cyclic order
per-player shuffled persistent revolver
random first player
  ↓
ROUND_START
  ↓
shuffle/reveal Table K/Q/A
shuffle full 20-card Liar Deck
5 cards → each living player
undealt cards remain hidden
previousPlay = null
  ↓
TURN
  ├─ if first turn:
  │      PLAY 1..3 only
  │
  └─ otherwise:
         PLAY 1..3
            OR
         CALL_LIAR(previousPlay)
  ↓
AFTER_PLAY
  ↓
hand becomes empty?
  ↓
count(players with cards) == 1 ?
  ├─ YES → forced CALL_LIAR by sole card-holder
  └─ NO  → next eligible player
              ↓
          CALL_LIAR or PLAY
              ↓
          if PLAY → older challenge window closes

CALL_LIAR
  ↓
reveal previousPlay only
  ↓
all cards == tableRank or Joker ?
  ├─ YES → caller loses round
  └─ NO  → accused loses round
  ↓
ROUND_LOSER_SHOT
  ↓
next persistent revolver result
  ├─ BLANK  → alive
  └─ LETHAL → eliminated
  ↓
only one living player?
  ├─ YES → MATCH_WINNER
  └─ NO  → NEW ROUND
             first player = round loser
             if eliminated → next living in cycle
```

---

# 30. منابع اصلی ممیزی

## منابع رسمی PC

1. **Liar's Bar — Steam Store / Curve Animation**  
   https://store.steampowered.com/app/3097560/Liars_Bar/  
   پشتیبانی از: face-down play، claim مطابق table value، challenge، Russian Roulette، reset کارت‌ها بعد از Roulette، game-over upon lethal.

2. **LIAR'S DECK REMASTERED — Official Steam News, 2 Jul 2026**  
   https://steamcommunity.com/app/3097560/  
   پشتیبانی از: Remaster با حفظ original gameplay experience؛ جداسازی Variantهای Chaos/Devil.

3. **HOTFIX — LIAR'S DECK REMASTERED, 3 Jul 2026**  
   https://steamcommunity.com/app/3097560/  
   پشتیبانی از: وجود و اهمیت mechanic خالی‌شدن Hand و اصلاح turn order پس از آن.

4. **Official Hotfix, 4 Oct 2024 — via Steam announcement / SteamDB mirror**  
   https://steamdb.info/patchnotes/15933605/  
   پشتیبانی از: Dead spectators نباید کارت‌های سایر Players را ببینند.

## منبع Rule Reconstruction تفصیلی

5. **Guillaume Fortin-Debigaré — How to Play Liar's Deck (Full Rules and Variants)**  
   https://www.debigare.com/how-to-play-liars-deck-from-liars-bar-full-rules-and-variants/  
   نویسنده منبع را بر in-game tutorial، gameplay observation و developer comments بنا کرده است. استفاده‌شده برای: 2–4 players، exact deck، table deck، persistent revolver sequence، random first player، round setup، 30s turn، 1–3 cards، counter-clockwise order، empty-hand skip، mandatory call، exact resolution، next-round starter.

## Steam Community corroboration

6. **Rules Summary for Deck/Dice (non-joke)**  
   https://steamcommunity.com/sharedfiles/filedetails/?id=3344163995  
   استفاده‌شده برای: exact deck، five-card hand، random table type، wildcard Joker، max 3, auto-selection on timeout، previous-play challenge، empty-hand safe/mandatory auto-call، mixed-card lie rule، revolver progress UI.

7. **Guide to Every (Current) Game Mode**  
   https://steamcommunity.com/sharedfiles/filedetails/?id=3377103757  
   استفاده‌شده برای: corroboration Deck Composition، 5-card hand، per-round type، 1–3 cards، Joker behavior.

8. **LiarsBar.Net Quick Start / Liar's Deck**  
   https://www.liarsbar.net/g/liars-bar-quick-start  
   https://www.liarsbar.net/g/liars-deck  
   استفاده‌شده فقط برای corroboration: counter-clockwise, previous-round loser starts, fixed lethal position across shots, 30-second timer.

## منبع رسمی Mobile — فقط برای مقایسه/تعارض نسخه

9. **Liar's Bar Official Mobile — Google Play / Curve Animation**  
   https://play.google.com/store/apps/details?id=com.CurveAnimation.LiarsBar&hl=en  
   تأیید 2–4 players و broad gameplay؛ اما Empty-Hand mobile text با PC Basic تعارض دارد، پس برای PC Edge Cases مرجع این سند نیست.

---

# 31. دستور برای Project Architect

> این فایل Source of Truth برای Game Rules پروژه است. Architect حق ندارد مکانیک Core را بر اساس سلیقه، حدس، «بهتر شدن بازی» یا رفتار یک Clone دیگر تغییر دهد. هر Rule که در این سند Canonical است باید با Test پوشش داده شود. تنها مورد `TIMEOUT_CARD_SELECTION_ALGORITHM` عمداً Unverified است و نباید بدون منبع جدید به CanonICAL تبدیل شود.

