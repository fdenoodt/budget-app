const url = config.url;

const chartInstances = {};
let dashboardMonthOffsets = [];
const detailsCache = new Map();
let currentPerson = 'fabian';

function getKey() {
    return localStorage.getItem("budget_key");
}

function setKey(key) {
    localStorage.setItem('budget_key', key);
}

function authenticate(isForceAuthenticate = false) {
    let key = getKey();
    if (!key || isForceAuthenticate) {
        key = prompt("Password");
        setKey(key);
    }
    return key;
}

function handleError(err) {
    const errMessage = err.toString();
    if (errMessage.includes("Unauthorized Access")) {
        authenticate(true);
        location.reload();
    } else {
        console.error(err);
    }
}

function betterFetch(fullUrl, options = {}) {
    options.headers = {'Authorization': 'Basic ' + btoa(getKey())};
    return fetch(fullUrl, options);
}

function getPreferredPerson() {
    const stored = (localStorage.getItem('budget_name') || '').toLowerCase();
    return stored === 'elisa' ? 'elisa' : 'fabian';
}

const formatter = new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
});

const compactFormatter = new Intl.NumberFormat('nl-NL', {
    notation: 'compact',
    maximumFractionDigits: 1
});

function formatCurrency(value) {
    return formatter.format(value);
}

function formatCompact(value) {
    return compactFormatter.format(value);
}

function getBarTotalValue(context) {
    const parsed = context.parsed || {};
    const indexAxis = context.chart?.options?.indexAxis || context.chart?.config?.options?.indexAxis;
    if (indexAxis === 'y' && typeof parsed.x === 'number') return parsed.x;
    if (typeof parsed.y === 'number') return parsed.y;
    if (typeof parsed.x === 'number') return parsed.x;
    return typeof context.raw === 'number' ? context.raw : 0;
}

function buildBarTooltipTitle(contexts, labelPrefix) {
    const ctx = contexts[0];
    const total = formatCurrency(getBarTotalValue(ctx));
    if (!labelPrefix) return `Total: ${total}`;
    return `Total: ${total}. ${labelPrefix}${ctx.label}`;
}

function setStatus(text) {
    const status = document.getElementById('dashboardStatus');
    if (status) status.textContent = text;
}

function destroyChart(id) {
    if (chartInstances[id]) {
        chartInstances[id].destroy();
        delete chartInstances[id];
    }
}

function buildChart(id, config) {
    const ctx = document.getElementById(id).getContext('2d');
    destroyChart(id);
    chartInstances[id] = new Chart(ctx, config);
}

function createDetailsModalIfNeeded() {
    if (document.getElementById('dashboard-details-modal')) return;
    const overlay = document.createElement('div');
    overlay.id = 'dashboard-details-modal';
    overlay.className = 'dashboard-modal';
    overlay.innerHTML = `
        <div class="dashboard-modal-card" role="dialog" aria-modal="true" aria-labelledby="dashboard-details-title">
            <div class="dashboard-modal-header">
                <h3 id="dashboard-details-title">Details</h3>
                <button type="button" class="dashboard-modal-close" aria-label="Close">x</button>
            </div>
            <div class="dashboard-modal-body">
                <ul id="dashboard-details-list"></ul>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) overlay.classList.remove('is-visible');
    });
    overlay.querySelector('.dashboard-modal-close').addEventListener('click', () => overlay.classList.remove('is-visible'));
}

function showDetailsModal(title, items) {
    createDetailsModalIfNeeded();
    const overlay = document.getElementById('dashboard-details-modal');
    overlay.querySelector('#dashboard-details-title').textContent = title;
    const list = overlay.querySelector('#dashboard-details-list');
    if (!items.length) {
        list.innerHTML = '<li>No items found.</li>';
    } else {
        list.innerHTML = items.map(item => {
            const date = item.date ? `${item.date} • ` : '';
            const desc = item.description ? item.description : '(no description)';
            const category = item.category ? ` (${item.category})` : '';
            return `<li>${date}${desc}${category} — €${item.amount.toFixed(2)}</li>`;
        }).join('');
    }
    overlay.classList.add('is-visible');
}

async function fetchDashboardDetails(params, title) {
    const query = new URLSearchParams(params);
    try {
        const response = await betterFetch(`${url}/dashboard_details?${query.toString()}`);
        const items = await response.json();
        showDetailsModal(title, items);
    } catch (err) {
        handleError(err);
    }
}

async function fetchDetailsItems(params) {
    const key = JSON.stringify(params);
    if (detailsCache.has(key) && detailsCache.get(key).items) {
        return detailsCache.get(key).items;
    }
    const query = new URLSearchParams(params);
    const response = await betterFetch(`${url}/dashboard_details?${query.toString()}`);
    const items = await response.json();
    detailsCache.set(key, {items, loading: false});
    return items;
}

function getClickIndex(chart, event) {
    const points = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);
    if (!points.length) return null;
    return points[0];
}

function ensureDetails(params, chart) {
    const key = JSON.stringify(params);
    const cached = detailsCache.get(key);
    if (cached && cached.loading) return;
    if (cached && cached.items) return;
    detailsCache.set(key, {items: null, loading: true});
    fetchDetailsItems(params)
        .then(() => chart.update('none'))
        .catch(handleError);
}

function getCachedDetails(params) {
    const key = JSON.stringify(params);
    const cached = detailsCache.get(key);
    return cached ? cached.items : null;
}

function formatDetailLines(items) {
    if (!items || !items.length) return ['No items'];
    return items.slice(0, 5).map(item => {
        const desc = item.description ? item.description : '(no description)';
        return `${desc} — €${item.amount.toFixed(2)}`;
    });
}

function updateKpis(data) {
    const expenses = data.monthly_totals.expenses;
    const income = data.monthly_totals.income;
    const rent = data.monthly_totals.rent || [];
    const targetNet = data.monthly_totals.target_net || [];
    const months = data.months;

    const totalSpent = expenses.reduce((sum, val) => sum + val, 0);
    const totalIncome = income.reduce((sum, val) => sum + val, 0);
    const totalRent = rent.reduce((sum, val) => sum + val, 0);
    const avgSpent = expenses.length ? (totalSpent + totalRent) / expenses.length : 0;
    const netTotal = data.monthly_totals.net.reduce((sum, val) => sum + val, 0);
    const targetNetTotal = targetNet.reduce((sum, val) => sum + val, 0);

    const peakValue = Math.max(...expenses);
    const peakIndex = expenses.indexOf(peakValue);
    const peakMonth = months[peakIndex] || "--";

    const topCategory = data.category_totals[0];

    document.getElementById('kpiTotalSpent').textContent = formatCurrency(totalSpent + totalRent);
    document.getElementById('kpiAvgSpent').textContent = `Avg ${formatCurrency(avgSpent)} / month`;
    document.getElementById('kpiTotalIncome').textContent = formatCurrency(totalIncome);

    const netLabel = document.getElementById('kpiNet');
    netLabel.textContent = `Net ${formatCurrency(netTotal)}`;
    netLabel.style.color = netTotal >= 0 ? '#2a9d8f' : '#d14545';

    const netTargetLabel = document.getElementById('kpiNetTarget');
    const netTargetValue = document.getElementById('kpiNetTargetValue');
    if (netTargetLabel && netTargetValue) {
        netTargetLabel.textContent = formatCurrency(netTotal);
        netTargetValue.textContent = `Target ${formatCurrency(targetNetTotal)}`;
        netTargetLabel.style.color = netTotal >= targetNetTotal ? '#2a9d8f' : '#d14545';
    }

    document.getElementById('kpiPeakMonth').textContent = peakMonth;
    document.getElementById('kpiPeakValue').textContent = formatCurrency(peakValue);

    if (topCategory) {
        document.getElementById('kpiTopCategory').textContent = topCategory.category;
        document.getElementById('kpiTopCategoryValue').textContent = formatCurrency(topCategory.total);
    } else {
        document.getElementById('kpiTopCategory').textContent = '--';
        document.getElementById('kpiTopCategoryValue').textContent = '--';
    }
}

function renderCharts(data) {
    const months = data.months;
    dashboardMonthOffsets = data.month_offsets || [];
    const colors = ['#0069d9', '#f08a5d', '#6a4c93', '#43aa8b', '#f9c74f', '#577590', '#d62828'];

    buildChart('chartIncomeExpense', {
        type: 'line',
        data: {
            labels: months,
            datasets: [
                {
                    label: 'Expenses',
                    data: data.monthly_totals.expenses,
                    borderColor: '#d62828',
                    backgroundColor: 'rgba(214, 40, 40, 0.18)',
                    fill: true,
                    tension: 0.3
                },
                {
                    label: 'Income',
                    data: data.monthly_totals.income,
                    borderColor: '#2a9d8f',
                    backgroundColor: 'rgba(42, 157, 143, 0.18)',
                    fill: true,
                    tension: 0.3
                },
                {
                    label: 'Net',
                    data: data.monthly_totals.net,
                    borderColor: '#1d3557',
                    backgroundColor: 'rgba(29, 53, 87, 0.1)',
                    fill: false,
                    borderDash: [6, 4],
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    ticks: {
                        callback: value => formatCompact(value)
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        title: (contexts) => {
                            const ctx = contexts[0];
                            const dataset = ctx.dataset.label;
                            const monthLabel = ctx.label;
                            if (dataset === 'Income' || dataset === 'Expenses') {
                                return `${dataset} in ${monthLabel}`;
                            }
                            return ctx.label || '';
                        },
                        label: (context) => {
                            const dataset = context.dataset.label;
                            if (dataset !== 'Income' && dataset !== 'Expenses') {
                                return `${dataset}: ${context.formattedValue}`;
                            }
                            const offset = dashboardMonthOffsets[context.dataIndex];
                            const type = dataset === 'Income' ? 'income' : 'expense';
                            const params = {who: currentPerson, type, offset};
                            const items = getCachedDetails(params);
                            if (!items) {
                                return 'Loading...';
                            }
                            return formatDetailLines(items);
                        }
                    }
                }
            },
            onHover: (event, elements) => {
                if (!elements.length) return;
                const point = elements[0];
                const dataset = chartInstances.chartIncomeExpense.data.datasets[point.datasetIndex];
                const label = dataset.label;
                if (label !== 'Income' && label !== 'Expenses') return;
                const offset = dashboardMonthOffsets[point.index];
                const type = label === 'Income' ? 'income' : 'expense';
                ensureDetails({who: currentPerson, type, offset}, chartInstances.chartIncomeExpense);
            }
        }
    });
    chartInstances.chartIncomeExpense.options.onClick = (event, elements, chart) => {
        const point = getClickIndex(chartInstances.chartIncomeExpense, event);
        if (!point) return;
        const dataset = chartInstances.chartIncomeExpense.data.datasets[point.datasetIndex];
        const label = dataset.label;
        if (label !== 'Income' && label !== 'Expenses') return;
        const offset = dashboardMonthOffsets[point.index];
        const type = label === 'Income' ? 'income' : 'expense';
        fetchDashboardDetails({
            who: currentPerson,
            type,
            offset
        }, `${label} details`);
    };

    const categoryLabels = data.category_totals.map(item => item.category);
    const categoryTotals = data.category_totals.map(item => item.total);
    buildChart('chartCategoryTotals', {
        type: 'bar',
        data: {
            labels: categoryLabels,
            datasets: [{
                label: 'Total',
                data: categoryTotals,
                backgroundColor: '#3d5a80'
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    ticks: {
                        callback: value => formatCompact(value)
                    }
                }
            },
            plugins: {
                legend: {display: false},
                tooltip: {
                    callbacks: {
                        title: (contexts) => {
                            return buildBarTooltipTitle(contexts, 'Top items: ');
                        },
                        label: (context) => {
                            const category = chartInstances.chartCategoryTotals.data.labels[context.dataIndex];
                            const params = {
                                who: currentPerson,
                                type: 'category_range',
                                months_back: parseInt(document.getElementById('rangeSelect').value, 10),
                                category
                            };
                            const items = getCachedDetails(params);
                            if (!items) return 'Loading...';
                            return formatDetailLines(items);
                        }
                    }
                }
            },
            onHover: (event, elements) => {
                if (!elements.length) return;
                const category = chartInstances.chartCategoryTotals.data.labels[elements[0].index];
                ensureDetails({
                    who: currentPerson,
                    type: 'category_range',
                    months_back: parseInt(document.getElementById('rangeSelect').value, 10),
                    category
                }, chartInstances.chartCategoryTotals);
            }
        }
    });
    chartInstances.chartCategoryTotals.options.onClick = (event, elements, chart) => {
        const point = getClickIndex(chartInstances.chartCategoryTotals, event);
        if (!point) return;
        const category = chartInstances.chartCategoryTotals.data.labels[point.index];
        fetchDashboardDetails({
            who: currentPerson,
            type: 'category_range',
            months_back: parseInt(document.getElementById('rangeSelect').value, 10),
            category
        }, `${category} (range)`);
    };

    const avgLabels = data.category_avg.map(item => item.category);
    const avgValues = data.category_avg.map(item => item.avg);
    buildChart('chartCategoryAvg', {
        type: 'bar',
        data: {
            labels: avgLabels,
            datasets: [{
                label: 'Avg / month',
                data: avgValues,
                backgroundColor: '#8d99ae'
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    ticks: {
                        callback: value => formatCompact(value)
                    }
                }
            },
            plugins: {
                legend: {display: false},
                tooltip: {
                    callbacks: {
                        title: (contexts) => {
                            return buildBarTooltipTitle(contexts, 'Top items: ');
                        },
                        label: (context) => {
                            const category = chartInstances.chartCategoryAvg.data.labels[context.dataIndex];
                            const params = {
                                who: currentPerson,
                                type: 'category_range',
                                months_back: parseInt(document.getElementById('rangeSelect').value, 10),
                                category
                            };
                            const items = getCachedDetails(params);
                            if (!items) return 'Loading...';
                            return formatDetailLines(items);
                        }
                    }
                }
            },
            onHover: (event, elements) => {
                if (!elements.length) return;
                const category = chartInstances.chartCategoryAvg.data.labels[elements[0].index];
                ensureDetails({
                    who: currentPerson,
                    type: 'category_range',
                    months_back: parseInt(document.getElementById('rangeSelect').value, 10),
                    category
                }, chartInstances.chartCategoryAvg);
            }
        }
    });
    chartInstances.chartCategoryAvg.options.onClick = (event, elements, chart) => {
        const point = getClickIndex(chartInstances.chartCategoryAvg, event);
        if (!point) return;
        const category = chartInstances.chartCategoryAvg.data.labels[point.index];
        fetchDashboardDetails({
            who: currentPerson,
            type: 'category_range',
            months_back: parseInt(document.getElementById('rangeSelect').value, 10),
            category
        }, `${category} (range)`);
    };

    const categoryTrendDatasets = data.category_monthly.map((item, index) => ({
        label: item.category,
        data: item.data,
        borderColor: colors[index % colors.length],
        backgroundColor: 'rgba(0,0,0,0)',
        tension: 0.3
    }));

    buildChart('chartCategoryTrends', {
        type: 'line',
        data: {
            labels: months,
            datasets: categoryTrendDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {position: 'bottom'}
            },
            scales: {
                y: {
                    ticks: {
                        callback: value => formatCompact(value)
                    }
                }
            }
        }
    });

    buildChart('chartTravelMonthly', {
        type: 'bar',
        data: {
            labels: months,
            datasets: [{
                label: 'Travel',
                data: data.travel.monthly_totals,
                backgroundColor: 'rgba(67, 170, 139, 0.6)',
                borderColor: '#43aa8b'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {display: false},
                tooltip: {
                    callbacks: {
                        title: (contexts) => {
                            return buildBarTooltipTitle(contexts, 'Travel in ');
                        },
                        label: (context) => {
                            const offset = dashboardMonthOffsets[context.dataIndex];
                            const params = {
                                who: currentPerson,
                                type: 'travel',
                                offset,
                                category: 'Reizen'
                            };
                            const items = getCachedDetails(params);
                            if (!items) return 'Loading...';
                            return formatDetailLines(items);
                        }
                    }
                }
            },
            scales: {
                y: {
                    ticks: {callback: value => formatCompact(value)}
                }
            },
            onHover: (event, elements) => {
                if (!elements.length) return;
                const offset = dashboardMonthOffsets[elements[0].index];
                ensureDetails({
                    who: currentPerson,
                    type: 'travel',
                    offset,
                    category: 'Reizen'
                }, chartInstances.chartTravelMonthly);
            }
        }
    });
    chartInstances.chartTravelMonthly.options.onClick = (event, elements, chart) => {
        const point = getClickIndex(chartInstances.chartTravelMonthly, event);
        if (!point) return;
        const offset = dashboardMonthOffsets[point.index];
        fetchDashboardDetails({
            who: currentPerson,
            type: 'travel',
            offset,
            category: 'Reizen'
        }, `Travel expenses`);
    };

    const tripLabels = data.travel.trips.map(item => item.trip);
    const tripTotals = data.travel.trips.map(item => item.total);
    buildChart('chartTravelTrips', {
        type: 'bar',
        data: {
            labels: tripLabels,
            datasets: [{
                label: 'Trip total',
                data: tripTotals,
                backgroundColor: '#f4a261'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {ticks: {callback: value => formatCompact(value)}}
            },
            plugins: {
                legend: {display: false},
                tooltip: {
                    callbacks: {
                        title: (contexts) => {
                            return buildBarTooltipTitle(contexts, 'Trip: ');
                        },
                        label: (context) => {
                            const trip = chartInstances.chartTravelTrips.data.labels[context.dataIndex];
                            const params = {
                                who: currentPerson,
                                type: 'trip_range',
                                months_back: parseInt(document.getElementById('rangeSelect').value, 10),
                                trip
                            };
                            const items = getCachedDetails(params);
                            if (!items) return 'Loading...';
                            return formatDetailLines(items);
                        }
                    }
                }
            },
            onHover: (event, elements) => {
                if (!elements.length) return;
                const trip = chartInstances.chartTravelTrips.data.labels[elements[0].index];
                ensureDetails({
                    who: currentPerson,
                    type: 'trip_range',
                    months_back: parseInt(document.getElementById('rangeSelect').value, 10),
                    trip
                }, chartInstances.chartTravelTrips);
            }
        }
    });
    chartInstances.chartTravelTrips.options.onClick = (event, elements, chart) => {
        const point = getClickIndex(chartInstances.chartTravelTrips, event);
        if (!point) return;
        const trip = chartInstances.chartTravelTrips.data.labels[point.index];
        fetchDashboardDetails({
            who: currentPerson,
            type: 'trip_range',
            months_back: parseInt(document.getElementById('rangeSelect').value, 10),
            trip
        }, `Trip: ${trip}`);
    };

    const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    buildChart('chartWeekday', {
        type: 'bar',
        data: {
            labels: weekdayLabels,
            datasets: [{
                label: 'Spend',
                data: data.weekday_totals,
                backgroundColor: '#577590'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {display: false},
                tooltip: {
                    callbacks: {
                        title: (contexts) => buildBarTooltipTitle(contexts, ''),
                        label: (context) => `${context.dataset.label}: ${context.formattedValue}`
                    }
                }
            },
            scales: {
                y: {ticks: {callback: value => formatCompact(value)}}
            }
        }
    });
}

async function loadDashboard(monthsBack) {
    setStatus('Loading dashboard data...');
    try {
        const response = await betterFetch(`${url}/dashboard?months=${monthsBack}&who=${currentPerson}`);
        const data = await response.json();
        updateKpis(data);
        renderCharts(data);
        setStatus(`Showing ${monthsBack} months for ${currentPerson}.`);
    } catch (err) {
        handleError(err);
        setStatus('Unable to load dashboard data.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    authenticate();
    const rangeSelect = document.getElementById('rangeSelect');
    const toggleButtons = Array.from(document.querySelectorAll('.toggle-button'));
    currentPerson = getPreferredPerson();

    toggleButtons.forEach(button => {
        button.classList.toggle('is-active', button.dataset.person === currentPerson);
        button.addEventListener('click', () => {
            currentPerson = button.dataset.person;
            toggleButtons.forEach(btn => btn.classList.toggle('is-active', btn.dataset.person === currentPerson));
            loadDashboard(parseInt(rangeSelect.value, 10));
        });
    });

    loadDashboard(parseInt(rangeSelect.value, 10));

    rangeSelect.addEventListener('change', () => {
        const monthsBack = parseInt(rangeSelect.value, 10);
        loadDashboard(monthsBack);
    });
});
