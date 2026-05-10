from __future__ import annotations

import os
import shlex
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_env_file(ROOT / ".env")

CONFIG = {
    "DATABASE_URL": os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres"),
    "BACKEND_START_PORT": int(os.environ.get("BACKEND_START_PORT", "3000")),
    "FRONTEND_START_PORT": int(os.environ.get("FRONTEND_START_PORT", "5173")),
    "BASE_PATH": os.environ.get("BASE_PATH", "/"),
    "MAX_PORT_OFFSET": int(os.environ.get("MAX_PORT_OFFSET", "100")),
    "KILL_OCCUPIED_PORTS": os.environ.get("KILL_OCCUPIED_PORTS", "1"),
    "RUN_SCHEMA_PUSH": os.environ.get("RUN_SCHEMA_PUSH", "1"),
    "SEED_DATABASE": os.environ.get("SEED_DATABASE", "0"),
    "CHECK_DATABASE": os.environ.get("CHECK_DATABASE", "1"),
    "OPEN_BROWSER": os.environ.get("OPEN_BROWSER", "1"),
}


class StartupError(Exception):
    pass


def print_header() -> None:
    print("\n=======================================")
    print("       EliteMek ERP Local Starter")
    print("=======================================")
    print(f"Project: {ROOT}")
    print()


def run_command(args, cwd=None, capture_output=False, check=True, shell=False):
    if capture_output:
        result = subprocess.run(args, cwd=cwd, shell=shell, capture_output=True, text=True)
        if check and result.returncode != 0:
            raise StartupError(f"Command failed: {args}\n{result.stderr.strip()}")
        return result.stdout.strip()
    else:
        result = subprocess.run(args, cwd=cwd, shell=shell)
        if check and result.returncode != 0:
            raise StartupError(f"Command failed: {args}")
        return result


def require_executable(name: str, message: str) -> None:
    if shutil.which(name) is None:
        raise StartupError(message)
    print(f"{name} found.")


def resolve_pnpm() -> list[str]:
    pnpm_path = shutil.which("pnpm")
    if pnpm_path:
        print("pnpm found.")
        return [pnpm_path]

    corepack_path = shutil.which("corepack")
    if corepack_path:
        print("pnpm was not found directly. Using Corepack pnpm.")
        return [corepack_path, "pnpm"]

    raise StartupError("pnpm is required. Install it with: npm install -g pnpm or enable Corepack: corepack enable")


def check_node_version() -> None:
    version = run_command(["node", "-p", "process.versions.node"], capture_output=True)
    if not version:
        raise StartupError("Could not determine Node.js version.")

    major = int(version.split(".")[0])
    if major < 20:
        raise StartupError(f"Node.js 20+ is required. Current major version: {major}")

    print(f"Node.js version {version} is OK.")


def check_database_tcp() -> None:
    url = urlparse(CONFIG["DATABASE_URL"])
    host = url.hostname or "localhost"
    port = url.port or 5432

    print(f"Checking database connection to {host}:{port}...")
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(3.0)
        try:
            sock.connect((host, port))
        except OSError as error:
            raise StartupError(f"Cannot connect to PostgreSQL at {host}:{port}: {error}")

    print("PostgreSQL is reachable.")


def is_port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def kill_port(port: int) -> None:
    if CONFIG["KILL_OCCUPIED_PORTS"] != "1":
        return

    if shutil.which("powershell") is None:
        return

    cmd = [
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        (
            f"Get-NetTCPConnection -LocalPort {port} -State Listen "
            "| Select-Object -ExpandProperty OwningProcess -Unique "
            "| ForEach-Object { Try { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } Catch {} }"
        ),
    ]
    subprocess.run(cmd, capture_output=True)
    time.sleep(0.25)


def find_free_port(start_port: int) -> int:
    for candidate in range(start_port, start_port + CONFIG["MAX_PORT_OFFSET"] + 1):
        if is_port_free(candidate):
            return candidate

        kill_port(candidate)
        if is_port_free(candidate):
            return candidate

    raise StartupError("Could not find a free port in the configured range.")


def wait_http(url: str, timeout_seconds: int) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=3) as response:
                if 200 <= response.status < 500:
                    return True
        except (urllib.error.URLError, socket.timeout):
            pass
        time.sleep(2)
    return False


def launch_window(title: str, cwd: Path, env_vars: dict[str, str], command: str) -> None:
    set_commands = " && ".join(f"set {key}={value}" for key, value in env_vars.items())
    full_command = f"{set_commands} && {command}" if set_commands else command
    escaped = full_command.replace('"', '\\"')
    shell_cmd = f'start "{title}" /D "{cwd}" cmd /k "{escaped}"'
    subprocess.Popen(shell_cmd, shell=True)


def run() -> None:
    print_header()
    require_executable("node", "Node.js 20+ is required. Install Node.js and run start.bat again.")
    require_executable("powershell", "PowerShell is required for this startup helper.")
    pnpm_cmd = resolve_pnpm()
    check_node_version()

    node_modules = ROOT / "node_modules"
    if not node_modules.exists():
        print("Dependencies are missing. Running pnpm install...")
        run_command(pnpm_cmd + ["install"], cwd=ROOT)
    else:
        print("Dependencies found.")

    print("Ensuring backend dependencies are installed...")
    backend_dir = ROOT / "backend"
    run_command(pnpm_cmd + ["install"], cwd=backend_dir)

    (backend_dir / "uploads").mkdir(parents=True, exist_ok=True)
    (ROOT / "logs").mkdir(parents=True, exist_ok=True)

    if CONFIG["CHECK_DATABASE"] == "1":
        check_database_tcp()
    else:
        print("Skipping database reachability check.")

    backend_port = find_free_port(CONFIG["BACKEND_START_PORT"])
    frontend_port = find_free_port(CONFIG["FRONTEND_START_PORT"])

    print()
    print(f"Database:      {CONFIG['DATABASE_URL']}")
    print(f"Backend port:  {backend_port}")
    print(f"Frontend port: {frontend_port}")
    print()

    if CONFIG["RUN_SCHEMA_PUSH"] == "1":
        print("[1/4] Updating database schema...")
        run_command(pnpm_cmd + ["--filter", "@workspace/db", "push"], cwd=ROOT)
    else:
        print("[1/4] Skipping database schema update.")

    if CONFIG["SEED_DATABASE"] == "1":
        print("[2/4] Seeding database...")
        print("WARNING: Seed resets sample-data tables before inserting demo data.")
        run_command(pnpm_cmd + ["--filter", "@workspace/scripts", "run", "seed"], cwd=ROOT)
    else:
        print("[2/4] Skipping seed. Set SEED_DATABASE=1 only when you want demo data reset.")

    print("[3/4] Starting backend API...")
    launch_window(
        f"EliteMek Backend API - {backend_port}",
        backend_dir,
        {
            "DATABASE_URL": CONFIG["DATABASE_URL"],
            "PORT": str(backend_port),
            "NODE_ENV": "development",
        },
        "pnpm dev",
    )

    print("Waiting for backend health check...")
    backend_ok = wait_http(f"http://localhost:{backend_port}/api/healthz", 90)
    if not backend_ok:
        raise StartupError("Backend did not become healthy in time. Check the backend window for the actual error.")

    print("[4/4] Starting frontend dashboard...")
    launch_window(
        f"EliteMek Frontend - {frontend_port}",
        ROOT / "frontend",
        {
            "PORT": str(frontend_port),
            "BASE_PATH": CONFIG["BASE_PATH"],
            "BACKEND_PORT": str(backend_port),
        },
        "pnpm dev",
    )

    print("Waiting for frontend server...")
    frontend_ok = wait_http(f"http://localhost:{frontend_port}", 60)
    if not frontend_ok:
        print("WARNING: Frontend did not answer yet. Check the frontend window for details.")

    if CONFIG["OPEN_BROWSER"] == "1":
        webbrowser.open(f"http://localhost:{frontend_port}")

    print()
    print("=======================================")
    print("ERP System Launched")
    print(f"Backend:  http://localhost:{backend_port}/api")
    print(f"Frontend: http://localhost:{frontend_port}")
    print("Login:    admin@elitemek.com / admin123")
    print("=======================================")
    print()
    print("Keep this launcher window open.")
    print("Close the Backend and Frontend windows to stop the servers.")
    print("Press Ctrl+C in this window to exit the launcher.")

    try:
        while True:
            time.sleep(30)
    except KeyboardInterrupt:
        print("\nLauncher exiting. Backend and frontend windows remain open.")


if __name__ == "__main__":
    try:
        run()
    except StartupError as exc:
        print(f"ERROR: {exc}")
        print()
        input("Press Enter to exit...")
        sys.exit(1)
    except Exception as exc:
        print(f"UNEXPECTED ERROR: {exc}")
        print()
        input("Press Enter to exit...")
        sys.exit(1)
