"""
Agent kecil yang jalan di tiap instance (Termux, Android), polling
poster_server buat command yang di-queue dari dashboard web (misal
"Restart Script"). Ditulis transparan biar bisa diaudit sendiri -- ga
ada request keluar selain ke server milik kamu sendiri (serverUrl di
config), dan cuma jalanin command yang memang kita definisiin di sini
(bukan command bebas dari luar).

Setup (sekali per instance):
  1. pkg install python -y   (kalau belum ada)
  2. Copy naru_agent.py ke instance ini (lewat Termux, download dari
     raw.githubusercontent.com/MasPutram/NaruHub/main/StealAnEgg/naru_agent.py)
  3. Buat ~/.naru_agent_config.json isinya:
       {
         "account": "BlekokGong13",
         "package": "com.roblox.clienr",
         "serverUrl": "https://<tunnel-atau-vps-kamu>"
       }
     "account" harus PERSIS sama kayak nama akun Roblox (LocalPlayer.Name)
     yang muncul di dashboard. "package" itu package name Roblox clone
     buat instance ini spesifik (beda-beda tiap instance).
  4. Jalanin: python naru_agent.py
     (biarin kebuka terus di Termux -- kalau mau auto-start pas reboot,
     pakai Termux:Boot, di luar scope script ini)

Run: python naru_agent.py
"""

import json
import os
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

CONFIG_PATH = os.path.expanduser("~/.naru_agent_config.json")
POLL_INTERVAL_S = 10


def load_config() -> dict:
    if not os.path.exists(CONFIG_PATH):
        print(f"[naru_agent] Config nggak ketemu di {CONFIG_PATH}")
        print('[naru_agent] Buat dulu isinya, contoh:')
        print('  {"account": "BlekokGong13", "package": "com.roblox.clienr", "serverUrl": "https://xxx.trycloudflare.com"}')
        raise SystemExit(1)
    with open(CONFIG_PATH, encoding="utf-8") as f:
        cfg = json.load(f)
    for key in ("account", "package", "serverUrl"):
        if not cfg.get(key):
            raise SystemExit(f"[naru_agent] Field '{key}' wajib diisi di {CONFIG_PATH}")
    return cfg


def run_shell(args: list) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(args, capture_output=True, text=True, timeout=20)
    except Exception as e:  # noqa: BLE001
        return subprocess.CompletedProcess(args, 1, "", str(e))


def needs_root_retry(result: subprocess.CompletedProcess) -> bool:
    text = (result.stdout or "") + (result.stderr or "")
    return result.returncode != 0 or "Permission Denial" in text or "SecurityException" in text


def restart_roblox(package: str) -> None:
    print(f"[naru_agent] restart_script -- force-stop {package}...")
    r = run_shell(["am", "force-stop", package])
    if needs_root_retry(r):
        r = run_shell(["su", "-c", f"am force-stop {package}"])
        if needs_root_retry(r):
            print(f"[naru_agent] gagal force-stop (perlu root?): {r.stderr.strip()}")

    time.sleep(2)

    print(f"[naru_agent] buka lagi {package}...")
    launch_args = ["monkey", "-p", package, "-c", "android.intent.category.LAUNCHER", "1"]
    r = run_shell(launch_args)
    if needs_root_retry(r):
        r = run_shell(["su", "-c", " ".join(launch_args)])
        if needs_root_retry(r):
            print(f"[naru_agent] gagal buka app (perlu root?): {r.stderr.strip()}")
            return
    print("[naru_agent] restart selesai -- tunggu executor auto-execute jalan lagi.")


ACTIONS = {
    "restart_script": lambda cfg: restart_roblox(cfg["package"]),
}


def poll_once(server_url: str, account: str) -> dict:
    url = server_url.rstrip("/") + "/api/poll-command?account=" + urllib.parse.quote(account)
    with urllib.request.urlopen(url, timeout=15) as res:
        return json.loads(res.read().decode("utf-8"))


def main() -> None:
    cfg = load_config()
    print(f"[naru_agent] jalan buat akun '{cfg['account']}' (package {cfg['package']}), server {cfg['serverUrl']}")
    while True:
        try:
            body = poll_once(cfg["serverUrl"], cfg["account"])
            action = body.get("action")
            if action:
                handler = ACTIONS.get(action)
                if handler:
                    handler(cfg)
                else:
                    print(f"[naru_agent] command '{action}' belum dikenal, dilewatin.")
        except urllib.error.URLError as e:
            print(f"[naru_agent] gagal connect ke server: {e}")
        except Exception as e:  # noqa: BLE001
            print(f"[naru_agent] error: {e}")
        time.sleep(POLL_INTERVAL_S)


if __name__ == "__main__":
    main()
