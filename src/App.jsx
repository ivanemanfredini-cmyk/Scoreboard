import { useState, useMemo, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC2o4K_UQwhdj375y6a4M8il3Rj-S_5270",
  authDomain: "raccolta-punteggi-italy.firebaseapp.com",
  projectId: "raccolta-punteggi-italy",
  storageBucket: "raccolta-punteggi-italy.firebasestorage.app",
  messagingSenderId: "92185659876",
  appId: "1:92185659876:web:e3d4fd2cf3e2833ec09ff1",
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const DATA_DOC = doc(db, "scoreboard", "data");

const ADMIN_PASSWORD = "admin2024";
const COLORS = ["#f97316","#3b82f6","#22c55e","#a855f7","#eab308","#ec4899","#14b8a6","#ef4444","#8b5cf6","#06b6d4",
  "#f43f5e","#84cc16","#0ea5e9","#d946ef","#fb923c","#4ade80","#60a5fa","#c084fc","#fbbf24","#34d399"];

const emptyData = { teams: [], players: [], events: [], scores: {} };

export default function App() {
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [page, setPage] = useState("players");
  const [isAdmin, setIsAdmin] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const [toast, setToast] = useState(null);

  const [newTeam, setNewTeam] = useState("");
  const [newPlayer, setNewPlayer] = useState({ name: "", teamId: "" });
  const [newEventDate, setNewEventDate] = useState(new Date().toISOString().split("T")[0]);
  const [newEventName, setNewEventName] = useState("");
  const [activeEventId, setActiveEventId] = useState(null);
  const [scoreInputs, setScoreInputs] = useState({});
  const [selectedTeamFilter, setSelectedTeamFilter] = useState("all");
  const [chartPlayer, setChartPlayer] = useState(null);

  // Carica dati da Firebase in tempo reale
  useEffect(() => {
    const unsub = onSnapshot(DATA_DOC, (snap) => {
      if (snap.exists()) {
        setData(snap.data());
      } else {
        setData(emptyData);
      }
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const persist = async (updated) => {
    setSaving(true);
    try {
      await setDoc(DATA_DOC, updated);
      setData(updated);
    } catch (e) {
      showToast("Errore salvataggio!", "err");
    }
    setSaving(false);
  };

  const showToast = (msg, type = "ok") => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500); };

  const playerStats = useMemo(() => {
    return data.players.map(p => {
      let total = 0, count = 0, absences = 0, best = 0;
      data.events.forEach(e => {
        const s = data.scores[e.id]?.[p.id];
        if (s === "absent") absences++;
        else if (s !== undefined && s !== "") { total += s; count++; if (s > best) best = s; }
      });
      const avg = count > 0 ? Math.round(total / count) : 0;
      const team = data.teams.find(t => t.id === p.teamId);
      return { ...p, total, count, absences, avg, best, teamName: team?.name || "—" };
    });
  }, [data]);

  const sortedPlayers = useMemo(() => [...playerStats]
    .filter(p => selectedTeamFilter === "all" || p.teamId === selectedTeamFilter)
    .sort((a, b) => b.total - a.total), [playerStats, selectedTeamFilter]);

  const sortedEvents = useMemo(() => [...data.events].sort((a, b) => new Date(b.date) - new Date(a.date)), [data.events]);

  const chartData = useMemo(() => {
    if (!chartPlayer) return [];
    let cumulative = 0;
    return [...data.events].sort((a, b) => new Date(a.date) - new Date(b.date)).map(e => {
      const s = data.scores[e.id]?.[chartPlayer];
      const score = (s !== undefined && s !== "absent" && s !== "") ? s : null;
      if (score !== null) cumulative += score;
      return { name: e.name || e.date, score, cumulative: score !== null ? cumulative : null };
    });
  }, [chartPlayer, data]);

  const addTeam = async () => { if (!newTeam.trim()) return; await persist({ ...data, teams: [...data.teams, { id: Date.now().toString(), name: newTeam.trim() }] }); setNewTeam(""); showToast("Team aggiunto!"); };
  const removeTeam = async (id) => { await persist({ ...data, teams: data.teams.filter(t => t.id !== id), players: data.players.filter(p => p.teamId !== id) }); showToast("Team rimosso", "err"); };
  const addPlayer = async () => { if (!newPlayer.name.trim() || !newPlayer.teamId) return; await persist({ ...data, players: [...data.players, { id: Date.now().toString(), name: newPlayer.name.trim(), teamId: newPlayer.teamId }] }); setNewPlayer({ name: "", teamId: "" }); showToast("Player aggiunto!"); };
  const removePlayer = async (id) => { await persist({ ...data, players: data.players.filter(p => p.id !== id) }); showToast("Player rimosso", "err"); };
  const addEvent = async () => {
    if (!newEventDate) return;
    const ev = { id: Date.now().toString(), date: newEventDate, name: newEventName.trim() || `Evento ${data.events.length + 1}` };
    await persist({ ...data, events: [...data.events, ev] });
    setNewEventName(""); showToast("Evento creato!");
  };
  const removeEvent = async (id) => { const scores = { ...data.scores }; delete scores[id]; await persist({ ...data, events: data.events.filter(e => e.id !== id), scores }); showToast("Evento rimosso", "err"); };

  const openScoreEntry = (eventId) => {
    setActiveEventId(eventId);
    const existing = data.scores[eventId] || {};
    const inputs = {};
    data.players.forEach(p => { const v = existing[p.id]; inputs[p.id] = v === "absent" ? "absent" : v !== undefined ? String(v) : ""; });
    setScoreInputs(inputs); setPage("entry");
  };

  const saveScores = async () => {
    const scores = { ...data.scores };
    const entry = {};
    Object.entries(scoreInputs).forEach(([pid, val]) => {
      if (val === "absent") entry[pid] = "absent";
      else if (val !== "") entry[pid] = parseInt(val) || 0;
    });
    scores[activeEventId] = entry;
    await persist({ ...data, scores });
    showToast("Punteggi salvati!"); setPage("events");
  };

  const teamColor = (id) => COLORS[data.teams.findIndex(t => t.id === id) % COLORS.length] || "#888";
  const playerColor = (id) => COLORS[data.players.findIndex(p => p.id === id) % COLORS.length] || "#888";
  const fmtNum = (n) => n != null ? n.toLocaleString("it-IT") : "—";

  const handleNav = (key) => { if (key === "logout") { setIsAdmin(false); setPage("players"); } else setPage(key); };
  const handleLogin = () => { if (pwInput === ADMIN_PASSWORD) { setIsAdmin(true); setPwError(false); setPage("players"); setPwInput(""); } else setPwError(true); };

  const navItems = [
    { key: "players", label: "🏅 Classifica" },
    { key: "events", label: "📅 Eventi" },
    { key: "charts", label: "📈 Grafici" },
    ...(isAdmin ? [{ key: "admin", label: "⚙️ Gestisci" }] : []),
    { key: isAdmin ? "logout" : "login", label: isAdmin ? "🔓 Esci" : "🔐 Admin" },
  ];

  if (loading) return (
    <div style={{ background: "#0d0d12", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', Arial, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
        <div style={{ color: "#f97316", fontSize: 20, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".1em" }}>Caricamento...</div>
        <div style={{ color: "#444", fontSize: 13, marginTop: 8 }}>Connessione al database</div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Barlow Condensed', Arial, sans-serif", background: "#0d0d12", minHeight: "100vh", color: "#f0f0f0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        input,select,button{font-family:inherit;outline:none}
        .card{background:#15151e;border:1px solid #21212e;border-radius:12px;padding:20px}
        .btn{font-weight:700;text-transform:uppercase;letter-spacing:.06em;border:none;border-radius:8px;cursor:pointer;padding:10px 20px;font-size:13px;transition:all .15s}
        .btn-o{background:#f97316;color:#000}.btn-o:hover{background:#fb923c}
        .btn-r{background:#ef4444;color:#fff}.btn-r:hover{background:#f87171}
        .btn-g{background:#22c55e;color:#000}.btn-g:hover{background:#4ade80}
        .btn-ghost{background:#21212e;color:#aaa}.btn-ghost:hover{background:#2a2a38;color:#f0f0f0}
        .inp{background:#1c1c28;border:1px solid #2e2e3e;color:#f0f0f0;font-size:14px;border-radius:8px;padding:10px 14px;width:100%;transition:border .15s}
        .inp:focus{border-color:#f97316}
        .nav-btn{background:none;border:none;color:#666;font-size:13px;font-weight:700;letter-spacing:.06em;cursor:pointer;padding:8px 12px;border-radius:6px;transition:all .15s;text-transform:uppercase}
        .nav-btn:hover,.nav-btn.active{background:#1c1c28;color:#f97316;text-shadow:0 0 8px rgba(249,115,22,0.5)}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        .tr:hover td{background:#1c1c28!important}
        .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase}
        .toast{position:fixed;bottom:24px;right:24px;padding:12px 22px;border-radius:10px;font-weight:700;font-size:14px;z-index:9999;animation:up .3s ease}
        @keyframes up{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
        .score-inp{background:#1c1c28;border:1px solid #2e2e3e;color:#f0f0f0;font-size:16px;font-weight:700;border-radius:8px;padding:8px 10px;width:120px;text-align:center}
        .score-inp:focus{border-color:#f97316}
        .score-inp:disabled{opacity:.3}
        .absent-btn{background:#1c1c28;border:1px solid #2e2e3e;color:#666;font-size:11px;font-weight:700;border-radius:8px;padding:8px 12px;cursor:pointer;text-transform:uppercase;letter-spacing:.05em;transition:all .15s}
        .absent-btn.on{background:#3f1a1a;border-color:#ef4444;color:#ef4444}
        .absent-btn:hover{border-color:#ef4444;color:#ef4444}
      `}</style>

      {/* Header */}
      <div style={{ background: "#09090f", borderBottom: "2px solid #f97316", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(249,115,22,0.08) 0%, transparent 50%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, #f97316, #ef4444, #f97316)", backgroundSize: "200% 100%", animation: "shimmer 3s linear infinite" }} />
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 70 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ position: "relative" }}>
              <span style={{ fontSize: 32, filter: "drop-shadow(0 0 12px #f97316)" }}>⚔️</span>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#f97316", textTransform: "uppercase", letterSpacing: ".25em", marginBottom: 1, opacity: 0.8 }}>Italy</div>
              <div style={{ fontSize: 24, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", lineHeight: 1, background: "linear-gradient(90deg, #22c55e 0%, #fff 50%, #ef4444 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Raccolta Punteggi
              </div>
            </div>
            {saving && <span style={{ color: "#f97316", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.7 }}>💾 salvataggio...</span>}
          </div>
          <nav style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
            {navItems.map(n => <button key={n.key} className={`nav-btn${page === n.key ? " active" : ""}`} onClick={() => handleNav(n.key)}>{n.label}</button>)}
          </nav>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 16px" }}>

        {/* CLASSIFICA */}
        {page === "players" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <h2 style={{ fontSize: 28, fontWeight: 800, textTransform: "uppercase", color: "#f97316" }}>🏅 Classifica Player</h2>
              {data.teams.length > 0 && (
                <select className="inp" style={{ width: "auto", fontSize: 13 }} value={selectedTeamFilter} onChange={e => setSelectedTeamFilter(e.target.value)}>
                  <option value="all">Tutti i team</option>
                  {data.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
            </div>
            {sortedPlayers.length === 0
              ? <div className="card" style={{ textAlign: "center", color: "#444", padding: 50 }}>Nessun player. Vai in ⚙️ Gestisci per aggiungerne.</div>
              : <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#111118", borderBottom: "2px solid #21212e" }}>
                        {["#","Player","Team","Presenze","Assenze","Miglior Score","Media","Totale"].map(h => (
                          <th key={h} style={{ padding: "12px 14px", textAlign: ["Player","Team"].includes(h) ? "left" : "center", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPlayers.map((p, i) => (
                        <tr key={p.id} className="tr" style={{ borderBottom: "1px solid #1c1c28" }}>
                          <td style={{ padding: "12px 14px", textAlign: "center", width: 36 }}>
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <span style={{ color: "#444", fontWeight: 700 }}>{i+1}</span>}
                          </td>
                          <td style={{ padding: "12px 14px", fontWeight: 700, fontSize: 15 }}>
                            <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: playerColor(p.id), marginRight: 8 }}></span>{p.name}
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: teamColor(p.teamId), display: "inline-block" }}></span>
                              <span style={{ color: "#888", fontSize: 13 }}>{p.teamName}</span>
                            </span>
                          </td>
                          <td style={{ padding: "12px 14px", textAlign: "center", color: "#22c55e", fontWeight: 700 }}>{p.count}</td>
                          <td style={{ padding: "12px 14px", textAlign: "center", color: p.absences > 0 ? "#ef4444" : "#444", fontWeight: 700 }}>{p.absences}</td>
                          <td style={{ padding: "12px 14px", textAlign: "center", color: "#eab308", fontWeight: 700 }}>{fmtNum(p.best)}</td>
                          <td style={{ padding: "12px 14px", textAlign: "center", color: "#aaa", fontWeight: 600 }}>{fmtNum(p.avg)}</td>
                          <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: 800, fontSize: 18, color: "#f97316" }}>{fmtNum(p.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            }
          </div>
        )}

        {/* EVENTI */}
        {page === "events" && (
          <div>
            <h2 style={{ fontSize: 28, fontWeight: 800, textTransform: "uppercase", color: "#f97316", marginBottom: 20 }}>📅 Eventi</h2>
            {isAdmin && (
              <div className="card" style={{ marginBottom: 20 }}>
                <p style={{ color: "#555", fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>Crea nuovo evento</p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <input className="inp" style={{ flex: 1, minWidth: 140 }} placeholder="Nome evento (opzionale)" value={newEventName} onChange={e => setNewEventName(e.target.value)} />
                  <input className="inp" type="date" style={{ width: 160 }} value={newEventDate} onChange={e => setNewEventDate(e.target.value)} />
                  <button className="btn btn-o" onClick={addEvent}>+ Crea</button>
                </div>
              </div>
            )}
            {sortedEvents.length === 0
              ? <div className="card" style={{ textAlign: "center", color: "#444", padding: 50 }}>Nessun evento ancora.</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {sortedEvents.map(e => {
                    const scores = data.scores[e.id] || {};
                    const entries = Object.values(scores);
                    const played = entries.filter(v => v !== "absent").length;
                    const absent = entries.filter(v => v === "absent").length;
                    const missing = data.players.length - played - absent;
                    return (
                      <div key={e.id} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", flexWrap: "wrap", gap: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 16 }}>{e.name}</div>
                            <div style={{ color: "#555", fontSize: 12, marginTop: 2 }}>📅 {e.date}</div>
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <span className="badge" style={{ background: "#1c3a2a", color: "#22c55e" }}>✓ {played}</span>
                            {absent > 0 && <span className="badge" style={{ background: "#3a1c1c", color: "#ef4444" }}>✗ {absent}</span>}
                            {missing > 0 && <span className="badge" style={{ background: "#21212e", color: "#555" }}>⌛ {missing}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {isAdmin && <button className="btn btn-o" style={{ fontSize: 12, padding: "8px 14px" }} onClick={() => openScoreEntry(e.id)}>✏️ Punteggi</button>}
                          <button className="btn btn-ghost" style={{ fontSize: 12, padding: "8px 14px" }} onClick={() => { setActiveEventId(e.id); setPage("event-detail"); }}>👁 Dettaglio</button>
                          {isAdmin && <button className="btn btn-r" style={{ fontSize: 12, padding: "8px 10px" }} onClick={() => removeEvent(e.id)}>✕</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
            }
          </div>
        )}

        {/* DETTAGLIO EVENTO */}
        {page === "event-detail" && (() => {
          const ev = data.events.find(e => e.id === activeEventId);
          if (!ev) return null;
         const [newPlayer, setNewPlayer] = useState({ name: "", teamId: "" });
  const [newEventDate, setNewEventDate] = useState(new Date().toISOString().split("T")[0]);
  const [newEventName, setNewEventName] = useState("");
  const [activeEventId, setActiveEventId] = useState(null);
  const [scoreInputs, setScoreInputs] = useState({});
  const [selectedTeamFilter, setSelectedTeamFilter] = useState("all");
  const [chartPlayer, setChartPlayer] = useState(null);

  // Carica dati da Firebase in tempo reale
  useEffect(() => {
    const unsub = onSnapshot(DATA_DOC, (snap) => {
      if (snap.exists()) {
        setData(snap.data());
      } else {
        setData(emptyData);
      }
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const persist = async (updated) => {
    setSaving(true);
    try {
      await setDoc(DATA_DOC, updated);
      setData(updated);
    } catch (e) {
      showToast("Errore salvataggio!", "err");
    }
    setSaving(false);
  };

  const showToast = (msg, type = "ok") => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500); };

  const playerStats = useMemo(() => {
    return data.players.map(p => {
      let total = 0, count = 0, absences = 0, best = 0;
      data.events.forEach(e => {
        const s = data.scores[e.id]?.[p.id];
        if (s === "absent") absences++;
        else if (s !== undefined && s !== "") { total += s; count++; if (s > best) best = s; }
      });
      const avg = count > 0 ? Math.round(total / count) : 0;
      const team = data.teams.find(t => t.id === p.teamId);
      return { ...p, total, count, absences, avg, best, teamName: team?.name || "—" };
    });
  }, [data]);

  const sortedPlayers = useMemo(() => [...playerStats]
    .filter(p => selectedTeamFilter === "all" || p.teamId === selectedTeamFilter)
    .sort((a, b) => b.total - a.total), [playerStats, selectedTeamFilter]);

  const sortedEvents = useMemo(() => [...data.events].sort((a, b) => new Date(b.date) - new Date(a.date)), [data.events]);

  const chartData = useMemo(() => {
    if (!chartPlayer) return [];
    let cumulative = 0;
    return [...data.events].sort((a, b) => new Date(a.date) - new Date(b.date)).map(e => {
      const s = data.scores[e.id]?.[chartPlayer];
      const score = (s !== undefined && s !== "absent" && s !== "") ? s : null;
      if (score !== null) cumulative += score;
      return { name: e.name || e.date, score, cumulative: score !== null ? cumulative : null };
    });
  }, [chartPlayer, data]);

  const addTeam = async () => { if (!newTeam.trim()) return; await persist({ ...data, teams: [...data.teams, { id: Date.now().toString(), name: newTeam.trim() }] }); setNewTeam(""); showToast("Team aggiunto!"); };
  const removeTeam = async (id) => { await persist({ ...data, teams: data.teams.filter(t => t.id !== id), players: data.players.filter(p => p.teamId !== id) }); showToast("Team rimosso", "err"); };
  const addPlayer = async () => { if (!newPlayer.name.trim() || !newPlayer.teamId) return; await persist({ ...data, players: [...data.players, { id: Date.now().toString(), name: newPlayer.name.trim(), teamId: newPlayer.teamId }] }); setNewPlayer({ name: "", teamId: "" }); showToast("Player aggiunto!"); };
  const removePlayer = async (id) => { await persist({ ...data, players: data.players.filter(p => p.id !== id) }); showToast("Player rimosso", "err"); };
  const addEvent = async () => {
    if (!newEventDate) return;
    const ev = { id: Date.now().toString(), date: newEventDate, name: newEventName.trim() || `Evento ${data.events.length + 1}` };
    await persist({ ...data, events: [...data.events, ev] });
    setNewEventName(""); showToast("Evento creato!");
  };
  const removeEvent = async (id) => { const scores = { ...data.scores }; delete scores[id]; await persist({ ...data, events: data.events.filter(e => e.id !== id), scores }); showToast("Evento rimosso", "err"); };

  const openScoreEntry = (eventId) => {
    setActiveEventId(eventId);
    const existing = data.scores[eventId] || {};
    const inputs = {};
    data.players.forEach(p => { const v = existing[p.id]; inputs[p.id] = v === "absent" ? "absent" : v !== undefined ? String(v) : ""; });
    setScoreInputs(inputs); setPage("entry");
  };

  const saveScores = async () => {
    const scores = { ...data.scores };
    const entry = {};
    Object.entries(scoreInputs).forEach(([pid, val]) => {
      if (val === "absent") entry[pid] = "absent";
      else if (val !== "") entry[pid] = parseInt(val) || 0;
    });
    scores[activeEventId] = entry;
    await persist({ ...data, scores });
    showToast("Punteggi salvati!"); setPage("events");
  };

  const teamColor = (id) => COLORS[data.teams.findIndex(t => t.id === id) % COLORS.length] || "#888";
  const playerColor = (id) => COLORS[data.players.findIndex(p => p.id === id) % COLORS.length] || "#888";
  const fmtNum = (n) => n != null ? n.toLocaleString("it-IT") : "—";

  const handleNav = (key) => { if (key === "logout") { setIsAdmin(false); setPage("players"); } else setPage(key); };
  const handleLogin = () => { if (pwInput === ADMIN_PASSWORD) { setIsAdmin(true); setPwError(false); setPage("players"); setPwInput(""); } else setPwError(true); };

  const navItems = [
    { key: "players", label: "🏅 Classifica" },
    { key: "events", label: "📅 Eventi" },
    { key: "charts", label: "📈 Grafici" },
    ...(isAdmin ? [{ key: "admin", label: "⚙️ Gestisci" }] : []),
    { key: isAdmin ? "logout" : "login", label: isAdmin ? "🔓 Esci" : "🔐 Admin" },
  ];

  if (loading) return (
    <div style={{ background: "#0d0d12", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', Arial, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
        <div style={{ color: "#f97316", fontSize: 20, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".1em" }}>Caricamento...</div>
        <div style={{ color: "#444", fontSize: 13, marginTop: 8 }}>Connessione al database</div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Barlow Condensed', Arial, sans-serif", background: "#0d0d12", minHeight: "100vh", color: "#f0f0f0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        input,select,button{font-family:inherit;outline:none}
        .card{background:#15151e;border:1px solid #21212e;border-radius:12px;padding:20px}
        .btn{font-weight:700;text-transform:uppercase;letter-spacing:.06em;border:none;border-radius:8px;cursor:pointer;padding:10px 20px;font-size:13px;transition:all .15s}
        .btn-o{background:#f97316;color:#000}.btn-o:hover{background:#fb923c}
        .btn-r{background:#ef4444;color:#fff}.btn-r:hover{background:#f87171}
        .btn-g{background:#22c55e;color:#000}.btn-g:hover{background:#4ade80}
        .btn-ghost{background:#21212e;color:#aaa}.btn-ghost:hover{background:#2a2a38;color:#f0f0f0}
        .inp{background:#1c1c28;border:1px solid #2e2e3e;color:#f0f0f0;font-size:14px;border-radius:8px;padding:10px 14px;width:100%;transition:border .15s}
        .inp:focus{border-color:#f97316}
        .nav-btn{background:none;border:none;color:#666;font-size:13px;font-weight:700;letter-spacing:.06em;cursor:pointer;padding:8px 12px;border-radius:6px;transition:all .15s;text-transform:uppercase}
        .nav-btn:hover,.nav-btn.active{background:#1c1c28;color:#f97316;text-shadow:0 0 8px rgba(249,115,22,0.5)}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        .tr:hover td{background:#1c1c28!important}
        .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase}
        .toast{position:fixed;bottom:24px;right:24px;padding:12px 22px;border-radius:10px;font-weight:700;font-size:14px;z-index:9999;animation:up .3s ease}
        @keyframes up{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
        .score-inp{background:#1c1c28;border:1px solid #2e2e3e;color:#f0f0f0;font-size:16px;font-weight:700;border-radius:8px;padding:8px 10px;width:120px;text-align:center}
        .score-inp:focus{border-color:#f97316}
        .score-inp:disabled{opacity:.3}
        .absent-btn{background:#1c1c28;border:1px solid #2e2e3e;color:#666;font-size:11px;font-weight:700;border-radius:8px;padding:8px 12px;cursor:pointer;text-transform:uppercase;letter-spacing:.05em;transition:all .15s}
        .absent-btn.on{background:#3f1a1a;border-color:#ef4444;color:#ef4444}
        .absent-btn:hover{border-color:#ef4444;color:#ef4444}
      `}</style>

      {/* Header */}
      <div style={{ background: "#09090f", borderBottom: "2px solid #f97316", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(249,115,22,0.08) 0%, transparent 50%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, #f97316, #ef4444, #f97316)", backgroundSize: "200% 100%", animation: "shimmer 3s linear infinite" }} />
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 70 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ position: "relative" }}>
              <span style={{ fontSize: 32, filter: "drop-shadow(0 0 12px #f97316)" }}>⚔️</span>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#f97316", textTransform: "uppercase", letterSpacing: ".25em", marginBottom: 1, opacity: 0.8 }}>Italy</div>
              <div style={{ fontSize: 24, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", lineHeight: 1, background: "linear-gradient(90deg, #22c55e 0%, #fff 50%, #ef4444 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Raccolta Punteggi
              </div>
            </div>
            {saving && <span style={{ color: "#f97316", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.7 }}>💾 salvataggio...</span>}
          </div>
          <nav style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
            {navItems.map(n => <button key={n.key} className={`nav-btn${page === n.key ? " active" : ""}`} onClick={() => handleNav(n.key)}>{n.label}</button>)}
          </nav>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 16px" }}>

        {/* CLASSIFICA */}
        {page === "players" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <h2 style={{ fontSize: 28, fontWeight: 800, textTransform: "uppercase", color: "#f97316" }}>🏅 Classifica Player</h2>
              {data.teams.length > 0 && (
                <select className="inp" style={{ width: "auto", fontSize: 13 }} value={selectedTeamFilter} onChange={e => setSelectedTeamFilter(e.target.value)}>
                  <option value="all">Tutti i team</option>
                  {data.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
            </div>
            {sortedPlayers.length === 0
              ? <div className="card" style={{ textAlign: "center", color: "#444", padding: 50 }}>Nessun player. Vai in ⚙️ Gestisci per aggiungerne.</div>
              : <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#111118", borderBottom: "2px solid #21212e" }}>
                        {["#","Player","Team","Presenze","Assenze","Miglior Score","Media","Totale"].map(h => (
                          <th key={h} style={{ padding: "12px 14px", textAlign: ["Player","Team"].includes(h) ? "left" : "center", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPlayers.map((p, i) => (
                        <tr key={p.id} className="tr" style={{ borderBottom: "1px solid #1c1c28" }}>
                          <td style={{ padding: "12px 14px", textAlign: "center", width: 36 }}>
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <span style={{ color: "#444", fontWeight: 700 }}>{i+1}</span>}
                          </td>
                          <td style={{ padding: "12px 14px", fontWeight: 700, fontSize: 15 }}>
                            <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: playerColor(p.id), marginRight: 8 }}></span>{p.name}
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: teamColor(p.teamId), display: "inline-block" }}></span>
                              <span style={{ color: "#888", fontSize: 13 }}>{p.teamName}</span>
                            </span>
                          </td>
                          <td style={{ padding: "12px 14px", textAlign: "center", color: "#22c55e", fontWeight: 700 }}>{p.count}</td>
                          <td style={{ padding: "12px 14px", textAlign: "center", color: p.absences > 0 ? "#ef4444" : "#444", fontWeight: 700 }}>{p.absences}</td>
                          <td style={{ padding: "12px 14px", textAlign: "center", color: "#eab308", fontWeight: 700 }}>{fmtNum(p.best)}</td>
                          <td style={{ padding: "12px 14px", textAlign: "center", color: "#aaa", fontWeight: 600 }}>{fmtNum(p.avg)}</td>
                          <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: 800, fontSize: 18, color: "#f97316" }}>{fmtNum(p.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            }
          </div>
        )}

        {/* EVENTI */}
        {page === "events" && (
          <div>
            <h2 style={{ fontSize: 28, fontWeight: 800, textTransform: "uppercase", color: "#f97316", marginBottom: 20 }}>📅 Eventi</h2>
            {isAdmin && (
              <div className="card" style={{ marginBottom: 20 }}>
                <p style={{ color: "#555", fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>Crea nuovo evento</p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <input className="inp" style={{ flex: 1, minWidth: 140 }} placeholder="Nome evento (opzionale)" value={newEventName} onChange={e => setNewEventName(e.target.value)} />
                  <input className="inp" type="date" style={{ width: 160 }} value={newEventDate} onChange={e => setNewEventDate(e.target.value)} />
                  <button className="btn btn-o" onClick={addEvent}>+ Crea</button>
                </div>
              </div>
            )}
            {sortedEvents.length === 0
              ? <div className="card" style={{ textAlign: "center", color: "#444", padding: 50 }}>Nessun evento ancora.</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {sortedEvents.map(e => {
                    const scores = data.scores[e.id] || {};
                    const entries = Object.values(scores);
                    const played = entries.filter(v => v !== "absent").length;
                    const absent = entries.filter(v => v === "absent").length;
                    const missing = data.players.length - played - absent;
                    return (
                      <div key={e.id} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", flexWrap: "wrap", gap: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 16 }}>{e.name}</div>
                            <div style={{ color: "#555", fontSize: 12, marginTop: 2 }}>📅 {e.date}</div>
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <span className="badge" style={{ background: "#1c3a2a", color: "#22c55e" }}>✓ {played}</span>
                            {absent > 0 && <span className="badge" style={{ background: "#3a1c1c", color: "#ef4444" }}>✗ {absent}</span>}
                            {missing > 0 && <span className="badge" style={{ background: "#21212e", color: "#555" }}>⌛ {missing}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {isAdmin && <button className="btn btn-o" style={{ fontSize: 12, padding: "8px 14px" }} onClick={() => openScoreEntry(e.id)}>✏️ Punteggi</button>}
                          <button className="btn btn-ghost" style={{ fontSize: 12, padding: "8px 14px" }} onClick={() => { setActiveEventId(e.id); setPage("event-detail"); }}>👁 Dettaglio</button>
                          {isAdmin && <button className="btn btn-r" style={{ fontSize: 12, padding: "8px 10px" }} onClick={() => removeEvent(e.id)}>✕</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
            }
          </div>
        )}

        {/* DETTAGLIO EVENTO */}
        {page === "event-detail" && (() => {
          const ev = data.events.find(e => e.id === activeEventId);
          if (!ev) return null;
          const scores = data.scores[ev.id] || {};
          const rows = [...data.players].map(p => ({ ...p, score: scores[p.id] }))
            .sort((a, b) => {
              if (a.score === "absent" || a.score === undefined) return 1;
              if (b.score === "absent" || b.score === undefined) return -1;
              return b.score - a.score;
            });
          let rank = 0;
          return (
            <div>
              <button className="btn btn-ghost" style={{ marginBottom: 20, fontSize: 12 }} onClick={() => setPage("events")}>← Torna agli eventi</button>
              <h2 style={{ fontSize: 24, fontWeight: 800, textTransform: "uppercase", color: "#f97316", marginBottom: 4 }}>{ev.name}</h2>
              <p style={{ color: "#555", marginBottom: 20 }}>📅 {ev.date}</p>
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#111118", borderBottom: "2px solid #21212e" }}>
                      {["#","Player","Team","Punteggio"].map(h => (
                        <th key={h} style={{ padding: "12px 14px", textAlign: ["Player","Team"].includes(h) ? "left" : "center", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".08em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => {
                      const hasScore = p.score !== "absent" && p.score !== undefined;
                      if (hasScore) rank++;
                      const r = rank;
                      return (
                        <tr key={p.id} className="tr" style={{ borderBottom: "1px solid #1c1c28" }}>
                          <td style={{ padding: "12px 14px", textAlign: "center", width: 36 }}>
                            {hasScore ? (r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : <span style={{ color: "#444" }}>{r}</span>) : "—"}
                          </td>
                          <td style={{ padding: "12px 14px", fontWeight: 700, fontSize: 15 }}>
                            <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: playerColor(p.id), marginRight: 8 }}></span>{p.name}
                          </td>
                          <td style={{ padding: "12px 14px", color: "#888", fontSize: 13 }}>{data.teams.find(t => t.id === p.teamId)?.name || "—"}</td>
                          <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: 800, fontSize: 18 }}>
                            {p.score === "absent" ? <span style={{ color: "#ef4444", fontSize: 13, fontWeight: 700 }}>ASSENTE</span>
                              : p.score !== undefined ? <span style={{ color: "#f97316" }}>{fmtNum(p.score)}</span>
                              : <span style={{ color: "#444" }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* INSERIMENTO PUNTEGGI */}
        {page === "entry" && isAdmin && (() => {
          const ev = data.events.find(e => e.id === activeEventId);
          if (!ev) return null;
          const grouped = data.teams.map(t => ({ team: t, players: data.players.filter(p => p.teamId === t.id) })).filter(g => g.players.length > 0);
          const noTeam = data.players.filter(p => !data.teams.find(t => t.id === p.teamId));
          const PlayerRow = ({ p }) => (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #1c1c28" }}>
              <span style={{ minWidth: 170, fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: playerColor(p.id), display: "inline-block" }}></span>
                {p.name}
              </span>
              <input type="number" min="0" max="75000" className="score-inp" placeholder="0 – 75.000"
                disabled={scoreInputs[p.id] === "absent"}
                value={scoreInputs[p.id] === "absent" ? "" : (scoreInputs[p.id] ?? "")}
                onChange={e => setScoreInputs(prev => ({ ...prev, [p.id]: e.target.value }))} />
              <button className={`absent-btn${scoreInputs[p.id] === "absent" ? " on" : ""}`}
                onClick={() => setScoreInputs(prev => ({ ...prev, [p.id]: prev[p.id] === "absent" ? "" : "absent" }))}>
                {scoreInputs[p.id] === "absent" ? "✗ Assente" : "Assente"}
              </button>
            </div>
          );
          return (
            <div>
              <button className="btn btn-ghost" style={{ marginBottom: 20, fontSize: 12 }} onClick={() => setPage("events")}>← Annulla</button>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h2 style={{ fontSize: 24, fontWeight: 800, textTransform: "uppercase", color: "#f97316" }}>{ev.name}</h2>
                  <p style={{ color: "#555", fontSize: 13 }}>📅 {ev.date} — punteggi da 0 a 75.000</p>
                </div>
                <button className="btn btn-g" onClick={saveScores}>💾 Salva punteggi</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {grouped.map(({ team, players }) => (
                  <div key={team.id} className="card">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: teamColor(team.id), display: "inline-block" }}></span>
                      <span style={{ fontWeight: 800, fontSize: 14, textTransform: "uppercase", letterSpacing: ".06em" }}>{team.name}</span>
                    </div>
                    {players.map(p => <PlayerRow key={p.id} p={p} />)}
                  </div>
                ))}
                {noTeam.length > 0 && (
                  <div className="card">
                    <p style={{ color: "#555", fontSize: 12, marginBottom: 10, textTransform: "uppercase" }}>Senza team</p>
                    {noTeam.map(p => <PlayerRow key={p.id} p={p} />)}
                  </div>
                )}
              </div>
              <div style={{ marginTop: 20 }}>
                <button className="btn btn-g" style={{ width: "100%", padding: 14 }} onClick={saveScores}>💾 Salva punteggi</button>
              </div>
            </div>
          );
        })()}

        {/* GRAFICI */}
        {page === "charts" && (
          <div>
            <h2 style={{ fontSize: 28, fontWeight: 800, textTransform: "uppercase", color: "#f97316", marginBottom: 20 }}>📈 Grafici</h2>
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {data.players.map(p => (
                <button key={p.id} onClick={() => setChartPlayer(p.id)}
                  style={{ background: chartPlayer === p.id ? playerColor(p.id) : "#1c1c28", border: `1px solid ${chartPlayer === p.id ? playerColor(p.id) : "#2e2e3e"}`, color: chartPlayer === p.id ? "#000" : "#aaa", fontFamily: "inherit", fontWeight: 700, fontSize: 13, padding: "7px 14px", borderRadius: 20, cursor: "pointer", transition: "all .15s" }}>
                  {p.name}
                </button>
              ))}
              {data.players.length === 0 && <div style={{ color: "#444" }}>Nessun player ancora.</div>}
            </div>
            {!chartPlayer
              ? <div className="card" style={{ textAlign: "center", color: "#444", padding: 50 }}>Seleziona un player per vedere il grafico.</div>
              : (() => {
                  const stats = playerStats.find(pl => pl.id === chartPlayer);
                  const color = playerColor(chartPlayer);
                  return (
                    <div>
                      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                        {[["Totale", fmtNum(stats?.total)], ["Media", fmtNum(stats?.avg)], ["Miglior Score", fmtNum(stats?.best)], ["Presenze", stats?.count], ["Assenze", stats?.absences]].map(([label, val]) => (
                          <div key={label} className="card" style={{ flex: 1, minWidth: 100, textAlign: "center", padding: "14px 10px" }}>
                            <div style={{ color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 }}>{label}</div>
                            <div style={{ fontSize: 22, fontWeight: 800, color }}>{val}</div>
                          </div>
                        ))}
                      </div>
                      <div className="card" style={{ marginBottom: 16 }}>
                        <p style={{ color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 14 }}>Punteggio per Evento</p>
                        <ResponsiveContainer width="100%" height={220}>
                          <LineChart data={chartData.filter(d => d.score !== null)} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1c1c28" />
                            <XAxis dataKey="name" tick={{ fill: "#555", fontSize: 10 }} />
                            <YAxis tick={{ fill: "#555", fontSize: 11 }} tickFormatter={v => v.toLocaleString("it-IT")} />
                            <Tooltip contentStyle={{ background: "#1c1c28", border: "1px solid #2e2e3e", borderRadius: 8, color: "#f0f0f0" }} formatter={v => v.toLocaleString("it-IT")} />
                            <Line type="monotone" dataKey="score" stroke={color} strokeWidth={2.5} dot={{ r: 4, fill: color }} name="Punteggio" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="card">
                        <p style={{ color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 14 }}>Punteggio Cumulativo</p>
                        <ResponsiveContainer width="100%" height={220}>
                          <LineChart data={chartData.filter(d => d.cumulative !== null)} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1c1c28" />
                            <XAxis dataKey="name" tick={{ fill: "#555", fontSize: 10 }} />
                            <YAxis tick={{ fill: "#555", fontSize: 11 }} tickFormatter={v => v.toLocaleString("it-IT")} />
                            <Tooltip contentStyle={{ background: "#1c1c28", border: "1px solid #2e2e3e", borderRadius: 8, color: "#f0f0f0" }} formatter={v => v.toLocaleString("it-IT")} />
                            <Line type="monotone" dataKey="cumulative" stroke={color} strokeWidth={2.5} dot={{ r: 4, fill: color }} name="Cumulativo" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  );
                })()
            }
          </div>
        )}

        {/* ADMIN */}
        {page === "admin" && isAdmin && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, textTransform: "uppercase", color: "#f97316", marginBottom: 14 }}>⚙️ Team</h2>
              <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <input className="inp" placeholder="Nome team" value={newTeam} onChange={e => setNewTeam(e.target.value)} onKeyDown={e => e.key === "Enter" && addTeam()} />
                  <button className="btn btn-o" onClick={addTeam}>+</button>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.teams.map((t, i) => (
                  <div key={t.id} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px" }}>
                    <span style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: COLORS[i % COLORS.length], display: "inline-block" }}></span>
                      {t.name} <span style={{ color: "#444", fontSize: 12 }}>({data.players.filter(p => p.teamId === t.id).length} player)</span>
                    </span>
                    <button className="btn btn-r" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => removeTeam(t.id)}>✕</button>
                  </div>
                ))}
                {data.teams.length === 0 && <div style={{ color: "#444", textAlign: "center", padding: 20 }}>Nessun team</div>}
              </div>
            </div>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, textTransform: "uppercase", color: "#f97316", marginBottom: 14 }}>⚙️ Player</h2>
              <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <input className="inp" placeholder="Nome player" value={newPlayer.name} onChange={e => setNewPlayer({ ...newPlayer, name: e.target.value })} />
                  <select className="inp" value={newPlayer.teamId} onChange={e => setNewPlayer({ ...newPlayer, teamId: e.target.value })}>
                    <option value="">Seleziona team</option>
                    {data.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button className="btn btn-o" onClick={addPlayer}>Aggiungi Player</button>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto" }}>
                {data.players.map(p => {
                  const ti = data.teams.findIndex(t => t.id === p.teamId);
                  const team = data.teams.find(t => t.id === p.teamId);
                  return (
                    <div key={p.id} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: playerColor(p.id), display: "inline-block" }}></span>
                        <span style={{ fontWeight: 700 }}>{p.name}</span>
                        {team && <span style={{ color: "#555", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS[ti % COLORS.length], display: "inline-block" }}></span>
                          {team.name}
                        </span>}
                      </span>
                      <button className="btn btn-r" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => removePlayer(p.id)}>✕</button>
                    </div>
                  );
                })}
                {data.players.length === 0 && <div style={{ color: "#444", textAlign: "center", padding: 20 }}>Nessun player</div>}
              </div>
            </div>
          </div>
        )}

        {/* LOGIN */}
        {page === "login" && (
          <div style={{ maxWidth: 360, margin: "60px auto" }}>
            <div className="card">
              <h2 style={{ fontSize: 24, fontWeight: 800, textTransform: "uppercase", color: "#f97316", marginBottom: 6 }}>🔐 Accesso Admin</h2>
              <p style={{ color: "#555", fontSize: 13, marginBottom: 20 }}>Inserisci la password per gestire team, player ed eventi.</p>
              <input className="inp" type="password" placeholder="Password" value={pwInput}
                onChange={e => { setPwInput(e.target.value); setPwError(false); }}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                style={{ marginBottom: 10 }} />
              {pwError && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 10 }}>❌ Password errata</p>}
              <button className="btn btn-o" style={{ width: "100%" }} onClick={handleLogin}>Accedi</button>
              <p style={{ color: "#333", fontSize: 11, marginTop: 14, textAlign: "center" }}>Password: <strong style={{ color: "#555" }}>admin2024</strong></p>
            </div>
          </div>
        )}

      </div>

      {toast && <div className="toast" style={{ background: toast.type === "err" ? "#ef4444" : "#22c55e", color: "#fff" }}>{toast.msg}</div>}
    </div>
  );
}  const [newPlayer, setNewPlayer] = useState({ name: "", teamId: "" });
  const [newEventDate, setNewEventDate] = useState(new Date().toISOString().split("T")[0]);
  const [newEventName, setNewEventName] = useState("");
  const [activeEventId, setActiveEventId] = useState(null);
  const [scoreInputs, setScoreInputs] = useState({});
  const [selectedTeamFilter, setSelectedTeamFilter] = useState("all");
  const [chartPlayer, setChartPlayer] = useState(null);

  // Carica dati da Firebase in tempo reale
  useEffect(() => {
    const unsub = onSnapshot(DATA_DOC, (snap) => {
      if (snap.exists()) {
        setData(snap.data());
      } else {
        setData(emptyData);
      }
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const persist = async (updated) => {
    setSaving(true);
    try {
      await setDoc(DATA_DOC, updated);
      setData(updated);
    } catch (e) {
      showToast("Errore salvataggio!", "err");
    }
    setSaving(false);
  };

  const showToast = (msg, type = "ok") => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500); };

  const playerStats = useMemo(() => {
    return data.players.map(p => {
      let total = 0, count = 0, absences = 0, best = 0;
      data.events.forEach(e => {
        const s = data.scores[e.id]?.[p.id];
        if (s === "absent") absences++;
        else if (s !== undefined && s !== "") { total += s; count++; if (s > best) best = s; }
      });
      const avg = count > 0 ? Math.round(total / count) : 0;
      const team = data.teams.find(t => t.id === p.teamId);
      return { ...p, total, count, absences, avg, best, teamName: team?.name || "—" };
    });
  }, [data]);

  const sortedPlayers = useMemo(() => [...playerStats]
    .filter(p => selectedTeamFilter === "all" || p.teamId === selectedTeamFilter)
    .sort((a, b) => b.total - a.total), [playerStats, selectedTeamFilter]);

  const sortedEvents = useMemo(() => [...data.events].sort((a, b) => new Date(b.date) - new Date(a.date)), [data.events]);

  const chartData = useMemo(() => {
    if (!chartPlayer) return [];
    let cumulative = 0;
    return [...data.events].sort((a, b) => new Date(a.date) - new Date(b.date)).map(e => {
      const s = data.scores[e.id]?.[chartPlayer];
      const score = (s !== undefined && s !== "absent" && s !== "") ? s : null;
      if (score !== null) cumulative += score;
      return { name: e.name || e.date, score, cumulative: score !== null ? cumulative : null };
    });
  }, [chartPlayer, data]);

  const addTeam = async () => { if (!newTeam.trim()) return; await persist({ ...data, teams: [...data.teams, { id: Date.now().toString(), name: newTeam.trim() }] }); setNewTeam(""); showToast("Team aggiunto!"); };
  const removeTeam = async (id) => { await persist({ ...data, teams: data.teams.filter(t => t.id !== id), players: data.players.filter(p => p.teamId !== id) }); showToast("Team rimosso", "err"); };
  const addPlayer = async () => { if (!newPlayer.name.trim() || !newPlayer.teamId) return; await persist({ ...data, players: [...data.players, { id: Date.now().toString(), name: newPlayer.name.trim(), teamId: newPlayer.teamId }] }); setNewPlayer({ name: "", teamId: "" }); showToast("Player aggiunto!"); };
  const removePlayer = async (id) => { await persist({ ...data, players: data.players.filter(p => p.id !== id) }); showToast("Player rimosso", "err"); };
  const addEvent = async () => {
    if (!newEventDate) return;
    const ev = { id: Date.now().toString(), date: newEventDate, name: newEventName.trim() || `Evento ${data.events.length + 1}` };
    await persist({ ...data, events: [...data.events, ev] });
    setNewEventName(""); showToast("Evento creato!");
  };
  const removeEvent = async (id) => { const scores = { ...data.scores }; delete scores[id]; await persist({ ...data, events: data.events.filter(e => e.id !== id), scores }); showToast("Evento rimosso", "err"); };

  const openScoreEntry = (eventId) => {
    setActiveEventId(eventId);
    const existing = data.scores[eventId] || {};
    const inputs = {};
    data.players.forEach(p => { const v = existing[p.id]; inputs[p.id] = v === "absent" ? "absent" : v !== undefined ? String(v) : ""; });
    setScoreInputs(inputs); setPage("entry");
  };

  const saveScores = async () => {
    const scores = { ...data.scores };
    const entry = {};
    Object.entries(scoreInputs).forEach(([pid, val]) => {
      if (val === "absent") entry[pid] = "absent";
      else if (val !== "") entry[pid] = parseInt(val) || 0;
    });
    scores[activeEventId] = entry;
    await persist({ ...data, scores });
    showToast("Punteggi salvati!"); setPage("events");
  };

  const teamColor = (id) => COLORS[data.teams.findIndex(t => t.id === id) % COLORS.length] || "#888";
  const playerColor = (id) => COLORS[data.players.findIndex(p => p.id === id) % COLORS.length] || "#888";
  const fmtNum = (n) => n != null ? n.toLocaleString("it-IT") : "—";

  const handleNav = (key) => { if (key === "logout") { setIsAdmin(false); setPage("players"); } else setPage(key); };
  const handleLogin = () => { if (pwInput === ADMIN_PASSWORD) { setIsAdmin(true); setPwError(false); setPage("players"); setPwInput(""); } else setPwError(true); };

  const navItems = [
    { key: "players", label: "🏅 Classifica" },
    { key: "events", label: "📅 Eventi" },
    { key: "charts", label: "📈 Grafici" },
    ...(isAdmin ? [{ key: "admin", label: "⚙️ Gestisci" }] : []),
    { key: isAdmin ? "logout" : "login", label: isAdmin ? "🔓 Esci" : "🔐 Admin" },
  ];

  if (loading) return (
    <div style={{ background: "#0d0d12", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', Arial, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
        <div style={{ color: "#f97316", fontSize: 20, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".1em" }}>Caricamento...</div>
        <div style={{ color: "#444", fontSize: 13, marginTop: 8 }}>Connessione al database</div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Barlow Condensed', Arial, sans-serif", background: "#0d0d12", minHeight: "100vh", color: "#f0f0f0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        input,select,button{font-family:inherit;outline:none}
        .card{background:#15151e;border:1px solid #21212e;border-radius:12px;padding:20px}
        .btn{font-weight:700;text-transform:uppercase;letter-spacing:.06em;border:none;border-radius:8px;cursor:pointer;padding:10px 20px;font-size:13px;transition:all .15s}
        .btn-o{background:#f97316;color:#000}.btn-o:hover{background:#fb923c}
        .btn-r{background:#ef4444;color:#fff}.btn-r:hover{background:#f87171}
        .btn-g{background:#22c55e;color:#000}.btn-g:hover{background:#4ade80}
        .btn-ghost{background:#21212e;color:#aaa}.btn-ghost:hover{background:#2a2a38;color:#f0f0f0}
        .inp{background:#1c1c28;border:1px solid #2e2e3e;color:#f0f0f0;font-size:14px;border-radius:8px;padding:10px 14px;width:100%;transition:border .15s}
        .inp:focus{border-color:#f97316}
        .nav-btn{background:none;border:none;color:#666;font-size:13px;font-weight:700;letter-spacing:.06em;cursor:pointer;padding:8px 12px;border-radius:6px;transition:all .15s;text-transform:uppercase}
        .nav-btn:hover,.nav-btn.active{background:#1c1c28;color:#f97316}
        .tr:hover td{background:#1c1c28!important}
        .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase}
        .toast{position:fixed;bottom:24px;right:24px;padding:12px 22px;border-radius:10px;font-weight:700;font-size:14px;z-index:9999;animation:up .3s ease}
        @keyframes up{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
        .score-inp{background:#1c1c28;border:1px solid #2e2e3e;color:#f0f0f0;font-size:16px;font-weight:700;border-radius:8px;padding:8px 10px;width:120px;text-align:center}
        .score-inp:focus{border-color:#f97316}
        .score-inp:disabled{opacity:.3}
        .absent-btn{background:#1c1c28;border:1px solid #2e2e3e;color:#666;font-size:11px;font-weight:700;border-radius:8px;padding:8px 12px;cursor:pointer;text-transform:uppercase;letter-spacing:.05em;transition:all .15s}
        .absent-btn.on{background:#3f1a1a;border-color:#ef4444;color:#ef4444}
        .absent-btn:hover{border-color:#ef4444;color:#ef4444}
      `}</style>

      {/* Header */}
      <div style={{ background: "#09090f", borderBottom: "1px solid #1c1c28" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 58 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: "#f97316", textTransform: "uppercase", letterSpacing: ".1em" }}>⚡ Raccolta Punteggi</span>
            {saving && <span style={{ color: "#555", fontSize: 12 }}>💾 salvataggio...</span>}
          </div>
          <nav style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
            {navItems.map(n => <button key={n.key} className={`nav-btn${page === n.key ? " active" : ""}`} onClick={() => handleNav(n.key)}>{n.label}</button>)}
          </nav>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 16px" }}>

        {/* CLASSIFICA */}
        {page === "players" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <h2 style={{ fontSize: 28, fontWeight: 800, textTransform: "uppercase", color: "#f97316" }}>🏅 Classifica Player</h2>
              {data.teams.length > 0 && (
                <select className="inp" style={{ width: "auto", fontSize: 13 }} value={selectedTeamFilter} onChange={e => setSelectedTeamFilter(e.target.value)}>
                  <option value="all">Tutti i team</option>
                  {data.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
            </div>
            {sortedPlayers.length === 0
              ? <div className="card" style={{ textAlign: "center", color: "#444", padding: 50 }}>Nessun player. Vai in ⚙️ Gestisci per aggiungerne.</div>
              : <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#111118", borderBottom: "2px solid #21212e" }}>
                        {["#","Player","Team","Presenze","Assenze","Miglior Score","Media","Totale"].map(h => (
                          <th key={h} style={{ padding: "12px 14px", textAlign: ["Player","Team"].includes(h) ? "left" : "center", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPlayers.map((p, i) => (
                        <tr key={p.id} className="tr" style={{ borderBottom: "1px solid #1c1c28" }}>
                          <td style={{ padding: "12px 14px", textAlign: "center", width: 36 }}>
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <span style={{ color: "#444", fontWeight: 700 }}>{i+1}</span>}
                          </td>
                          <td style={{ padding: "12px 14px", fontWeight: 700, fontSize: 15 }}>
                            <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: playerColor(p.id), marginRight: 8 }}></span>{p.name}
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: teamColor(p.teamId), display: "inline-block" }}></span>
                              <span style={{ color: "#888", fontSize: 13 }}>{p.teamName}</span>
                            </span>
                          </td>
                          <td style={{ padding: "12px 14px", textAlign: "center", color: "#22c55e", fontWeight: 700 }}>{p.count}</td>
                          <td style={{ padding: "12px 14px", textAlign: "center", color: p.absences > 0 ? "#ef4444" : "#444", fontWeight: 700 }}>{p.absences}</td>
                          <td style={{ padding: "12px 14px", textAlign: "center", color: "#eab308", fontWeight: 700 }}>{fmtNum(p.best)}</td>
                          <td style={{ padding: "12px 14px", textAlign: "center", color: "#aaa", fontWeight: 600 }}>{fmtNum(p.avg)}</td>
                          <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: 800, fontSize: 18, color: "#f97316" }}>{fmtNum(p.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            }
          </div>
        )}

        {/* EVENTI */}
        {page === "events" && (
          <div>
            <h2 style={{ fontSize: 28, fontWeight: 800, textTransform: "uppercase", color: "#f97316", marginBottom: 20 }}>📅 Eventi</h2>
            {isAdmin && (
              <div className="card" style={{ marginBottom: 20 }}>
                <p style={{ color: "#555", fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>Crea nuovo evento</p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <input className="inp" style={{ flex: 1, minWidth: 140 }} placeholder="Nome evento (opzionale)" value={newEventName} onChange={e => setNewEventName(e.target.value)} />
                  <input className="inp" type="date" style={{ width: 160 }} value={newEventDate} onChange={e => setNewEventDate(e.target.value)} />
                  <button className="btn btn-o" onClick={addEvent}>+ Crea</button>
                </div>
              </div>
            )}
            {sortedEvents.length === 0
              ? <div className="card" style={{ textAlign: "center", color: "#444", padding: 50 }}>Nessun evento ancora.</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {sortedEvents.map(e => {
                    const scores = data.scores[e.id] || {};
                    const entries = Object.values(scores);
                    const played = entries.filter(v => v !== "absent").length;
                    const absent = entries.filter(v => v === "absent").length;
                    const missing = data.players.length - played - absent;
                    return (
                      <div key={e.id} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", flexWrap: "wrap", gap: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 16 }}>{e.name}</div>
                            <div style={{ color: "#555", fontSize: 12, marginTop: 2 }}>📅 {e.date}</div>
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <span className="badge" style={{ background: "#1c3a2a", color: "#22c55e" }}>✓ {played}</span>
                            {absent > 0 && <span className="badge" style={{ background: "#3a1c1c", color: "#ef4444" }}>✗ {absent}</span>}
                            {missing > 0 && <span className="badge" style={{ background: "#21212e", color: "#555" }}>⌛ {missing}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {isAdmin && <button className="btn btn-o" style={{ fontSize: 12, padding: "8px 14px" }} onClick={() => openScoreEntry(e.id)}>✏️ Punteggi</button>}
                          <button className="btn btn-ghost" style={{ fontSize: 12, padding: "8px 14px" }} onClick={() => { setActiveEventId(e.id); setPage("event-detail"); }}>👁 Dettaglio</button>
                          {isAdmin && <button className="btn btn-r" style={{ fontSize: 12, padding: "8px 10px" }} onClick={() => removeEvent(e.id)}>✕</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
            }
          </div>
        )}

        {/* DETTAGLIO EVENTO */}
        {page === "event-detail" && (() => {
          const ev = data.events.find(e => e.id === activeEventId);
          if (!ev) return null;
          const scores = data.scores[ev.id] || {};
          const rows = [...data.players].map(p => ({ ...p, score: scores[p.id] }))
            .sort((a, b) => {
              if (a.score === "absent" || a.score === undefined) return 1;
              if (b.score === "absent" || b.score === undefined) return -1;
              return b.score - a.score;
            });
          let rank = 0;
          return (
            <div>
              <button className="btn btn-ghost" style={{ marginBottom: 20, fontSize: 12 }} onClick={() => setPage("events")}>← Torna agli eventi</button>
              <h2 style={{ fontSize: 24, fontWeight: 800, textTransform: "uppercase", color: "#f97316", marginBottom: 4 }}>{ev.name}</h2>
              <p style={{ color: "#555", marginBottom: 20 }}>📅 {ev.date}</p>
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#111118", borderBottom: "2px solid #21212e" }}>
                      {["#","Player","Team","Punteggio"].map(h => (
                        <th key={h} style={{ padding: "12px 14px", textAlign: ["Player","Team"].includes(h) ? "left" : "center", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".08em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => {
                      const hasScore = p.score !== "absent" && p.score !== undefined;
                      if (hasScore) rank++;
                      const r = rank;
                      return (
                        <tr key={p.id} className="tr" style={{ borderBottom: "1px solid #1c1c28" }}>
                          <td style={{ padding: "12px 14px", textAlign: "center", width: 36 }}>
                            {hasScore ? (r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : <span style={{ color: "#444" }}>{r}</span>) : "—"}
                          </td>
                          <td style={{ padding: "12px 14px", fontWeight: 700, fontSize: 15 }}>
                            <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: playerColor(p.id), marginRight: 8 }}></span>{p.name}
                          </td>
                          <td style={{ padding: "12px 14px", color: "#888", fontSize: 13 }}>{data.teams.find(t => t.id === p.teamId)?.name || "—"}</td>
                          <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: 800, fontSize: 18 }}>
                            {p.score === "absent" ? <span style={{ color: "#ef4444", fontSize: 13, fontWeight: 700 }}>ASSENTE</span>
                              : p.score !== undefined ? <span style={{ color: "#f97316" }}>{fmtNum(p.score)}</span>
                              : <span style={{ color: "#444" }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* INSERIMENTO PUNTEGGI */}
        {page === "entry" && isAdmin && (() => {
          const ev = data.events.find(e => e.id === activeEventId);
          if (!ev) return null;
          const grouped = data.teams.map(t => ({ team: t, players: data.players.filter(p => p.teamId === t.id) })).filter(g => g.players.length > 0);
          const noTeam = data.players.filter(p => !data.teams.find(t => t.id === p.teamId));
          const PlayerRow = ({ p }) => (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #1c1c28" }}>
              <span style={{ minWidth: 170, fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: playerColor(p.id), display: "inline-block" }}></span>
                {p.name}
              </span>
              <input type="number" min="0" max="75000" className="score-inp" placeholder="0 – 75.000"
                disabled={scoreInputs[p.id] === "absent"}
                value={scoreInputs[p.id] === "absent" ? "" : (scoreInputs[p.id] ?? "")}
                onChange={e => setScoreInputs(prev => ({ ...prev, [p.id]: e.target.value }))} />
              <button className={`absent-btn${scoreInputs[p.id] === "absent" ? " on" : ""}`}
                onClick={() => setScoreInputs(prev => ({ ...prev, [p.id]: prev[p.id] === "absent" ? "" : "absent" }))}>
                {scoreInputs[p.id] === "absent" ? "✗ Assente" : "Assente"}
              </button>
            </div>
          );
          return (
            <div>
              <button className="btn btn-ghost" style={{ marginBottom: 20, fontSize: 12 }} onClick={() => setPage("events")}>← Annulla</button>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h2 style={{ fontSize: 24, fontWeight: 800, textTransform: "uppercase", color: "#f97316" }}>{ev.name}</h2>
                  <p style={{ color: "#555", fontSize: 13 }}>📅 {ev.date} — punteggi da 0 a 75.000</p>
                </div>
                <button className="btn btn-g" onClick={saveScores}>💾 Salva punteggi</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {grouped.map(({ team, players }) => (
                  <div key={team.id} className="card">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: teamColor(team.id), display: "inline-block" }}></span>
                      <span style={{ fontWeight: 800, fontSize: 14, textTransform: "uppercase", letterSpacing: ".06em" }}>{team.name}</span>
                    </div>
                    {players.map(p => <PlayerRow key={p.id} p={p} />)}
                  </div>
                ))}
                {noTeam.length > 0 && (
                  <div className="card">
                    <p style={{ color: "#555", fontSize: 12, marginBottom: 10, textTransform: "uppercase" }}>Senza team</p>
                    {noTeam.map(p => <PlayerRow key={p.id} p={p} />)}
                  </div>
                )}
              </div>
              <div style={{ marginTop: 20 }}>
                <button className="btn btn-g" style={{ width: "100%", padding: 14 }} onClick={saveScores}>💾 Salva punteggi</button>
              </div>
            </div>
          );
        })()}

        {/* GRAFICI */}
        {page === "charts" && (
          <div>
            <h2 style={{ fontSize: 28, fontWeight: 800, textTransform: "uppercase", color: "#f97316", marginBottom: 20 }}>📈 Grafici</h2>
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {data.players.map(p => (
                <button key={p.id} onClick={() => setChartPlayer(p.id)}
                  style={{ background: chartPlayer === p.id ? playerColor(p.id) : "#1c1c28", border: `1px solid ${chartPlayer === p.id ? playerColor(p.id) : "#2e2e3e"}`, color: chartPlayer === p.id ? "#000" : "#aaa", fontFamily: "inherit", fontWeight: 700, fontSize: 13, padding: "7px 14px", borderRadius: 20, cursor: "pointer", transition: "all .15s" }}>
                  {p.name}
                </button>
              ))}
              {data.players.length === 0 && <div style={{ color: "#444" }}>Nessun player ancora.</div>}
            </div>
            {!chartPlayer
              ? <div className="card" style={{ textAlign: "center", color: "#444", padding: 50 }}>Seleziona un player per vedere il grafico.</div>
              : (() => {
                  const stats = playerStats.find(pl => pl.id === chartPlayer);
                  const color = playerColor(chartPlayer);
                  return (
                    <div>
                      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                        {[["Totale", fmtNum(stats?.total)], ["Media", fmtNum(stats?.avg)], ["Miglior Score", fmtNum(stats?.best)], ["Presenze", stats?.count], ["Assenze", stats?.absences]].map(([label, val]) => (
                          <div key={label} className="card" style={{ flex: 1, minWidth: 100, textAlign: "center", padding: "14px 10px" }}>
                            <div style={{ color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 }}>{label}</div>
                            <div style={{ fontSize: 22, fontWeight: 800, color }}>{val}</div>
                          </div>
                        ))}
                      </div>
                      <div className="card" style={{ marginBottom: 16 }}>
                        <p style={{ color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 14 }}>Punteggio per Evento</p>
                        <ResponsiveContainer width="100%" height={220}>
                          <LineChart data={chartData.filter(d => d.score !== null)} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1c1c28" />
                            <XAxis dataKey="name" tick={{ fill: "#555", fontSize: 10 }} />
                            <YAxis tick={{ fill: "#555", fontSize: 11 }} tickFormatter={v => v.toLocaleString("it-IT")} />
                            <Tooltip contentStyle={{ background: "#1c1c28", border: "1px solid #2e2e3e", borderRadius: 8, color: "#f0f0f0" }} formatter={v => v.toLocaleString("it-IT")} />
                            <Line type="monotone" dataKey="score" stroke={color} strokeWidth={2.5} dot={{ r: 4, fill: color }} name="Punteggio" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="card">
                        <p style={{ color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 14 }}>Punteggio Cumulativo</p>
                        <ResponsiveContainer width="100%" height={220}>
                          <LineChart data={chartData.filter(d => d.cumulative !== null)} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1c1c28" />
                            <XAxis dataKey="name" tick={{ fill: "#555", fontSize: 10 }} />
                            <YAxis tick={{ fill: "#555", fontSize: 11 }} tickFormatter={v => v.toLocaleString("it-IT")} />
                            <Tooltip contentStyle={{ background: "#1c1c28", border: "1px solid #2e2e3e", borderRadius: 8, color: "#f0f0f0" }} formatter={v => v.toLocaleString("it-IT")} />
                            <Line type="monotone" dataKey="cumulative" stroke={color} strokeWidth={2.5} dot={{ r: 4, fill: color }} name="Cumulativo" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  );
                })()
            }
          </div>
        )}

        {/* ADMIN */}
        {page === "admin" && isAdmin && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, textTransform: "uppercase", color: "#f97316", marginBottom: 14 }}>⚙️ Team</h2>
              <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <input className="inp" placeholder="Nome team" value={newTeam} onChange={e => setNewTeam(e.target.value)} onKeyDown={e => e.key === "Enter" && addTeam()} />
                  <button className="btn btn-o" onClick={addTeam}>+</button>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.teams.map((t, i) => (
                  <div key={t.id} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px" }}>
                    <span style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: COLORS[i % COLORS.length], display: "inline-block" }}></span>
                      {t.name} <span style={{ color: "#444", fontSize: 12 }}>({data.players.filter(p => p.teamId === t.id).length} player)</span>
                    </span>
                    <button className="btn btn-r" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => removeTeam(t.id)}>✕</button>
                  </div>
                ))}
                {data.teams.length === 0 && <div style={{ color: "#444", textAlign: "center", padding: 20 }}>Nessun team</div>}
              </div>
            </div>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, textTransform: "uppercase", color: "#f97316", marginBottom: 14 }}>⚙️ Player</h2>
              <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <input className="inp" placeholder="Nome player" value={newPlayer.name} onChange={e => setNewPlayer({ ...newPlayer, name: e.target.value })} />
                  <select className="inp" value={newPlayer.teamId} onChange={e => setNewPlayer({ ...newPlayer, teamId: e.target.value })}>
                    <option value="">Seleziona team</option>
                    {data.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button className="btn btn-o" onClick={addPlayer}>Aggiungi Player</button>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto" }}>
                {data.players.map(p => {
                  const ti = data.teams.findIndex(t => t.id === p.teamId);
                  const team = data.teams.find(t => t.id === p.teamId);
                  return (
                    <div key={p.id} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: playerColor(p.id), display: "inline-block" }}></span>
                        <span style={{ fontWeight: 700 }}>{p.name}</span>
                        {team && <span style={{ color: "#555", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS[ti % COLORS.length], display: "inline-block" }}></span>
                          {team.name}
                        </span>}
                      </span>
                      <button className="btn btn-r" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => removePlayer(p.id)}>✕</button>
                    </div>
                  );
                })}
                {data.players.length === 0 && <div style={{ color: "#444", textAlign: "center", padding: 20 }}>Nessun player</div>}
              </div>
            </div>
          </div>
        )}

        {/* LOGIN */}
        {page === "login" && (
          <div style={{ maxWidth: 360, margin: "60px auto" }}>
            <div className="card">
              <h2 style={{ fontSize: 24, fontWeight: 800, textTransform: "uppercase", color: "#f97316", marginBottom: 6 }}>🔐 Accesso Admin</h2>
              <p style={{ color: "#555", fontSize: 13, marginBottom: 20 }}>Inserisci la password per gestire team, player ed eventi.</p>
              <input className="inp" type="password" placeholder="Password" value={pwInput}
                onChange={e => { setPwInput(e.target.value); setPwError(false); }}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                style={{ marginBottom: 10 }} />
              {pwError && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 10 }}>❌ Password errata</p>}
              <button className="btn btn-o" style={{ width: "100%" }} onClick={handleLogin}>Accedi</button>
              <p style={{ color: "#333", fontSize: 11, marginTop: 14, textAlign: "center" }}>Password: <strong style={{ color: "#555" }}>admin2024</strong></p>
            </div>
          </div>
        )}

      </div>

      {toast && <div className="toast" style={{ background: toast.type === "err" ? "#ef4444" : "#22c55e", color: "#fff" }}>{toast.msg}</div>}
    </div>
  );
}
