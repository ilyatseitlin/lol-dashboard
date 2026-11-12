# КРОВЬ — LoL Dashboard

Дашборд команды по League of Legends: рейтинг игроков и команды, чемпионы, инсайты, план тренировок. Статичная страница (HTML/CSS/JS), данные берутся из `data.json`, который собирает скрипт из Riot API.

Не связано с Riot Games и не одобрено ими.

## Локальный просмотр
```bash
python3 -m http.server 8765
# http://localhost:8765
```

## Обновление данных
1. Скопируй `.env.example` в `.env` и впиши `RIOT_API_KEY` (dev-ключ живёт 24 часа).
2. `python3 scripts/fetch_riot.py --check` проверяет ключ и игроков, `python3 scripts/fetch_riot.py` пересобирает `data.json`.
3. Состав и нормы по ролям: `scripts/config.json`. План тренировок: `training.json`.
