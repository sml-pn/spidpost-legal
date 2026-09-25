/* ═══════════════════════════════════════════════════════════════
   SPIDPOST - Painel (cliente)
   ═══════════════════════════════════════════════════════════════ */

const API = '';
const POLL_STATUS = 5000;
const POLL_TUNNEL = 10000;
const POLL_TIMELINE = 30000;
const POLL_SYSTEM = 5000;

const state = {
  runningJobs: new Set(),
  logs: [],
  tunnelUrl: null,
  eventSource: null,
  systemRunning: false,
};

function $(id) { return document.getElementById(id); }
function ts() { return new Date().toLocaleTimeString('pt-BR'); }

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ═══════════════ TOASTS ═══════════════

function toast(message, type = 'info', duration = 4000) {
  const container = $('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <div class="toast-msg">${escapeHtml(message)}</div>
    <button class="toast-close">✕</button>
  `;
  const close = () => {
    el.classList.add('closing');
    setTimeout(() => el.remove(), 300);
  };
  el.querySelector('.toast-close').addEventListener('click', close);
  container.appendChild(el);
  if (duration > 0) setTimeout(close, duration);
}

// ═══════════════ TOOLTIPS ═══════════════

function initTooltips() {
  const tooltip = $('tooltip');

  function showTooltip(target, text) {
    if (!text) return;
    tooltip.textContent = text;
    tooltip.hidden = false;
    const rect = target.getBoundingClientRect();
    const tRect = tooltip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tRect.width / 2;
    let top = rect.bottom + 10;
    if (left < 10) left = 10;
    if (left + tRect.width > window.innerWidth - 10) left = window.innerWidth - tRect.width - 10;
    if (top + tRect.height > window.innerHeight - 10) top = rect.top - tRect.height - 10;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function hideTooltip() { tooltip.hidden = true; }

  document.querySelectorAll('[data-tooltip]').forEach((el) => {
    const text = el.getAttribute('data-tooltip');
    el.addEventListener('mouseenter', () => showTooltip(el, text));
    el.addEventListener('mouseleave', hideTooltip);
    el.addEventListener('click', hideTooltip);
    el.addEventListener('blur', hideTooltip);
  });
  window.addEventListener('scroll', hideTooltip);
}

// ═══════════════ LOGS ═══════════════

function addLog(level, message, time) {
  const container = $('log-container');
  const empty = container.querySelector('.log-empty');
  if (empty) empty.remove();
  const el = document.createElement('div');
  el.className = `log-line log-${level || 'info'}`;
  const t = time || ts();
  el.innerHTML = `<span class="log-time">[${escapeHtml(t)}]</span>${escapeHtml(message)}`;
  container.appendChild(el);
  state.logs.push({ level, message, time: t });
  if ($('auto-scroll').checked) container.scrollTop = container.scrollHeight;
}

function clearLogs() {
  $('log-container').innerHTML = '<div class="log-empty">Sem registos.</div>';
  state.logs = [];
}

function downloadLogs() {
  if (state.logs.length === 0) { toast('Sem logs para descarregar', 'warning'); return; }
  const txt = state.logs.map((l) => `[${l.time}] ${l.level.toUpperCase()} ${l.message}`).join('\n');
  const blob = new Blob([txt], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `spidpost-logs-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════ SSE ═══════════════

function conectarSSE() {
  if (state.eventSource) state.eventSource.close();
  const es = new EventSource(`${API}/api/logs`);
  state.eventSource = es;
  es.onopen = () => atualizarStatusConexao(true);
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      addLog(data.level || 'info', data.message, data.time);
    } catch { addLog('info', e.data); }
  };
  es.onerror = () => {
    atualizarStatusConexao(false);
    es.close();
    setTimeout(conectarSSE, 3000);
  };
}

// ═══════════════ CONEXÃO ═══════════════

function atualizarStatusConexao(online) {
  const el = $('connection-status');
  el.classList.toggle('online', online);
  el.classList.toggle('offline', !online);
  el.querySelector('.text').textContent = online ? 'Online' : 'Offline';
}

// ═══════════════ STATUS ═══════════════

async function carregarStatus() {
  try {
    const res = await fetch(`${API}/api/status`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    $('stat-pending').textContent = data.pending ?? 0;
    $('stat-ready').textContent = data.ready ?? 0;
    $('stat-posted').textContent = data.posted ?? 0;
    $('stat-cooldown').textContent = data.cooldown ?? 0;
    atualizarStatusConexao(true);
  } catch { atualizarStatusConexao(false); }
}

// ═══════════════ TIMELINE ═══════════════

async function carregarTimeline() {
  try {
    const res = await fetch(`${API}/api/timeline`);
    if (!res.ok) throw new Error();
    const data = await res.json();

    // Turno atual
    if (data.turnoAtual) {
      $('turno-atual-nome').textContent = data.turnoAtual.nome;
      $('turno-atual-horas').textContent = `${data.turnoAtual.inicio} → ${data.turnoAtual.fim}`;
      $('turno-atual-meta').textContent = `Cota: ${data.turnoAtual.cota_reels} reels + ${data.turnoAtual.cota_feed} feed`;
    } else {
      $('turno-atual-nome').textContent = 'Fora de turno';
      $('turno-atual-horas').textContent = '—';
      $('turno-atual-meta').textContent = 'Sem publicacao automatica agora';
    }

    // Próximo turno
    if (data.proximoTurno) {
      $('turno-prox-nome').textContent = data.proximoTurno.nome;
      $('turno-prox-horas').textContent = `${data.proximoTurno.inicio} → ${data.proximoTurno.fim}`;
      $('turno-prox-meta').textContent = `Em ${data.proximoTurno.tempoTexto}`;
    }

    // Posts hoje
    $('posts-hoje').textContent = data.postsHoje ?? 0;
    if (data.turnoAtual && data.postsNoTurno) {
      $('posts-turno').textContent = `${data.postsNoTurno.total} no turno atual`;
    } else {
      $('posts-turno').textContent = '—';
    }

    // Timeline visual (24h)
    const agora = new Date();
    const minutos = agora.getHours() * 60 + agora.getMinutes();
    const percent = (minutos / 1440) * 100;
    $('day-timeline-now').style.left = `${percent}%`;

  } catch (err) {
    console.error('Erro timeline:', err);
  }
}

// ═══════════════ SYSTEM (start/stop) ═══════════════

async function carregarSystemStatus() {
  try {
    const res = await fetch(`${API}/api/system/status`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    const running = data.scheduler === 'running';
    if (running !== state.systemRunning) {
      state.systemRunning = running;
      atualizarUI(running);
    }
  } catch { /* ignore */ }
}

function atualizarUI(running) {
  const bar = $('control-bar');
  const title = $('system-state-text');
  const desc = $('system-state-desc');
  const btnStart = $('btn-system-start');
  const btnStop = $('btn-system-stop');

  if (running) {
    bar.classList.add('running');
    title.textContent = '🟢 Sistema em execucao';
    desc.textContent = 'A produzir e publicar conteudo automaticamente.';
    btnStart.hidden = true;
    btnStop.hidden = false;
  } else {
    bar.classList.remove('running');
    title.textContent = 'Sistema parado';
    desc.textContent = 'Clica em INICIAR para comecar a produzir conteudo automaticamente.';
    btnStart.hidden = false;
    btnStop.hidden = true;
  }
}

async function iniciarSistema() {
  const btn = $('btn-system-start');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon">⏳</span><span>A INICIAR...</span>';

  try {
    const res = await fetch(`${API}/api/system/start`, { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      toast('Sistema iniciado com sucesso', 'success');
      state.systemRunning = true;
      atualizarUI(true);
    } else {
      toast(`Erro: ${data.error || data.message}`, 'error', 6000);
    }
  } catch (err) {
    toast(`Erro: ${err.message}`, 'error', 6000);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">▶</span><span>INICIAR SISTEMA</span>';
  }
}

async function pararSistema() {
  if (!confirm('Parar o sistema? As publicacoes automaticas serao interrompidas.')) return;

  const btn = $('btn-system-stop');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon">⏳</span><span>A PARAR...</span>';

  try {
    const res = await fetch(`${API}/api/system/stop`, { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      toast('Sistema parado', 'success');
      state.systemRunning = false;
      atualizarUI(false);
    } else {
      toast(`Erro: ${data.error}`, 'error');
    }
  } catch (err) {
    toast(`Erro: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">⏸</span><span>PARAR SISTEMA</span>';
  }
}

// ═══════════════ TÚNEL ═══════════════

async function carregarTunnel() {
  try {
    const res = await fetch(`${API}/api/tunnel`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    const el = $('tunnel-url');
    if (data.url) {
      el.textContent = data.url;
      el.classList.remove('empty');
      state.tunnelUrl = data.url;
    } else {
      el.textContent = 'Sem tunel ativo';
      el.classList.add('empty');
      state.tunnelUrl = null;
    }
  } catch {
    const el = $('tunnel-url');
    el.textContent = 'Erro ao obter tunel';
    el.classList.add('empty');
  }
}

function copiarTunnel() {
  if (!state.tunnelUrl) { toast('Sem URL para copiar', 'warning'); return; }
  navigator.clipboard.writeText(state.tunnelUrl)
    .then(() => toast('URL copiada', 'success'))
    .catch(() => toast('Erro ao copiar', 'error'));
}

async function testarTunnel() {
  if (!state.tunnelUrl) { toast('Sem URL para testar', 'warning'); return; }
  toast('A testar tunel...', 'info', 2000);
  try {
    const res = await fetch(`${API}/api/tunnel/test`);
    const data = await res.json();
    if (data.ok) {
      toast(`Tunel OK (${data.durationMs}ms)`, 'success');
    } else {
      toast(`Tunel falhou: ${data.error}`, 'error', 6000);
    }
  } catch (err) {
    toast(`Erro: ${err.message}`, 'error', 6000);
  }
}

// ═══════════════ JOBS ═══════════════

const JOB_LABELS = {
  harvest: 'Buscar Produtos',
  render: 'Criar Video',
  publish: 'Publicar',
  refresh: 'Renovar Token',
  cleanup: 'Limpar',
};

async function executarJob(nome) {
  if (state.runningJobs.has(nome)) {
    toast(`${JOB_LABELS[nome]} ja esta a correr`, 'warning');
    return;
  }
  const btn = document.querySelector(`[data-job="${nome}"]`);
  if (!btn) return;

  state.runningJobs.add(nome);
  btn.disabled = true;
  btn.classList.add('running');
  btn.classList.remove('success', 'error');

  const label = JOB_LABELS[nome] || nome;
  addLog('system', `Iniciando: ${label}`);
  toast(`A executar ${label}...`, 'info', 2000);

  try {
    const res = await fetch(`${API}/api/run/${nome}`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.exitCode === 0) {
      btn.classList.add('success');
      toast(`${label} concluido`, 'success');
    } else {
      btn.classList.add('error');
      toast(`${label} falhou`, 'error', 6000);
    }
    setTimeout(carregarStatus, 1000);
  } catch (err) {
    btn.classList.add('error');
    toast(`Erro: ${err.message}`, 'error', 6000);
  } finally {
    state.runningJobs.delete(nome);
    setTimeout(() => {
      btn.disabled = false;
      btn.classList.remove('running');
    }, 2000);
  }
}

// ═══════════════ JANELAS ═══════════════

async function mostrarJanelas() {
  try {
    await fetch(`${API}/api/windows/show`, { method: 'POST' });
    toast('Janelas visiveis', 'success');
  } catch (err) { toast(`Erro: ${err.message}`, 'error'); }
}

async function esconderJanelas() {
  try {
    await fetch(`${API}/api/windows/hide`, { method: 'POST' });
    toast('Janelas minimizadas', 'success');
  } catch (err) { toast(`Erro: ${err.message}`, 'error'); }
}

// ═══════════════ MODAL URLS ═══════════════

async function abrirModalUrls() {
  const modal = $('modal-urls');
  const body = $('modal-urls-body');
  modal.hidden = false;
  body.innerHTML = '<p>A carregar...</p>';
  try {
    const res = await fetch(`${API}/api/urls`);
    const data = await res.json();
    if (!data.urls || data.urls.length === 0) {
      body.innerHTML = '<p>Sem URLs disponiveis.</p>';
      return;
    }
    body.innerHTML = data.urls.map((u) => `
      <div class="url-item">
        <div class="url-item-title">${escapeHtml(u.titulo || '')}</div>
        <div class="url-item-url">${escapeHtml(u.url)}</div>
        <div class="url-item-actions">
          <button class="small-btn" data-copy="${escapeHtml(u.url)}">📋 Copiar</button>
          <button class="small-btn" data-open="${escapeHtml(u.url)}">🌐 Abrir</button>
        </div>
      </div>
    `).join('');
    body.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.copy);
        toast('URL copiada', 'success');
      });
    });
    body.querySelectorAll('[data-open]').forEach((btn) => {
      btn.addEventListener('click', () => window.open(btn.dataset.open, '_blank'));
    });
  } catch (err) {
    body.innerHTML = `<p style="color: var(--error);">Erro: ${escapeHtml(err.message)}</p>`;
  }
}

function fecharModalUrls() { $('modal-urls').hidden = true; }

// ═══════════════ RELÓGIO ═══════════════

function atualizarRelogio() {
  $('server-time').textContent = new Date().toLocaleTimeString('pt-BR');
}

// ═══════════════ INIT ═══════════════

function init() {
  // Jobs
  document.querySelectorAll('[data-job]').forEach((btn) => {
    btn.addEventListener('click', () => executarJob(btn.dataset.job));
  });

  // Logs
  $('btn-clear-logs').addEventListener('click', clearLogs);
  $('btn-download-logs').addEventListener('click', downloadLogs);

  // Túnel
  $('btn-copy-tunnel').addEventListener('click', copiarTunnel);
  $('btn-test-tunnel').addEventListener('click', testarTunnel);

  // Modal URLs
  $('btn-open-urls').addEventListener('click', abrirModalUrls);
  $('modal-urls-close').addEventListener('click', fecharModalUrls);
  $('modal-urls').addEventListener('click', (e) => {
    if (e.target.id === 'modal-urls') fecharModalUrls();
  });

  // Janelas
  $('btn-show-windows').addEventListener('click', mostrarJanelas);
  $('btn-hide-windows').addEventListener('click', esconderJanelas);

  // Sistema
  $('btn-system-start').addEventListener('click', iniciarSistema);
  $('btn-system-stop').addEventListener('click', pararSistema);

  initTooltips();

  atualizarStatusConexao(false);
  carregarStatus();
  carregarTunnel();
  carregarTimeline();
  carregarSystemStatus();
  conectarSSE();

  setInterval(carregarStatus, POLL_STATUS);
  setInterval(carregarTunnel, POLL_TUNNEL);
  setInterval(carregarTimeline, POLL_TIMELINE);
  setInterval(carregarSystemStatus, POLL_SYSTEM);
  setInterval(atualizarRelogio, 1000);
  atualizarRelogio();

  addLog('system', 'Painel pronto.');
}

document.addEventListener('DOMContentLoaded', init);