const url = config.url;
let currentPerson = getPreferredPerson();
let reviewData = null;

function getKey() { return localStorage.getItem('budget_key'); }
function setKey(key) { localStorage.setItem('budget_key', key); }
function getPreferredPerson() {
    return (localStorage.getItem('budget_name') || '').toLowerCase() === 'elisa' ? 'elisa' : 'fabian';
}
function getName() { return currentPerson === 'elisa' ? 'Elisa' : 'Fabian'; }
function authenticate(force = false) {
    let key = getKey();
    if (!key || force) {
        key = prompt('Password');
        setKey(key);
    }
    return key;
}
function betterFetch(fullUrl) {
    return fetch(fullUrl, {headers: {'Authorization': 'Basic ' + btoa(authenticate() || '')}});
}
function formatCurrency(value, digits = 0) {
    return new Intl.NumberFormat('nl-BE', {
        style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits
    }).format(Number(value) || 0);
}
function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value ?? '';
    return div.innerHTML;
}
function shortDate(value) {
    if (!value) return '';
    return new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'short'}).format(new Date(`${value}T12:00:00`));
}
function setStatus(message) { document.getElementById('reviewStatus').textContent = message || ''; }

function renderHero(data) {
    const week = data.weeks[0];
    const comparison = data.comparison;
    document.getElementById('reviewPeriod').textContent = week.label;
    document.getElementById('weekTotal').textContent = formatCurrency(comparison.current_total);

    const comparisonEl = document.getElementById('weekComparison');
    const difference = Math.abs(comparison.change);
    if (comparison.direction === 'same') {
        comparisonEl.textContent = `About the same as the prior week · ${week.transaction_count} expenses`;
        comparisonEl.className = 'hero-comparison';
    } else {
        const word = comparison.direction === 'down' ? 'less' : 'more';
        const percent = comparison.percent_change === null ? '' : ` (${Math.abs(comparison.percent_change).toFixed(0)}%)`;
        comparisonEl.textContent = `${formatCurrency(difference)} ${word} than the prior week${percent} · ${week.transaction_count} expenses`;
        comparisonEl.className = `hero-comparison ${comparison.direction === 'down' ? 'is-good' : 'is-warning'}`;
    }

    const top = data.highlights.top_category;
    const increase = data.highlights.biggest_increase;
    const largest = data.highlights.largest_expense;
    let focus = 'No expenses were recorded last week. A quiet week is still useful context.';
    if (top) {
        focus = `${top.category} was your largest category at ${formatCurrency(top.total)}.`;
        if (increase && increase.category !== top.category) {
            focus += ` The clearest increase was ${increase.category}, up ${formatCurrency(increase.change)}.`;
        }
        if (largest?.description) focus += ` Your largest single expense was ${largest.description} (${formatCurrency(largest.amount)}).`;
    }
    document.getElementById('weeklyFocus').textContent = focus;
}

function renderMonth(month) {
    document.getElementById('monthLabel').textContent = month.label;
    document.getElementById('monthSpent').textContent = formatCurrency(month.spent);
    document.getElementById('monthRemaining').textContent = formatCurrency(month.remaining);
    document.getElementById('safePerDay').textContent = `${formatCurrency(month.safe_to_spend_per_day)} / day`;

    const status = document.getElementById('paceStatus');
    status.textContent = month.remaining < 0 ? 'Over allowance' : month.on_pace ? 'On pace' : 'Above expected pace';
    status.className = `pace-status ${month.on_pace && month.remaining >= 0 ? 'is-good' : 'is-warning'}`;
    const spendPercent = month.allowance > 0 ? Math.min(100, month.spent / month.allowance * 100) : 0;
    const expectedPercent = month.allowance > 0 ? Math.min(100, month.expected_spend_by_today / month.allowance * 100) : 0;
    const fill = document.getElementById('paceFill');
    fill.style.width = `${spendPercent}%`;
    fill.classList.toggle('is-over', month.spent > month.allowance);
    document.getElementById('paceMarker').style.left = `${expectedPercent}%`;
    document.getElementById('paceCaption').textContent =
        `${formatCurrency(month.spent)} of ${formatCurrency(month.allowance)} allowance · marker shows today's expected pace`;
}

function renderCategoryComparison(items) {
    const container = document.getElementById('categoryComparison');
    if (!items.length) {
        container.innerHTML = '<div class="empty-state">No category activity in these weeks.</div>';
        return;
    }
    const max = Math.max(...items.flatMap(item => [item.current, item.previous]), 1);
    container.innerHTML = items.map(item => {
        const direction = item.change > 0 ? 'up' : item.change < 0 ? 'down' : '';
        const change = item.change === 0 ? '—' : `${item.change > 0 ? '+' : '−'}${formatCurrency(Math.abs(item.change))}`;
        return `<div class="comparison-row">
            <div class="comparison-name">${escapeHtml(item.category)}</div>
            <div class="comparison-bars">
                <div class="mini-track"><div class="mini-fill" style="width:${item.current / max * 100}%"></div></div>
                <div class="mini-track"><div class="mini-fill previous" style="width:${item.previous / max * 100}%"></div></div>
            </div>
            <div class="comparison-value ${direction}">${change}</div>
        </div>`;
    }).join('');
}

function renderWeeklyTrend(weeks) {
    const container = document.getElementById('weeklyTrend');
    const ordered = [...weeks].reverse();
    const max = Math.max(...ordered.map(week => week.total), 1);
    container.innerHTML = ordered.map((week, index) => {
        const originalIndex = weeks.length - index - 1;
        return `<button type="button" class="trend-row ${originalIndex === 0 ? 'is-selected' : ''}" data-week-index="${originalIndex}">
            <span class="trend-label">${escapeHtml(shortDate(week.start))}</span>
            <span class="trend-track"><span class="trend-fill" style="width:${week.total / max * 100}%"></span></span>
            <span class="trend-value">${formatCurrency(week.total)}</span>
        </button>`;
    }).join('');
    container.querySelectorAll('[data-week-index]').forEach(button => {
        button.addEventListener('click', () => {
            container.querySelectorAll('.trend-row').forEach(row => row.classList.remove('is-selected'));
            button.classList.add('is-selected');
            renderTransactions(weeks[Number(button.dataset.weekIndex)]);
        });
    });
}

function renderTransactions(week) {
    document.getElementById('selectedWeekLabel').textContent = week.label;
    document.getElementById('selectedWeekCount').textContent = `${week.transaction_count} expenses`;
    const container = document.getElementById('weekTransactions');
    if (!week.transactions.length) {
        container.innerHTML = '<div class="empty-state">No expenses recorded for this week.</div>';
        return;
    }
    container.innerHTML = week.transactions.map(item => `<div class="transaction-row">
        <div class="transaction-date">${escapeHtml(shortDate(item.date))}</div>
        <div><div class="transaction-description">${escapeHtml(item.description || item.category)}</div><div class="transaction-category">${escapeHtml(item.category)}</div></div>
        <div class="transaction-amount">${formatCurrency(item.amount, 2)}</div>
    </div>`).join('');
}

function renderMonthlyTrend(months) {
    const container = document.getElementById('monthlyTrend');
    const max = Math.max(...months.flatMap(month => [month.spent, month.allowance]), 1);
    container.innerHTML = months.map(month => `<div class="trend-row">
        <span class="trend-label">${escapeHtml(month.label)}</span>
        <span class="trend-track">
            <span class="trend-fill ${month.spent > month.allowance ? 'over' : ''}" style="width:${month.spent / max * 100}%"></span>
            <span class="trend-allowance-marker" style="left:${Math.min(99.5, month.allowance / max * 100)}%" title="Allowance: ${escapeHtml(formatCurrency(month.allowance))}"></span>
        </span>
        <span class="trend-value">${formatCurrency(month.spent)}</span>
    </div>`).join('');
}

function renderTravel(travel) {
    const container = document.getElementById('travelSummary');
    const trips = (travel.trips || [])
        .map(trip => ({...trip, recent: (trip.monthly || []).slice(-3).reduce((sum, value) => sum + value, 0)}))
        .filter(trip => trip.recent > 0)
        .sort((a, b) => b.recent - a.recent)
        .slice(0, 5);
    if (!trips.length) {
        container.innerHTML = '<div class="empty-state">No holiday expenses in the last three months.</div>';
        return;
    }
    container.innerHTML = trips.map(trip => `<div class="trip-row"><span>${escapeHtml(trip.trip)}</span><strong>${formatCurrency(trip.recent)}</strong></div>`).join('');
}

function renderAll(data) {
    reviewData = data;
    renderHero(data);
    renderMonth(data.month);
    renderCategoryComparison(data.category_comparison || []);
    renderWeeklyTrend(data.weeks || []);
    renderTransactions(data.weeks[0]);
    renderMonthlyTrend(data.months || []);
    renderTravel(data.travel || {});
    setStatus(`Updated ${new Date(data.generated_at).toLocaleString('en-GB', {dateStyle: 'medium', timeStyle: 'short'})}`);
}

async function loadReview() {
    setStatus('Loading your weekly review…');
    try {
        const response = await betterFetch(`${url}/monitoring/weekly?who=${encodeURIComponent(currentPerson)}&weeks=8`);
        if (response.status === 401) {
            authenticate(true);
            return loadReview();
        }
        if (!response.ok) throw new Error(`Review request failed (${response.status})`);
        renderAll(await response.json());
    } catch (error) {
        console.error(error);
        setStatus('Unable to load the weekly review. Please try again later.');
    }
}

function setupPersonSwitch() {
    document.querySelectorAll('[data-person]').forEach(button => {
        button.classList.toggle('is-active', button.dataset.person === currentPerson);
        button.addEventListener('click', () => {
            currentPerson = button.dataset.person;
            localStorage.setItem('budget_name', currentPerson === 'elisa' ? 'Elisa' : 'Fabian');
            if (window.BudgetAndroid?.configure) {
                window.BudgetAndroid.configure(url, 'Basic ' + btoa(getKey() || ''), getName());
            }
            document.querySelectorAll('[data-person]').forEach(item => item.classList.toggle('is-active', item === button));
            loadReview();
        });
    });
}

function setupNotificationControl() {
    const button = document.getElementById('weeklyNotificationToggle');
    if (!window.BudgetAndroid?.isWeeklyReviewEnabled || !window.BudgetAndroid?.setWeeklyReviewEnabled) return;
    button.classList.remove('is-hidden');
    const update = () => {
        const enabled = !!window.BudgetAndroid.isWeeklyReviewEnabled();
        button.textContent = enabled ? '🔔 Weekly update on' : '🔕 Weekly update off';
        button.setAttribute('aria-pressed', String(enabled));
    };
    button.addEventListener('click', () => {
        window.BudgetAndroid.setWeeklyReviewEnabled(!window.BudgetAndroid.isWeeklyReviewEnabled());
        update();
    });
    update();
}

setupPersonSwitch();
setupNotificationControl();
loadReview();
