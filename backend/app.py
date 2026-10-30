import os
import sys
import json
import time
import sqlite3
import secrets

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from argon2 import PasswordHasher
import crypto


DB = lambda: os.environ.get("DB_PATH", "smartgrid.db")
TTL = lambda: int(os.environ.get("CHALLENGE_TTL_SECONDS", "30"))
VER = "CPv1"

ph = PasswordHasher()
TOKENS = {}


SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    pw_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','operator'))
);

CREATE TABLE IF NOT EXISTS meters(
    meter_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT,
    enabled INTEGER DEFAULT 1,
    simulated INTEGER DEFAULT 1,
    created REAL
);

CREATE TABLE IF NOT EXISTS meter_keys(
    meter_id TEXT PRIMARY KEY REFERENCES meters(meter_id) ON DELETE CASCADE,
    k BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions(
    sid TEXT PRIMARY KEY,
    meter_id TEXT NOT NULL REFERENCES meters(meter_id) ON DELETE CASCADE,
    cs BLOB,
    cm BLOB,
    expires REAL,
    state TEXT,
    ks BLOB,
    last_seq INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS readings(
    id INTEGER PRIMARY KEY,
    meter_id TEXT,
    sid TEXT,
    seq INTEGER,
    kwh REAL,
    voltage REAL,
    current REAL,
    ts REAL,
    UNIQUE(sid, seq)
);

CREATE TABLE IF NOT EXISTS events(
    id INTEGER PRIMARY KEY,
    ts REAL,
    meter_id TEXT,
    type TEXT,
    descr TEXT,
    result TEXT,
    severity TEXT,
    ref TEXT
);

CREATE INDEX IF NOT EXISTS ix_ev ON events(type, ts);
"""


def db():
    c = sqlite3.connect(DB())
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    return c


def init():
    with db() as c:
        c.executescript(SCHEMA)


def log(c, meter, typ, descr, result, sev="info", ref=""):
    c.execute(
        """INSERT INTO events
        (ts, meter_id, type, descr, result, severity, ref)
        VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (time.time(), meter, typ, descr, result, sev, ref),
    )
    c.commit()


def create_user(username, password, role="admin"):
    init()
    with db() as c:
        c.execute(
            "INSERT INTO users(username, pw_hash, role) VALUES (?, ?, ?)",
            (username, ph.hash(password), role),
        )


app = FastAPI(
    title="Smart Grid Mutual Authentication",
    description="Academic Ascon-based smart-grid security prototype",
    version="1.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "https://smart-grid-ascon.vercel.app",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init()


def user(authorization: str = Header(default="")):
    token = authorization.removeprefix("Bearer ").strip()

    if token in TOKENS:
        return TOKENS[token]

    # Public access is intended only for a simulated academic demonstration.
    # Enable by setting DEMO_MODE=true in the hosting environment.
    if not token and os.environ.get("DEMO_MODE", "false").lower() == "true":
        return ("demo", "admin")

    raise HTTPException(status_code=401, detail="Not authenticated")


def admin(u=Depends(user)):
    if u[1] != "admin":
        raise HTTPException(status_code=403, detail="Administrator role required")
    return u


class Login(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


@app.post("/api/auth/login")
def login(b: Login):
    with db() as c:
        record = c.execute(
            "SELECT * FROM users WHERE username = ?",
            (b.username,),
        ).fetchone()

        try:
            ok = bool(record) and ph.verify(record["pw_hash"], b.password)
        except Exception:
            ok = False

        log(
            c,
            None,
            "login",
            f"Login for {b.username}",
            "success" if ok else "failure",
            "info" if ok else "warning",
        )

    if not ok:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = secrets.token_urlsafe(32)
    TOKENS[token] = (record["username"], record["role"])

    return {"token": token, "role": record["role"]}


@app.post("/api/auth/logout")
def logout(authorization: str = Header(default="")):
    token = authorization.removeprefix("Bearer ").strip()
    TOKENS.pop(token, None)
    return {"ok": True}


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "crypto": crypto.ALG,
        "note": "Prototype; not NIST SP 800-232 Ascon-AEAD128",
    }


class MeterIn(BaseModel):
    meter_id: str = Field(pattern=r"^[A-Za-z0-9_-]{3,32}$")
    name: str = Field(min_length=1, max_length=64)
    location: str = ""


def public_meter(r):
    return {
        k: r[k]
        for k in (
            "meter_id",
            "name",
            "location",
            "enabled",
            "simulated",
        )
    }


@app.get("/api/meters")
def meters(u=Depends(user)):
    with db() as c:
        return [
            public_meter(r)
            for r in c.execute("SELECT * FROM meters ORDER BY meter_id")
        ]


@app.post("/api/meters", status_code=201)
def add_meter(m: MeterIn, u=Depends(admin)):
    with db() as c:
        if c.execute(
            "SELECT 1 FROM meters WHERE meter_id = ?",
            (m.meter_id,),
        ).fetchone():
            raise HTTPException(status_code=409, detail="Meter ID already exists")

        c.execute(
            """INSERT INTO meters
            (meter_id, name, location, created)
            VALUES (?, ?, ?, ?)""",
            (m.meter_id, m.name, m.location, time.time()),
        )

        c.execute(
            "INSERT INTO meter_keys(meter_id, k) VALUES (?, ?)",
            (m.meter_id, secrets.token_bytes(16)),
        )

        log(c, m.meter_id, "meter_registered", "Simulated meter registered", "success")

    return {
        "meter_id": m.meter_id,
        "key_provisioned": True,
    }


@app.delete("/api/meters/{mid}")
def delete_meter(mid: str, u=Depends(admin)):
    with db() as c:
        n = c.execute(
            "DELETE FROM meters WHERE meter_id = ?",
            (mid,),
        ).rowcount

    if not n:
        raise HTTPException(status_code=404, detail="Unknown meter")

    return {"deleted": mid}


def key_for(c, mid):
    r = c.execute(
        """SELECT k.k, m.enabled
        FROM meters m JOIN meter_keys k USING(meter_id)
        WHERE m.meter_id = ?""",
        (mid,),
    ).fetchone()

    return r["k"] if r and r["enabled"] else None


def ctx(mid, sid, cs, cm):
    return f"{VER}|{mid}|{sid}".encode() + cs + cm


class Begin(BaseModel):
    meter_id: str
    cm: str


@app.post("/api/protocol/begin")
def begin(b: Begin, u=Depends(user)):
    try:
        cm = bytes.fromhex(b.cm)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid challenge encoding")

    if len(cm) != 16:
        raise HTTPException(status_code=400, detail="Challenge must be 16 bytes")

    with db() as c:
        if key_for(c, b.meter_id) is None:
            log(c, b.meter_id, "unknown_meter", "Unknown or disabled meter", "rejected", "high")
            raise HTTPException(status_code=404, detail="Unknown meter")

        sid = secrets.token_hex(16)
        cs = secrets.token_bytes(16)

        c.execute(
            """INSERT INTO sessions
            (sid, meter_id, cs, cm, expires, state)
            VALUES (?, ?, ?, ?, ?, 'pending')""",
            (sid, b.meter_id, cs, cm, time.time() + TTL()),
        )

    return {
        "session_id": sid,
        "cs": cs.hex(),
        "ttl": TTL(),
    }


class Respond(BaseModel):
    session_id: str
    rm: str


@app.post("/api/protocol/respond")
def respond(b: Respond, u=Depends(user)):
    with db() as c:
        s = c.execute(
            "SELECT * FROM sessions WHERE sid = ?",
            (b.session_id,),
        ).fetchone()

        if not s or s["state"] != "pending":
            raise HTTPException(status_code=400, detail="Invalid or already used session")

        mid = s["meter_id"]
        k = key_for(c, mid)

        if k is None:
            raise HTTPException(status_code=404, detail="Unknown meter")

        x = ctx(mid, b.session_id, s["cs"], s["cm"])

        c.execute(
            "UPDATE sessions SET state = 'used' WHERE sid = ?",
            (b.session_id,),
        )
        c.commit()

        if time.time() > s["expires"]:
            log(c, mid, "auth_failed", "Challenge expired", "rejected", "warning", b.session_id)
            raise HTTPException(status_code=401, detail="Challenge expired")

        try:
            rm = bytes.fromhex(b.rm)
        except ValueError:
            rm = b""

        if not crypto.eq(rm, crypto.mac(k, b"M" + x)):
            log(c, mid, "auth_failed", "Invalid meter response", "rejected", "high", b.session_id)
            raise HTTPException(status_code=401, detail="Invalid response")

        ks = crypto.mac(k, b"K" + x)

        c.execute(
            """UPDATE sessions
            SET state = 'authenticated', ks = ?
            WHERE sid = ?""",
            (ks, b.session_id),
        )

        log(c, mid, "auth_success", "Mutual authentication completed", "success", "info", b.session_id)

    return {
        "rs": crypto.mac(k, b"S" + x).hex(),
        "state": "authenticated",
    }


def sim_meter_auth(mid, k, tamper_rm=False):
    cm = secrets.token_bytes(16)

    sess = begin(
        Begin(meter_id=mid, cm=cm.hex()),
        ("sim", "admin"),
    )

    sid = sess["session_id"]
    cs = bytes.fromhex(sess["cs"])
    x = ctx(mid, sid, cs, cm)

    rm = crypto.mac(k, b"M" + x)

    if tamper_rm:
        rm = bytes(16)

    out = respond(
        Respond(session_id=sid, rm=rm.hex()),
        ("sim", "admin"),
    )

    ok = crypto.eq(
        bytes.fromhex(out["rs"]),
        crypto.mac(k, b"S" + x),
    )

    return sid, crypto.mac(k, b"K" + x), ok


@app.post("/api/protocol/authenticate")
def authenticate(b: Begin, u=Depends(user)):
    start = time.perf_counter()

    with db() as c:
        k = key_for(c, b.meter_id)

    if k is None:
        begin(b, u)

    sid, ks, ok = sim_meter_auth(b.meter_id, k)

    return {
        "session_id": sid,
        "server_verified_by_meter": ok,
        "authenticated": ok,
        "elapsed_ms": round((time.perf_counter() - start) * 1000, 2),
    }


class Msg(BaseModel):
    meter_id: str
    session_id: str
    seq: int
    ct: str


def aad(m):
    return f"{VER}|{m.meter_id}|{m.session_id}|{m.seq}".encode()


def nonce(seq):
    if seq < 0 or seq >= 2**128:
        raise ValueError("Invalid sequence number")

    return seq.to_bytes(16, "big")


def build(mid, sid, ks, seq, reading):
    m = Msg(
        meter_id=mid,
        session_id=sid,
        seq=seq,
        ct="",
    )

    plaintext = json.dumps(reading).encode()

    m.ct = crypto.aead_encrypt(
        ks,
        nonce(seq),
        aad(m),
        plaintext,
    ).hex()

    return m


@app.post("/api/readings/verify")
def verify(m: Msg, u=Depends(user)):
    with db() as c:
        s = c.execute(
            """SELECT * FROM sessions
            WHERE sid = ? AND meter_id = ?""",
            (m.session_id, m.meter_id),
        ).fetchone()

        if key_for(c, m.meter_id) is None:
            log(c, m.meter_id, "unknown_meter", "Message from unknown meter", "rejected", "high")
            raise HTTPException(status_code=404, detail="Unknown meter")

        if not s or s["state"] != "authenticated":
            log(c, m.meter_id, "auth_failed", "No authenticated session", "rejected", "warning")
            raise HTTPException(status_code=401, detail="No authenticated session")

        if m.seq <= s["last_seq"]:
            log(c, m.meter_id, "replay", f"Replay or old sequence {m.seq}", "rejected", "high", m.session_id)
            raise HTTPException(status_code=409, detail="Replay detected")

        try:
            plaintext = crypto.aead_decrypt(
                s["ks"],
                nonce(m.seq),
                aad(m),
                bytes.fromhex(m.ct),
            )
        except (ValueError, TypeError):
            plaintext = None

        if plaintext is None:
            log(c, m.meter_id, "tampered", "Authentication tag verification failed", "rejected", "high", m.session_id)
            raise HTTPException(status_code=400, detail="Tag verification failed")

        try:
            reading = json.loads(plaintext)
        except (ValueError, UnicodeDecodeError):
            raise HTTPException(status_code=400, detail="Invalid reading payload")

        c.execute(
            "UPDATE sessions SET last_seq = ? WHERE sid = ?",
            (m.seq, m.session_id),
        )

        c.execute(
            """INSERT INTO readings
            (meter_id, sid, seq, kwh, voltage, current, ts)
            VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                m.meter_id,
                m.session_id,
                m.seq,
                reading["kwh"],
                reading["voltage"],
                reading["current"],
                time.time(),
            ),
        )

        log(c, m.meter_id, "reading_accepted", "Reading verified and decrypted", "success", "info", m.session_id)

    return {
        "verified": True,
        "reading": reading,
    }


class Tx(BaseModel):
    meter_id: str
    session_id: str
    kwh: float = Field(ge=0, le=1e6)
    voltage: float = Field(ge=0, le=1000)
    current: float = Field(ge=0, le=1000)


def next_msg(t: Tx):
    with db() as c:
        s = c.execute(
            """SELECT ks, last_seq FROM sessions
            WHERE sid = ? AND meter_id = ?
            AND state = 'authenticated'""",
            (t.session_id, t.meter_id),
        ).fetchone()

    if not s:
        raise HTTPException(status_code=401, detail="No authenticated session")

    return build(
        t.meter_id,
        t.session_id,
        s["ks"],
        s["last_seq"] + 1,
        t.model_dump(include={"kwh", "voltage", "current"}),
    )


@app.post("/api/readings/transmit")
def transmit(t: Tx, u=Depends(user)):
    message = next_msg(t)
    result = verify(message, u)

    return {
        "message": message.model_dump(),
        "result": result,
        "algorithm": crypto.ALG,
    }


def case(name, initial, action, expected, fn):
    try:
        fn()
        actual = "accepted"
    except HTTPException as e:
        actual = f"rejected ({e.status_code}: {e.detail})"

    return {
        "test": name,
        "initial": initial,
        "action": action,
        "expected": expected,
        "actual": actual,
        "ts": time.time(),
        "result": "PASS" if actual.startswith("rejected") else "FAIL",
    }


def fresh(mid):
    with db() as c:
        k = key_for(c, mid)

    if k is None:
        raise HTTPException(status_code=404, detail="Unknown meter")

    sid, _, _ = sim_meter_auth(mid, k)
    return sid


class Sim(BaseModel):
    meter_id: str


@app.post("/api/simulation/tamper")
def sim_tamper(b: Sim, u=Depends(user)):
    sid = fresh(b.meter_id)

    m = next_msg(
        Tx(
            meter_id=b.meter_id,
            session_id=sid,
            kwh=1,
            voltage=230,
            current=5,
        )
    )

    m.ct = m.ct[:-2] + ("00" if m.ct[-2:] != "00" else "01")

    return case(
        "Message tampering",
        "Authenticated session, valid message",
        "Modified final ciphertext/tag byte",
        "Rejected",
        lambda: verify(m, u),
    )


@app.post("/api/simulation/replay")
def sim_replay(b: Sim, u=Depends(user)):
    sid = fresh(b.meter_id)

    m = next_msg(
        Tx(
            meter_id=b.meter_id,
            session_id=sid,
            kwh=1,
            voltage=230,
            current=5,
        )
    )

    verify(m, u)

    return case(
        "Replay attack",
        "Message already accepted",
        "Resubmitted identical message",
        "Rejected",
        lambda: verify(m, u),
    )


@app.post("/api/simulation/unknown-meter")
def sim_unknown(u=Depends(user)):
    return case(
        "Unknown meter",
        "Meter not registered",
        "Requested a session",
        "Rejected",
        lambda: begin(
            Begin(meter_id="GHOST-999", cm="00" * 16),
            u,
        ),
    )


@app.post("/api/simulation/invalid-response")
def sim_invalid(b: Sim, u=Depends(user)):
    with db() as c:
        k = key_for(c, b.meter_id)

    if k is None:
        raise HTTPException(status_code=404, detail="Unknown meter")

    return case(
        "Invalid challenge-response",
        "Valid challenge issued",
        "Sent incorrect response",
        "Rejected",
        lambda: sim_meter_auth(b.meter_id, k, tamper_rm=True),
    )


@app.post("/api/simulation/expired-challenge")
def sim_expired(b: Sim, u=Depends(user)):
    with db() as c:
        k = key_for(c, b.meter_id)

    if k is None:
        raise HTTPException(status_code=404, detail="Unknown meter")

    cm = secrets.token_bytes(16)

    session = begin(
        Begin(meter_id=b.meter_id, cm=cm.hex()),
        u,
    )

    sid = session["session_id"]

    with db() as c:
        c.execute(
            "UPDATE sessions SET expires = ? WHERE sid = ?",
            (time.time() - 1, sid),
        )

    x = ctx(b.meter_id, sid, bytes.fromhex(session["cs"]), cm)

    return case(
        "Expired challenge",
        "Challenge expired",
        "Submitted response after expiry",
        "Rejected",
        lambda: respond(
            Respond(
                session_id=sid,
                rm=crypto.mac(k, b"M" + x).hex(),
            ),
            u,
        ),
    )


@app.get("/api/logs")
def logs(type: str = "", u=Depends(user)):
    with db() as c:
        return [
            dict(r)
            for r in c.execute(
                """SELECT * FROM events
                WHERE (? = '' OR type = ?)
                ORDER BY id DESC LIMIT 500""",
                (type, type),
            )
        ]


# -------------------------------------------------
# REAL-TIME SMART GRID DATA COMMUNICATION
# -------------------------------------------------

@app.get("/api/readings")
def get_readings(u=Depends(user)):
    """Return recent readings accepted by the security verification API."""

    with db() as c:
        rows = c.execute(
            """SELECT r.id, r.meter_id, m.name AS meter_name,
                      r.kwh, r.voltage, r.current, r.ts, r.seq, r.sid
               FROM readings r
               LEFT JOIN meters m ON m.meter_id = r.meter_id
               ORDER BY r.ts DESC
               LIMIT 100"""
        ).fetchall()

    items = []

    for row in rows:
        voltage = float(row["voltage"] or 0)
        current = float(row["current"] or 0)

        items.append({
            "id": row["id"],
            "meter_id": row["meter_id"],
            "meter_name": row["meter_name"],
            "energy": row["kwh"],
            "voltage": voltage,
            "current": current,
            "power": round(voltage * current, 2),
            "timestamp": row["ts"],
            "sequence": row["seq"],
            "session_id": row["sid"],
            "communication_status": "Successful",
            "security_status": "Verified",
        })

    return {
        "total": len(items),
        "readings": items,
    }


@app.get("/api/dashboard/summary")
def summary(u=Depends(user)):
    with db() as c:
        def count(query):
            return c.execute(query).fetchone()[0]

        return {
            "meters": count("SELECT COUNT(*) FROM meters"),
            "auth_ok": count(
                "SELECT COUNT(*) FROM events WHERE type = 'auth_success'"
            ),
            "auth_failed": count(
                "SELECT COUNT(*) FROM events WHERE type = 'auth_failed'"
            ),
            "rejected": count(
                """SELECT COUNT(*) FROM events
                WHERE type IN ('tampered','replay','unknown_meter')"""
            ),
            "readings": count("SELECT COUNT(*) FROM readings"),
            "data_source": "simulated",
        }


if __name__ == "__main__" and sys.argv[1:2] == ["create-admin"]:
    if len(sys.argv) != 4:
        print("Usage: python app.py create-admin USERNAME PASSWORD")
        sys.exit(1)

    create_user(sys.argv[2], sys.argv[3])
    print("Administrator created successfully.")