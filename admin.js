import { supabase } from './supabase-client.js';

const els = {
  logout: document.querySelector('#logout'),
  searchInput: document.querySelector('#searchInput'),
  searchBtn: document.querySelector('#searchBtn'),
  refreshBtn: document.querySelector('#refreshBtn'),
  clientsList: document.querySelector('#clientsList'),
  totalClients: document.querySelector('#totalClients'),
  onlineClients: document.querySelector('#onlineClients'),
  activeClients: document.querySelector('#activeClients'),
  expiredClients: document.querySelector('#expiredClients'),
  msg: document.querySelector('#msg'),
  editModal: document.querySelector('#editModal'),
  modalEmail: document.querySelector('#modalEmail'),
  modalCurrentExpiry: document.querySelector('#modalCurrentExpiry'),
  planSelect: document.querySelector('#planSelect'),
  statusSelect: document.querySelector('#statusSelect'),
  expiryInput: document.querySelector('#expiryInput'),
  saveExpiryBtn: document.querySelector('#saveExpiryBtn'),
  modalMsg: document.querySelector('#modalMsg'),
  clientsTab: document.querySelector('#clientsTab'),
  bugsTab: document.querySelector('#bugsTab'),
  clientsView: document.querySelector('#clientsView'),
  bugsView: document.querySelector('#bugsView'),
  bugReportsList: document.querySelector('#bugReportsList'),
  refreshBugsBtn: document.querySelector('#refreshBugsBtn'),
  bugMsg: document.querySelector('#bugMsg'),
  newBugCount: document.querySelector('#newBugCount'),
};

let selectedClient = null;
let bugReports = [];
let bugFilter = 'todos';
let onlineUsers = new Map();
let onlineRefreshTimer = null;

const { data: sessionData } = await supabase.auth.getSession();
const session = sessionData.session;

if (!session) {
  location.href = 'login.html';
  throw new Error('not authenticated');
}

const { data: adminAllowed, error: adminError } = await supabase.rpc('is_admin');

if (adminError || adminAllowed !== true) {
  document.body.innerHTML = `
    <main class="denied-screen">
      <div class="denied-card">
        <div class="eyebrow">ACESSO RESTRITO</div>
        <h1>Acesso não autorizado</h1>
        <p>Esta área é exclusiva da administração do Multi Idle Arena.</p>
        <a class="btn primary" href="conta.html">Voltar para Minha conta</a>
      </div>
    </main>`;
  throw new Error('admin required');
}

els.logout.onclick = async () => {
  await supabase.auth.signOut();
  location.href = 'login.html';
};

els.searchBtn.onclick = () => loadClients(els.searchInput.value.trim());
els.refreshBtn.onclick = async () => { await loadOnlineUsers(); await loadClients(els.searchInput.value.trim()); };

els.searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') loadClients(els.searchInput.value.trim());
});

document.querySelectorAll('[data-close-modal]').forEach((element) => {
  element.addEventListener('click', closeModal);
});

document.querySelectorAll('.quick-days').forEach((button) => {
  button.addEventListener('click', () => addDays(Number(button.dataset.days)));
});

els.saveExpiryBtn.onclick = saveExpiry;


els.clientsTab?.addEventListener('click', () => switchAdminView('clients'));
els.bugsTab?.addEventListener('click', () => switchAdminView('bugs'));
els.refreshBugsBtn?.addEventListener('click', loadBugReports);

document.querySelectorAll('[data-bug-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    bugFilter = button.dataset.bugFilter || 'todos';
    document.querySelectorAll('[data-bug-filter]').forEach((item) => item.classList.toggle('active', item === button));
    renderBugReports();
  });
});

await loadOnlineUsers();
await loadClients('');
onlineRefreshTimer = setInterval(loadOnlineUsers, 30000);
// Carrega a contagem de reports sem trocar de aba.
await preloadBugCount();


async function loadOnlineUsers() {
  const { data, error } = await supabase.rpc('admin_online_users');

  if (error) {
    console.warn('Não foi possível carregar usuários online:', error);
    return;
  }

  const rows = Array.isArray(data) ? data : [];
  onlineUsers = new Map(rows.map((row) => [row.user_id, row]));

  if (els.onlineClients) {
    els.onlineClients.textContent = String(onlineUsers.size);
  }

  // Atualiza os indicadores na lista sem precisar refazer a consulta de clientes.
  document.querySelectorAll('.client-row').forEach((row) => {
    const userId = row.querySelector('.manage-client')?.dataset.user;
    const info = row.querySelector('.client-info');
    if (!userId || !info) return;

    let badge = info.querySelector('.client-online');
    if (onlineUsers.has(userId)) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'client-online';
        badge.innerHTML = '<i class="online-dot"></i>ONLINE';
        info.appendChild(badge);
      }
    } else if (badge) {
      badge.remove();
    }
  });
}

async function loadClients(search = '') {
  setMessage('Carregando clientes...', '');

  const { data, error } = await supabase.rpc('admin_list_clients_v2', {
    p_search: search || null,
  });

  if (error) {
    console.error(error);
    setMessage('Não foi possível carregar os clientes.', 'error');
    els.clientsList.innerHTML = '<div class="admin-empty">Erro ao carregar clientes.</div>';
    return;
  }

  const clients = Array.isArray(data) ? data : [];
  renderClients(clients);
  updateSummary(clients);
  setMessage('', '');
}

function renderClients(clients) {
  if (!clients.length) {
    els.clientsList.innerHTML = '<div class="admin-empty">Nenhum cliente encontrado.</div>';
    return;
  }

  els.clientsList.innerHTML = clients.map((client) => {
    const expires = client.expires_at ? new Date(client.expires_at) : null;
    const trialState = client.trial_state || inferLegacyTrialState(client);
    const statusInfo = clientStatusInfo(trialState);
    const plan = planLabel(client.plan);

    let expiry = expires && !Number.isNaN(expires.getTime())
      ? expires.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : 'Sem validade';

    if (trialState === 'awaiting_activation') expiry = 'Aguardando 1º acesso';
    if (trialState === 'trial_blocked') expiry = 'Trial não liberado';

    const statusTitle = client.last_trial_message || statusInfo.help;

    return `
      <article class="client-row">
        <div class="client-main">
          <div class="client-avatar">${escapeHtml((client.email || '?').slice(0, 1).toUpperCase())}</div>
          <div class="client-info">
            <strong>${escapeHtml(client.email || 'Sem e-mail')}</strong>
            <span>ID ${escapeHtml(shortId(client.user_id))}</span>
            ${onlineUsers.has(client.user_id) ? '<span class="client-online"><i class="online-dot"></i>ONLINE</span>' : ''}
          </div>
        </div>

        <div class="client-detail">
          <span>PLANO</span>
          <strong>${escapeHtml(plan)}</strong>
        </div>

        <div class="client-detail">
          <span>VENCIMENTO</span>
          <strong>${escapeHtml(expiry)}</strong>
        </div>

        <div class="client-status ${escapeAttr(statusInfo.className)}" title="${escapeAttr(statusTitle)}">
          ${escapeHtml(statusInfo.label)}
        </div>

        <button class="btn primary manage-client"
          data-user="${escapeAttr(client.user_id)}"
          data-email="${escapeAttr(client.email || '')}"
          data-expiry="${escapeAttr(client.expires_at || '')}"
          data-plan="${escapeAttr(client.plan || 'manual')}"
          data-status="${escapeAttr(client.status || 'active')}">
          Gerenciar
        </button>
      </article>`;
  }).join('');

  document.querySelectorAll('.manage-client').forEach((button) => {
    button.addEventListener('click', () => {
      selectedClient = {
        user_id: button.dataset.user,
        email: button.dataset.email,
        expires_at: button.dataset.expiry || null,
        plan: button.dataset.plan || 'manual',
        status: button.dataset.status || 'active',
      };
      openModal();
    });
  });
}

function inferLegacyTrialState(client) {
  const expiry = client.expires_at ? new Date(client.expires_at).getTime() : 0;
  const start = client.starts_at ? new Date(client.starts_at).getTime() : 0;
  const active = client.status === 'active' && expiry > Date.now();

  if (client.status === 'blocked') return 'blocked';
  if (active) return 'active';
  if (String(client.plan || '').toLowerCase() === 'trial' && start && expiry && Math.abs(expiry - start) < 1500) {
    return 'awaiting_activation';
  }
  return 'expired';
}

function clientStatusInfo(state) {
  return {
    active: {
      label: 'ATIVO',
      className: 'active',
      help: 'Licença ativa.'
    },
    awaiting_activation: {
      label: 'AGUARDANDO ATIVAÇÃO',
      className: 'waiting',
      help: 'Conta criada. O Trial será validado no primeiro acesso pelo launcher.'
    },
    trial_blocked: {
      label: 'TRIAL BLOQUEADO',
      className: 'blocked',
      help: 'O computador já utilizou o período gratuito em outra conta.'
    },
    blocked: {
      label: 'BLOQUEADO',
      className: 'blocked',
      help: 'Licença bloqueada.'
    },
    expired: {
      label: 'EXPIRADO',
      className: 'expired',
      help: 'A validade terminou.'
    }
  }[state] || {
    label: 'EXPIRADO',
    className: 'expired',
    help: 'Licença sem validade ativa.'
  };
}

function updateSummary(clients) {
  const states = clients.map((client) => client.trial_state || inferLegacyTrialState(client));
  const active = states.filter((state) => state === 'active').length;
  const waiting = states.filter((state) => state === 'awaiting_activation').length;
  const blocked = states.filter((state) => state === 'trial_blocked' || state === 'blocked').length;
  const expired = states.filter((state) => state === 'expired').length;

  els.totalClients.textContent = String(clients.length);
  els.activeClients.textContent = String(active);
  els.expiredClients.textContent = String(expired);

  const waitingEl = document.querySelector('#waitingClients');
  const blockedEl = document.querySelector('#blockedClients');
  if (waitingEl) waitingEl.textContent = String(waiting);
  if (blockedEl) blockedEl.textContent = String(blocked);
}

function openModal() {
  if (!selectedClient) return;

  els.modalEmail.textContent = selectedClient.email || 'Cliente';

  const current = selectedClient.expires_at
    ? new Date(selectedClient.expires_at)
    : null;

  els.modalCurrentExpiry.textContent =
    current && !Number.isNaN(current.getTime())
      ? current.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : 'Sem validade';

  els.planSelect.value = ['trial','daily','weekly','monthly','manual'].includes(selectedClient.plan)
    ? selectedClient.plan
    : 'manual';

  els.statusSelect.value = ['active','expired','blocked'].includes(selectedClient.status)
    ? selectedClient.status
    : 'active';

  els.expiryInput.value =
    current && !Number.isNaN(current.getTime())
      ? toDatetimeLocal(current)
      : toDatetimeLocal(new Date(Date.now() + 86400000));

  els.modalMsg.textContent = '';
  els.editModal.classList.add('open');
  els.editModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closeModal() {
  els.editModal.classList.remove('open');
  els.editModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  selectedClient = null;
}

async function saveExpiry() {
  if (!selectedClient) return;

  const value = els.expiryInput.value;
  const plan = els.planSelect.value;
  const status = els.statusSelect.value;

  if (!value) {
    setModalMessage('Escolha uma data e hora.', 'error');
    return;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    setModalMessage('Data inválida.', 'error');
    return;
  }

  els.saveExpiryBtn.disabled = true;
  setModalMessage('Salvando...', '');

  const { data, error } = await supabase.rpc('admin_update_license', {
    p_user_id: selectedClient.user_id,
    p_expires_at: date.toISOString(),
    p_plan: plan,
    p_status: status,
  });

  els.saveExpiryBtn.disabled = false;

  if (error) {
    console.error(error);
    setModalMessage('Não foi possível salvar as alterações.', 'error');
    return;
  }

  selectedClient.expires_at = data?.expires_at || date.toISOString();
  selectedClient.plan = data?.plan || plan;
  selectedClient.status = data?.status || status;

  setModalMessage('Licença atualizada com sucesso.', 'ok');

  setTimeout(async () => {
    closeModal();
    await loadClients(els.searchInput.value.trim());
  }, 900);
}

async function addDays(days) {
  if (!selectedClient || !Number.isInteger(days) || days <= 0) return;

  setModalMessage(`Adicionando ${days} dia${days > 1 ? 's' : ''}...`, '');

  const { data, error } = await supabase.rpc('admin_add_days', {
    p_user_id: selectedClient.user_id,
    p_days: days,
  });

  if (error) {
    console.error(error);
    setModalMessage('Não foi possível adicionar os dias.', 'error');
    return;
  }

  selectedClient.expires_at = data?.expires_at || selectedClient.expires_at;
  selectedClient.plan = data?.plan || 'manual';
  selectedClient.status = data?.status || 'active';
  els.planSelect.value = selectedClient.plan;
  els.statusSelect.value = selectedClient.status;

  const updated = selectedClient.expires_at ? new Date(selectedClient.expires_at) : null;

  els.modalCurrentExpiry.textContent =
    updated && !Number.isNaN(updated.getTime())
      ? updated.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : '—';

  if (updated && !Number.isNaN(updated.getTime())) {
    els.expiryInput.value = toDatetimeLocal(updated);
  }

  setModalMessage(`+${days} dia${days > 1 ? 's' : ''} adicionado com sucesso.`, 'ok');
  await loadClients(els.searchInput.value.trim());
}


async function switchAdminView(view) {
  const bugs = view === 'bugs';

  if (els.clientsView) {
    els.clientsView.hidden = bugs;
    els.clientsView.style.display = bugs ? 'none' : '';
  }
  if (els.bugsView) {
    els.bugsView.hidden = !bugs;
    els.bugsView.style.display = bugs ? '' : 'none';
  }
  els.clientsTab?.classList.toggle('active', !bugs);
  els.bugsTab?.classList.toggle('active', bugs);

  if (bugs) await loadBugReports();
}

window.miaAdminShowView = switchAdminView;

async function preloadBugCount() {
  const { data, error } = await supabase
    .from('bug_reports')
    .select('id,status')
    .eq('status', 'novo')
    .limit(200);

  if (error) {
    console.warn('Não foi possível pré-carregar a contagem de bugs:', error);
    return;
  }

  const total = Array.isArray(data) ? data.length : 0;
  if (els.newBugCount) {
    els.newBugCount.textContent = String(total);
    els.newBugCount.style.display = total ? 'inline-flex' : 'none';
  }
}

async function loadBugReports() {
  setBugMessage('Carregando relatórios...', '');

  const { data, error } = await supabase
    .from('bug_reports')
    .select('id,category,description,app_version,electron_version,platform,os_version,total_ram_gb,process_count,workspace,layout,session_count,status,created_at,updated_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error(error);
    setBugMessage('Não foi possível carregar os relatórios. Verifique a permissão de leitura do Admin.', 'error');
    els.bugReportsList.innerHTML = '<div class="admin-empty">Erro ao carregar relatórios.</div>';
    return;
  }

  bugReports = Array.isArray(data) ? data : [];
  renderBugReports();
  updateBugBadge();
  setBugMessage('', '');
}

function renderBugReports() {
  const reports = bugFilter === 'todos'
    ? bugReports
    : bugReports.filter((report) => report.status === bugFilter);

  if (!reports.length) {
    els.bugReportsList.innerHTML = '<div class="admin-empty">Nenhum relatório nesta categoria.</div>';
    return;
  }

  els.bugReportsList.innerHTML = reports.map((report) => {
    const created = report.created_at ? new Date(report.created_at) : null;
    const dateLabel = created && !Number.isNaN(created.getTime())
      ? created.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : 'Data indisponível';

    const status = ['novo','em_analise','resolvido'].includes(report.status) ? report.status : 'novo';

    const meta = [
      report.app_version ? `App ${report.app_version}` : '',
      report.electron_version ? `Electron ${report.electron_version}` : '',
      report.os_version || report.platform || '',
      report.total_ram_gb != null ? `${report.total_ram_gb} GB RAM` : '',
      report.process_count != null ? `${report.process_count} proc.` : '',
      report.session_count != null ? `${report.session_count} sessões` : '',
      report.workspace ? `Workspace: ${report.workspace}` : '',
      report.layout ? `Layout: ${report.layout}` : '',
    ].filter(Boolean);

    return `
      <article class="bug-card">
        <div>
          <div class="bug-top">
            <span class="bug-category">${escapeHtml(bugCategoryLabel(report.category))}</span>
            <span class="bug-date">${escapeHtml(dateLabel)}</span>
            <span class="bug-status ${escapeAttr(status)}">${escapeHtml(bugStatusLabel(status))}</span>
          </div>
          <div class="bug-description">${escapeHtml(report.description || 'Sem descrição')}</div>
          <div class="bug-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>
        </div>
        <div class="bug-actions">
          <label class="admin-label" for="bug-${escapeAttr(report.id)}">Status</label>
          <select id="bug-${escapeAttr(report.id)}" class="bug-status-select" data-bug-id="${escapeAttr(report.id)}">
            <option value="novo" ${status === 'novo' ? 'selected' : ''}>Novo</option>
            <option value="em_analise" ${status === 'em_analise' ? 'selected' : ''}>Em análise</option>
            <option value="resolvido" ${status === 'resolvido' ? 'selected' : ''}>Resolvido</option>
          </select>
        </div>
      </article>`;
  }).join('');

  document.querySelectorAll('[data-bug-id]').forEach((select) => {
    select.addEventListener('change', () => updateBugStatus(select.dataset.bugId, select.value, select));
  });
}

async function updateBugStatus(id, status, select) {
  if (!id || !['novo','em_analise','resolvido'].includes(status)) return;

  select.disabled = true;
  setBugMessage('Atualizando chamado...', '');

  const { error } = await supabase
    .from('bug_reports')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);

  select.disabled = false;

  if (error) {
    console.error(error);
    setBugMessage('Não foi possível alterar o status.', 'error');
    await loadBugReports();
    return;
  }

  const report = bugReports.find((item) => item.id === id);
  if (report) report.status = status;
  updateBugBadge();
  renderBugReports();
  setBugMessage('Status atualizado.', 'ok');
}

function updateBugBadge() {
  const total = bugReports.filter((report) => report.status === 'novo').length;
  els.newBugCount.textContent = String(total);
  els.newBugCount.style.display = total ? 'inline-flex' : 'none';
}

function bugCategoryLabel(category) {
  return {
    bug: 'Bug',
    crash: 'Erro / travamento',
    performance: 'Desempenho',
    visual: 'Problema visual',
    account: 'Conta / sessão',
    update: 'Atualização',
    other: 'Outro',
  }[String(category || '').toLowerCase()] || String(category || 'Bug');
}

function bugStatusLabel(status) {
  return {
    novo: 'NOVO',
    em_analise: 'EM ANÁLISE',
    resolvido: 'RESOLVIDO',
  }[status] || 'NOVO';
}

function setBugMessage(text, type = '') {
  if (!els.bugMsg) return;
  els.bugMsg.className = `admin-msg ${type}`.trim();
  els.bugMsg.textContent = text;
}

function planLabel(plan) {
  return {
    trial: 'Trial',
    daily: 'Diário',
    weekly: 'Semanal',
    monthly: 'Mensal',
    manual: 'Manual/Admin',
  }[plan] || (plan || 'Sem plano');
}

function shortId(value) {
  const id = String(value || '');
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id || '—';
}

function toDatetimeLocal(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function setMessage(text, type = '') {
  els.msg.className = `admin-msg ${type}`.trim();
  els.msg.textContent = text;
}

function setModalMessage(text, type = '') {
  els.modalMsg.className = `admin-msg ${type}`.trim();
  els.modalMsg.textContent = text;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
