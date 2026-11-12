#!/usr/bin/env python3
"""Собирает статистику команды из Riot API и пишет data.json.

Запуск (из папки проекта):
    python3 scripts/fetch_riot.py --check      # только проверить ключ и найти игроков
    python3 scripts/fetch_riot.py              # полный сбор, пишет data.json
Ключ берётся из .env (RIOT_API_KEY=...) или из переменной окружения.
Только стандартная библиотека. Ключ нигде не печатается и не пишется в файлы.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
CONFIG = json.loads((ROOT / "scripts" / "config.json").read_text(encoding="utf-8"))

REGION = {  # платформа -> региональный маршрут (match-v5, account-v1)
    "ru": "europe", "eun1": "europe", "euw1": "europe", "tr1": "europe", "me1": "europe",
    "na1": "americas", "br1": "americas", "la1": "americas", "la2": "americas",
    "kr": "asia", "jp1": "asia",
    "oc1": "sea", "ph2": "sea", "sg2": "sea", "th2": "sea", "tw2": "sea", "vn2": "sea",
}
TIERS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND"]
APEX = ["MASTER", "GRANDMASTER", "CHALLENGER"]
DIV = {"IV": 0, "III": 1, "II": 2, "I": 3}
POSITION = {"TOP": "Top", "JUNGLE": "Jungle", "MIDDLE": "Mid", "BOTTOM": "ADC", "UTILITY": "Support"}


class ApiError(Exception):
    def __init__(self, status, url):
        super().__init__(f"HTTP {status}")
        self.status, self.url = status, url


# ---------- HTTP ----------
class Client:
    def __init__(self, key, interval):
        self.key, self.interval, self.last = key, interval, 0.0

    def get(self, url, retries=3):
        for attempt in range(retries + 1):
            wait = self.interval - (time.time() - self.last)
            if wait > 0:
                time.sleep(wait)
            self.last = time.time()
            req = urllib.request.Request(url, headers={"X-Riot-Token": self.key, "User-Agent": "lol-dashboard"})
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    return json.loads(r.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < retries:
                    delay = int(e.headers.get("Retry-After", "10")) + 1
                    print(f"  лимит запросов, пауза {delay} с", file=sys.stderr)
                    time.sleep(delay)
                    continue
                if e.code >= 500 and attempt < retries:
                    time.sleep(3)
                    continue
                raise ApiError(e.code, url.split("?")[0]) from None
            except urllib.error.URLError as e:
                if attempt < retries:
                    time.sleep(3)
                    continue
                raise SystemExit(f"Нет связи с Riot API: {e.reason}")


def load_key():
    key = os.environ.get("RIOT_API_KEY", "").strip()
    env = ROOT / ".env"
    if not key and env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("RIOT_API_KEY="):
                key = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not key:
        raise SystemExit("Не найден RIOT_API_KEY. Создай файл .env (см. .env.example) и впиши ключ.")
    return key


def public(plain_json):
    """Публичный Data Dragon, ключ не нужен."""
    with urllib.request.urlopen(plain_json, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


# ---------- Riot ----------
def resolve(client, p):
    reg = REGION.get(p["platform"], "europe")
    name, tag = urllib.parse.quote(p["name"], safe=""), urllib.parse.quote(p["tag"], safe="")
    return client.get(f"https://{reg}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{name}/{tag}")["puuid"]


def rank_of(client, p, puuid):
    entries = client.get(f"https://{p['platform']}.api.riotgames.com/lol/league/v4/entries/by-puuid/{puuid}")
    by_q = {e["queueType"]: e for e in entries}
    e = by_q.get("RANKED_SOLO_5x5") or by_q.get("RANKED_FLEX_SR")
    if not e:
        return {"tier": "Unranked", "division": "", "lp": 0, "wins": 0, "losses": 0}, None
    tier = e["tier"]
    score = rank_score(tier, e.get("rank", ""), e["leaguePoints"])
    return {"tier": tier.capitalize(), "division": e.get("rank", "") if tier not in APEX else "",
            "lp": e["leaguePoints"], "wins": e["wins"], "losses": e["losses"]}, score


def rank_score(tier, division, lp):
    if tier in TIERS:
        return TIERS.index(tier) * 400 + DIV.get(division, 0) * 100 + lp
    return 2800 + lp


def rank_label(score):
    if score >= 2800:
        return "Master+"
    t = TIERS[min(score // 400, 6)].capitalize()
    d = {0: "IV", 1: "III", 2: "II", 3: "I"}[(score % 400) // 100]
    return f"{t} {d}"


def match_ids(client, p, puuid, count):
    reg = REGION.get(p["platform"], "europe")
    ids = []
    for q in CONFIG["queues"]:
        ids += client.get(f"https://{reg}.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?queue={q}&count={count}")
    return list(dict.fromkeys(ids))


def get_match(client, mid, reg):
    f = CACHE / "matches" / f"{mid}.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    m = client.get(f"https://{reg}.api.riotgames.com/lol/match/v5/matches/{mid}")
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(m), encoding="utf-8")
    return m


# ---------- метрики ----------
def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def agg(games):
    """games: список записей игрока в матчах."""
    n = len(games)
    if not n:
        return None
    mins = sum(g["dur"] for g in games) / 60
    k, d, a = (sum(g[x] for g in games) for x in ("k", "d", "a"))
    return {
        "games": n, "winrate": sum(g["win"] for g in games) / n,
        "kda": (k + a) / max(d, 1), "csPerMin": sum(g["cs"] for g in games) / mins,
        "visionPerMin": sum(g["vision"] for g in games) / mins, "dmgPerMin": sum(g["dmg"] for g in games) / mins,
    }


def form_score(stats, role):
    if not stats:
        return 0
    norm, w = CONFIG["roleNorms"][role], dict(CONFIG["formWeights"])
    if role == "Support":  # у саппорта CS не считаем, вес уходит в обзор
        w["visionPerMin"] += w.pop("csPerMin")
        w["csPerMin"] = 0
    score = w["winrate"] * clamp((stats["winrate"] - 0.25) / 0.5 * 100, 0, 100)
    for m in ("kda", "csPerMin", "visionPerMin", "dmgPerMin"):
        score += w[m] * clamp(50 * stats[m] / norm[m], 0, 100)
    return round(score)


def champ_table(games, names, limit):
    by = {}
    for g in games:
        by.setdefault(g["champ"], []).append(g)
    rows = []
    for cid, gs in by.items():
        a = agg(gs)
        rows.append({"id": cid, "name": names.get(cid, cid), "games": a["games"],
                     "winrate": round(a["winrate"], 2), "kda": round(a["kda"], 2)})
    rows.sort(key=lambda r: (-r["games"], -r["winrate"]))
    return rows[:limit]


def record(m, part):
    return {
        "mid": m["metadata"]["matchId"], "ts": m["info"]["gameStartTimestamp"], "dur": m["info"]["gameDuration"],
        "win": 1 if part["win"] else 0, "k": part["kills"], "d": part["deaths"], "a": part["assists"],
        "cs": part["totalMinionsKilled"] + part.get("neutralMinionsKilled", 0), "vision": part["visionScore"],
        "dmg": part["totalDamageDealtToChampions"], "champ": part["championName"], "pos": POSITION.get(part.get("teamPosition", ""), ""),
    }


def r2(x, n=2):
    return round(x, n)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="только проверить ключ и найти игроков")
    ap.add_argument("--rate", type=float, default=1.25, help="пауза между запросами, с (dev-ключ: 100 запросов за 2 минуты)")
    ap.add_argument("--allow-partial", action="store_true", help="писать data.json, даже если кого-то не нашли")
    args = ap.parse_args()

    client = Client(load_key(), args.rate)
    players, puuids = CONFIG["players"], {}

    print("Ищу игроков...")
    failed = []
    for p in players:
        try:
            puuids[p["id"]] = resolve(client, p)
            print(f"  ✓ {p['name']}#{p['tag']} ({p['platform']})")
        except ApiError as e:
            hint = {401: "ключ недействителен", 403: "ключ истёк или нет доступа к платформе", 404: "игрок не найден"}.get(e.status, "ошибка")
            print(f"  ✗ {p['name']}#{p['tag']}: HTTP {e.status} ({hint})")
            failed.append(p["id"])
            if e.status in (401, 403):
                raise SystemExit("Остановлено: проверь ключ (dev-ключ живёт 24 часа) и доступ к платформе.")
    if failed and not args.allow_partial:
        raise SystemExit(f"Не найдены: {', '.join(failed)}. data.json не тронут.")
    if args.check:
        print("Проверка пройдена.")
        return

    window = CONFIG["window"]
    ver = public("https://ddragon.leagueoflegends.com/api/versions.json")[0]
    names = {v["id"]: v["name"] for v in public(f"https://ddragon.leagueoflegends.com/cdn/{ver}/data/en_US/champion.json")["data"].values()}
    team_pu = set(puuids.values())

    # ранги и матчи
    out_players, per_games, matches = [], {}, {}
    for p in players:
        if p["id"] not in puuids:
            continue
        pu = puuids[p["id"]]
        print(f"Собираю {p['name']}...")
        rank, score = rank_of(client, p, pu)
        ids = match_ids(client, p, pu, window)
        reg = REGION.get(p["platform"], "europe")
        recs = []
        for mid in ids:
            try:
                m = get_match(client, mid, reg)
            except ApiError as e:
                print(f"  пропуск {mid}: HTTP {e.status}")
                continue
            matches[mid] = m
            part = next((x for x in m["info"]["participants"] if x["puuid"] == pu), None)
            if part:
                recs.append(record(m, part))
        recs.sort(key=lambda r: r["ts"], reverse=True)
        recs = recs[:window]
        per_games[p["id"]] = recs
        s = agg(recs)
        last, prev = recs[:10], recs[10:20]
        delta = (form_score(agg(last), p["role"]) - form_score(agg(prev), p["role"])) if len(prev) >= 5 and len(last) >= 5 else 0
        out_players.append({
            "id": p["id"], "role": p["role"], "name": p["name"], "tag": p["tag"], "platform": p["platform"], "opgg": p["opgg"],
            "rank": rank, "rankScore": score,
            "stats": {"games": s["games"] if s else 0, "winrate": r2(s["winrate"]) if s else 0,
                      "wins": sum(r["win"] for r in recs), "losses": len(recs) - sum(r["win"] for r in recs),
                      "kda": r2(s["kda"]) if s else 0, "csPerMin": r2(s["csPerMin"], 1) if s else 0,
                      "visionPerMin": r2(s["visionPerMin"]) if s else 0, "dmgPerMin": round(s["dmgPerMin"]) if s else 0},
            "formScore": form_score(s, p["role"]), "formDelta": delta,
            "lpHistory": [],
            "champions": champ_table(recs, names, 5),
        })

    # история LP: снимок рангов по дням (API историю не отдаёт)
    hist_f = ROOT / "history" / "lp.json"
    hist = json.loads(hist_f.read_text(encoding="utf-8")) if hist_f.exists() else []
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    snap = {"date": today, "scores": {p["id"]: p["rankScore"] for p in out_players if p["rankScore"] is not None}}
    hist = [h for h in hist if h["date"] != today] + [snap]
    hist_f.write_text(json.dumps(hist, ensure_ascii=False, indent=1), encoding="utf-8")
    for p in out_players:
        series = [h["scores"][p["id"]] for h in hist[-10:] if p["id"] in h["scores"]]
        p["lpHistory"] = [v - series[0] for v in series] if len(series) >= 2 else []

    # командные игры: >= N участников команды на одной стороне
    team_games = []
    for m in matches.values():
        sides = {}
        for x in m["info"]["participants"]:
            if x["puuid"] in team_pu:
                sides.setdefault(x["teamId"], []).append(x)
        for tid, xs in sides.items():
            if len(xs) >= CONFIG["minTeamMembers"]:
                team_games.append((m, tid))
    basis = "team"
    if len(team_games) < CONFIG["minTeamGames"]:  # мало совместных игр: берём игры игроков, по одной на матч
        basis = "individual"
        team_games = []
        for m in matches.values():
            tid = next((x["teamId"] for x in m["info"]["participants"] if x["puuid"] in team_pu), None)
            if tid is not None:
                team_games.append((m, tid))
    team_games.sort(key=lambda t: t[0]["info"]["gameStartTimestamp"])
    team_games = team_games[-window:]

    n = len(team_games)
    wins = sum(1 for m, tid in team_games if next(t for t in m["info"]["teams"] if t["teamId"] == tid)["win"])
    objs = {"dragons": "dragon", "barons": "baron", "towers": "tower"}
    obj_wr = {}
    for out_k, api_k in objs.items():
        got = [next(t for t in m["info"]["teams"] if t["teamId"] == tid) for m, tid in team_games]
        first = [t for t in got if t["objectives"][api_k]["first"]]
        obj_wr[out_k] = r2(sum(1 for t in first if t["win"]) / len(first)) if first else 0
    avg_dur = sum(m["info"]["gameDuration"] for m, _ in team_games) / n if n else 0
    fb = sum(1 for m, tid in team_games if next(t for t in m["info"]["teams"] if t["teamId"] == tid)["objectives"]["champion"]["first"])
    scores = [p["rankScore"] for p in out_players if p["rankScore"] is not None]
    avg_score = round(sum(scores) / len(scores)) if scores else 0
    all_recs = [r for rs in per_games.values() for r in rs]

    team = {
        "basis": basis, "rankScore": avg_score, "rankLabel": rank_label(avg_score) if scores else "Unranked",
        "winrate": r2(wins / n) if n else 0, "games": n,
        "avgDuration": f"{int(avg_dur // 60)}:{int(avg_dur % 60):02d}", "firstBlood": r2(fb / n) if n else 0,
        "form": ["W" if next(t for t in m["info"]["teams"] if t["teamId"] == tid)["win"] else "L" for m, tid in team_games],
        "objectives": obj_wr, "champions": champ_table(all_recs, names, 8),
    }

    # инсайты по правилам
    ins = []
    streak = 0
    for r in reversed(team["form"]):
        if r == "W":
            streak += 1
        else:
            break
    if streak >= 3:
        ins.append({"type": "good", "icon": "bolt", "title": f"Серия из {streak} побед", "text": "Команда выигрывает подряд. Держим темп."})
    for p in out_players:
        for c in p["champions"]:
            if c["games"] >= 5 and c["winrate"] >= 0.6:
                ins.append({"type": "good", "icon": "trend", "title": f"{c['name']}: {round(c['winrate'] * 100)}% побед",
                            "text": f"{p['name']}: {c['games']} игр на {c['name']}, KDA {c['kda']}."})
                break
        norm = CONFIG["roleNorms"][p["role"]]
        if p["stats"]["games"] >= 5 and p["stats"]["visionPerMin"] < norm["visionPerMin"] * 0.8:
            ins.append({"type": "bad", "icon": "eye", "title": f"Обзор {p['role']} ниже нормы",
                        "text": f"{p['name']}: {p['stats']['visionPerMin']} обзора/мин против нормы {norm['visionPerMin']}."})
        if abs(p["formDelta"]) >= 8:
            up = p["formDelta"] > 0
            ins.append({"type": "good" if up else "bad", "icon": "trend", "title": f"{p['name']}: Form Score {'вырос' if up else 'упал'} на {abs(p['formDelta'])}",
                        "text": "Сравнение последних 10 игр с предыдущими 10."})
    short = [(m, tid) for m, tid in team_games if m["info"]["gameDuration"] < 1500]
    if len(short) >= 5:
        sw = sum(1 for m, tid in short if next(t for t in m["info"]["teams"] if t["teamId"] == tid)["win"])
        ins.append({"type": "neutral", "icon": "info", "title": f"{round(sw / len(short) * 100)}% побед в играх короче 25 минут",
                    "text": f"Выборка: {len(short)} игр."})
    ins = ins[:6]

    data = {
        "meta": {"mock": False, "team": CONFIG["team"], "patch": ".".join(ver.split(".")[:2]),
                 "generatedAt": today, "queue": "solo+flex", "window": window, "repo": "#"},
        "team": team, "players": out_players, "insights": ins,
    }
    tmp = ROOT / "data.json.tmp"
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(ROOT / "data.json")
    print(f"Готово: data.json ({len(out_players)} игроков, {n} командных игр, база: {basis}).")


if __name__ == "__main__":
    main()
