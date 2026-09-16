import { supabase } from './supabase-client.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const els = {
  email: document.querySelector('#email'),
  displayName: document.querySelector('#displayName'),
  logout: document.querySelector('#logout'),
  plan: document.querySelector('#plan'),
  planTag: document.querySelector('#planTag'),
  status: document.querySelector('#status'),
  statusDescription: document.querySelector('#statusDescription'),
  remaining: document.querySelector('#remaining'),
  expiresAt: document.querySelector('#expiresAt'),
  licenseBadge: document.querySelector('#licenseBadge'),
  licenseBadgeText: document.querySelector('#licenseBadgeText'),
  accountShortId: document.querySelector('#accountShortId'),
  renewBtn: document.querySelector('#renewBtn'),
  refreshLicense: document.querySelector('#refreshLicense'),
  refreshPayments: document.querySelector('#refreshPayments'),
  paymentsList: document.querySelector('#paymentsList'),
  msg: document.querySelector('#msg'),
  pixModal: document.querySelector('#pixModal'),
  pixLoading: document.querySelector('#pixLoading'),
  pixContent: document.querySelector('#pixContent'),
  pixError: document.querySelector('#pixError'),
  pixPlanLabel: document.querySelector('#pixPlanLabel'),
  pixAmount: document.querySelector('#pixAmount'),
  pixQr: document.querySelector('#pixQr'),
  pixCode: document.querySelector('#pixCode'),
  copyPix: document.querySelector('#copyPix'),
  checkPix: document.querySelector('#checkPix'),
  pixStatus: document.querySelector('#pixStatus'),
};

const PLAN = {
  trial: { name: 'Teste gratuito', tag: 'TRIAL 8H' },
  lifetime: { name: 'Licença vitalícia', tag: 'VITALÍCIO' },
  daily: { name: 'Diário (legado)', tag: 'LEGADO' },
  weekly: { name: 'Semanal (legado)', tag: 'LEGADO' },
  monthly: { name: 'Mensal (legado)', tag: 'LEGADO' },
  manual: { name: 'Manual/Admin', tag: 'ADMIN' },
};

const PRICE = { lifetime: 19 };
let session = null;
let currentLicense = null;
let paymentPoll = null;
let pendingPixPaymentId = null;
let pendingPixBaselineExpiresAt = 0;

const sessionResult = await supabase.auth.getSession();
session = sessionResult.data.session;
if (!session) {
  location.href = 'login.html';
  throw new Error('not authenticated');
}

const user = session.user;
els.email.textContent = user.email || 'Conta Multi Idle Arena';
els.displayName.textContent = displayNameFromUser(user);
els.accountShortId.textContent = user.id ? `${user.id.slice(0, 8)}…${user.id.slice(-4)}` : '—';

els.logout.onclick = async () => {
  await supabase.auth.signOut();
  location.href = 'login.html';
};

els.renewBtn.onclick = () => {
  document.querySelector('#plansSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

els.refreshLicense.onclick = async () => {
  els.refreshLicense.disabled = true;
  await loadLicense(true);
  els.refreshLicense.disabled = false;
};

els.refreshPayments.onclick = async () => {
  els.refreshPayments.disabled = true;
  await loadPayments();
  els.refreshPayments.disabled = false;
};

document.querySelectorAll('.pix-plan-btn').forEach((button) => {
  button.addEventListener('click', () => startPix(button.dataset.plan));
});

document.querySelectorAll('[data-close-pix]').forEach((element) => {
  element.addEventListener('click', closePixModal);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && els.pixModal.classList.contains('open')) closePixModal();
});

els.copyPix.onclick = async () => {
  try {
    await navigator.clipboard.writeText(els.pixCode.value);
    const original = els.copyPix.textContent;
    els.copyPix.textContent = '✓ Código Pix copiado';
    setTimeout(() => { els.copyPix.textContent = original; }, 1800);
  } catch {
    els.pixCode.focus();
    els.pixCode.select();
    document.execCommand('copy');
    els.copyPix.textContent = '✓ Código Pix copiado';
    setTimeout(() => { els.copyPix.textContent = 'Copiar código Pix'; }, 1800);
  }
};

els.checkPix.onclick = async () => {
  els.checkPix.disabled = true;
  await checkPaymentState(true);
  els.checkPix.disabled = false;
};

await Promise.all([loadLicense(), loadPayments()]);

async function loadLicense(showToast = false) {
  const { data, error } = await supabase
    .from('licenses')
    .select('plan,status,starts_at,expires_at')
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    setMessage('Não foi possível carregar sua licença.', 'error');
    return null;
  }

  currentLicense = data;
  renderLicense(data);
  if (showToast) setMessage('Status da licença atualizado.', 'ok', 2200);
  return data;
}

function renderLicense(data) {
  const plan = PLAN[data.plan] || { name: data.plan || '—', tag: 'LICENÇA' };
  const expires = data.expires_at ? new Date(data.expires_at) : null;
  const now = new Date();
  const validDate = expires && !Number.isNaN(expires.getTime());
  const isLifetime = data.plan === 'lifetime' && data.status === 'active';
  const isTrial = data.plan === 'trial';
  const active = isLifetime || (data.status === 'active' && validDate && expires > now);

  els.plan.textContent = plan.name;
  els.planTag.textContent = plan.tag;

  if (isLifetime) {
    els.expiresAt.textContent = 'Vitalícia · não expira';
    els.remaining.textContent = 'Para sempre';
  } else {
    els.expiresAt.textContent = validDate
      ? expires.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : '—';
    els.remaining.textContent = validDate ? formatRemaining(expires - now) : '—';
  }

  els.status.textContent = active ? 'ATIVO' : 'EXPIRADO';
  els.status.className = `status-big ${active ? 'active' : 'expired'}`;
  els.licenseBadge.className = `license-badge ${active ? 'active' : 'expired'}`;
  els.licenseBadgeText.textContent = isLifetime
    ? 'Licença vitalícia'
    : active && isTrial ? 'Trial 8h ativo' : active ? 'Licença ativa' : 'Acesso expirado';

  const plansSection = document.querySelector('#plansSection');
  if (isLifetime) {
    els.statusDescription.textContent = 'Sua licença é vitalícia. Não há mensalidade, renovação ou data de vencimento.';
    els.renewBtn.textContent = 'Licença vitalícia ativa';
    els.renewBtn.disabled = true;
    if (plansSection) plansSection.hidden = true;
  } else if (active && isTrial) {
    els.statusDescription.textContent = 'Seu teste gratuito de 8 horas está ativo. Compre o vitalício uma única vez por R$ 19.';
    els.renewBtn.textContent = 'Comprar vitalício · R$ 19';
    els.renewBtn.disabled = false;
    if (plansSection) plansSection.hidden = false;
  } else {
    els.statusDescription.textContent = 'Seu teste terminou. Compre a licença vitalícia por R$ 19 para liberar o acesso permanentemente.';
    els.renewBtn.textContent = 'Comprar vitalício · R$ 19';
    els.renewBtn.disabled = false;
    if (plansSection) plansSection.hidden = false;
  }
}

async function loadPayments() {
  els.paymentsList.innerHTML = '<div class="empty-state">Carregando pagamentos...</div>';

  const { data, error } = await supabase
    .from('payments')
    .select('mercado_pago_payment_id,plan,amount,status,paid_at,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    // A tabela pode ainda estar sendo preparada durante a implantação.
    els.paymentsList.innerHTML = '<div class="empty-state">O histórico ficará disponível assim que o primeiro pagamento for registrado.</div>';
    return;
  }

  if (!data?.length) {
    els.paymentsList.innerHTML = '<div class="empty-state">Nenhum pagamento registrado até agora.</div>';
    return;
  }

  els.paymentsList.innerHTML = data.map((payment) => {
    const plan = PLAN[payment.plan]?.name || payment.plan || 'Plano';
    const status = paymentStatus(payment.status);
    const date = payment.paid_at || payment.created_at;
    const amount = Number(payment.amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const id = escapeHtml(String(payment.mercado_pago_payment_id || '—'));

    return `
      <div class="payment-row">
        <div class="payment-main">
          <div class="payment-icon">$</div>
          <div>
            <strong>${escapeHtml(plan)}</strong>
            <span>${formatDate(date)} · ID ${id}</span>
          </div>
        </div>
        <div class="payment-right">
          <strong>${amount}</strong>
          <span class="payment-status ${status.className}">${status.label}</span>
        </div>
      </div>`;
  }).join('');
}

async function startPix(planKey) {
  if (!PRICE[planKey]) return;

  // Guarda a validade atual ANTES de gerar um novo Pix.
  // Assim uma licença que já estava ativa não é confundida com o novo pagamento.
  pendingPixBaselineExpiresAt = currentLicense?.expires_at
    ? new Date(currentLicense.expires_at).getTime()
    : 0;
  pendingPixPaymentId = null;

  openPixModal();
  resetPixModal();
  els.pixPlanLabel.textContent = `${PLAN[planKey].name} · ${formatBRL(PRICE[planKey])}`;
  els.pixAmount.textContent = formatBRL(PRICE[planKey]);

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente.');

    const response = await fetch(`${SUPABASE_URL}/functions/v1/create-pix`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ plan: planKey }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      const details = result?.details?.message || result?.details?.error || '';
      if (/Unauthorized use of live credentials/i.test(details)) {
        throw new Error('As credenciais de produção do Mercado Pago ainda precisam ser ativadas. Finalize a configuração comercial no Mercado Pago e tente novamente.');
      }
      throw new Error(result?.error || 'Não foi possível gerar o Pix.');
    }

    const pix = result.pix || {};
    pendingPixPaymentId = result.payment_id ? String(result.payment_id) : null;

    if (!pix.copy_paste) throw new Error('O Mercado Pago não retornou o código Pix.');

    els.pixCode.value = pix.copy_paste;
    if (pix.qr_code_base64) {
      els.pixQr.src = pix.qr_code_base64.startsWith('data:')
        ? pix.qr_code_base64
        : `data:image/png;base64,${pix.qr_code_base64}`;
      els.pixQr.hidden = false;
    } else {
      els.pixQr.hidden = true;
    }

    els.pixLoading.classList.add('hidden');
    els.pixContent.classList.remove('hidden');
    startPaymentPolling();
  } catch (error) {
    els.pixLoading.classList.add('hidden');
    els.pixError.classList.remove('hidden');
    els.pixError.textContent = error?.message || 'Não foi possível gerar o Pix.';
  }
}

function startPaymentPolling() {
  stopPaymentPolling();
  paymentPoll = setInterval(() => checkPaymentState(false), 5000);
}

function stopPaymentPolling() {
  if (paymentPoll) clearInterval(paymentPoll);
  paymentPoll = null;
}

async function checkPaymentState(manual = false) {
  // 1) Forma principal: verifica exatamente o pagamento Pix que acabou de ser criado.
  if (pendingPixPaymentId) {
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('mercado_pago_payment_id,status,plan,amount,paid_at')
      .eq('user_id', user.id)
      .eq('mercado_pago_payment_id', pendingPixPaymentId)
      .maybeSingle();

    if (!paymentError && payment?.status === 'approved') {
      await finishApprovedPix();
      return;
    }
  }

  // 2) Fallback: confirma que a validade realmente AUMENTOU após a criação deste Pix.
  // Nunca basta a licença já estar ativa.
  const license = await loadLicense(false);
  if (!license) return;

  if (license.plan === 'lifetime' && license.status === 'active') {
    await finishApprovedPix();
    return;
  }

  if (manual) {
    els.pixStatus.className = 'pix-status waiting';
    els.pixStatus.innerHTML =
      '<span class="pulse-dot"></span><span>Pagamento ainda não identificado. Continuamos verificando...</span>';
  }
}

async function finishApprovedPix() {
  els.pixStatus.className = 'pix-status approved';
  els.pixStatus.innerHTML =
    '<span class="approved-check">✓</span><span>Pagamento aprovado · licença vitalícia ativada</span>';

  stopPaymentPolling();

  // Atualiza a tela e o histórico antes de fechar o modal.
  await Promise.all([
    loadLicense(false),
    loadPayments(),
  ]);

  setTimeout(closePixModal, 2200);
}

function openPixModal() {
  els.pixModal.classList.add('open');
  els.pixModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closePixModal() {
  stopPaymentPolling();
  pendingPixPaymentId = null;
  pendingPixBaselineExpiresAt = 0;
  els.pixModal.classList.remove('open');
  els.pixModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

function resetPixModal() {
  stopPaymentPolling();
  els.pixLoading.classList.remove('hidden');
  els.pixLoading.textContent = 'Gerando seu Pix...';
  els.pixContent.classList.add('hidden');
  els.pixError.classList.add('hidden');
  els.pixError.textContent = '';
  els.pixQr.removeAttribute('src');
  els.pixCode.value = '';
  els.pixStatus.className = 'pix-status waiting';
  els.pixStatus.innerHTML = '<span class="pulse-dot"></span><span>Aguardando pagamento...</span>';
}

function displayNameFromUser(user) {
  const metaName = user.user_metadata?.name || user.user_metadata?.full_name;
  if (metaName) return String(metaName).trim().split(/\s+/)[0];
  return String(user.email || 'jogador').split('@')[0];
}

function formatRemaining(ms) {
  if (ms <= 0) return 'Expirado';
  const total = Math.floor(ms / 60000);
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

function formatBRL(value) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value) {
  if (!value) return 'Data não informada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data não informada';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function paymentStatus(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'approved') return { label: 'APROVADO', className: 'approved' };
  if (normalized === 'pending' || normalized === 'in_process') return { label: 'PENDENTE', className: 'pending' };
  if (normalized === 'rejected' || normalized === 'cancelled') return { label: 'NÃO APROVADO', className: 'rejected' };
  return { label: normalized ? normalized.toUpperCase() : 'REGISTRADO', className: 'neutral' };
}

function setMessage(text, type = '', duration = 0) {
  els.msg.className = `msg ${type}`.trim();
  els.msg.textContent = text;
  if (duration) setTimeout(() => {
    if (els.msg.textContent === text) els.msg.textContent = '';
  }, duration);
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}
