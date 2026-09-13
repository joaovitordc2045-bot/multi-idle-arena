import { supabase } from './supabase-client.js';

const els = {
  logout: document.querySelector('#logout'),
  searchInput: document.querySelector('#searchInput'),
  searchBtn: document.querySelector('#searchBtn'),
  refreshBtn: document.querySelector('#refreshBtn'),
  clientsList: document.querySelector('#clientsList'),
  totalClients: document.querySelector('#totalClients'),
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
};

let selectedClient = null;

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
els.refreshBtn.onclick = () => loadClients(els.searchInput.value.trim());

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

await loadClients('');

async function loadClients(search = '') {
  setMessage('Carregando clientes...', '');

  const { data, error } = await supabase.rpc('admin_list_clients', {
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
    const active = client.status === 'active' && expires && expires > new Date();
    const trialBlocked = client.display_status === 'trial_blocked';
    const statusClass = trialBlocked ? 'trial-blocked' : (active ? 'active' : 'expired');
    const statusLabel = trialBlocked ? 'TRIAL BLOQUEADO' : (active ? 'ATIVO' : 'EXPIRADO');
    const plan = planLabel(client.plan);
    const expiry = expires && !Number.isNaN(expires.getTime())
      ? expires.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : 'Sem validade';

    return `
      <article class="client-row">
        <div class="client-main">
          <div class="client-avatar">${escapeHtml((client.email || '?').slice(0, 1).toUpperCase())}</div>
          <div class="client-info">
            <strong>${escapeHtml(client.email || 'Sem e-mail')}</strong>
            <span>ID ${escapeHtml(shortId(client.user_id))}</span>
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

        <div class="client-status ${statusClass}">
          ${statusLabel}
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

function updateSummary(clients) {
  const now = Date.now();
  const active = clients.filter((client) => {
    const expiry = client.expires_at ? new Date(client.expires_at).getTime() : 0;
    return client.status === 'active' && expiry > now;
  }).length;

  els.totalClients.textContent = String(clients.length);
  els.activeClients.textContent = String(active);
  els.expiredClients.textContent = String(clients.length - active);
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
