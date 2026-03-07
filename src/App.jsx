import { useState, useMemo, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import * as XLSX from "xlsx";
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

  const [page, setPage] = useState("home");
  const [isAdmin, setIsAdmin] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const [toast, setToast] = useState(null);

  const [newTeam, setNewTeam] = useState("");
  const [newPlayer, setNewPlayer] = useState({ name: "", teamId: "" });
  const [adminPlayerSearch, setAdminPlayerSearch] = useState("");
  const [adminTeamFilter, setAdminTeamFilter] = useState("");
  const [duplicatePlayer, setDuplicatePlayer] = useState(null); // { existing, incoming }
  const [newEventDate, setNewEventDate] = useState(new Date().toISOString().split("T")[0]);
  const [newEventName, setNewEventName] = useState("");
  const [activeEventId, setActiveEventId] = useState(null);
  const [scoreInputs, setScoreInputs] = useState({});
  const [selectedTeamFilter, setSelectedTeamFilter] = useState("all");
  const [selectedYearFilter, setSelectedYearFilter] = useState("all");
  const [playerStatusFilter, setPlayerStatusFilter] = useState("active");
  const [chartPlayers, setChartPlayers] = useState([]);
  const [chartTeamFilter, setChartTeamFilter] = useState("all");
  const [chartYear, setChartYear] = useState("all");
  const [selectedMonthFilter, setSelectedMonthFilter] = useState("all");
  const [chartMonth, setChartMonth] = useState("all");
  const [confirmReset, setConfirmReset] = useState(null); // null | "all" | year
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [editingTeamName, setEditingTeamName] = useState("");
  const [importPreview, setImportPreview] = useState(null); // { pending, newTeams, newPlayers, newEvents, newScores, imported }


  useEffect(() => {
    const unsub = onSnapshot(DATA_DOC, (snap) => {
      if (snap.exists()) setData(snap.data());
      else setData(emptyData);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const persist = async (updated) => {
    setSaving(true);
    try { await setDoc(DATA_DOC, updated); setData(updated); }
    catch { showToast("Errore salvataggio!", "err"); }
    setSaving(false);
  };

  const showToast = (msg, type = "ok") => { setToast({ msg, type }); setTimeout(() => setToast(null), 2800); };

  // Anni e mesi disponibili dagli eventi
  const availableYears = useMemo(() => {
    const years = new Set();
    data.events.forEach(e => {
      const y = e.year || (e.date ? e.date.substring(0, 4) : null);
      if (y) years.add(y);
    });
    return [...years].sort((a, b) => b - a);
  }, [data.events]);

  const MONTHS = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

  const availableMonths = useMemo(() => {
    const months = new Set();
    const eventsToCheck = selectedYearFilter === "all" ? data.events : data.events.filter(e => {
      const y = e.year || (e.date ? e.date.substring(0, 4) : null);
      return y === selectedYearFilter;
    });
    eventsToCheck.forEach(e => {
      if (e.date && e.date.length >= 7) {
        const m = e.date.substring(5, 7);
        if (m) months.add(m);
      }
    });
    return [...months].sort();
  }, [data.events, selectedYearFilter]);

  // Filtra eventi per anno e mese
  const filteredEvents = useMemo(() => {
    return data.events.filter(e => {
      const y = e.year || (e.date ? e.date.substring(0, 4) : null);
      const m = e.date ? e.date.substring(5, 7) : null;
      if (selectedYearFilter !== "all" && y !== selectedYearFilter) return false;
      if (selectedMonthFilter !== "all" && m !== selectedMonthFilter) return false;
      return true;
    });
  }, [data.events, selectedYearFilter, selectedMonthFilter]);

  const playerStats = useMemo(() => {
    return data.players.map(p => {
      let total = 0, count = 0, absences = 0, best = 0;
      filteredEvents.forEach(e => {
        const s = data.scores[e.id]?.[p.id];
        if (s === "absent") absences++;
        else if (s !== undefined && s !== "") { total += s; count++; if (s > best) best = s; }
      });
      const avg = count > 0 ? Math.round(total / count) : 0;
      const team = data.teams.find(t => t.id === p.teamId);
      return { ...p, total, count, absences, avg, best, teamName: team?.name || "—", active: p.active !== false };
    });
  }, [data, filteredEvents]);

  const [rankSortKey, setRankSortKey] = useState("avg");

  const sortedPlayers = useMemo(() => [...playerStats]
    .filter(p => {
      if (playerStatusFilter === "active") return p.active !== false;
      if (playerStatusFilter === "historic") return p.active === false;
      return true;
    })
    .filter(p => selectedTeamFilter === "all" || p.teamId === selectedTeamFilter)
    .sort((a, b) => {
      if (rankSortKey === "avg") return b.avg - a.avg;
      if (rankSortKey === "count") return b.count - a.count;
      if (rankSortKey === "best") return b.best - a.best;
      return b.avg - a.avg;
    }), [playerStats, selectedTeamFilter, playerStatusFilter, rankSortKey]);

  const sortedEvents = useMemo(() => [...filteredEvents].sort((a, b) => new Date(b.date) - new Date(a.date)), [filteredEvents]);

  const chartFilteredEvents = useMemo(() => {
    return data.events.filter(e => {
      const y = e.year || (e.date ? e.date.substring(0, 4) : null);
      const m = e.date ? e.date.substring(5, 7) : null;
      if (chartYear !== "all" && y !== chartYear) return false;
      if (chartMonth !== "all" && m !== chartMonth) return false;
      return true;
    });
  }, [data.events, chartYear, chartMonth]);

  const chartData = useMemo(() => {
    if (chartPlayers.length === 0) return [];
    const events = [...chartFilteredEvents].sort((a, b) => new Date(a.date) - new Date(b.date));
    const cumulatives = {};
    chartPlayers.forEach(pid => { cumulatives[pid] = 0; });
    return events.map(e => {
      const point = { name: e.date || e.name };
      chartPlayers.forEach(pid => {
        const s = data.scores[e.id]?.[pid];
        const score = (s !== undefined && s !== "absent" && s !== "") ? s : null;
        point[`score_${pid}`] = score;
        if (score !== null) cumulatives[pid] += score;
        point[`cum_${pid}`] = score !== null ? cumulatives[pid] : null;
      });
      return point;
    });
  }, [chartPlayers, chartFilteredEvents, data.scores]);

  const renameTeam = async (id, name) => {
    if (!name.trim()) return;
    const teams = data.teams.map(t => t.id === id ? { ...t, name: name.trim() } : t);
    await persist({ ...data, teams });
    setEditingTeamId(null);
    showToast("Team rinominato!");
  };

  const updatePlayerTeam = async (playerId, teamId) => {
    const players = data.players.map(p => p.id === playerId ? { ...p, teamId, teamYear: new Date().getFullYear().toString() } : p);
    await persist({ ...data, players });
    showToast("Team aggiornato!");
  };

  const addTeam = async () => { if (!newTeam.trim()) return; await persist({ ...data, teams: [...data.teams, { id: Date.now().toString(), name: newTeam.trim() }] }); setNewTeam(""); showToast("Team aggiunto!"); };
  const removeTeam = async (id) => { await persist({ ...data, teams: data.teams.filter(t => t.id !== id), players: data.players.filter(p => p.teamId !== id) }); showToast("Team rimosso", "err"); };
  const addPlayer = async () => {
    if (!newPlayer.name.trim() || !newPlayer.teamId) return;
    const existing = data.players.find(p => p.name.trim().toLowerCase() === newPlayer.name.trim().toLowerCase());
    if (existing) {
      setDuplicatePlayer({ existing, incoming: { ...newPlayer } });
      return;
    }
    await persist({ ...data, players: [...data.players, { id: Date.now().toString(), name: newPlayer.name.trim(), teamId: newPlayer.teamId, active: true }] });
    setNewPlayer({ name: "", teamId: "" });
    showToast("Player aggiunto!");
  };
  const mergeDuplicatePlayer = async () => {
    if (!duplicatePlayer) return;
    const { existing, incoming } = duplicatePlayer;
    const players = data.players.map(p => p.id === existing.id
      ? { ...p, teamId: incoming.teamId, teamYear: new Date().getFullYear().toString(), active: true }
      : p);
    await persist({ ...data, players });
    setDuplicatePlayer(null);
    setNewPlayer({ name: "", teamId: "" });
    showToast("Player aggiornato e riattivato!");
  };
  const renameDuplicatePlayer = async (newName) => {
    if (!newName.trim()) return;
    if (data.players.find(p => p.name.trim().toLowerCase() === newName.trim().toLowerCase())) {
      showToast("Nome già esistente!", "err"); return;
    }
    const { incoming } = duplicatePlayer;
    await persist({ ...data, players: [...data.players, { id: Date.now().toString(), name: newName.trim(), teamId: incoming.teamId, active: true }] });
    setDuplicatePlayer(null);
    setNewPlayer({ name: "", teamId: "" });
    showToast("Nuovo player aggiunto!");
  };
  const removePlayer = async (id) => { await persist({ ...data, players: data.players.filter(p => p.id !== id) }); showToast("Player rimosso", "err"); };
  const togglePlayerActive = async (id) => {
    const players = data.players.map(p => p.id === id ? { ...p, active: p.active === false ? true : false } : p);
    await persist({ ...data, players });
    showToast("Stato player aggiornato!");
  };
  const addEvent = async () => {
    if (!newEventDate) return;
    const year = newEventDate.substring(0, 4);
    const ev = { id: Date.now().toString(), date: newEventDate, name: newEventName.trim() || `Evento ${data.events.length + 1}`, year };
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

  const parseExcelDate = (eName, fileYear) => {
    const raw = String(eName).trim();
    let isoDate = null, eventYear = fileYear;
    const num = Number(raw);
    if (eName instanceof Date) {
      const d = eName;
      isoDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      eventYear = String(d.getFullYear());
    } else if (!isNaN(num) && num > 40000 && num < 60000) {
      const d = new Date(new Date(1899,11,30).getTime() + num * 86400000);
      isoDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      eventYear = String(d.getFullYear());
    } else {
      const ddmm = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
      const yyyymm = raw.match(/^(\d{4})[\/\-\.](\d{2})[\/\-\.](\d{2})$/);
      if (ddmm) { isoDate = `${ddmm[3]}-${ddmm[2].padStart(2,"0")}-${ddmm[1].padStart(2,"0")}`; eventYear = ddmm[3]; }
      else if (yyyymm) { isoDate = `${yyyymm[1]}-${yyyymm[2]}-${yyyymm[3]}`; eventYear = yyyymm[1]; }
    }
    return { isoDate, eventYear, fullName: isoDate || (fileYear ? `${raw} (${fileYear})` : raw) };
  };

  const importExcel = async (file) => {
    try {
      const yearMatch = file.name.match(/(20\d{2})/);
      const fileYear = yearMatch ? yearMatch[1] : null;
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true, raw: false });
      const newTeams = [...data.teams];
      const newPlayers = [...data.players];
      const newScores = { ...data.scores };
      const newEvents = [...data.events];
      let imported = { teams: 0, players: 0, events: 0, scores: 0 };
      const conflicts = []; // player storici trovati

      wb.SheetNames.forEach(sheetName => {
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (rows.length < 2) return;

        let team = newTeams.find(t => t.name === sheetName);
        if (!team) {
          team = { id: "t_" + Date.now() + Math.random().toString(36).slice(2), name: sheetName };
          newTeams.push(team); imported.teams++;
        }

        const eventNames = rows[0].slice(1);
        const eventObjs = eventNames.map((eName) => {
          if (!eName) return null;
          const { isoDate, eventYear, fullName } = parseExcelDate(eName, fileYear);
          let ev = isoDate ? newEvents.find(e => e.date === isoDate) : newEvents.find(e => e.name === fullName);
          if (!ev) {
            ev = { id: "e_" + Date.now() + Math.random().toString(36).slice(2), name: fullName, date: isoDate || (eventYear ? `${eventYear}-01-01` : "2024-01-01"), year: eventYear || "?" };
            newEvents.push(ev); imported.events++;
          }
          return ev;
        });

        rows.slice(1).forEach(row => {
          const playerName = String(row[0] || "").trim();
          if (!playerName) return;
          let playerIdx = newPlayers.findIndex(p => p.name === playerName);
          let player;

          if (playerIdx === -1) {
            player = { id: "p_" + Date.now() + Math.random().toString(36).slice(2), name: playerName, teamId: team.id, teamYear: fileYear || "0", active: true };
            newPlayers.push(player); imported.players++;
          } else {
            player = { ...newPlayers[playerIdx] };
            // Se è storico, registra conflitto
            if (player.active === false && !conflicts.find(c => c.originalName === playerName)) {
              conflicts.push({ originalName: playerName, playerId: player.id, teamName: sheetName, teamId: team.id, action: "merge" /* o "rename" */, newName: playerName });
            }
            const currentYear = parseInt(player.teamYear || "0");
            const newYear = parseInt(fileYear || "0");
            if (newYear >= currentYear) { player.teamId = team.id; player.teamYear = fileYear || player.teamYear; }
            newPlayers[playerIdx] = player;
          }

          // Scores (usa id temporaneo, verrà risolto al salvataggio)
          const scores = row.slice(1);
          scores.forEach((val, i) => {
            const ev = eventObjs[i];
            if (!ev) return;
            if (!newScores[ev.id]) newScores[ev.id] = {};
            const v = String(val).trim();
            const rawNum = typeof val === "number" ? val : null;
            if (v === "-" || v.toLowerCase() === "assente") {
              newScores[ev.id][player.id] = "absent";
            } else if (rawNum !== null && rawNum > 0) {
              newScores[ev.id][player.id] = Math.round(rawNum); imported.scores++;
            } else if (v !== "" && v !== "0") {
              const normalized = v.replace(",", ".").replace(/[^0-9.]/g, "");
              const num = Math.round(parseFloat(normalized));
              if (!isNaN(num) && num > 0) { newScores[ev.id][player.id] = num; imported.scores++; }
            }
          });
        });
      });

      if (conflicts.length > 0) {
        // Mostra schermata di revisione
        setImportPreview({ conflicts, newTeams, newPlayers, newEvents, newScores, imported });
        setPage("import-review");
      } else {
        await persist({ ...data, teams: newTeams, players: newPlayers, events: newEvents, scores: newScores });
        showToast(`✅ Importato! ${imported.players} player, ${imported.events} eventi, ${imported.scores} punteggi`);
      }
    } catch (e) {
      console.error(e);
      showToast("❌ Errore durante l'importazione", "err");
    }
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    let { conflicts, newTeams, newPlayers, newEvents, newScores } = importPreview;

    conflicts.forEach(c => {
      if (c.action === "rename") {
        // Crea nuovo player con nome modificato, sposta i punteggi nuovi su di lui
        const newId = "p_" + Date.now() + Math.random().toString(36).slice(2);
        const newPlayer = { id: newId, name: c.newName, teamId: c.teamId, teamYear: importPreview.imported.year || "0", active: true };
        newPlayers.push(newPlayer);
        // Sposta i punteggi dal vecchio id al nuovo per gli eventi nuovi
        Object.keys(newScores).forEach(evId => {
          if (newScores[evId][c.playerId] !== undefined) {
            const existing = importPreview.newEvents.find(e => e.id === evId);
            // Se l'evento è nuovo (non era già nel db originale), riassegna al nuovo player
            if (existing && !data.events.find(e => e.id === evId)) {
              newScores[evId][newId] = newScores[evId][c.playerId];
              delete newScores[evId][c.playerId];
            }
          }
        });
      } else {
        // merge: riattiva il player storico
        const idx = newPlayers.findIndex(p => p.id === c.playerId);
        if (idx !== -1) newPlayers[idx] = { ...newPlayers[idx], active: true };
      }
    });

    await persist({ ...data, teams: newTeams, players: newPlayers, events: newEvents, scores: newScores });
    const { imported } = importPreview;
    showToast(`✅ Importato! ${imported.players} player, ${imported.events} eventi, ${imported.scores} punteggi`);
    setImportPreview(null);
    setPage("admin");
  };

  const resetAll = async () => {
    await persist(emptyData);
    setConfirmReset(null);
    showToast("Tutti i dati cancellati", "err");
  };

  const resetYear = async (year) => {
    const eventsToRemove = new Set(data.events.filter(e => (e.year || e.date?.substring(0,4)) === year).map(e => e.id));
    const newScores = { ...data.scores };
    eventsToRemove.forEach(id => delete newScores[id]);
    const newEvents = data.events.filter(e => !eventsToRemove.has(e.id));
    // rimuovi player che non hanno punteggi in altri eventi
    await persist({ ...data, events: newEvents, scores: newScores });
    setConfirmReset(null);
    showToast(`Dati ${year} cancellati`, "err");
  };

  const getConsecutiveAbsences = (playerId, events) => {
    const sorted = [...events].sort((a, b) => new Date(b.date) - new Date(a.date));
    let consecutive = 0;
    for (const ev of sorted) {
      const s = data.scores[ev.id]?.[playerId];
      if (s === "absent") consecutive++;
      else if (s !== undefined && s !== "") break;
      else break; // non registrato = non contare
    }
    return consecutive;
  };

  const teamColor = (id) => COLORS[data.teams.findIndex(t => t.id === id) % COLORS.length] || "#888";
  const playerColor = (id) => COLORS[data.players.findIndex(p => p.id === id) % COLORS.length] || "#888";
  const fmtNum = (n) => n != null ? n.toLocaleString("it-IT") : "—";

  const handleNav = (key) => { if (key === "logout") { setIsAdmin(false); setPage("home"); } else setPage(key); };
  const handleLogin = () => { if (pwInput === ADMIN_PASSWORD) { setIsAdmin(true); setPwError(false); setPage("players"); setPwInput(""); } else setPwError(true); };

  const navItems = [
    { key: "home", label: "🏠 Home" },
    { key: "players", label: "🏅 Classifica" },
    { key: "hall", label: "🏆 Hall of Fame" },
    { key: "stats", label: "📊 Team" },
    { key: "rampa", label: "🚀 Rampa" },
    { key: "events", label: "📅 Eventi" },
    { key: "charts", label: "📈 Grafici" },
    ...(isAdmin ? [{ key: "admin", label: "⚙️ Gestisci" }] : []),
    { key: isAdmin ? "logout" : "login", label: isAdmin ? "🔓 Esci" : "🔐 Admin" },
  ];

  // Ultimo mese/anno disponibile negli eventi
  const lastEventDate = useMemo(() => {
    if (data.events.length === 0) return null;
    const sorted = [...data.events].sort((a, b) => new Date(b.date) - new Date(a.date));
    return sorted[0];
  }, [data.events]);

  const goToTeam = (teamId) => {
    // Imposta filtri: team selezionato + ultimo anno + ultimo mese
    setSelectedTeamFilter(teamId);
    if (lastEventDate) {
      const y = lastEventDate.year || lastEventDate.date?.substring(0, 4);
      const m = lastEventDate.date?.substring(5, 7);
      if (y) setSelectedYearFilter(y);
      if (m) setSelectedMonthFilter(m);
    }
    setPlayerStatusFilter("active");
    setPage("players");
  };

  const YearFilter = ({ value, onChange }) => (
    availableYears.length > 0 ? (
      <select className="inp" style={{ width: "auto", fontSize: 13 }} value={value} onChange={e => { onChange(e.target.value); setSelectedMonthFilter("all"); setChartMonth("all"); }}>
        <option value="all">Tutti gli anni</option>
        {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    ) : null
  );

  const MonthFilter = ({ yearValue, monthValue, onMonthChange }) => (
    yearValue !== "all" && availableMonths.length > 1 ? (
      <select className="inp" style={{ width: "auto", fontSize: 13 }} value={monthValue} onChange={e => onMonthChange(e.target.value)}>
        <option value="all">Tutti i mesi</option>
        {availableMonths.map(m => <option key={m} value={m}>{MONTHS[parseInt(m) - 1]}</option>)}
      </select>
    ) : null
  );

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
        .card{background:#15151e;border:1px solid #21212e;border-radius:12px;padding:20px;position:relative;overflow:hidden}
        .card::before{content:'';position:absolute;inset:0;background:url('/logo2.png') center/contain no-repeat;opacity:0.03;pointer-events:none;z-index:0}
        .card>*{position:relative;z-index:1}
        .btn{font-weight:700;text-transform:uppercase;letter-spacing:.06em;border:none;border-radius:8px;cursor:pointer;padding:10px 20px;font-size:13px;transition:all .15s}
        .btn-o{background:#f97316;color:#000}.btn-o:hover{background:#fb923c}
        .btn-r{background:#ef4444;color:#fff}.btn-r:hover{background:#f87171}
        .btn-g{background:#22c55e;color:#000}.btn-g:hover{background:#4ade80}
        .btn-ghost{background:#21212e;color:#aaa}.btn-ghost:hover{background:#2a2a38;color:#f0f0f0}
        .btn-yellow{background:#eab308;color:#000}.btn-yellow:hover{background:#facc15}
        .inp{background:#1c1c28;border:1px solid #2e2e3e;color:#f0f0f0;font-size:14px;border-radius:8px;padding:10px 14px;width:100%;transition:border .15s}
        .inp:focus{border-color:#f97316}
        .nav-btn{background:none;border:none;color:#666;font-size:13px;font-weight:700;letter-spacing:.06em;cursor:pointer;padding:8px 12px;border-radius:6px;transition:all .15s;text-transform:uppercase}
        .nav-btn:hover,.nav-btn.active{background:#1c1c28;color:#f97316;text-shadow:0 0 8px rgba(249,115,22,0.5)}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        .tr:hover td{background:#1c1c28!important}
        .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase}
        .toast{position:fixed;bottom:80px;right:16px;padding:12px 22px;border-radius:10px;font-weight:700;font-size:14px;z-index:9999;animation:up .3s ease;max-width:300px}
        @keyframes up{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
        .score-inp{background:#1c1c28;border:1px solid #2e2e3e;color:#f0f0f0;font-size:16px;font-weight:700;border-radius:8px;padding:8px 10px;width:120px;text-align:center}
        .score-inp:focus{border-color:#f97316}
        .score-inp:disabled{opacity:.3}
        .absent-btn{background:#1c1c28;border:1px solid #2e2e3e;color:#666;font-size:11px;font-weight:700;border-radius:8px;padding:8px 12px;cursor:pointer;text-transform:uppercase;letter-spacing:.05em;transition:all .15s}
        .absent-btn.on{background:#3f1a1a;border-color:#ef4444;color:#ef4444}
        .absent-btn:hover{border-color:#ef4444;color:#ef4444}
        .filter-btn{background:#1c1c28;border:1px solid #2e2e3e;color:#666;font-size:12px;font-weight:700;border-radius:20px;padding:6px 14px;cursor:pointer;text-transform:uppercase;letter-spacing:.05em;transition:all .15s;font-family:inherit}
        .filter-btn.on{background:#f97316;border-color:#f97316;color:#000}
      `}</style>

      {/* Header */}
      <div style={{ background: "#09090f", borderBottom: "2px solid #c9a84c", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(201,168,76,0.10) 0%, transparent 60%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, #22c55e, #fff, #ef4444)", backgroundSize: "200% 100%", animation: "shimmer 3s linear infinite" }} />
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 72 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/logo2.png" alt="Italy" onClick={() => setPage("home")} style={{ height: 58, width: 58, objectFit: "contain", filter: "drop-shadow(0 0 8px rgba(201,168,76,0.6))", cursor: "pointer" }} />
            <div style={{ fontSize: 38, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".10em", lineHeight: 1, background: "linear-gradient(90deg, #22c55e 0%, #fff 50%, #ef4444 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: "'Barlow Condensed', Arial, sans-serif" }}>
              ITALY
            </div>
            {saving && <span style={{ color: "#c9a84c", fontSize: 11, fontWeight: 700, opacity: 0.7, marginLeft: 8 }}>💾 salvataggio...</span>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a href="https://web.satispay.com/download/qrcode/S6Y-CON--9D25C976-A15A-405A-BFF3-7078B2000721?locale=it" target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#ff3c3c", borderRadius: 20, padding: "6px 14px", textDecoration: "none", color: "#fff", fontWeight: 800, fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em", whiteSpace: "nowrap", boxShadow: "0 0 10px rgba(255,60,60,0.4)" }}>
              ☕ Satispay
            </a>
            <a href="https://www.paypal.me/IManfredini" target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#003087", borderRadius: 20, padding: "6px 14px", textDecoration: "none", color: "#fff", fontWeight: 800, fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em", whiteSpace: "nowrap", boxShadow: "0 0 10px rgba(0,48,135,0.4)" }}>
              💙 PayPal
            </a>
          </div>
        </div>
      </div>

      {/* Bottom Nav */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#09090f", borderTop: "1px solid #1c1c28", zIndex: 100, display: "flex", justifyContent: "space-around", alignItems: "stretch", height: 64 }}>
        {navItems.map(n => (
          <button key={n.key} onClick={() => handleNav(n.key)}
            style={{ flex: 1, background: "none", border: "none", borderTop: page === n.key ? "2px solid #f97316" : "2px solid transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, padding: "6px 2px", color: page === n.key ? "#f97316" : "#555", transition: "all .15s", fontFamily: "inherit" }}>
            <span style={{ fontSize: 18 }}>{n.label.split(" ")[0]}</span>
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", whiteSpace: "nowrap" }}>{n.label.split(" ").slice(1).join(" ")}</span>
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 16px 80px 16px" }}>

        {/* HOME - Selezione Team */}
        {page === "home" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <h2 style={{ fontSize: 28, fontWeight: 800, textTransform: "uppercase", color: "#f97316", marginBottom: 6 }}>Seleziona il tuo Team</h2>
              <p style={{ color: "#555", fontSize: 13 }}>Clicca per vedere la classifica dell'ultimo mese</p>
            </div>
            {data.teams.length === 0
              ? <div className="card" style={{ textAlign: "center", color: "#444", padding: 50 }}>Nessun team ancora. Vai in ⚙️ Gestisci per aggiungerne.</div>
              : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
                  {data.teams.map((t, i) => {
                    const color = COLORS[i % COLORS.length];
                    const rosterCount = data.players.filter(p => p.teamId === t.id && p.active !== false).length;
                    return (
                      <button key={t.id} onClick={() => goToTeam(t.id)}
                        style={{ background: "#15151e", border: `2px solid ${color}`, borderRadius: 16, padding: "28px 16px", cursor: "pointer", fontFamily: "inherit", textAlign: "center", transition: "all .2s", boxShadow: `0 0 20px ${color}22` }}
                        onMouseEnter={e => { e.currentTarget.style.background = `${color}22`; e.currentTarget.style.transform = "scale(1.04)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "#15151e"; e.currentTarget.style.transform = "scale(1)"; }}>
                        <div style={{ width: 48, height: 48, borderRadius: "50%", background: color, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, boxShadow: `0 0 16px ${color}88` }}>
                          🛡️
                        </div>
                        <div style={{ fontWeight: 800, fontSize: 16, color: "#f0f0f0", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>{t.name}</div>
                        <div style={{ color: "#555", fontSize: 12, fontWeight: 600 }}>{rosterCount} / 50 player</div>
                      </button>
                    );
                  })}
                </div>
            }
          </div>
        )}

        {/* CLASSIFICA */}
        {page === "players" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <h2 style={{ fontSize: 28, fontWeight: 800, textTransform: "uppercase", color: "#f97316" }}>🏅 Classifica</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <YearFilter value={selectedYearFilter} onChange={setSelectedYearFilter} />
                <MonthFilter yearValue={selectedYearFilter} monthValue={selectedMonthFilter} onMonthChange={setSelectedMonthFilter} />
                {data.teams.length > 0 && (
                  <select className="inp" style={{ width: "auto", fontSize: 13 }} value={selectedTeamFilter} onChange={e => setSelectedTeamFilter(e.target.value)}>
                    <option value="all">Tutti i team</option>
                    {data.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {[["active","✅ Attivi"],["historic","📦 Storici"],["all","👥 Tutti"]].map(([val, label]) => (
                <button key={val} className={`filter-btn${playerStatusFilter === val ? " on" : ""}`} onClick={() => setPlayerStatusFilter(val)}>{label}</button>
              ))}
            </div>
            {sortedPlayers.length === 0
              ? <div className="card" style={{ textAlign: "center", color: "#444", padding: 50 }}>Nessun player trovato.</div>
              : <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#111118", borderBottom: "2px solid #21212e" }}>
                        {["#","Player","Team"].map(h => (
                          <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                        {[["count","Presenze"],["absences","Assenze"],["best","Best"],["avg","Media"]].map(([key, label]) => (
                          <th key={key} onClick={() => setRankSortKey(key)} style={{ padding: "12px 14px", textAlign: "center", fontSize: 11, fontWeight: 700, color: rankSortKey === key ? "#f97316" : "#555", textTransform: "uppercase", letterSpacing: ".08em", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}>
                            {label}{rankSortKey === key ? " ▼" : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPlayers.map((p, i) => (
                        <tr key={p.id} className="tr" style={{ borderBottom: "1px solid #1c1c28", opacity: p.active === false ? 0.5 : 1 }}>
                          <td style={{ padding: "12px 14px", textAlign: "center", width: 36 }}>
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <span style={{ color: "#444", fontWeight: 700 }}>{i+1}</span>}
                          </td>
                          <td style={{ padding: "12px 14px", fontWeight: 700, fontSize: 15 }}>
                            <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: playerColor(p.id), marginRight: 8 }}></span>
                            {p.name}
                            {p.active === false && <span style={{ marginLeft: 6, fontSize: 10, color: "#555", fontWeight: 400 }}>storico</span>}
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
                          <td style={{ padding: "12px 14px", textAlign: "center", color: rankSortKey === "avg" ? "#f97316" : "#aaa", fontWeight: rankSortKey === "avg" ? 800 : 600, fontSize: rankSortKey === "avg" ? 17 : 14 }}>{fmtNum(p.avg)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            }
          </div>
        )}

        {/* STATISTICHE TEAM */}
        {page === "stats" && (() => {
          const totalTeams = data.teams.length;
          const rosterPlayers = data.players.filter(p => p.active !== false);
          const totalPlayers = data.players.length;
          const historicPlayers = totalPlayers - rosterPlayers.length;
          const totalSlots = totalTeams * 50;
          const totalFree = totalSlots - rosterPlayers.length;

          const allEvents = [...data.events].sort((a, b) => new Date(b.date) - new Date(a.date));

          const teamStats = data.teams.map(team => {
            const teamPlayers = data.players.filter(p => p.teamId === team.id && p.active !== false);
            const freeSlots = 50 - teamPlayers.length;

            // Player con 2 assenze consecutive (allerta)
            const alert2 = teamPlayers.filter(p => getConsecutiveAbsences(p.id, allEvents) === 2);

            // Calcola su eventi filtrati
            let totalPresenze = 0, totalScoreSum = 0;
            filteredEvents.forEach(ev => {
              teamPlayers.forEach(p => {
                const s = data.scores[ev.id]?.[p.id];
                if (s !== undefined && s !== "absent" && s !== "") {
                  totalPresenze++; totalScoreSum += s;
                }
              });
            });

            const eventsCount = filteredEvents.length;
            const mediaPresenze = eventsCount > 0 ? (totalPresenze / eventsCount).toFixed(1) : "—";
            const mediaPunteggio = totalPresenze > 0 ? Math.round(totalScoreSum / totalPresenze).toLocaleString("it-IT") : "—";

            return { team, teamPlayers, freeSlots, alert2, mediaPresenze, mediaPunteggio };
          });

          return (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
                <h2 style={{ fontSize: 28, fontWeight: 800, textTransform: "uppercase", color: "#f97316" }}>📊 Statistiche Team</h2>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <YearFilter value={selectedYearFilter} onChange={setSelectedYearFilter} />
                  <MonthFilter yearValue={selectedYearFilter} monthValue={selectedMonthFilter} onMonthChange={setSelectedMonthFilter} />
                </div>
              </div>

              {/* Riepilogo globale */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
                {[
                  { label: "🏰 Team", val: totalTeams, color: "#f97316" },
                  { label: "👥 Player roster", val: rosterPlayers.length, color: "#22c55e" },
                  { label: "📦 Player storici", val: historicPlayers, color: "#888" },
                  { label: "📅 Eventi", val: filteredEvents.length, color: "#3b82f6" },
                  { label: "👥 Player totali", val: totalPlayers, color: "#aaa" },
                  { label: "🆓 Posti liberi", val: totalFree, color: "#22c55e" },
                ].map(({ label, val, color }) => (
                  <div key={label} className="card" style={{ textAlign: "center", padding: "16px 12px" }}>
                    <div style={{ color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 }}>{label}</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Tabella team */}
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#111118", borderBottom: "2px solid #21212e" }}>
                      {["Team", "Roster", "Posti liberi", "Presenze medie/evento", "Punteggio medio"].map(h => (
                        <th key={h} style={{ padding: "12px 14px", textAlign: h === "Team" ? "left" : "center", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".07em", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {teamStats.map(({ team, teamPlayers, freeSlots, alert2, mediaPresenze, mediaPunteggio }, i) => (
                      <tr key={team.id} className="tr" style={{ borderBottom: "1px solid #1c1c28" }}>
                        <td style={{ padding: "12px 14px", fontWeight: 800, fontSize: 15 }}>
                          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: COLORS[i % COLORS.length], marginRight: 8 }}></span>
                          {team.name}
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "center", color: "#aaa", fontWeight: 700 }}>{teamPlayers.length}/50</td>
                        <td style={{ padding: "12px 14px", textAlign: "center", color: freeSlots > 0 ? "#22c55e" : "#ef4444", fontWeight: 700 }}>{freeSlots}</td>
                        <td style={{ padding: "12px 14px", textAlign: "center", color: "#3b82f6", fontWeight: 700 }}>{mediaPresenze}</td>
                        <td style={{ padding: "12px 14px", textAlign: "center", color: "#f97316", fontWeight: 800, fontSize: 16 }}>{mediaPunteggio}</td>
                      </tr>
                    ))}
                    {data.teams.length === 0 && (
                      <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#444" }}>Nessun team ancora.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* HALL OF FAME */}
        {page === "hall" && (() => {
          const totalEvents = filteredEvents.length;
          const minPresenze = Math.ceil(totalEvents * 0.5);
          const eligible = playerStats.filter(p => p.count >= minPresenze);
          const top10avg = [...eligible].sort((a, b) => b.avg - a.avg).slice(0, 10);
          const top10best = [...eligible].sort((a, b) => b.best - a.best).slice(0, 10);
          const top10presence = [...playerStats].sort((a, b) => b.count - a.count).slice(0, 10);
          const historic = [...playerStats].filter(p => p.active === false).sort((a, b) => b.avg - a.avg);

          const HallTable = ({ players, valueKey, valueLabel, valueColor }) => {
            const showPresenze = valueKey !== "count";
            const headers = ["#","Player","Team", ...(showPresenze ? ["Presenze"] : []), valueLabel];
            return (
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#111118", borderBottom: "2px solid #21212e" }}>
                      {headers.map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: ["Player","Team"].includes(h) ? "left" : "center", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".08em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((p, i) => (
                      <tr key={p.id} className="tr" style={{ borderBottom: "1px solid #1c1c28" }}>
                        <td style={{ padding: "10px 14px", textAlign: "center", width: 36 }}>
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <span style={{ color: "#444", fontWeight: 700 }}>{i+1}</span>}
                        </td>
                        <td style={{ padding: "10px 14px", fontWeight: 700 }}>
                          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: playerColor(p.id), marginRight: 7 }}></span>{p.name}
                        </td>
                        <td style={{ padding: "10px 14px", color: "#888", fontSize: 13 }}>{p.teamName}</td>
                        {showPresenze && <td style={{ padding: "10px 14px", textAlign: "center", color: "#22c55e", fontWeight: 700 }}>{p.count}</td>}
                        <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 800, fontSize: 16, color: valueColor }}>{fmtNum(p[valueKey])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          };

          return (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
                <h2 style={{ fontSize: 28, fontWeight: 800, textTransform: "uppercase", color: "#f97316" }}>🏆 Hall of Fame</h2>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <select className="filter-btn" value={selectedTeamFilter} onChange={e => setSelectedTeamFilter(e.target.value)}>
                    <option value="">Tutti i team</option>
                    {data.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <YearFilter value={selectedYearFilter} onChange={setSelectedYearFilter} />
                </div>
              </div>
              {totalEvents > 0 && <p style={{ color: "#555", fontSize: 12, marginBottom: 20 }}>Qualifica: minimo {minPresenze} presenze su {totalEvents} eventi ({Math.round(minPresenze/totalEvents*100)}%)</p>}

              <h3 style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase", color: "#f97316", marginBottom: 10 }}>📊 Top 10 Media</h3>
              <div style={{ marginBottom: 24 }}>
                {top10avg.length === 0 ? <div className="card" style={{ color: "#444", textAlign: "center", padding: 20 }}>Nessun player con abbastanza presenze.</div>
                  : <HallTable players={top10avg} valueKey="avg" valueLabel="Media" valueColor="#f97316" />}
              </div>

              <h3 style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase", color: "#eab308", marginBottom: 10 }}>⚡ Top 10 Miglior Score</h3>
              <div style={{ marginBottom: 24 }}>
                {top10best.length === 0 ? <div className="card" style={{ color: "#444", textAlign: "center", padding: 20 }}>Nessun player con abbastanza presenze.</div>
                  : <HallTable players={top10best} valueKey="best" valueLabel="Best Score" valueColor="#eab308" />}
              </div>

              <h3 style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase", color: "#22c55e", marginBottom: 10 }}>📅 Top 10 Presenze</h3>
              <div style={{ marginBottom: 24 }}>
                <HallTable players={top10presence} valueKey="count" valueLabel="Presenze" valueColor="#22c55e" />
              </div>

              {historic.length > 0 && (
                <>
                  <h3 style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase", color: "#888", marginBottom: 10 }}>📦 Player Storici ({historic.length})</h3>
                  <HallTable players={historic} valueKey="avg" valueLabel="Media" valueColor="#888" />
                </>
              )}
            </div>
          );
        })()}

        {/* EVENTI */}
        {page === "events" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
              <h2 style={{ fontSize: 28, fontWeight: 800, textTransform: "uppercase", color: "#f97316" }}>📅 Eventi</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <YearFilter value={selectedYearFilter} onChange={setSelectedYearFilter} />
                <MonthFilter yearValue={selectedYearFilter} monthValue={selectedMonthFilter} onMonthChange={setSelectedMonthFilter} />
              </div>
            </div>
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
              ? <div className="card" style={{ textAlign: "center", color: "#444", padding: 50 }}>Nessun evento{selectedYearFilter !== "all" ? ` nel ${selectedYearFilter}` : ""}.</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {sortedEvents.map(e => {
                    const scores = data.scores[e.id] || {};
                    const entries = Object.values(scores);
                    const played = entries.filter(v => v !== "absent").length;
                    const absent = entries.filter(v => v === "absent").length;
                    const missing = data.players.filter(p => p.active !== false).length - played - absent;
                    return (
                      <div key={e.id} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", flexWrap: "wrap", gap: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 16 }}>{e.name}</div>
                            <div style={{ color: "#555", fontSize: 12, marginTop: 2 }}>📅 {e.date} {e.year && <span className="badge" style={{ background: "#1c1c28", color: "#666", marginLeft: 4 }}>{e.year}</span>}</div>
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
          const grouped = data.teams.map(t => ({ team: t, players: data.players.filter(p => p.teamId === t.id && p.active !== false) })).filter(g => g.players.length > 0);
          const noTeam = data.players.filter(p => !data.teams.find(t => t.id === p.teamId) && p.active !== false);
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <h2 style={{ fontSize: 28, fontWeight: 800, textTransform: "uppercase", color: "#f97316" }}>📈 Grafici</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <YearFilter value={chartYear} onChange={setChartYear} />
                <MonthFilter yearValue={chartYear} monthValue={chartMonth} onMonthChange={setChartMonth} />
              </div>
            </div>
            {/* Filtro team */}
            {data.teams.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ color: "#555", fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em" }}>Team:</span>
                <button className={`filter-btn${chartTeamFilter === "all" ? " on" : ""}`} onClick={() => setChartTeamFilter("all")}>Tutti</button>
                {data.teams.map(t => (
                  <button key={t.id} className={`filter-btn${chartTeamFilter === t.id ? " on" : ""}`} onClick={() => setChartTeamFilter(t.id)}>{t.name}</button>
                ))}
              </div>
            )}
            {/* Selezione player (max 5) */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: "#555", fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
                Player ({chartPlayers.length}/5) — clicca per selezionare/deselezionare:
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {data.players
                  .filter(p => chartTeamFilter === "all" || p.teamId === chartTeamFilter)
                  .map(p => {
                    const selected = chartPlayers.includes(p.id);
                    const col = playerColor(p.id);
                    return (
                      <button key={p.id}
                        onClick={() => {
                          if (selected) setChartPlayers(prev => prev.filter(id => id !== p.id));
                          else if (chartPlayers.length < 5) setChartPlayers(prev => [...prev, p.id]);
                        }}
                        style={{ background: selected ? col : "#1c1c28", border: `2px solid ${selected ? col : "#2e2e3e"}`, color: selected ? "#000" : "#aaa", fontFamily: "inherit", fontWeight: 700, fontSize: 13, padding: "7px 14px", borderRadius: 20, cursor: chartPlayers.length >= 5 && !selected ? "not-allowed" : "pointer", transition: "all .15s", opacity: (chartPlayers.length >= 5 && !selected) ? 0.3 : p.active === false ? 0.6 : 1 }}>
                        {p.name}
                      </button>
                    );
                  })}
                {data.players.length === 0 && <div style={{ color: "#444" }}>Nessun player ancora.</div>}
              </div>
            </div>
            {chartPlayers.length > 0 && (
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: "5px 12px", marginBottom: 16 }} onClick={() => setChartPlayers([])}>✕ Deseleziona tutti</button>
            )}

            {chartPlayers.length === 0
              ? <div className="card" style={{ textAlign: "center", color: "#444", padding: 50 }}>Seleziona fino a 5 player per vedere il grafico.</div>
              : (() => {
                  // Stats cards per ogni player selezionato
                  const selectedStats = chartPlayers.map(pid => playerStats.find(pl => pl.id === pid)).filter(Boolean);
                  return (
                    <div>
                      {/* Stat cards */}
                      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
                        {selectedStats.map(p => {
                          const col = playerColor(p.id);
                          return (
                            <div key={p.id} className="card" style={{ flex: 1, minWidth: 140, padding: "12px 14px", borderColor: col }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                                <span style={{ width: 10, height: 10, borderRadius: "50%", background: col, display: "inline-block" }}></span>
                                <span style={{ fontWeight: 800, fontSize: 14, color: col }}>{p.name}</span>
                              </div>
                              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                                {[["Media", fmtNum(p.avg)], ["Best", fmtNum(p.best)], ["Presenze", p.count]].map(([label, val]) => (
                                  <div key={label}>
                                    <div style={{ color: "#555", fontSize: 10, textTransform: "uppercase" }}>{label}</div>
                                    <div style={{ fontWeight: 800, fontSize: 15, color: "#f0f0f0" }}>{val}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {/* Grafico punteggi */}
                      <div className="card" style={{ marginBottom: 16 }}>
                        <p style={{ color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 14 }}>Punteggio per Evento</p>
                        <ResponsiveContainer width="100%" height={260}>
                          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1c1c28" />
                            <XAxis dataKey="name" tick={{ fill: "#555", fontSize: 10 }} />
                            <YAxis tick={{ fill: "#555", fontSize: 11 }} tickFormatter={v => v.toLocaleString("it-IT")} />
                            <Tooltip contentStyle={{ background: "#1c1c28", border: "1px solid #2e2e3e", borderRadius: 8, color: "#f0f0f0" }} formatter={(v, name) => [v?.toLocaleString("it-IT"), name]} />
                            {chartPlayers.map(pid => {
                              const col = playerColor(pid);
                              const p = data.players.find(pl => pl.id === pid);
                              return <Line key={pid} type="monotone" dataKey={`score_${pid}`} stroke={col} strokeWidth={2.5} dot={{ r: 3, fill: col }} name={p?.name || pid} connectNulls={false} />;
                            })}
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
          <div>
            {/* Confirm dialog */}
            {confirmReset && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                <div className="card" style={{ maxWidth: 380, width: "100%", textAlign: "center" }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
                  <h3 style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>
                    {confirmReset === "all" ? "Cancella TUTTI i dati?" : `Cancella tutti i dati del ${confirmReset}?`}
                  </h3>
                  <p style={{ color: "#666", fontSize: 13, marginBottom: 20 }}>
                    {confirmReset === "all"
                      ? "Verranno eliminati tutti i team, player, eventi e punteggi. Operazione irreversibile!"
                      : `Verranno eliminati tutti gli eventi e punteggi del ${confirmReset}. Team e player restano.`}
                  </p>
                  <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                    <button className="btn btn-ghost" onClick={() => setConfirmReset(null)}>Annulla</button>
                    <button className="btn btn-r" onClick={() => confirmReset === "all" ? resetAll() : resetYear(confirmReset)}>
                      Sì, cancella
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Import */}
            <div className="card" style={{ marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>📥 Importa da Excel / Google Sheets</div>
                <div style={{ color: "#666", fontSize: 13 }}>Scarica il tuo Google Sheets come .xlsx e caricalo. Un foglio = un team, colonna A = player, riga 1 = eventi, "-" = assente. L'anno viene letto dal nome del file (es. "Punteggi 2023.xlsx").</div>
              </div>
              <label style={{ cursor: "pointer" }}>
                <span className="btn btn-o" style={{ display: "inline-block" }}>📂 Carica file .xlsx</span>
                <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) importExcel(e.target.files[0]); e.target.value = ""; }} />
              </label>
            </div>

            {/* Reset */}
            <div className="card" style={{ marginBottom: 24 }}>
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>🗑️ Cancella Dati</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button className="btn btn-r" onClick={() => setConfirmReset("all")}>Svuota tutto</button>
                {availableYears.map(y => (
                  <button key={y} className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setConfirmReset(y)}>
                    🗑 Cancella {y}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              {/* Team */}
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
                    <div key={t.id} className="card" style={{ padding: "10px 14px" }}>
                      {editingTeamId === t.id ? (
                        <div style={{ display: "flex", gap: 8 }}>
                          <input className="inp" value={editingTeamName} onChange={e => setEditingTeamName(e.target.value)} onKeyDown={e => e.key === "Enter" && renameTeam(t.id, editingTeamName)} autoFocus />
                          <button className="btn btn-g" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => renameTeam(t.id, editingTeamName)}>✓</button>
                          <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setEditingTeamId(null)}>✕</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{ width: 9, height: 9, borderRadius: "50%", background: COLORS[i % COLORS.length], display: "inline-block" }}></span>
                            {t.name} <span style={{ color: "#444", fontSize: 12 }}>({data.players.filter(p => p.teamId === t.id).length})</span>
                          </span>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => { setEditingTeamId(t.id); setEditingTeamName(t.name); }}>✏️</button>
                            <button className="btn btn-r" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => removeTeam(t.id)}>✕</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {data.teams.length === 0 && <div style={{ color: "#444", textAlign: "center", padding: 20 }}>Nessun team</div>}
                </div>
              </div>

              {/* Player */}
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 800, textTransform: "uppercase", color: "#f97316", marginBottom: 14 }}>⚙️ Player</h2>
                <div className="card" style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <input className="inp" placeholder="Nome player" value={newPlayer.name} onChange={e => setNewPlayer({ ...newPlayer, name: e.target.value })} />
                    <select className="inp" value={newPlayer.teamId} onChange={e => setNewPlayer({ ...newPlayer, teamId: e.target.value })}>
                      <option value="">Seleziona team</option>
                      {data.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <button className="btn btn-o" onClick={addPlayer}>Aggiungi</button>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  <input className="inp" placeholder="🔍 Cerca player..." value={adminPlayerSearch} onChange={e => setAdminPlayerSearch(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
                  <select className="inp" value={adminTeamFilter} onChange={e => setAdminTeamFilter(e.target.value)} style={{ width: "auto" }}>
                    <option value="">Tutti i team</option>
                    {data.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    <option value="none">Senza team</option>
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto" }}>
                  {data.players.filter(p => {
                    const matchSearch = !adminPlayerSearch || p.name.toLowerCase().includes(adminPlayerSearch.toLowerCase());
                    const matchTeam = !adminTeamFilter || (adminTeamFilter === "none" ? !p.teamId : p.teamId === adminTeamFilter);
                    return matchSearch && matchTeam;
                  }).sort((a,b) => a.name.localeCompare(b.name)).map(p => {
                    const ti = data.teams.findIndex(t => t.id === p.teamId);
                    const team = data.teams.find(t => t.id === p.teamId);
                    const isActive = p.active !== false;
                    return (
                      <div key={p.id} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", opacity: isActive ? 1 : 0.6 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: playerColor(p.id), display: "inline-block" }}></span>
                          <span style={{ fontWeight: 700 }}>{p.name}</span>
                          {!isActive && <span style={{ fontSize: 10, color: "#555" }}>storico</span>}
                          {team && <span style={{ color: "#555", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS[ti % COLORS.length], display: "inline-block" }}></span>
                            {team.name}
                          </span>}
                        </span>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <select className="inp" style={{ fontSize: 11, padding: "4px 8px", width: "auto" }}
                            value={p.teamId || ""}
                            onChange={e => updatePlayerTeam(p.id, e.target.value)}>
                            <option value="">— Nessun team —</option>
                            {data.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                          <button className={`btn ${isActive ? "btn-yellow" : "btn-g"}`} style={{ padding: "4px 8px", fontSize: 10 }} onClick={() => togglePlayerActive(p.id)}>
                            {isActive ? "📦" : "✅"}
                          </button>
                          <button className="btn btn-r" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => removePlayer(p.id)}>✕</button>
                        </div>
                      </div>
                    );
                  })}
                  {data.players.length === 0 && <div style={{ color: "#444", textAlign: "center", padding: 20 }}>Nessun player</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* RAMPA DI LANCIO */}
        {page === "rampa" && (() => {
          const allEvents = [...data.events].sort((a, b) => new Date(b.date) - new Date(a.date));
          const alert2 = data.players.filter(p => p.active !== false && getConsecutiveAbsences(p.id, allEvents) === 2);
          const alert3plus = data.players.filter(p => p.active !== false && getConsecutiveAbsences(p.id, allEvents) >= 3);

          const PlayerRow = ({ p, absences, color }) => {
            const team = data.teams.find(t => t.id === p.teamId);
            return (
              <tr className="tr" style={{ borderBottom: "1px solid #1c1c28" }}>
                <td style={{ padding: "12px 14px", fontWeight: 700 }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: playerColor(p.id), marginRight: 8 }}></span>
                  {p.name}
                </td>
                <td style={{ padding: "12px 14px", color: "#888", fontSize: 13 }}>{team?.name || "—"}</td>
                <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: 800, color }}>{absences} eventi</td>
              </tr>
            );
          };

          return (
            <div>
              <h2 style={{ fontSize: 28, fontWeight: 800, textTransform: "uppercase", color: "#f97316", marginBottom: 6 }}>🚀 Rampa di Lancio</h2>
              <p style={{ color: "#555", fontSize: 13, marginBottom: 24 }}>Player con assenze consecutive recenti — potenziali posti liberi per nuovi arrivi.</p>

              {/* Allerta 2 eventi */}
              <div style={{ marginBottom: 28 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase", color: "#eab308", marginBottom: 10 }}>
                  ⚠️ In allerta — 2 assenze consecutive ({alert2.length})
                </h3>
                {alert2.length === 0
                  ? <div className="card" style={{ color: "#444", textAlign: "center", padding: 20 }}>Nessun player in allerta.</div>
                  : <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "#111118", borderBottom: "2px solid #21212e" }}>
                            {["Player","Team","Assenze consecutive"].map(h => (
                              <th key={h} style={{ padding: "10px 14px", textAlign: h === "Assenze consecutive" ? "center" : "left", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".07em" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {alert2.map(p => <PlayerRow key={p.id} p={p} absences={2} color="#eab308" />)}
                        </tbody>
                      </table>
                    </div>
                }
              </div>

              {/* Rampa 3+ eventi */}
              <div style={{ marginBottom: 28 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase", color: "#ef4444", marginBottom: 10 }}>
                  🔴 Rampa di lancio — 3+ assenze consecutive ({alert3plus.length})
                </h3>
                {alert3plus.length === 0
                  ? <div className="card" style={{ color: "#444", textAlign: "center", padding: 20 }}>Nessun player in rampa.</div>
                  : <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "#111118", borderBottom: "2px solid #21212e" }}>
                            {["Player","Team","Assenze consecutive"].map(h => (
                              <th key={h} style={{ padding: "10px 14px", textAlign: h === "Assenze consecutive" ? "center" : "left", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".07em" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {alert3plus.map(p => <PlayerRow key={p.id} p={p} absences={getConsecutiveAbsences(p.id, allEvents)} color="#ef4444" />)}
                        </tbody>
                      </table>
                    </div>
                }
              </div>

              {/* Pedatona 5+ eventi */}
              {(() => {
                const pedatona = data.players.filter(p => p.active !== false && getConsecutiveAbsences(p.id, allEvents) >= 5);
                return (
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase", color: "#7c3aed", marginBottom: 10 }}>
                      🥾 Pedatona — 5+ assenze consecutive ({pedatona.length})
                    </h3>
                    {pedatona.length === 0
                      ? <div className="card" style={{ color: "#444", textAlign: "center", padding: 20 }}>Nessun player in pedatona.</div>
                      : <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ background: "#111118", borderBottom: "2px solid #21212e" }}>
                                {["Player","Team","Assenze consecutive"].map(h => (
                                  <th key={h} style={{ padding: "10px 14px", textAlign: h === "Assenze consecutive" ? "center" : "left", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".07em" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {pedatona.map(p => <PlayerRow key={p.id} p={p} absences={getConsecutiveAbsences(p.id, allEvents)} color="#7c3aed" />)}
                            </tbody>
                          </table>
                        </div>
                    }
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {/* IMPORT REVIEW */}
        {page === "import-review" && importPreview && (
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 800, textTransform: "uppercase", color: "#f97316", marginBottom: 6 }}>⚠️ Revisione Import</h2>
            <p style={{ color: "#666", fontSize: 13, marginBottom: 20 }}>Trovati {importPreview.conflicts.length} player storici nel file. Scegli cosa fare per ognuno prima di salvare.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
              {importPreview.conflicts.map((c, i) => (
                <div key={i} className="card" style={{ borderColor: "#eab308" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 20 }}>📦</span>
                    <span style={{ fontWeight: 800, fontSize: 16, color: "#eab308" }}>{c.originalName}</span>
                    <span style={{ color: "#555", fontSize: 12 }}>— player storico trovato nel team {c.teamName}</span>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: c.action === "rename" ? 12 : 0 }}>
                    <button
                      className={`filter-btn${c.action === "merge" ? " on" : ""}`}
                      onClick={() => setImportPreview(prev => ({ ...prev, conflicts: prev.conflicts.map((x, j) => j === i ? { ...x, action: "merge" } : x) }))}>
                      ✅ Aggrega — è tornato attivo, unisci i dati
                    </button>
                    <button
                      className={`filter-btn${c.action === "rename" ? " on" : ""}`}
                      style={{ borderColor: c.action === "rename" ? "#ef4444" : undefined, background: c.action === "rename" ? "#ef4444" : undefined }}
                      onClick={() => setImportPreview(prev => ({ ...prev, conflicts: prev.conflicts.map((x, j) => j === i ? { ...x, action: "rename" } : x) }))}>
                      ✏️ Omonimo — crea nuovo player con nome diverso
                    </button>
                  </div>
                  {c.action === "rename" && (
                    <div style={{ marginTop: 10 }}>
                      <p style={{ color: "#666", fontSize: 12, marginBottom: 6 }}>Nome per il nuovo player:</p>
                      <input className="inp" value={c.newName}
                        onChange={e => setImportPreview(prev => ({ ...prev, conflicts: prev.conflicts.map((x, j) => j === i ? { ...x, newName: e.target.value } : x) }))}
                        placeholder="Es. Francesco 2" />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => { setImportPreview(null); setPage("admin"); }}>Annulla</button>
              <button className="btn btn-g" style={{ flex: 1, padding: 14 }} onClick={confirmImport}>💾 Conferma e salva</button>
            </div>
          </div>
        )}

        {/* DUPLICATE PLAYER DIALOG */}
        {duplicatePlayer && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div className="card" style={{ maxWidth: 400, width: "100%", borderColor: "#eab308" }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: "#eab308", marginBottom: 8 }}>⚠️ Player già esistente</h3>
              <p style={{ color: "#888", fontSize: 13, marginBottom: 16 }}>
                <strong style={{ color: "#f0f0f0" }}>{duplicatePlayer.existing.name}</strong> è già presente nel database{duplicatePlayer.existing.active === false ? " (storico)" : ""}.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                <button className="btn btn-g" onClick={mergeDuplicatePlayer}>
                  ✅ Aggrega — aggiorna team e riattiva
                </button>
                <div>
                  <p style={{ color: "#555", fontSize: 12, marginBottom: 6 }}>✏️ Omonimo — inserisci con nome diverso:</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input className="inp" defaultValue={duplicatePlayer.incoming.name + " 2"}
                      onKeyDown={e => e.key === "Enter" && renameDuplicatePlayer(e.target.value)}
                      id="rename-input" />
                    <button className="btn btn-o" onClick={() => renameDuplicatePlayer(document.getElementById("rename-input").value)}>OK</button>
                  </div>
                </div>
              </div>
              <button className="btn btn-ghost" style={{ width: "100%" }} onClick={() => setDuplicatePlayer(null)}>Annulla</button>
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
      </div>
    </div>
  );
}
